import { useEffect, useRef } from 'react';
import Script from 'next/script';
import { useRouter } from 'next/router';
import { supabase } from '../utils/supabaseClient';

// Requires NEXT_PUBLIC_GOOGLE_CLIENT_ID in .env.local
export default function GoogleOneTap({ enabled = true }) {
  const router = useRouter();
  const initialized = useRef(false);

  async function makeNoncePair() {
    const raw = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
    const enc = new TextEncoder().encode(raw);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
    return { raw, hashed: hex };
  }

  async function startOneTap() {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId || !window.google?.accounts?.id) return;

    const { raw, hashed } = await makeNoncePair();

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async (resp) => {
        try {
          const { error } = await supabase.auth.signInWithIdToken({
            provider: 'google',
            token: resp.credential,   // Google ID token
            nonce: raw,               // raw nonce to Supabase
          });
          if (!error) router.replace('/');
        } catch (e) {
          console.error('One Tap error', e);
        }
      },
      // Google/FedCM & UX
      use_fedcm_for_prompt: true,
      context: 'signin',
      ux_mode: 'popup',
      nonce: hashed,  // hashed nonce to Google
      auto_select: true,
      itp_support: true,
    });

    window.google.accounts.id.prompt();
  }

  useEffect(() => {
    if (!enabled) return;
    if (initialized.current) return;
    initialized.current = true;
    if (typeof window !== 'undefined' && window.google?.accounts?.id) startOneTap();
  }, [enabled]);

  return (
    <Script
      id="google-identity-services"
      src="https://accounts.google.com/gsi/client"
      async
      strategy="afterInteractive"
      onLoad={() => { if (enabled) startOneTap(); }}
    />
  );
}

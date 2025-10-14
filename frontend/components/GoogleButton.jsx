import { supabase } from '../utils/supabaseClient';

export default function GoogleButton() {
  return (
    <button
      onClick={async () => {
        await supabase.auth.signInWithOAuth({ provider: 'google' });
      }}
      style={{ padding: '0.6rem 1rem', borderRadius: 10, border: '1px solid #ddd', cursor: 'pointer' }}
    >
      Continue with Google
    </button>
  );
}

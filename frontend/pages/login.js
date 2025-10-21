import { useEffect } from 'react';
import { useRouter } from 'next/router';
import GoogleButton from '../components/GoogleButton';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      router.replace('/');
    }
  }, [loading, user, router]);

  return (
    <Layout>
      <h1>UMarket – Sign in</h1>

      {/* Google only */}
      <GoogleButton />

      <p style={{ marginTop: 12, color: '#666' }}>
        Sign in with your UMass Google account to continue.
      </p>
    </Layout>
  );
}

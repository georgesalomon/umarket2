import GoogleButton from '../components/GoogleButton';

export default function Login() {
  return (
    <main style={{ padding: 24, maxWidth: 420, margin: '0 auto' }}>
      <h1>UMarket – Sign in</h1>

      {/* Google only */}
      <GoogleButton />

      <p style={{ marginTop: 12, color: '#666' }}>
        Sign in with your UMass Google account to continue.
      </p>
    </main>
  );
}


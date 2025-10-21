import '../styles/globals.css';
import GoogleOneTap from '../components/GoogleOneTap';
import { AuthProvider, useAuth } from '../context/AuthContext';

function GoogleOneTapBridge() {
  const { user, loading } = useAuth();
  return <GoogleOneTap enabled={!loading && !user} />;
}

function MyApp({ Component, pageProps }) {
  return (
    <AuthProvider>
      <GoogleOneTapBridge />
      <Component {...pageProps} />
    </AuthProvider>
  );
}

export default MyApp;

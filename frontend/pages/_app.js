import '../styles/globals.css';
import GoogleOneTap from '../components/GoogleOneTap';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';

function GoogleOneTapBridge() {
  const { user, loading } = useAuth();
  return <GoogleOneTap enabled={!loading && !user} />;
}

function MyApp({ Component, pageProps }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <GoogleOneTapBridge />
        <Component {...pageProps} />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default MyApp;

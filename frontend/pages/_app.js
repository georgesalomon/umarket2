import '../styles/globals.css';
import GoogleOneTap from '../components/GoogleOneTap';

function MyApp({ Component, pageProps }) {
  return (
    <>
      <GoogleOneTap enabled />
      <Component {...pageProps} />
    </>
  );
}

export default MyApp;

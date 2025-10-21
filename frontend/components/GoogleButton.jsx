import { useAuth } from '../context/AuthContext';

export default function GoogleButton() {
  const { signInWithGoogle } = useAuth();

  return (
    <button
      onClick={async () => {
        await signInWithGoogle();
      }}
    >
      Continue with Google
    </button>
  );
}

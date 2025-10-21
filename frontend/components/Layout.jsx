import Link from 'next/link';
import { useAuth } from '../context/AuthContext';

export default function Layout({ children }) {
  const { user, loading, signOut, signInWithGoogle } = useAuth();

  return (
    <div className="container">
      <header className="nav">
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <Link href="/">
            <strong>UMarket</strong>
          </Link>
          {!loading && user && (
            <>
              <Link href="/dashboard/profile">Profile</Link>
              <Link href="/dashboard/listings">My Listings</Link>
              <Link href="/dashboard/orders">My Orders</Link>
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {!loading && user ? (
            <>
              <span style={{ fontSize: '0.9rem', color: '#555' }}>{user.email}</span>
              <button type="button" onClick={signOut}>
                Sign out
              </button>
            </>
          ) : (
            <button type="button" onClick={signInWithGoogle}>
              Sign in
            </button>
          )}
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}

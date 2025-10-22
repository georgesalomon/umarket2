import Link from 'next/link';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function Layout({ children, searchSlot = null }) {
  const { user, loading, signOut, signInWithGoogle } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <div className="container">
      <header className="nav">
        <div className="nav__left">
          <Link href="/" className="nav__logo">
            <span>UMarket</span>
          </Link>
          {!loading && user && (
            <>
              <Link href="/dashboard/profile">Profile</Link>
              <Link href="/dashboard/listings">My Listings</Link>
              <Link href="/dashboard/orders">My Orders</Link>
            </>
          )}
        </div>
        {searchSlot ? <div className="nav__search">{searchSlot}</div> : <div className="nav__spacer" />}
        <div className="nav__right">
          <button
            type="button"
            className={`theme-toggle${isDark ? ' theme-toggle--dark' : ''}`}
            onClick={toggleTheme}
            aria-pressed={isDark}
          >
            <span className="theme-toggle__track">
              <span className="theme-toggle__thumb" />
            </span>
            <span className="theme-toggle__label">{isDark ? 'Dark' : 'Light'} mode</span>
          </button>
          {!loading && user ? (
            <>
              <span style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
                {user.email}
              </span>
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

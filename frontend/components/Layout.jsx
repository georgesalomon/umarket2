import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import AuthNotice from './AuthNotice';
import GoogleButton from './GoogleButton';
import { useEffect, useState } from 'react';



export default function Layout({ children, searchSlot = null }) {
  const { user, loading, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const router = useRouter();

  const [menuOpen, setMenuOpen] = useState(false);

  // Close menu on route change
  useEffect(() => {
    const close = () => setMenuOpen(false);
    router.events.on('routeChangeStart', close);
    return () => router.events.off('routeChangeStart', close);
  }, [router.events]);

  // Close menu on ESC key
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false);
    if (menuOpen) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  function navLinkClass(path) {
    const isActive =
      path === '/'
        ? router.pathname === '/'
        : router.pathname.startsWith(path) || router.asPath.startsWith(path);
    return `nav__link${isActive ? ' nav__link--active' : ''}`;
  }

  return (
    <div className="container">
       <header className="nav">
    <div className="nav__left">
      <Link href="/" className="nav__logo">
        <span>UMarket</span>
      </Link>
      {!loading && user && (
        <nav className="nav__links nav__links--desktop" aria-label="Primary">
          <Link href="/dashboard/profile" className={navLinkClass('/dashboard/profile')}>
            Profile
          </Link>
          <Link href="/dashboard/listings" className={navLinkClass('/dashboard/listings')}>
            My Listings
          </Link>
          <Link href="/dashboard/orders" className={navLinkClass('/dashboard/orders')}>
            My Orders
          </Link>
          <Link href="/messages" className={navLinkClass('/messages')}>
            Messages
          </Link>
        </nav>
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

          {/* Desktop auth area */}
          <div className="nav__auth nav__auth--desktop">
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
              <GoogleButton label="Sign in" />
            )}
          </div>

          {/* Hamburger button (shown on small screens via CSS) */}
          <button
            type="button"
            className="nav__menuBtn"
            aria-label="Open menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls="nav-drawer"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className="nav__menuIcon" />
          </button>
        </div>
        

               {/* Mobile drawer: nav links + user email + sign out / sign in */}
        <div
          id="nav-drawer"
          role="menu"
          className={`nav__drawer ${menuOpen ? 'is-open' : ''}`}
        >
          {!loading && user ? (
            <>
              <Link
                href="/dashboard/profile"
                role="menuitem"
                className={navLinkClass('/dashboard/profile')}
              >
                Profile
              </Link>
              <Link
                href="/dashboard/listings"
                role="menuitem"
                className={navLinkClass('/dashboard/listings')}
              >
                My Listings
              </Link>
              <Link
                href="/dashboard/orders"
                role="menuitem"
                className={navLinkClass('/dashboard/orders')}
              >
                My Orders
              </Link>
              <Link
                href="/messages"
                role="menuitem"
                className={navLinkClass('/messages')}
              >
                Messages
              </Link>

              <div className="nav__drawerSeparator" />

              <span className="nav__email nav__email--mobile">{user.email}</span>
              <button
                type="button"
                className="nav__drawerAction"
                onClick={signOut}
                role="menuitem"
              >
                Sign out
              </button>
            </>
          ) : (
            <div className="nav__drawerAction">
              <GoogleButton label="Sign in" />
            </div>
          )}
        </div>
      </header>
      <main>{children}</main>
      <AuthNotice />
    </div>
  );
}

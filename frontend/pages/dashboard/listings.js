import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../utils/apiClient';

export default function DashboardListings() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login');
    }
  }, [authLoading, user, router]);

  const fetchListings = useCallback(async () => {
    if (!user) return;
    async function fetchListings() {
      setLoading(true);
      try {
        const params = new URLSearchParams({ seller_id: user.id });
        const data = await apiFetch(`/listings?${params.toString()}`);
        setListings(data || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchListings();
  }, [user]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  if (authLoading) {
    return (
      <Layout>
        <p>Loading account…</p>
      </Layout>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <Layout>
      <section className="dashboard-listings">
        <header className="dashboard-listings__header">
          <div>
            <h1>My listings</h1>
            <p className="dashboard-listings__subtitle">
              Manage your inventory and keep your buyers up to date.
            </p>
          </div>
          <div className="dashboard-listings__actions">
            <button
              type="button"
              className="dashboard-listings__refresh"
              onClick={fetchListings}
              disabled={loading}
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
            <Link href="/items/new" className="home-listings__cta dashboard-listings__create">
              + Create listing
            </Link>
          </div>
        </header>

        {error && <p className="dashboard-listings__error">{error}</p>}
        {loading && <p className="dashboard-listings__status">Loading listings…</p>}
        {!loading && listings.length === 0 && (
          <div className="dashboard-listings__empty">
            <h2>No listings yet</h2>
            <p>Start by creating your first listing to see it appear here.</p>
            <Link href="/items/new" className="home-listings__cta">
              Create listing
            </Link>
          </div>
        )}

        {!loading && listings.length > 0 && (
          <ul className="dashboard-listings__grid">
            {listings.map((listing) => {
              const quantity =
                typeof listing.quantity === 'number' && Number.isFinite(listing.quantity)
                  ? listing.quantity
                  : 1;
              const price =
                typeof listing.price === 'number' && Number.isFinite(listing.price)
                  ? `$${listing.price.toFixed(2)}`
                  : 'Not set';
              const isSold = Boolean(listing.sold);

              return (
                <li key={listing.id} className="dashboard-listings__card">
                  <div className="dashboard-listings__card-header">
                    <h3>{listing.name}</h3>
                    <span
                      className={`dashboard-listings__badge${
                        isSold ? ' dashboard-listings__badge--sold' : ' dashboard-listings__badge--available'
                      }`}
                    >
                      {isSold ? 'Sold' : 'Available'}
                    </span>
                  </div>
                  <p className="dashboard-listings__price">{price}</p>
                  <ul className="dashboard-listings__meta">
                    <li>
                      Category:{' '}
                      <strong>
                        {typeof listing.category === 'string' && listing.category
                          ? listing.category
                          : 'Miscellaneous'}
                      </strong>
                    </li>
                    <li>
                      Quantity: <strong>{quantity}</strong>
                    </li>
                  </ul>
                  <div className="dashboard-listings__card-actions">
                    <Link href={`/items/${listing.id}`} className="dashboard-listings__link">
                      View listing
                    </Link>
                    <Link
                      href={`/items/${listing.id}/edit`}
                      className="dashboard-listings__link dashboard-listings__link--muted"
                    >
                      Edit details
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </Layout>
  );
}

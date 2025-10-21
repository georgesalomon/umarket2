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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>My listings</h1>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button type="button" onClick={fetchListings} disabled={loading}>
            Refresh
          </button>
          <Link href="/items/new">Create listing</Link>
        </div>
      </div>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {loading && <p>Loading listings…</p>}
      {!loading && listings.length === 0 && <p>You have not created any listings yet.</p>}
      {!loading && listings.length > 0 && (
        <ul>
          {listings.map((listing) => (
            <li key={listing.id} style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <strong>{listing.name}</strong>
                <span>Status: {listing.sold ? 'Sold' : 'Available'}</span>
                <span>Quantity: {listing.quantity ?? 1}</span>
                <span>
                  Price: $
                  {typeof listing.price === 'number' ? listing.price.toFixed(2) : '0.00'}
                </span>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <Link href={`/items/${listing.id}`}>View</Link>
                  <Link href={`/items/${listing.id}/edit`}>Edit</Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Layout>
  );
}

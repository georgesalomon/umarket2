import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../utils/apiClient';

export default function ListingDetail() {
  const router = useRouter();
  const { id } = router.query;
  const { user, accessToken, loading: authLoading } = useAuth();
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderError, setOrderError] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');

  const fetchListing = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await apiFetch(`/listings/${id}`);
      setListing(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchListing();
  }, [fetchListing]);

  async function handleToggleSold(nextSold) {
    if (!accessToken) {
      setError('You must be signed in to update a listing.');
      return;
    }
    setUpdating(true);
    setMessage(null);
    setOrderError(null);
    try {
      const updated = await apiFetch(`/listings/${id}`, {
        method: 'PATCH',
        body: { sold: nextSold },
        accessToken,
      });
      setListing(updated);
      setMessage(`Listing marked as ${nextSold ? 'sold' : 'available'}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdating(false);
    }
  }

  const isOwner = user && listing && listing.seller_id === user.id;
  const quantity = listing?.quantity ?? 1;
  const isSoldOut = listing?.sold || quantity <= 0;
  const canBuy = Boolean(user && !isOwner && !isSoldOut);

  async function handleRequestPurchase() {
    if (!user) {
      router.push('/login');
      return;
    }
    if (!accessToken) {
      setOrderError('Missing access token');
      return;
    }
    if (!listing) return;

    setOrderSubmitting(true);
    setOrderError(null);
    setMessage(null);

    try {
      await apiFetch('/orders', {
        method: 'POST',
        body: { listing_id: listing.id, payment_method: paymentMethod },
        accessToken,
      });
      setMessage('Purchase recorded. The seller has been notified.');
      setListing((prev) => {
        if (!prev) return prev;
        const nextQuantity =
          typeof prev.quantity === 'number' ? Math.max(prev.quantity - 1, 0) : 0;
        return {
          ...prev,
          quantity: nextQuantity,
          sold: nextQuantity === 0 ? true : prev.sold,
        };
      });
    } catch (err) {
      setOrderError(err.message);
    } finally {
      setOrderSubmitting(false);
    }
  }

  if (loading) {
    return (
      <Layout>
        <p>Loading…</p>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <p style={{ color: 'red' }}>{error}</p>
      </Layout>
    );
  }

  if (!listing) {
    return (
      <Layout>
        <p>Listing not found.</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <h1>{listing.name}</h1>
      <p>
        <strong>Price:</strong>{' '}
        {listing.price !== undefined && listing.price !== null
          ? `$${listing.price.toFixed(2)}`
          : 'N/A'}
      </p>
      <p>
        <strong>Quantity:</strong> {quantity}
      </p>
      <p>
        <strong>Status:</strong> {listing.sold || quantity <= 0 ? 'Sold out' : 'Available'}
      </p>
      {message && <p style={{ color: 'green' }}>{message}</p>}
      {orderError && <p style={{ color: 'red' }}>{orderError}</p>}

      {isOwner ? (
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          <Link href={`/items/${listing.id}/edit`}>Edit listing</Link>
          <button
            type="button"
            onClick={() => handleToggleSold(false)}
            disabled={updating || !listing.sold}
          >
            Mark available
          </button>
          <button
            type="button"
            onClick={() => handleToggleSold(true)}
            disabled={updating || listing.sold}
          >
            Mark sold
          </button>
        </div>
      ) : (
        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {user ? (
            canBuy ? (
              <>
                <label htmlFor="paymentMethod">
                  Preferred payment method
                  <select
                    id="paymentMethod"
                    value={paymentMethod}
                    onChange={(event) => setPaymentMethod(event.target.value)}
                    style={{ marginLeft: '0.75rem', width: 'auto' }}
                  >
                    <option value="cash">Cash</option>
                    <option value="venmo">Venmo</option>
                    <option value="paypal">PayPal</option>
                  </select>
                </label>
                <button type="button" onClick={handleRequestPurchase} disabled={orderSubmitting}>
                  {orderSubmitting ? 'Submitting…' : 'Buy this item'}
                </button>
              </>
            ) : (
              <p>This item is no longer available.</p>
            )
          ) : (
            <>
              <p>{isSoldOut ? 'This item is no longer available.' : 'Sign in to purchase this item.'}</p>
              <button type="button" onClick={() => router.push('/login')} disabled={authLoading}>
                Sign in to purchase
              </button>
            </>
          )}
        </div>
      )}
    </Layout>
  );
}

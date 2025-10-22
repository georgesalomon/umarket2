import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../utils/apiClient';
import { supabase } from '../../utils/supabaseClient';

const CATEGORY_LABELS = {
  decor: 'Decor',
  clothing: 'Clothing',
  'school-supplies': 'School Supplies',
  tickets: 'Tickets',
  miscellaneous: 'Miscellaneous',
};
const AVATAR_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_AVATAR_BUCKET || 'avatars';

export default function ListingDetail() {
  const router = useRouter();
  const { id } = router.query;
  const { user, accessToken } = useAuth();
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderError, setOrderError] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [seller, setSeller] = useState(null);
  const [sellerLoading, setSellerLoading] = useState(false);
  const [sellerError, setSellerError] = useState(null);
  const [sellerAvatarUrl, setSellerAvatarUrl] = useState(null);

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

  useEffect(() => {
    if (!listing?.seller_id) {
      setSeller(null);
      return;
    }
    let cancelled = false;
    async function loadSeller() {
      setSellerLoading(true);
      setSellerError(null);
      try {
        const data = await apiFetch(`/users/${listing.seller_id}`);
        if (!cancelled) {
          setSeller(data);
        }
      } catch (err) {
        if (!cancelled) {
          setSellerError(err.message);
        }
      } finally {
        if (!cancelled) {
          setSellerLoading(false);
        }
      }
    }
    loadSeller();
    return () => {
      cancelled = true;
    };
  }, [listing?.seller_id]);

  useEffect(() => {
    if (!seller) {
      setSellerAvatarUrl(null);
      return;
    }
    if (seller.avatar_path) {
      const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(seller.avatar_path);
      if (data?.publicUrl) {
        setSellerAvatarUrl(data.publicUrl);
        return;
      }
    }
    setSellerAvatarUrl(seller.avatar_url || null);
  }, [seller]);

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
  const sellerName =
    seller?.full_name || seller?.email || (listing?.seller_id ? 'Seller' : 'Unknown seller');

  function sellerInitials(value) {
    if (!value) return 'U';
    const text = String(value).trim();
    if (!text) {
      return 'U';
    }
    const segments = text.split(/\s+/);
    if (segments.length === 1) {
      return segments[0].slice(0, 2).toUpperCase();
    }
    const first = segments[0]?.[0] || '';
    const last = segments[segments.length - 1]?.[0] || '';
    const initials = `${first}${last}`.toUpperCase();
    return initials || 'U';
  }

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
      <section className="listing-detail">
        <header className="listing-detail__header">
          <div>
            <h1>{listing.name}</h1>
            <p className="listing-detail__category">
              {CATEGORY_LABELS[listing.category] || 'Miscellaneous'}
            </p>
          </div>
          <div
            className={`listing-detail__status${
              isSoldOut ? ' listing-detail__status--sold' : ' listing-detail__status--available'
            }`}
          >
            {isSoldOut ? 'Sold out' : 'Available'}
          </div>
        </header>

        <div className="listing-detail__layout">
          <article className="listing-detail__panel">
            <div className="listing-detail__price">
              {listing.price !== undefined && listing.price !== null
                ? `$${listing.price.toFixed(2)}`
                : 'N/A'}
            </div>
            <ul className="listing-detail__meta">
              <li>
                Quantity left <strong>{quantity}</strong>
              </li>
              <li>Listed in {CATEGORY_LABELS[listing.category] || 'Miscellaneous'}.</li>
            </ul>

            {message && (
              <p className="listing-detail__feedback listing-detail__feedback--success">{message}</p>
            )}
            {(orderError || error) && (
              <p className="listing-detail__feedback listing-detail__feedback--error">
                {orderError || error}
              </p>
            )}

            {isOwner ? (
              <div className="listing-detail__owner-actions">
                <Link href={`/items/${listing.id}/edit`} className="listing-detail__link">
                  Edit listing
                </Link>
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
              <div className="listing-detail__buy">
                {user ? (
                  canBuy ? (
                    <>
                      <label htmlFor="paymentMethod" className="listing-detail__label">
                        Preferred payment method
                        <select
                          id="paymentMethod"
                          value={paymentMethod}
                          onChange={(event) => setPaymentMethod(event.target.value)}
                        >
                          <option value="cash">Cash</option>
                          <option value="venmo">Venmo</option>
                          <option value="paypal">PayPal</option>
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={handleRequestPurchase}
                        disabled={orderSubmitting}
                      >
                        {orderSubmitting ? 'Submitting…' : 'Contact seller to buy'}
                      </button>
                    </>
                  ) : (
                    <p className="listing-detail__note">This item is no longer available.</p>
                  )
                ) : (
                  <p className="listing-detail__note">
                    <Link href="/login">Sign in</Link> to connect with the seller.
                  </p>
                )}
              </div>
            )}
          </article>

          <aside className="listing-detail__seller">
            <h2>Seller</h2>
            {sellerLoading ? (
              <p className="listing-detail__note">Loading seller details…</p>
            ) : sellerError ? (
              <p className="listing-detail__feedback listing-detail__feedback--error">
                {sellerError}
              </p>
            ) : seller ? (
              <Link href={`/users/${listing.seller_id}`} className="listing-detail__seller-card">
                {sellerAvatarUrl ? (
                  <img
                    src={sellerAvatarUrl}
                    alt={`${sellerName}'s avatar`}
                    className="listing-detail__seller-avatar"
                  />
                ) : (
                  <div className="listing-detail__seller-placeholder">
                    {sellerInitials(sellerName)}
                  </div>
                )}
                <div className="listing-detail__seller-info">
                  <span className="listing-detail__seller-name">{sellerName}</span>
                  {seller.profile_description && (
                    <span className="listing-detail__seller-bio">{seller.profile_description}</span>
                  )}
                  <span className="listing-detail__seller-link">View profile</span>
                </div>
              </Link>
            ) : (
              <p className="listing-detail__note">Seller information unavailable.</p>
            )}
          </aside>
        </div>
      </section>
    </Layout>
  );
}

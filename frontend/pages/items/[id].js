import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../utils/apiClient';
import { supabase } from '../../utils/supabaseClient';
import { fetchListingGalleryImage, fetchProductImages } from '../../utils/listingImages';
import { startChat } from '../../utils/chatApi';
import {
  CATEGORY_LABELS,
  COLOR_LABELS,
  CLOTHING_GENDER_LABELS,
  CLOTHING_SIZE_LABELS,
  CLOTHING_TYPE_LABELS,
  DECOR_TYPE_LABELS,
  TICKET_TYPE_LABELS,
  PAYMENT_METHOD_OPTIONS,
} from '../../constants/categories';
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
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [seller, setSeller] = useState(null);
  const [sellerLoading, setSellerLoading] = useState(false);
  const [sellerError, setSellerError] = useState(null);
  const [sellerAvatarUrl, setSellerAvatarUrl] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [photosLoading, setPhotosLoading] = useState(true);
  const [photosError, setPhotosError] = useState(null);
  const [activePhotoId, setActivePhotoId] = useState(null);
  const [primaryImageUrl, setPrimaryImageUrl] = useState(null);
  const [primaryImageError, setPrimaryImageError] = useState(null);
  const [startingChat, setStartingChat] = useState(false);
  const [chatError, setChatError] = useState(null);

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

  useEffect(() => {
    let cancelled = false;
    async function loadPhotos(productId) {
      setPhotosLoading(true);
      setPhotosError(null);
      try {
        const items = await fetchProductImages(productId);
        if (!cancelled) {
          setPhotos(items);
          const primary = items.find((item) => item.is_primary);
          setActivePhotoId(primary?.id || items[0]?.id || null);
        }
      } catch (err) {
        if (!cancelled) setPhotosError(err.message);
      } finally {
        if (!cancelled) setPhotosLoading(false);
      }
    }
    async function loadPrimary(productId) {
      setPrimaryImageError(null);
      try {
        const url = await fetchListingGalleryImage(productId);
        if (!cancelled) {
          setPrimaryImageUrl(url);
        }
      } catch (err) {
        if (!cancelled) setPrimaryImageError(err.message);
      }
    }
    if (listing?.id) {
      loadPhotos(listing.id);
      loadPrimary(listing.id);
    }
    return () => {
      cancelled = true;
    };
  }, [listing?.id]);

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
  const categoryValue = useMemo(() => {
    if (!listing?.category) {
      return 'miscellaneous';
    }
    const slug = String(listing.category).trim().toLowerCase();
    return slug || 'miscellaneous';
  }, [listing?.category]);
  const detailEntries = useMemo(() => {
    const details = listing?.details;
    if (!details || typeof details !== 'object') {
      return [];
    }
    if (details.category === 'clothing') {
      return [
        {
          label: 'Gender',
          value: CLOTHING_GENDER_LABELS[details.gender] || details.gender || 'N/A',
        },
        {
          label: 'Size',
          value: CLOTHING_SIZE_LABELS[details.size] || details.size || 'N/A',
        },
        {
          label: 'Type',
          value: CLOTHING_TYPE_LABELS[details.type] || details.type || 'N/A',
        },
        {
          label: 'Color',
          value: COLOR_LABELS[details.color] || details.color || 'N/A',
        },
        {
          label: 'Condition',
          value: details.used ? 'Used' : 'New',
        },
      ];
    }
    if (details.category === 'decor') {
      const entries = [
        {
          label: 'Type',
          value: DECOR_TYPE_LABELS[details.type] || details.type || 'N/A',
        },
        {
          label: 'Color',
          value: COLOR_LABELS[details.color] || details.color || 'N/A',
        },
        {
          label: 'Condition',
          value: details.used ? 'Used' : 'New',
        },
      ];
      const dimensionLabels = {
        length: 'Length',
        width: 'Width',
        height: 'Height',
      };
      Object.keys(dimensionLabels).forEach((dimension) => {
        const rawValue = details[dimension];
        if (rawValue === undefined || rawValue === null || rawValue === '') {
          return;
        }
        const parsed = Number(rawValue);
        if (Number.isNaN(parsed) || parsed < 0) {
          return;
        }
        entries.push({
          label: `${dimensionLabels[dimension]} (in)`,
          value: `${parsed} in`,
        });
      });
      return entries;
    }
    if (details.category === 'tickets') {
      return [
        {
          label: 'Type',
          value: TICKET_TYPE_LABELS[details.type] || details.type || 'N/A',
        },
      ];
    }
    return [];
  }, [listing]);
  const sellerName =
    seller?.full_name || seller?.email || (listing?.seller_id ? 'Seller' : 'Unknown seller');
  const activePhoto = useMemo(() => {
    if (!photos.length) return null;
    const candidate = photos.find((photo) => photo.id === activePhotoId);
    return candidate || photos[0];
  }, [photos, activePhotoId]);
  const primaryDisplayUrl = useMemo(() => {
    if (activePhoto?.url) {
      return activePhoto.url;
    }
    if (primaryImageUrl) {
      return primaryImageUrl;
    }
    return null;
  }, [activePhoto?.url, primaryImageUrl]);

  useEffect(() => {
    if (primaryDisplayUrl) {
      console.debug('Primary listing image URL', primaryDisplayUrl);
    }
  }, [primaryDisplayUrl]);

  function getCategoryName(slug) {
    if (!slug) {
      return 'Miscellaneous';
    }
    const normalized = String(slug).toLowerCase();
    return CATEGORY_LABELS[normalized] || slug;
  }

  const activePhotoIndex = useMemo(() => {
    if (!photos.length) {
      return -1;
    }
    const index = photos.findIndex((photo) => photo.id === activePhotoId);
    return index >= 0 ? index : 0;
  }, [photos, activePhotoId]);
  const hasPrevPhoto = activePhotoIndex > 0;
  const hasNextPhoto = activePhotoIndex >= 0 && activePhotoIndex < photos.length - 1;

  function handlePrevPhoto() {
    if (!hasPrevPhoto) return;
    const previous = photos[activePhotoIndex - 1];
    if (previous) {
      setActivePhotoId(previous.id);
    }
  }

  function handleNextPhoto() {
    if (!hasNextPhoto) return;
    const next = photos[activePhotoIndex + 1];
    if (next) {
      setActivePhotoId(next.id);
    }
  }

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
    
  if (paymentMethod === 'STRIPE') {
      const data = await apiFetch('/stripe/create-checkout-session', {
        method: 'POST',
        body: { listing_id: listing.id },
        accessToken,
      });

      if (!data || !data.url) {
        throw new Error('Unable to start Stripe checkout');
      }
      window.location.href = data.url;
      return; 
    }

    
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

  async function handleStartChat() {
    if (!user) {
      router.push('/login');
      return;
    }
    if (!listing) return;
    setStartingChat(true);
    setChatError(null);
    try {
      const chatId = await startChat(listing.id);
      if (!chatId) {
        throw new Error('Unable to create conversation');
      }
      router.push({
        pathname: '/messages',
        query: { chat: chatId },
      });
    } catch (err) {
      setChatError(err.message);
    } finally {
      setStartingChat(false);
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

  const galleryViewerClass = photos.length > 1
    ? 'listing-gallery__viewer'
    : 'listing-gallery__viewer listing-gallery__viewer--full';

  return (
    <Layout>
      <section className="listing-detail">
        <div className="listing-detail__layout">
          <div className="listing-detail__media">
            {photosLoading ? (
                <div className="listing-gallery__placeholder">
                  <p>Loading photos…</p>
                </div>
              ) : (
              photos.length === 0 ? (
                <div className="listing-gallery listing-gallery--empty">
                  <div className="listing-gallery__empty">
                    <div className="listing-gallery__empty-icon" aria-hidden="true">📷</div>
                    <div className="listing-gallery__empty-text">
                      <p>No listing photos yet.</p>
                      <span>Check back soon or ask the seller for pictures.</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="listing-gallery">
                  {photos.length > 1 && (
                    <div className="listing-gallery__thumbs">
                      {photos.map((photo) => (
                        <button
                          type="button"
                          key={photo.id}
                          className={`listing-gallery__thumb${
                            photo.id === activePhotoId ? ' listing-gallery__thumb--active' : ''
                          }`}
                          onClick={() => setActivePhotoId(photo.id)}
                        >
                          <img src={photo.url} alt={`${listing.name} preview`} />
                        </button>
                      ))}
                    </div>
                  )}
                  <div className={galleryViewerClass}>
                    {photos.length > 1 && (
                      <button
                        type="button"
                        className="listing-gallery__nav listing-gallery__nav--prev"
                        onClick={handlePrevPhoto}
                        disabled={!hasPrevPhoto}
                        aria-label="View previous photo"
                      >
                        ‹
                      </button>
                    )}
                    <div className="listing-gallery__image">
                      {primaryDisplayUrl ? (
                        <div
                          key={primaryDisplayUrl}
                          className="listing-gallery__image-layer"
                          role="img"
                          aria-label={listing?.name || 'Listing photo'}
                          style={{ backgroundImage: `url(${primaryDisplayUrl})` }}
                        />
                      ) : (
                        <div className="listing-gallery__empty">
                          <div className="listing-gallery__empty-icon" aria-hidden="true">📷</div>
                          <div className="listing-gallery__empty-text">
                            <p>No listing photos yet.</p>
                            <span>Check back soon or ask the seller for pictures.</span>
                          </div>
                        </div>
                      )}
                    </div>
                    {photos.length > 1 && (
                      <button
                        type="button"
                        className="listing-gallery__nav listing-gallery__nav--next"
                        onClick={handleNextPhoto}
                        disabled={!hasNextPhoto}
                        aria-label="View next photo"
                      >
                        ›
                      </button>
                    )}
                  </div>
                </div>
              )
            )}
            {photosError && <p className="listing-gallery__error">{photosError}</p>}
            {primaryImageError && <p className="listing-gallery__error">{primaryImageError}</p>}
            {primaryDisplayUrl && (
              <div className="listing-gallery__debug-preview">
                <img
                  src={primaryDisplayUrl}
                  alt={listing?.name || 'Listing photo preview'}
                  style={{ marginTop: '1rem', maxWidth: '100%', borderRadius: '0.75rem' }}
                />
              </div>
            )}
          </div>

          <aside className="listing-detail__sidebar">
            <header className="listing-summary__header">
              <span
                className={`listing-summary__badge${
                  isSoldOut ? ' listing-summary__badge--sold' : ' listing-summary__badge--available'
                }`}
              >
                {isSoldOut ? 'Sold out' : 'Available'}
              </span>
              <h1 className="listing-summary__title">{listing.name}</h1>
              <p className="listing-summary__category">{getCategoryName(categoryValue)}</p>
            </header>

            <div className="listing-summary__card listing-summary__card--price">
              <span className="listing-summary__price">
                {typeof listing.price === 'number' ? `$${listing.price.toFixed(2)}` : 'Price not set'}
              </span>
              <div className="listing-summary__meta">
                <span className="listing-summary__meta-item">Quantity available: {quantity}</span>
                <span className="listing-summary__meta-item">
                  Category: {getCategoryName(categoryValue)}
                </span>
              </div>
            </div>
            {(listing.description && listing.description.trim().length > 0) && (
              <div className="listing-summary__card listing-summary__card--description">
                <h2 className="listing-summary__section-title">Description</h2>
                <p className="listing-summary__description">
                  {listing.description.trim()}
                </p>
              </div>
            )}
            {detailEntries.length > 0 && (
              <div className="listing-summary__card listing-summary__card--details">
                <h2 className="listing-summary__section-title">Item details</h2>
                <div className="listing-summary__meta">
                  {detailEntries.map((entry) => (
                    <span key={entry.label} className="listing-summary__meta-item">
                      <strong>{entry.label}:</strong> {entry.value}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {message && (
              <p className="listing-summary__alert listing-summary__alert--success">{message}</p>
            )}
            {(orderError || error || chatError) && (
              <p className="listing-summary__alert listing-summary__alert--error">
                {orderError || error || chatError}
              </p>
            )}

            {isOwner ? (
              <div className="listing-summary__card listing-summary__card--owner">
                <div className="listing-summary__actions listing-summary__actions--owner">
                  <Link href={`/items/${listing.id}/edit`} className="listing-summary__link">
                    Edit listing
                  </Link>
                  <button
                    type="button"
                    className="listing-summary__button listing-summary__button--ghost"
                    onClick={() => handleToggleSold(false)}
                    disabled={updating || !listing.sold}
                  >
                    Mark available
                  </button>
                  <button
                    type="button"
                    className="listing-summary__button listing-summary__button--ghost"
                    onClick={() => handleToggleSold(true)}
                    disabled={updating || listing.sold}
                  >
                    Mark sold
                  </button>
                </div>
              </div>
            ) : (
              <div className="listing-summary__card listing-summary__card--buyer">
                {user ? (
                  canBuy ? (
                    <>
                      <label htmlFor="paymentMethod" className="listing-summary__form-control">
                        Preferred payment method
                        <select
                          id="paymentMethod"
                          value={paymentMethod}
                          onChange={(event) => setPaymentMethod(event.target.value)}
                          className="listing-summary__select"
                        >
                          {PAYMENT_METHOD_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="listing-summary__actions">
                        <button
                          type="button"
                          className="listing-summary__button listing-summary__button--primary"
                          onClick={handleRequestPurchase}
                          disabled={orderSubmitting}
                        >
                          {orderSubmitting ? 'Submitting…' : 'Contact seller to buy'}
                        </button>
                        <button
                          type="button"
                          className="listing-summary__button listing-summary__button--outline"
                          onClick={handleStartChat}
                          disabled={startingChat}
                        >
                          {startingChat ? 'Opening chat…' : 'Message seller'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="listing-summary__note">This item is no longer available.</p>
                      <button
                        type="button"
                        className="listing-summary__button listing-summary__button--outline listing-summary__button--full"
                        onClick={handleStartChat}
                        disabled={startingChat}
                      >
                        {startingChat ? 'Opening chat…' : 'Message seller'}
                      </button>
                    </>
                  )
                ) : (
                  <p className="listing-summary__note">
                    <Link href="/login">Sign in</Link> to connect with the seller.
                  </p>
                )}
              </div>
            )}

            <div className="listing-summary__card listing-summary__seller-card">
              <h2 className="listing-summary__section-title">Seller</h2>
              {sellerLoading ? (
                <p className="listing-summary__note">Loading seller details…</p>
              ) : sellerError ? (
                <p className="listing-summary__alert listing-summary__alert--error">{sellerError}</p>
              ) : seller ? (
                <Link href={`/users/${listing.seller_id}`} className="listing-summary__seller-link">
                  {sellerAvatarUrl ? (
                    <img
                      src={sellerAvatarUrl}
                      alt={`${sellerName}'s avatar`}
                      className="listing-summary__seller-avatar"
                    />
                  ) : (
                    <div className="listing-summary__seller-placeholder">
                      {sellerInitials(sellerName)}
                    </div>
                  )}
                  <div className="listing-summary__seller-info">
                    <span className="listing-summary__seller-name">{sellerName}</span>
                    {seller.profile_description && (
                      <span className="listing-summary__seller-bio">{seller.profile_description}</span>
                    )}
                    <span className="listing-summary__seller-cta">View profile</span>
                  </div>
                </Link>
              ) : (
                <p className="listing-summary__note">Seller information unavailable.</p>
              )}
            </div>
          </aside>
        </div>
      </section>
    </Layout>
  );
}

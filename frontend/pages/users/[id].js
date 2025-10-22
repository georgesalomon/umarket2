import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
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

function initialsFromName(name) {
  if (!name) return 'U';
  const clean = String(name).trim();
  if (!clean) return 'U';
  const segments = clean.split(/\s+/);
  if (segments.length === 1) {
    return segments[0].slice(0, 2).toUpperCase();
  }
  const first = segments[0]?.[0] || '';
  const last = segments[segments.length - 1]?.[0] || '';
  const value = `${first}${last}`.toUpperCase();
  return value || 'U';
}

export default function PublicUserProfile() {
  const router = useRouter();
  const { id } = router.query;
  const sellerId = typeof id === 'string' ? id : Array.isArray(id) ? id[0] : null;
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [listings, setListings] = useState([]);
  const [listingsLoading, setListingsLoading] = useState(true);
  const [listingsError, setListingsError] = useState(null);
  const [profileAvatarUrl, setProfileAvatarUrl] = useState(null);

  useEffect(() => {
    if (!sellerId) return;
    let cancelled = false;

    async function loadProfile() {
      setProfileLoading(true);
      setProfileError(null);
      try {
        const data = await apiFetch(`/users/${sellerId}`);
        if (!cancelled) {
          setProfile(data);
        }
      } catch (error) {
        if (!cancelled) {
          setProfileError(error.message);
        }
      } finally {
        if (!cancelled) {
          setProfileLoading(false);
        }
      }
    }

    async function loadListings() {
      setListingsLoading(true);
      setListingsError(null);
      try {
        const params = new URLSearchParams({ seller_id: sellerId });
        const data = await apiFetch(`/listings?${params.toString()}`);
        if (!cancelled) {
          setListings(data || []);
        }
      } catch (error) {
        if (!cancelled) {
          setListingsError(error.message);
        }
      } finally {
        if (!cancelled) {
          setListingsLoading(false);
        }
      }
    }

    loadProfile();
    loadListings();

    return () => {
      cancelled = true;
    };
  }, [sellerId]);

  const displayName = useMemo(() => {
    if (!profile) return 'Seller profile';
    return profile.full_name || profile.email || 'Seller profile';
  }, [profile]);

  const sortedListings = useMemo(() => {
    if (!listings || listings.length === 0) return [];
    return [...listings].sort((a, b) => {
      if (!!a.sold === !!b.sold) return 0;
      return a.sold ? 1 : -1;
    });
  }, [listings]);

  useEffect(() => {
    if (!profile) {
      setProfileAvatarUrl(null);
      return;
    }
    if (profile.avatar_path) {
      const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(profile.avatar_path);
      if (data?.publicUrl) {
        setProfileAvatarUrl(data.publicUrl);
        return;
      }
    }
    setProfileAvatarUrl(profile.avatar_url || null);
  }, [profile]);

  return (
    <Layout>
      <section className="public-profile">
        {profileLoading ? (
          <div className="public-profile__card public-profile__card--loading">
            <p>Loading profile…</p>
          </div>
        ) : profileError ? (
          <div className="public-profile__card public-profile__card--error">
            <p>{profileError}</p>
          </div>
        ) : profile ? (
          <div className="public-profile__card">
            {profileAvatarUrl ? (
              <img
                src={profileAvatarUrl}
                alt={`${displayName}'s avatar`}
                className="public-profile__avatar"
              />
            ) : (
              <div className="public-profile__avatar public-profile__avatar--placeholder">
                {initialsFromName(displayName)}
              </div>
            )}
            <div className="public-profile__info">
              <h1>{displayName}</h1>
              {profile.email && <p className="public-profile__email">{profile.email}</p>}
              {profile.profile_description && (
                <p className="public-profile__bio">{profile.profile_description}</p>
              )}
              <div className="public-profile__stats">
                <span>
                  Active listings:{' '}
                  <strong>{listings.filter((item) => !item.sold && (item.quantity ?? 1) > 0).length}</strong>
                </span>
                <span>Total listings: <strong>{listings.length}</strong></span>
              </div>
            </div>
          </div>
        ) : null}

        <div className="public-profile__listings">
          <header className="public-profile__listings-header">
            <h2>Listings</h2>
            <span className="public-profile__count">
              {listings.length} {listings.length === 1 ? 'item' : 'items'}
            </span>
          </header>

          {listingsError && <p className="listing-detail__feedback listing-detail__feedback--error">{listingsError}</p>}
          {listingsLoading && <p className="public-profile__note">Loading listings…</p>}
          {!listingsLoading && sortedListings.length === 0 && (
            <div className="public-profile__empty">
              <h3>No listings yet</h3>
              <p>This seller hasn’t posted anything for sale right now.</p>
            </div>
          )}

          {!listingsLoading && sortedListings.length > 0 && (
            <ul className="home-listings__grid">
              {sortedListings.map((listing) => {
                const quantity =
                  typeof listing.quantity === 'number' && Number.isFinite(listing.quantity)
                    ? listing.quantity
                    : 1;
                const isSold = listing.sold || quantity <= 0;
                const badgeClass = isSold
                  ? 'home-listings__badge home-listings__badge--sold'
                  : 'home-listings__badge home-listings__badge--available';
                const priceLabel =
                  typeof listing.price === 'number' ? `$${listing.price.toFixed(2)}` : 'Not set';

                return (
                  <li key={listing.id} className="home-listings__item">
                    <div className="home-listings__header">
                      <h3 className="home-listings__title">{listing.name}</h3>
                      <span className={badgeClass}>{isSold ? 'Sold' : 'Available'}</span>
                    </div>
                    <p className="home-listings__price">{priceLabel}</p>
                    <p className="home-listings__meta">
                      Category:{' '}
                      <strong>
                        {CATEGORY_LABELS[listing.category] || 'Miscellaneous'}
                      </strong>
                    </p>
                    <p className="home-listings__meta">Quantity: {quantity}</p>
                    <Link href={`/items/${listing.id}`} className="home-listings__link">
                      View listing
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </Layout>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../utils/apiClient';
import { supabase } from '../../utils/supabaseClient';

const AVATAR_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_AVATAR_BUCKET || 'avatars';

export default function ProfileDashboard() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [profileLoading, setProfileLoading] = useState(true);
  const [listingsLoading, setListingsLoading] = useState(true);
  const [listings, setListings] = useState([]);
  const [profileError, setProfileError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [listingsError, setListingsError] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const [description, setDescription] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [avatarPath, setAvatarPath] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login');
    }
  }, [authLoading, user, router]);

  const displayName = useMemo(() => {
    if (!user) return '';
    return user.user_metadata?.full_name || user.email || 'Your profile';
  }, [user]);

  const initials = useMemo(() => {
    if (!displayName) return 'U';
    const trimmed = displayName.trim();
    if (!trimmed) return 'U';
    const segments = trimmed.split(/\s+/);
    const first = segments[0]?.[0];
    const second = segments.length > 1 ? segments[segments.length - 1]?.[0] : '';
    return `${first || ''}${second || ''}`.toUpperCase() || 'U';
  }, [displayName]);

  const loadProfile = useCallback(async () => {
    if (!user) {
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      const currentUser = data?.user;
      const descriptionValue = currentUser?.user_metadata?.profile_description ?? '';
      const avatarPathValue = currentUser?.user_metadata?.avatar_path ?? null;
      setDescription(descriptionValue);
      setAvatarPath(avatarPathValue);
      if (avatarPathValue) {
        const { data: publicData } = supabase.storage
          .from(AVATAR_BUCKET)
          .getPublicUrl(avatarPathValue);
        setAvatarUrl(publicData?.publicUrl ?? null);
      } else {
        setAvatarUrl(null);
      }
      setProfileError(null);
    } catch (error) {
      setProfileError(error.message);
    } finally {
      setProfileLoading(false);
    }
  }, [user]);

  const fetchListings = useCallback(async () => {
    if (!user) {
      setListingsLoading(false);
      return;
    }
    setListingsLoading(true);
    try {
      const params = new URLSearchParams({ seller_id: user.id });
      const data = await apiFetch(`/listings?${params.toString()}`);
      setListings(data || []);
      setListingsError(null);
    } catch (error) {
      setListingsError(error.message);
    } finally {
      setListingsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadProfile();
      fetchListings();
    }
  }, [user, loadProfile, fetchListings]);

  async function handleSaveProfile(event) {
    event.preventDefault();
    if (!user) return;
    setSavingProfile(true);
    setFormError(null);
    setStatusMessage(null);
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          profile_description: description,
        },
      });
      if (error) throw error;
      setStatusMessage('Profile updated successfully.');
      await loadProfile();
    } catch (error) {
      setFormError(error.message);
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleAvatarUpload(event) {
    const fileInput = event.target;
    const file = fileInput.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    setFormError(null);
    setStatusMessage(null);

    try {
      const fileExt = file.name.split('.').pop() || 'jpg';
      const fileName = `${user.id}-${Date.now()}.${fileExt.toLowerCase()}`;
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;

      if (avatarPath && avatarPath !== filePath) {
        await supabase.storage.from(AVATAR_BUCKET).remove([avatarPath]);
      }

      const { error: updateError } = await supabase.auth.updateUser({
        data: {
          avatar_path: filePath,
        },
      });
      if (updateError) throw updateError;

      setStatusMessage('Profile photo updated.');
      await loadProfile();
    } catch (error) {
      setFormError(normalizeStorageError(error));
    } finally {
      setUploading(false);
      fileInput.value = '';
    }
  }

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
      <div className="profile-page">
        <div className="profile-card">
          <div className="profile-card__avatar">
            {avatarUrl ? (
              <img src={avatarUrl} alt={`${displayName} avatar`} />
            ) : (
              <div className="profile-card__avatar-placeholder">{initials}</div>
            )}
            <label className="profile-card__upload">
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                disabled={uploading}
              />
              {uploading ? 'Uploading…' : avatarUrl ? 'Change photo' : 'Add photo'}
            </label>
          </div>
          <div className="profile-card__body">
            <h1>{displayName}</h1>
            <p className="profile-card__email">{user.email}</p>
            {profileLoading ? (
              <p>Loading profile…</p>
            ) : (
              <form className="profile-card__form" onSubmit={handleSaveProfile}>
                <label htmlFor="profileDescription">Profile description</label>
                <textarea
                  id="profileDescription"
                  rows={4}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Tell buyers a bit about yourself, what you sell, or how to reach you."
                />
                <div className="profile-card__actions">
                  <button type="submit" disabled={savingProfile}>
                    {savingProfile ? 'Saving…' : 'Save profile'}
                  </button>
                </div>
              </form>
            )}
            {(formError || profileError) && (
              <p className="profile-card__error">{formError || profileError}</p>
            )}
            {statusMessage && <p style={{ color: 'green' }}>{statusMessage}</p>}
          </div>
        </div>

        <section className="profile-listings">
          <div className="profile-listings__header">
            <h2>Your listings</h2>
            <button type="button" onClick={fetchListings} disabled={listingsLoading}>
              {listingsLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          {listingsError && <p style={{ color: 'red' }}>{listingsError}</p>}
          {listingsLoading && <p>Loading listings…</p>}
          {!listingsLoading && listings.length === 0 && (
            <p>You have not posted any listings yet.</p>
          )}
          {!listingsLoading && listings.length > 0 && (
            <ul className="profile-listings__grid">
              {listings.map((listing) => (
                <li key={listing.id} className="profile-listings__item">
                  <h3>{listing.name}</h3>
                  <p className="profile-listings__price">
                    Price:{' '}
                    {typeof listing.price === 'number'
                      ? `$${listing.price.toFixed(2)}`
                      : 'Not set'}
                  </p>
                  <p>Status: {listing.sold ? 'Sold' : 'Available'}</p>
                  <p>Quantity: {listing.quantity ?? 1}</p>
                  <Link href={`/items/${listing.id}`}>View listing</Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Layout>
  );
}

function normalizeStorageError(error) {
  const message = error?.message || 'Something went wrong while uploading your photo.';
  if (typeof message === 'string' && message.toLowerCase().includes('bucket')) {
    return (
      'Profile photo storage bucket not found. Create a Supabase storage bucket named "' +
      AVATAR_BUCKET +
      '" (make it public and allow authenticated users to upload), or set NEXT_PUBLIC_SUPABASE_AVATAR_BUCKET to an existing public bucket.'
    );
  }
  return message;
}

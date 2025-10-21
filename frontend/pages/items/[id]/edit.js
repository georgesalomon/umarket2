import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../../components/Layout';
import ListingForm from '../../../components/ListingForm';
import { useAuth } from '../../../context/AuthContext';
import { apiFetch } from '../../../utils/apiClient';

export default function EditListing() {
  const router = useRouter();
  const { id } = router.query;
  const { user, accessToken, loading: authLoading } = useAuth();
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    if (!id) return;
    async function fetchListing() {
      setLoading(true);
      try {
        const data = await apiFetch(`/listings/${id}`);
        setListing(data);
      } catch (err) {
        setLoadError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchListing();
  }, [id]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!authLoading && user && listing && listing.seller_id !== user.id) {
      router.replace(`/items/${id}`);
    }
  }, [authLoading, user, listing, router, id]);

  async function handleUpdate(payload) {
    if (!accessToken) {
      setFormError('You must be logged in to update a listing');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const updated = await apiFetch(`/listings/${id}`, {
        method: 'PATCH',
        body: payload,
        accessToken,
      });
      setListing(updated);
      router.replace(`/items/${id}`);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!accessToken) {
      setDeleteError('Missing access token');
      return;
    }
    const confirmed = window.confirm('Delete this listing? This action cannot be undone.');
    if (!confirmed) return;
    setDeleteError(null);
    try {
      await apiFetch(`/listings/${id}`, {
        method: 'DELETE',
        accessToken,
      });
      router.replace('/dashboard/listings');
    } catch (err) {
      setDeleteError(err.message);
    }
  }

  if (authLoading || loading) {
    return (
      <Layout>
        <p>Loading listing…</p>
      </Layout>
    );
  }

  if (loadError) {
    return (
      <Layout>
        <p style={{ color: 'red' }}>{loadError}</p>
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

  const initialValues = {
    name: listing.name,
    price: listing.price,
    quantity: listing.quantity ?? 1,
    sold: listing.sold ?? false,
    category: listing.category ?? 'miscellaneous',
  };

  return (
    <Layout>
      <h1>Edit listing</h1>
      <ListingForm
        initialValues={initialValues}
        onSubmit={handleUpdate}
        submitting={submitting}
        error={formError}
        allowSoldToggle
        submitLabel="Update listing"
      />
      <div style={{ marginTop: '1rem' }}>
        <button type="button" onClick={handleDelete} style={{ color: '#b00020' }}>
          Delete listing
        </button>
        {deleteError && <p style={{ color: 'red' }}>{deleteError}</p>}
      </div>
    </Layout>
  );
}

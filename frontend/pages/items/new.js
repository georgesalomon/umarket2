import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../components/Layout';
import ListingForm from '../../components/ListingForm';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../utils/apiClient';

// form for creating new item listing. the user has to be logged in to access this page.

export default function NewListing() {
  const router = useRouter();
  const { user, accessToken, loading: authLoading } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login');
    }
  }, [authLoading, user, router]);

  async function handleCreate(payload) {
    if (!accessToken) {
      setError('You must be logged in to create a listing');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/listings', {
        method: 'POST',
        body: payload,
        accessToken,
      });
      router.replace('/dashboard/listings');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading) {
    return (
      <Layout>
        <p>Checking authentication…</p>
      </Layout>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <Layout>
      <h1>Create a listing</h1>
      <ListingForm
        onSubmit={handleCreate}
        submitting={submitting}
        error={error}
        submitLabel="Create listing"
      />
    </Layout>
  );
}

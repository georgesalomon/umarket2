import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../utils/supabaseClient';
import Link from 'next/link';


// form for creating new item listing. the user has to be logged in to access this page. when the form is submitted the new record is 
// inserted into the 'items' table. supabase will autmatically set the user_id column to the authenticaed user's id

export default function NewListing() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    //check if the user is logged in
    async function fetchUser() {
      const { data } = await supabase.auth.getUser();
      setUser(data?.user || null);
    }
    fetchUser();
    const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user || null);
    });
    return () => {
      listener?.subscription?.unsubscribe();
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!user) {
      setError('You must be logged in to create a listing');
      return;
    }
    setLoading(true);
    setError(null);
    const priceFloat = parseFloat(price);
    const { error } = await supabase.from('listings').insert([
      {
        title,
        description,
        price_cents: Math.round(priceFloat * 100),
        status: 'available',
      },
    ]);
    if (error) {
      setError(error.message);
    } else {
      router.push('/');
    }
    setLoading(false);
  }

  if (user === null) {
    return (
      <div className="container">
        <p>Please <Link href="/login">login</Link> to create a listing.</p>
      </div>
    );
  }

  return (
    <div className="container">
      <header className="nav">
        <h1>New Listing</h1>
      </header>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '0.5rem' }}>
          <label htmlFor="title">Title</label>
          <br />
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
        <div style={{ marginBottom: '0.5rem' }}>
          <label htmlFor="description">Description</label>
          <br />
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            required
          />
        </div>
        <div style={{ marginBottom: '0.5rem' }}>
          <label htmlFor="price">Price</label>
          <br />
          <input
            id="price"
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
            step="0.01"
            min="0"
          />
        </div>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Submitting…' : 'Create'}
        </button>
      </form>
    </div>
  );
}
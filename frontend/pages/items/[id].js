import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { supabase } from '../../utils/supabaseClient';
import Link from 'next/link';


// good view of a single item. shows the item attributes and allows authenticated users to submit a purchase request
//the purchase request is created in the 'orders'table with the status being "pending"
/**
  Detailed view of a single item. Shows the item attributes and allows
  authenticated users to submit a purchase request. The purchase request
  is created in the `orders` table with status "pending".
 */
export default function ListingDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [listing, setListing] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => {
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

  useEffect(() => {
    if (!id) return;
    async function fetchListing() {
      setLoading(true);
      const { data, error } = await supabase
        .from('listings')
        .select('*')
        .eq('id', id)
        .single();
      if (error) {
        setError(error.message);
      } else {
        setListing(data);
      }
      setLoading(false);
    }
    fetchListing();
  }, [id]);

  async function handleRequestPurchase() {
    if (!user) {
      router.push('/login');
      return;
    }
    if (!listing) return;
    if (listing.seller_id === user.id) {
      setMessage('You cannot purchase your own listing');
      return;
    }
    setMessage(null);
    setError(null);
    const { error } = await supabase.from('orders').insert([
      {
        listing_id: listing.id,
        buyer_id: user.id,
        amount_cents: listing.price_cents,
        status: 'pending',
      },
    ]);
    if (error) {
      setError(error.message);
    } else {
      setMessage('Purchase request submitted');
    }
  }

  if (loading)
    return (
      <div className="container">
        <p>Loading…</p>
      </div>
    );
  if (error)
    return (
      <div className="container">
        <p style={{ color: 'red' }}>{error}</p>
      </div>
    );
  if (!listing)
    return (
      <div className="container">
        <p>Listing not found</p>
      </div>
    );
  return (
    <div className="container">
      <header className="nav">
        <h1>{listing.title}</h1>
        <div>
          <Link href="/">Back</Link>
        </div>
      </header>
      <p>
        <strong>Description:</strong> {listing.description}
      </p>
      <p>
        <strong>Price:</strong> ${listing.price_cents / 100}
      </p>
      <p>
        <strong>Status:</strong> {listing.status}
      </p>
      {message && <p style={{ color: 'green' }}>{message}</p>}
      {user ? (
        <button onClick={handleRequestPurchase}>Request to Buy</button>
      ) : (
        <p>
          <Link href="/login">Login</Link> to purchase
        </p>
      )}
    </div>
  );
}
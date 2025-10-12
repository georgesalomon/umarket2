import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../utils/supabaseClient';


//home page with all available items. users can see listings

 export default function Home() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchListings() {
      const { data, error } = await supabase
        .from('listings')
        .select('*')
        .eq('status', 'available');
      if (error) {
        console.error('Error fetching listings', error);
      } else {
        setListings(data || []);
      }
      setLoading(false);
    }
    fetchListings();
  }, []);

  return (
    <div className="container">
      <header className="nav">
        <h1>UMarket</h1>
        <div>
          <Link href="/login">Login</Link>
          <Link href="/items/new">Create Listing</Link>
        </div>
      </header>
      <h2>Available Listings</h2>
      {loading && <p>Loading…</p>}
      {!loading && listings.length === 0 && <p>No listings found.</p>}
      <ul>
        {listings.map((listing) => (
          <li key={listing.id} style={{ marginBottom: '0.5rem' }}>
            <Link href={`/items/${listing.id}`}>{listing.title}</Link> – ${
              (listing.price_cents || 0) / 100
            }
          </li>
        ))}
      </ul>
    </div>
  );
}
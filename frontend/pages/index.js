import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../utils/apiClient';

// home page with all available items. users can see listings

const CATEGORY_CARDS = [
  {
    slug: 'decor',
    name: 'Decor',
    backgroundImage:
      "linear-gradient(135deg, rgba(0, 0, 0, 0.45), rgba(0, 0, 0, 0.25)), url('https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=800&q=80')",
  },
  {
    slug: 'clothing',
    name: 'Clothing',
    backgroundImage:
      "linear-gradient(135deg, rgba(0, 0, 0, 0.45), rgba(0, 0, 0, 0.25)), url('https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=800&q=80')",
  },
  {
    slug: 'school-supplies',
    name: 'School Supplies',
    backgroundImage:
      "linear-gradient(135deg, rgba(0, 0, 0, 0.45), rgba(0, 0, 0, 0.25)), url('https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=800&q=80')",
  },
  {
    slug: 'tickets',
    name: 'Tickets',
    backgroundImage:
      "linear-gradient(135deg, rgba(0, 0, 0, 0.45), rgba(0, 0, 0, 0.25)), url('https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=1000&q=80')",
  },
  {
    slug: 'miscellaneous',
    name: 'Miscellaneous',
    backgroundImage:
      "linear-gradient(135deg, rgba(0, 0, 0, 0.45), rgba(0, 0, 0, 0.25)), url('https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=800&q=80')",
  },
];

export default function Home() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchResults, setSearchResults] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const { user } = useAuth();
  const router = useRouter();
  const activeCategory =
    typeof router.query.category === 'string' ? router.query.category.toLowerCase() : null;

  useEffect(() => {
    async function fetchListings() {
      try {
        const params = new URLSearchParams({ sold: 'false' });
        const data = await apiFetch(`/listings?${params.toString()}`);
        setListings(data || []);
      } catch (error) {
        console.error('Error fetching listings', error);
      } finally {
        setLoading(false);
      }
    }
    fetchListings();
  }, []);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }

    const controller = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ sold: 'false', search: searchTerm.trim() });
        const data = await apiFetch(`/listings?${params.toString()}`);
        setSearchResults(Array.isArray(data) ? data : []);
        setSearchError(null);
      } catch (error) {
        setSearchError(error.message);
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);

    return () => clearTimeout(controller);
  }, [searchTerm]);

  const filteredListings = useMemo(() => {
    const base = searchTerm.trim() ? searchResults : listings;
    if (!activeCategory) {
      return base;
    }
    return base.filter((listing) => {
      const categoryValue =
        typeof listing.category === 'string' && listing.category
          ? listing.category.toLowerCase()
          : 'miscellaneous';
      return categoryValue === activeCategory;
    });
  }, [activeCategory, listings, searchResults, searchTerm]);

  function getCategoryName(slug) {
    const match = CATEGORY_CARDS.find((category) => category.slug === slug);
    return match ? match.name : slug;
  }

  function handleCategorySelect(slug) {
    const normalized = slug ? slug.toLowerCase() : null;
    const isCurrentlyActive = normalized && normalized === activeCategory;
    router.push(
      {
        pathname: '/',
        query: isCurrentlyActive ? {} : normalized ? { category: normalized } : {},
      },
      undefined,
      { shallow: true },
    );
  }

  function highlight(text) {
    if (!searchTerm.trim()) {
      return text;
    }
    const rawTerm = searchTerm.trim();
    const escaped = rawTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'ig');
    const parts = String(text).split(regex);
    return parts.map((part, index) =>
      part.toLowerCase() === rawTerm.toLowerCase() ? (
        <mark key={`${part}-${index}`} className="search-highlight">
          {part}
        </mark>
      ) : (
        <span key={`${part}-${index}`}>{part}</span>
      ),
    );
  }

  const hasActiveSearch = Boolean(searchTerm.trim());

  const previewResults = hasActiveSearch ? searchResults.slice(0, 20) : [];

  const searchControl = (
    <div className="nav-search-wrapper">
      <div className="nav-search">
        <span className="nav-search__icon" aria-hidden="true">
          🔍
        </span>
        <input
          type="search"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search for textbooks, decor, tickets…"
          aria-label="Search listings"
        />
        {searchTerm && (
          <button type="button" className="nav-search__clear" onClick={() => setSearchTerm('')}>
            Clear
          </button>
        )}
      </div>
      {hasActiveSearch && (
        <div className="nav-search-results" role="status">
          {searching ? (
            <p className="nav-search-results__status">Searching…</p>
          ) : searchError ? (
            <p className="nav-search-results__status nav-search-results__status--error">{searchError}</p>
          ) : previewResults.length === 0 ? (
            <p className="nav-search-results__status">No matches yet.</p>
          ) : (
            <ul>
              {previewResults.map((result) => (
                <li key={result.id}>
                  <Link href={`/items/${result.id}`} className="nav-search-results__item">
                    <span className="nav-search-results__name">{highlight(result.name)}</span>
                    <span className="nav-search-results__meta">
                      {typeof result.price === 'number'
                        ? `$${result.price.toFixed(2)}`
                        : 'Price pending'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );

  return (
    <Layout searchSlot={searchControl}>
      {hasActiveSearch && (searching || searchError) && (
        <p className={`search-status${searchError ? ' search-status--error' : ''}`}>
          {searchError ? searchError : 'Searching…'}
        </p>
      )}
      <section className="category-section">
        <h1>Browse by Category</h1>
        <p className="category-section__subtitle">
          Jump straight to what you need with quick links to our most popular listing categories.
        </p>
        <div className="category-grid">
          {CATEGORY_CARDS.map((category) => (
            <Link
              key={category.slug}
              href={{ pathname: '/', query: { category: category.slug } }}
              className={`category-card${
                activeCategory === category.slug ? ' category-card--active' : ''
              }`}
              style={{ backgroundImage: category.backgroundImage }}
            >
              <span className="category-card__name">{category.name}</span>
              <span className="category-card__cta">Explore listings</span>
            </Link>
          ))}
        </div>
      </section>
      <section className="home-listings">
        <div className="home-listings__header">
          <h2>Available Listings</h2>
          {user && (
            <Link href="/items/new" className="home-listings__cta">
              + Create listing
            </Link>
          )}
        </div>
        {activeCategory && (
          <div className="listing-filter-banner">
            <span>
              Showing <strong>{getCategoryName(activeCategory)}</strong> listings.
            </span>
            <Link href="/" className="listing-filter-banner__clear">
              Clear filter
            </Link>
          </div>
        )}
        {loading && <p>Loading…</p>}
        {!loading && !searching && filteredListings.length === 0 && (
          <p>
            {activeCategory
              ? 'No listings found in this category yet—check back soon!'
              : 'No listings found.'}
          </p>
        )}
        {!loading && filteredListings.length > 0 && (
          <ul className="home-listings__grid">
            {filteredListings.map((listing) => {
              const quantity =
                typeof listing.quantity === 'number' && Number.isFinite(listing.quantity)
                  ? listing.quantity
                  : 1;
              const isSoldOut = listing.sold || quantity <= 0;
              const priceLabel =
                typeof listing.price === 'number' ? `$${listing.price.toFixed(2)}` : 'Not set';
              const categoryValue =
                typeof listing.category === 'string' && listing.category
                  ? listing.category.toLowerCase()
                  : 'miscellaneous';
              const badgeClass = isSoldOut
                ? 'home-listings__badge home-listings__badge--sold'
                : 'home-listings__badge home-listings__badge--available';

              return (
                <li key={listing.id} className="home-listings__item">
                  <div className="home-listings__header">
                    <h3 className="home-listings__title">
                      {hasActiveSearch ? highlight(listing.name) : listing.name}
                    </h3>
                    <span className={badgeClass}>{isSoldOut ? 'Sold out' : 'Available'}</span>
                  </div>
                  <p className="home-listings__price">{priceLabel}</p>
                  <p className="home-listings__meta">
                    Category: <strong>{getCategoryName(categoryValue)}</strong>
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
      </section>
    </Layout>
  );
}

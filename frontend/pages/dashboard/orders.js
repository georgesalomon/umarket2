import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '../../components/Layout';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../utils/apiClient';

function OrderList({ title, orders, emptyMessage }) {
  return (
    <section style={{ marginBottom: '2rem' }}>
      <h2>{title}</h2>
      {orders.length === 0 ? (
        <p>{emptyMessage}</p>
      ) : (
        <ul>
          {orders.map((order) => {
            const product = order.product;
            return (
              <li key={order.id} style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <strong>{product?.name || `Listing #${order.listing_id}`}</strong>
                  {typeof product?.price === 'number' && (
                    <span>Price: ${product.price.toFixed(2)}</span>
                  )}
                  <span>Payment method: {order.payment_method || 'Not provided'}</span>
                  {order.created_at && (
                    <span>Created: {new Date(order.created_at).toLocaleString()}</span>
                  )}
                  <Link href={`/items/${order.listing_id}`}>View listing</Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default function DashboardOrders() {
  const router = useRouter();
  const { user, accessToken, loading: authLoading } = useAuth();
  const [buyerOrders, setBuyerOrders] = useState([]);
  const [sellerOrders, setSellerOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user || !accessToken) return;

    async function fetchOrders() {
      setLoading(true);
      setError(null);
      try {
        const [buyer, seller] = await Promise.all([
          apiFetch('/orders?role=buyer', { accessToken }),
          apiFetch('/orders?role=seller', { accessToken }),
        ]);
        setBuyerOrders(buyer || []);
        setSellerOrders(seller || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchOrders();
  }, [user, accessToken]);

  if (authLoading) {
    return (
      <Layout>
        <p>Loading orders…</p>
      </Layout>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <Layout>
      <h1>Transactions</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {loading ? (
        <p>Loading…</p>
      ) : (
        <>
          <OrderList
            title="Purchases I've made"
            orders={buyerOrders}
            emptyMessage="You haven’t purchased anything yet."
          />
          <OrderList
            title="Purchases for my listings"
            orders={sellerOrders}
            emptyMessage="No one has purchased your listings yet."
          />
        </>
      )}
    </Layout>
  );
}

import { useEffect, useState } from 'react';

const DEFAULT_VALUES = {
  name: '',
  price: '',
  quantity: '1',
  sold: false,
};

export default function ListingForm({
  initialValues,
  onSubmit,
  submitting = false,
  error,
  allowSoldToggle = false,
  submitLabel = 'Save listing',
}) {
  const [values, setValues] = useState(() => ({
    ...DEFAULT_VALUES,
    ...normalizeInitial(initialValues),
  }));
  const [localError, setLocalError] = useState(null);

  useEffect(() => {
    setValues({
      ...DEFAULT_VALUES,
      ...normalizeInitial(initialValues),
    });
  }, [initialValues]);

  function handleChange(field, value) {
    setValues((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setLocalError(null);

    const trimmedName = values.name.trim();
    const parsedPrice = parseFloat(values.price);
    const parsedQuantity = parseInt(values.quantity, 10);

    if (!trimmedName) {
      setLocalError('Name is required');
      return;
    }
    if (Number.isNaN(parsedPrice) || parsedPrice <= 0) {
      setLocalError('Enter a price greater than 0');
      return;
    }
    if (Number.isNaN(parsedQuantity) || parsedQuantity < 0) {
      setLocalError('Enter a quantity of 0 or greater');
      return;
    }

    const payload = {
      name: trimmedName,
      price: parsedPrice,
      quantity: parsedQuantity,
    };

    if (allowSoldToggle) {
      payload.sold = Boolean(values.sold);
    }

    await onSubmit(payload);
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: '0.5rem' }}>
        <label htmlFor="name">Name</label>
        <br />
        <input
          id="name"
          type="text"
          value={values.name}
          onChange={(event) => handleChange('name', event.target.value)}
          required
        />
      </div>
      <div style={{ marginBottom: '0.5rem' }}>
        <label htmlFor="price">Price (USD)</label>
        <br />
        <input
          id="price"
          type="number"
          value={values.price}
          onChange={(event) => handleChange('price', event.target.value)}
          required
          step="0.01"
          min="0"
        />
      </div>
      <div style={{ marginBottom: '0.5rem' }}>
        <label htmlFor="quantity">Quantity</label>
        <br />
        <input
          id="quantity"
          type="number"
          value={values.quantity}
          onChange={(event) => handleChange('quantity', event.target.value)}
          required
          min="0"
          step="1"
        />
      </div>
      {allowSoldToggle && (
        <div style={{ marginBottom: '0.5rem' }}>
          <label htmlFor="sold">
            <input
              id="sold"
              type="checkbox"
              checked={Boolean(values.sold)}
              onChange={(event) => handleChange('sold', event.target.checked)}
              style={{ marginRight: '0.4rem' }}
            />
            Mark as sold
          </label>
        </div>
      )}
      {(localError || error) && <p style={{ color: 'red' }}>{localError || error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}

function normalizeInitial(initialValues) {
  if (!initialValues) return {};
  const normalized = { ...initialValues };
  if (normalized.price !== undefined && normalized.price !== null) {
    normalized.price = normalized.price.toString();
  }
  if (normalized.quantity !== undefined && normalized.quantity !== null) {
    normalized.quantity = normalized.quantity.toString();
  }
  return normalized;
}

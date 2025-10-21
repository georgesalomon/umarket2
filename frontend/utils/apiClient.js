const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';

async function parseResponse(response) {
  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    return text;
  }
}

export async function apiFetch(path, { method = 'GET', body, accessToken, headers: extraHeaders } = {}) {
  const url = `${API_BASE}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(extraHeaders || {}),
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await parseResponse(response);

  if (!response.ok) {
    const message =
      (data && typeof data === 'object' && data.detail) ||
      (typeof data === 'string' && data) ||
      'Request failed';
    const error = new Error(message);
    error.status = response.status;
    error.payload = data;
    throw error;
  }

  return data;
}

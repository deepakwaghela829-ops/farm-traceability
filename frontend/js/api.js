// api.js - Unified REST API Client for AgriTrace OS
export const API_BASE_URL = (
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE_URL) ||
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:8000'
    : 'https://farm-traceability-backend.vercel.app')
).replace(/\/$/, '');

async function request(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  try {
    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      let errDetail = 'Request failed';
      try {
        const errJson = await res.json();
        errDetail = errJson.detail || errDetail;
      } catch {}
      console.warn(`[API ${res.status}] ${path}:`, errDetail);
      throw new Error(errDetail);
    }
    return await res.json();
  } catch (err) {
    console.error(`[API Network Error] ${path}:`, err);
    throw err;
  }
}

// 1. Auth API
export async function loginApi(username, password) {
  return request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
}

export async function fetchCurrentUserApi(token) {
  return request('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function fetchSystemUsersApi(token) {
  return request('/api/auth/users', {
    headers: { Authorization: `Bearer ${token}` }
  });
}

// 2. Crop API
export async function fetchCropsApi(farmerId = null) {
  const qs = farmerId ? `?farmer_id=${encodeURIComponent(farmerId)}` : '';
  return request(`/api/crops${qs}`);
}

export async function fetchCropByIdApi(id) {
  return request(`/api/crops/${id}`);
}

export async function createCropApi(payload, token = null) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return request('/api/crops', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
}

// 3. Transactions API
export async function fetchCropTransactionsApi(cropId) {
  return request(`/api/transactions/${cropId}`);
}

export async function saveTransactionApi(payload, token = null) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return request('/api/transactions', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
}

// 4. AI Price Prediction API
export async function predictCropPriceApi(payload) {
  return request('/api/prediction/price', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function fetchCropPredictionApi(cropId) {
  return request(`/api/prediction/crop/${cropId}`);
}

export async function fetchCropBenchmarksApi(cropType) {
  return request(`/api/prediction/benchmarks/${encodeURIComponent(cropType)}`);
}

// 5. Pricing Workflow API
export async function confirmRetailPriceApi(cropId, token, markupPerKg = 30.00) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return request(`/api/crops/${cropId}/confirm-retail-price`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ markup_per_kg: markupPerKg })
  });
}

export async function updateFarmerPriceApi(cropId, farmerPricePerKg, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return request(`/api/crops/${cropId}/farmer-price`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ farmer_price_per_kg: farmerPricePerKg })
  });
}


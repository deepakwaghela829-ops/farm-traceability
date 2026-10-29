// api.js - Unified REST API Client for AgriTrace OS
export const API_BASE_URL = (
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE_URL) ||
  (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
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

// Bundled snapshot data guarantees immediate offline / serverless availability
import bundledSnapshotData from '../public/data/verified-crops.json' with { type: 'json' };

let staticDataCache = bundledSnapshotData;
let staticDataPromise = null;

async function loadStaticVerifiedData() {
  if (staticDataCache) return staticDataCache;
  if (!staticDataPromise) {
    staticDataPromise = (async () => {
      try {
        const res = await fetch('/data/verified-crops.json');
        if (res.ok) {
          staticDataCache = await res.json();
          return staticDataCache;
        }
      } catch (err) {
        console.warn('[Static Data Fallback] Could not load /data/verified-crops.json:', err);
      }
      return bundledSnapshotData;
    })();
  }
  return staticDataPromise;
}

export async function fetchPartnerDirectoryApi(token) {
  try {
    return await request('/api/auth/directory', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
  } catch (err) {
    const staticData = await loadStaticVerifiedData();
    if (staticData?.directory) {
      return staticData.directory;
    }
    throw err;
  }
}

// 2. Crop API
export async function fetchCropsApi(farmerId = null, availableOnly = false) {
  const params = new URLSearchParams();
  if (farmerId) params.append('farmer_id', farmerId);
  if (availableOnly) params.append('available_only', 'true');
  const qs = params.toString() ? `?${params.toString()}` : '';
  try {
    return await request(`/api/crops${qs}`);
  } catch (err) {
    const staticData = await loadStaticVerifiedData();
    if (staticData?.crops) {
      let crops = staticData.crops;
      if (farmerId) crops = crops.filter((c) => c.farmer_id === farmerId);
      if (availableOnly) crops = crops.filter((c) => c.is_available !== false && c.is_available !== 0);
      return crops;
    }
    throw err;
  }
}

export async function fetchCropByIdApi(id, idType = 'db') {
  const qs = idType !== 'db' ? `?id_type=${encodeURIComponent(idType)}` : '';
  try {
    return await request(`/api/crops/${id}${qs}`);
  } catch (err) {
    const staticData = await loadStaticVerifiedData();
    if (staticData?.crops) {
      const num = Number(id);
      const match = staticData.crops.find((c) =>
        idType === 'blockchain' ? c.blockchain_crop_id === num : c.crop_id === num
      );
      if (match) {
        return { ...match, _source: 'verified_snapshot' };
      }
    }
    throw err;
  }
}

export async function fetchCropByBlockchainIdApi(chainId) {
  try {
    return await request(`/api/crops/chain/${chainId}`);
  } catch (err) {
    const staticData = await loadStaticVerifiedData();
    if (staticData?.crops) {
      const num = Number(chainId);
      const match = staticData.crops.find((c) => c.blockchain_crop_id === num);
      if (match) {
        return { ...match, _source: 'verified_snapshot' };
      }
    }
    throw err;
  }
}

export async function fetchCropByBatchApi(batchNumber) {
  try {
    return await request(`/api/crops/batch/${encodeURIComponent(batchNumber)}`);
  } catch (err) {
    const staticData = await loadStaticVerifiedData();
    if (staticData?.crops) {
      const target = String(batchNumber).trim().toUpperCase();
      const match = staticData.crops.find(
        (c) => c.batch_number && c.batch_number.toUpperCase() === target
      );
      if (match) {
        return { ...match, _source: 'verified_snapshot' };
      }
    }
    throw err;
  }
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
export async function fetchCropTransactionsApi(cropId, idType = 'db') {
  const qs = idType !== 'db' ? `?id_type=${encodeURIComponent(idType)}` : '';
  try {
    return await request(`/api/transactions/${cropId}${qs}`);
  } catch (err) {
    const staticData = await loadStaticVerifiedData();
    if (staticData?.transactions) {
      const num = Number(cropId);
      const matches = staticData.transactions.filter((t) =>
        idType === 'blockchain' ? t.blockchain_crop_id === num : t.crop_id === num
      );
      return matches;
    }
    throw err;
  }
}

export async function fetchCropTransactionsByChainApi(chainId) {
  try {
    return await request(`/api/transactions/chain/${chainId}`);
  } catch (err) {
    const staticData = await loadStaticVerifiedData();
    if (staticData?.transactions) {
      const num = Number(chainId);
      const matches = staticData.transactions.filter((t) => t.blockchain_crop_id === num);
      return matches;
    }
    throw err;
  }
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

export async function fetchCropPredictionApi(cropId, idType = 'db') {
  const qs = idType !== 'db' ? `?id_type=${encodeURIComponent(idType)}` : '';
  return request(`/api/prediction/crop/${cropId}${qs}`);
}

export async function fetchCropBenchmarksApi(cropType) {
  return request(`/api/prediction/benchmarks/${encodeURIComponent(cropType)}`);
}

// 5. Pricing & Inventory Management Workflow API
export async function confirmSupplierMarginApi(cropId, token, marginPerKg = 15.00) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return request(`/api/crops/${cropId}/confirm-supplier-margin`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ margin_per_kg: marginPerKg })
  });
}

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

export async function receiveCropApi(cropId, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return request(`/api/crops/${cropId}/receive`, {
    method: 'POST',
    headers,
  });
}

export async function markCropUnavailableApi(cropId, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return request(`/api/crops/${cropId}/mark-unavailable`, {
    method: 'POST',
    headers,
  });
}

export async function markCropAvailableApi(cropId, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return request(`/api/crops/${cropId}/mark-available`, {
    method: 'POST',
    headers,
  });
}

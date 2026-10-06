import type { CropPayload, CropRecord } from './types'
export type { CropPayload, CropRecord }

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  'http://127.0.0.1:8000'
).replace(/\/$/, '')

export type BlockchainCropPayload = CropPayload & {
  blockchain_crop_id?: number
  blockchain_tx_hash?: string
  blockchain_contract_address?: string
  blockchain_block_number?: number
  blockchain_farmer_address?: string
  blockchain_chain_id?: number
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}))

  if (!response.ok) {
    const detail = typeof body.detail === 'string' ? body.detail : 'Request failed'
    throw new Error(detail)
  }

  return body as T
}

export async function createCrop(payload: BlockchainCropPayload): Promise<CropRecord> {
  const response = await fetch(`${API_BASE_URL}/api/crops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  return parseResponse<CropRecord>(response)
}

export async function fetchCrops(farmerId?: string): Promise<CropRecord[]> {
  const query = farmerId ? `?farmer_id=${encodeURIComponent(farmerId)}` : ''
  const response = await fetch(`${API_BASE_URL}/api/crops${query}`)
  return parseResponse<CropRecord[]>(response)
}

export async function fetchCropById(cropId: number | string): Promise<CropRecord> {
  const response = await fetch(`${API_BASE_URL}/api/crops/${cropId}`)
  return parseResponse<CropRecord>(response)
}

export interface SupplyChainTransaction {
  id: number
  crop_id: number
  from_address: string
  to_address: string
  role: string
  tx_hash: string
  block_number: number
  chain_id: number
  timestamp: string
}

export async function fetchCropTransactions(cropId: number | string): Promise<SupplyChainTransaction[]> {
  const response = await fetch(`${API_BASE_URL}/api/transactions/${cropId}`)
  return parseResponse<SupplyChainTransaction[]>(response)
}

export interface PricePredictionPayload {
  crop_id?: number
  crop_type: string
  historical_price: number
  season: string
  location: string
  demand: number
  production_quantity: number
  unit?: string
}

export interface PricePredictionResult {
  predicted_price: number
  currency: string
  unit: string
  model_name: string
  prediction_date: string
  crop_id?: number
  crop_type: string
  historical_price: number
  season: string
  location: string
  demand: number
  production_quantity: number
}

export interface CropBenchmarks {
  crop_type: string
  historical_price: number
  demand: number
  season: string
  location: string
  production_quantity: number
}

export interface AcknowledgementResult {
  id: number
  crop_id: number
  acknowledged: boolean
  acknowledged_at: string
}

export async function predictCropPrice(payload: PricePredictionPayload): Promise<PricePredictionResult> {
  const response = await fetch(`${API_BASE_URL}/api/prediction/price`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  return parseResponse<PricePredictionResult>(response)
}

export async function fetchCropPrediction(cropId: number | string): Promise<PricePredictionResult> {
  const response = await fetch(`${API_BASE_URL}/api/prediction/crop/${cropId}`)
  return parseResponse<PricePredictionResult>(response)
}

export async function fetchCropBenchmarks(cropType: string): Promise<CropBenchmarks> {
  const response = await fetch(`${API_BASE_URL}/api/prediction/benchmarks/${encodeURIComponent(cropType)}`)
  return parseResponse<CropBenchmarks>(response)
}

export async function acknowledgeForecast(cropId: number | string): Promise<AcknowledgementResult> {
  const response = await fetch(`${API_BASE_URL}/api/prediction/acknowledge/${cropId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acknowledged: true }),
  })
  return parseResponse<AcknowledgementResult>(response)
}

export async function fetchAcknowledgement(cropId: number | string): Promise<AcknowledgementResult | null> {
  const response = await fetch(`${API_BASE_URL}/api/prediction/acknowledge/${cropId}`)
  if (response.status === 404) return null
  return parseResponse<AcknowledgementResult | null>(response)
}

export interface UserProfile {
  id: number
  username: string
  email: string
  role: 'FARMER' | 'SUPPLIER' | 'RETAILER' | 'CONSUMER' | 'ADMIN'
  wallet_address?: string | null
  full_name?: string | null
  created_at: string
}

export interface TokenResponse {
  access_token: string
  token_type: string
  user: UserProfile
}

export async function loginUser(username: string, password: string): Promise<TokenResponse> {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  return parseResponse<TokenResponse>(response)
}

export async function fetchCurrentUser(token: string): Promise<UserProfile> {
  const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return parseResponse<UserProfile>(response)
}

export async function fetchSystemUsers(token: string): Promise<UserProfile[]> {
  const response = await fetch(`${API_BASE_URL}/api/auth/users`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return parseResponse<UserProfile[]>(response)
}


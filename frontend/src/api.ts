import type { CropPayload, CropRecord } from './types'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

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

export async function fetchCrops(farmerId: string): Promise<CropRecord[]> {
  const response = await fetch(
    `${API_BASE_URL}/api/crops?farmer_id=${encodeURIComponent(farmerId)}`,
  )

  return parseResponse<CropRecord[]>(response)
}
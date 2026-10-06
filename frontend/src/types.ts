export interface CropPayload {
  farmer_id: string
  crop_name: string
  crop_type: string
  quantity: number
  unit: string
  cultivation_date: string
  expected_harvest_date: string
  location: string
}

export interface CropRecord extends CropPayload {
  crop_id: number
  blockchain_crop_id?: number | null
  blockchain_tx_hash?: string | null
  blockchain_contract_address?: string | null
  blockchain_block_number?: number | null
  blockchain_farmer_address?: string | null
  blockchain_chain_id?: number | null
  created_at: string
  updated_at: string
}

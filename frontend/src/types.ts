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
  created_at: string
  updated_at: string
}

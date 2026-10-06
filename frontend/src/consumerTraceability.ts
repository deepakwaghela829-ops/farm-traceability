import deploymentInfo from './blockchain/deployment-info.json'

export const GANACHE_RPC = 'http://127.0.0.1:7545'
export const CONTRACT_ADDRESS: string = deploymentInfo.contractAddress

export interface MovementRecord {
  from: string
  to: string
  toRole: string
  timestamp: number
}

export interface VerifiedCrop {
  cropId: string
  farmer: string
  cropName: string
  cropType: string
  quantity: string
  unit: string
  cultivationDate: number
  expectedHarvestDate: number
  location: string
  createdAt: number
  isHarvested: boolean
  harvestTimestamp: number
  currentHolder: string
  movements: MovementRecord[]
}

/**
 * Formats a UNIX timestamp (seconds) into a readable date string.
 */
export function formatDate(timestampSec: number | string | bigint): string {
  const ts = Number(timestampSec)
  if (!ts || ts <= 0) return 'Not available'
  const date = new Date(ts * 1000)
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

/**
 * Formats a UNIX timestamp (seconds) into a readable date and time string.
 */
export function formatDateTime(timestampSec: number | string | bigint): string {
  const ts = Number(timestampSec)
  if (!ts || ts <= 0) return 'Not available'
  const date = new Date(ts * 1000)
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(date)
}

/**
 * Truncates an Ethereum address for concise display.
 */
export function truncateAddress(address: string, lead = 6, tail = 4): string {
  if (!address) return ''
  if (address.length <= lead + tail) return address
  return `${address.slice(0, lead)}...${address.slice(-tail)}`
}

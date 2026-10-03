import { ethers } from 'ethers'
import abi from './blockchain/CropRegistry.abi.json'
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
 * Creates a read-only instance of the CropRegistry smart contract.
 */
export function getCropRegistryContract(
  rpcUrl = GANACHE_RPC,
  address = CONTRACT_ADDRESS,
): ethers.Contract {
  const provider = new ethers.JsonRpcProvider(rpcUrl)
  return new ethers.Contract(address, abi, provider)
}

/**
 * Fetches and verifies complete crop journey data from the smart contract for a given crop ID.
 */
export async function verifyCrop(cropIdInput: number | string): Promise<VerifiedCrop> {
  const cleanStr = String(cropIdInput).trim().replace(/^#/, '')
  const numericId = parseInt(cleanStr, 10)

  if (isNaN(numericId) || numericId <= 0) {
    throw new Error('Please enter a valid positive Crop ID (e.g. 1).')
  }

  const contract = getCropRegistryContract()

  try {
    // Query smart contract in parallel:
    // - getCrop(cropId)
    // - getCurrentHolder(cropId)
    // - getMovementHistory(cropId)
    // - harvested(cropId)
    // - harvestTimestamp(cropId)
    const [cropData, currentHolderAddr, isHarvested, harvestTime, movementHistory] =
      await Promise.all([
        contract.getCrop(BigInt(numericId)),
        contract.getCurrentHolder(BigInt(numericId)),
        contract.harvested(BigInt(numericId)),
        contract.harvestTimestamp(BigInt(numericId)),
        contract.getMovementHistory(BigInt(numericId)),
      ])

    const movements: MovementRecord[] = (movementHistory || []).map((m: any) => ({
      from: String(m.from ?? m[0]),
      to: String(m.to ?? m[1]),
      toRole: String(m.toRole ?? m[2]),
      timestamp: Number(m.timestamp ?? m[3]),
    }))

    return {
      cropId: cropData.cropId ? cropData.cropId.toString() : String(numericId),
      farmer: String(cropData.farmer ?? cropData[1]),
      cropName: String(cropData.cropName ?? cropData[2]),
      cropType: String(cropData.cropType ?? cropData[3]),
      quantity: cropData.quantity ? cropData.quantity.toString() : String(cropData[4]),
      unit: String(cropData.unit ?? cropData[5]),
      cultivationDate: Number(cropData.cultivationDate ?? cropData[6]),
      expectedHarvestDate: Number(cropData.expectedHarvestDate ?? cropData[7]),
      location: String(cropData.location ?? cropData[8]),
      createdAt: Number(cropData.createdAt ?? cropData[9]),
      isHarvested: Boolean(isHarvested),
      harvestTimestamp: Number(harvestTime),
      currentHolder: String(currentHolderAddr),
      movements,
    }
  } catch (err: any) {
    const errorMsg: string = err?.message || String(err)
    const revertReason: string =
      err?.reason || err?.shortMessage || err?.data?.message || errorMsg

    if (
      revertReason.includes('Crop not found') ||
      errorMsg.includes('Crop not found') ||
      err?.data === 'Crop not found'
    ) {
      throw new Error(`Crop #${numericId} was not found on the blockchain.`)
    }

    if (
      errorMsg.includes('could not detect network') ||
      errorMsg.includes('ECONNREFUSED') ||
      errorMsg.includes('fetch failed') ||
      errorMsg.includes('Failed to fetch')
    ) {
      throw new Error(
        `Unable to connect to Ethereum / Ganache network at ${GANACHE_RPC}. Ensure Ganache is running.`,
      )
    }

    if (errorMsg.includes('call revert exception') || errorMsg.includes('BAD_DATA')) {
      throw new Error(
        `Crop #${numericId} could not be retrieved from the blockchain. Verify that Crop ID #${numericId} has been registered.`,
      )
    }

    throw new Error(revertReason || errorMsg)
  }
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

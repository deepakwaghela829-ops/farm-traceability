import abi from './blockchain/CropRegistry.abi.json'
import {
  getEthers,
  getSharedProvider,
  getSharedReadOnlyContract,
  GANACHE_RPC,
  REQUIRED_CHAIN_ID,
  CONTRACT_ADDRESS,
} from './blockchainService'
import {
  resolveCropProvenance,
  type UnifiedCropResolution,
} from './cropIdentifierService'

export { GANACHE_RPC, REQUIRED_CHAIN_ID, CONTRACT_ADDRESS }
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

export interface CropDetails {
  cropId: number
  farmer: string
  cropName: string
  cropType: string
  quantity: string
  unit: string
  cultivationDate: string
  expectedHarvestDate: string
  location: string
  createdAt: string
  currentHolder: string
  isHarvested: boolean
  farmerId?: string
}

export interface BlockchainMovement {
  from: string
  to: string
  toRole: string
  timestamp: number
  transactionHash?: string
  blockNumber?: number
}

export interface DbTransaction {
  id: number
  crop_id: number
  event_type: string
  from_address: string
  to_address: string
  to_role: string
  transaction_hash: string
  block_number: number
  timestamp: string
  created_at: string
}

export interface GanacheAccount {
  address: string
  balance: string
}

export interface LoadCropResult {
  crop: CropDetails
  movements: BlockchainMovement[]
  dbTransactions: DbTransaction[]
  resolution: UnifiedCropResolution
}

export function formatDateTime(value: number | string | bigint): string {
  const num = Number(value)
  if (!num || num <= 0) return 'N/A'
  const date = new Date(num * 1000)
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

export function truncateAddress(address: string, lead = 6, tail = 4): string {
  if (!address) return ''
  if (address.length <= lead + tail) return address
  return `${address.slice(0, lead)}...${address.slice(-tail)}`
}

/**
 * Connects to Ganache RPC provider and verifies chain ID 1337.
 */
export async function getProvider(): Promise<any> {
  const provider = await getSharedProvider(GANACHE_RPC)
  try {
    const network = await provider.getNetwork()
    if (network.chainId !== REQUIRED_CHAIN_ID) {
      throw new Error(
        `Wrong blockchain network. Expected Chain ID 1337, but connected to ${network.chainId}.`,
      )
    }
  } catch (err: any) {
    if (err.message?.includes('Wrong blockchain network')) {
      throw err
    }
    throw new Error(
      `Cannot connect to Ethereum / Ganache RPC at ${GANACHE_RPC}. Ensure Ganache is running.`,
    )
  }
  return provider
}

/**
 * Retrieves all unlocked Ganache accounts and their ETH balances.
 */
export async function fetchGanacheAccounts(): Promise<GanacheAccount[]> {
  const [provider, { ethers }] = await Promise.all([getProvider(), getEthers()])
  const addresses: string[] = await provider.send('eth_accounts', [])
  if (!addresses.length) {
    throw new Error('No Ganache accounts found. Make sure Ganache is running with unlocked accounts.')
  }

  const accounts = await Promise.all(
    addresses.map(async (address) => {
      try {
        const balanceBig = await provider.getBalance(address)
        const balanceEth = parseFloat(ethers.formatEther(balanceBig)).toFixed(4)
        return { address, balance: balanceEth }
      } catch {
        return { address, balance: '0.0000' }
      }
    }),
  )

  return accounts
}

/**
 * Loads crop info using the unified crop provenance resolver.
 * Handles both PostgreSQL database records and Ethereum Ganache smart contract records.
 */
export async function loadCrop(cropIdInput: number | string): Promise<LoadCropResult> {
  const resolution = await resolveCropProvenance(cropIdInput)

  if (resolution.status === 'NOT_FOUND' || !resolution.crop) {
    throw new Error(
      resolution.statusMessage || `Crop #${cropIdInput} was not found in the database or on the blockchain.`,
    )
  }

  return {
    crop: resolution.crop,
    movements: resolution.movements,
    dbTransactions: resolution.dbTransactions,
    resolution,
  }
}

/**
 * Transfers a crop on-chain using the selected Ganache signer and records it in PostgreSQL.
 */
export async function executeTransfer(
  cropId: number,
  signerAddress: string,
  destinationAddress: string,
  destinationRole: string,
): Promise<{ txHash: string; blockNumber: number; timestamp: string }> {
  // 1. Validations
  if (!cropId || cropId <= 0) {
    throw new Error('Invalid Crop ID.')
  }

  const destClean = destinationAddress.trim()
  if (!destClean) {
    throw new Error('Destination wallet address cannot be empty.')
  }

  const { ethers } = await getEthers()

  if (!ethers.isAddress(destClean)) {
    throw new Error('Destination wallet address is not a valid Ethereum address.')
  }

  if (destClean.toLowerCase() === signerAddress.toLowerCase()) {
    throw new Error('Destination wallet address cannot be the same as the current holder address.')
  }

  const roleClean = destinationRole.trim()
  if (!roleClean) {
    throw new Error('Please select a destination role (Supplier or Retailer).')
  }

  const [provider, contractForCheck] = await Promise.all([
    getProvider(),
    getSharedReadOnlyContract(),
  ])

  // 2. Verify current on-chain holder
  const currentOnChainHolder: string = await contractForCheck.getCurrentHolder(BigInt(cropId))
  if (currentOnChainHolder.toLowerCase() !== signerAddress.toLowerCase()) {
    throw new Error(
      `Selected Ganache account (${truncateAddress(signerAddress)}) is not the current holder of this crop (${truncateAddress(currentOnChainHolder)}).`,
    )
  }

  // 3. Obtain Signer & Send Transaction
  const signer = await provider.getSigner(signerAddress)
  const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, signer)

  let tx: any
  try {
    tx = await contract.transferCrop(BigInt(cropId), destClean, roleClean)
  } catch (err: any) {
    const reason = err?.reason || err?.message || 'Transaction submission failed.'
    if (reason.includes('Only current holder can transfer')) {
      throw new Error('Only current holder can transfer this crop.')
    }
    throw new Error(`Blockchain transaction rejected: ${reason}`)
  }

  // 4. Wait for blockchain confirmation
  let receipt: any = null
  try {
    receipt = await tx.wait()
    if (!receipt || receipt.status !== 1) {
      throw new Error('Transaction was reverted on the blockchain.')
    }
  } catch (err: any) {
    throw new Error(`Transaction confirmation failure: ${err?.message || err}`)
  }

  // 5. Obtain block timestamp
  let blockTimestampIso = new Date().toISOString()
  try {
    const block = await provider.getBlock(receipt.blockNumber)
    if (block?.timestamp) {
      blockTimestampIso = new Date(block.timestamp * 1000).toISOString()
    }
  } catch {
    // Fallback to ISO now
  }

  return {
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
    timestamp: blockTimestampIso,
  }
}

/**
 * Saves a confirmed blockchain transaction to PostgreSQL via FastAPI.
 */
export async function saveTransactionToBackend(payload: {
  crop_id: number
  event_type: string
  from_address: string
  to_address: string
  to_role: string
  transaction_hash: string
  block_number: number
  timestamp: string
}): Promise<DbTransaction> {
  const response = await fetch(`${API_BASE_URL}/api/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail = typeof body.detail === 'string' ? body.detail : 'Failed to record transaction'
    throw new Error(detail)
  }

  return body as DbTransaction
}

/**
 * Retrieves all transaction records for a given crop ID from PostgreSQL.
 */
export async function fetchDbTransactions(cropId: number): Promise<DbTransaction[]> {
  const response = await fetch(`${API_BASE_URL}/api/transactions/${cropId}`)
  if (!response.ok) {
    throw new Error(`Failed to fetch transactions for crop #${cropId}`)
  }
  return response.json()
}

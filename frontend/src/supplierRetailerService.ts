import { ethers } from 'ethers'
import abi from './blockchain/CropRegistry.abi.json'
import deploymentInfo from './blockchain/deployment-info.json'

export const GANACHE_RPC = 'http://127.0.0.1:7545'
export const REQUIRED_CHAIN_ID = 1337n
export const CONTRACT_ADDRESS: string = deploymentInfo.contractAddress
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

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
}

function dateFromUnix(value: bigint | string | number): string {
  const num = Number(value)
  if (!num || num <= 0) return 'N/A'
  const date = new Date(num * 1000)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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
export async function getProvider(): Promise<ethers.JsonRpcProvider> {
  const provider = new ethers.JsonRpcProvider(GANACHE_RPC)
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
  const provider = await getProvider()
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
 * Loads crop info from smart contract and transaction records from PostgreSQL.
 */
export async function loadCrop(cropIdInput: number | string): Promise<LoadCropResult> {
  const numericId = typeof cropIdInput === 'string' ? parseInt(cropIdInput.trim(), 10) : cropIdInput
  if (isNaN(numericId) || numericId <= 0) {
    throw new Error('Please enter a valid positive numeric Crop ID (e.g. 1).')
  }

  const provider = await getProvider()
  const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider)

  // 1. Fetch on-chain state
  let cropData: any
  let currentHolder: string
  let movementsRaw: any[]
  let isHarvested = false

  try {
    const [cData, holder, hist, harvested] = await Promise.all([
      contract.getCrop(BigInt(numericId)),
      contract.getCurrentHolder(BigInt(numericId)),
      contract.getMovementHistory(BigInt(numericId)),
      contract.harvested(BigInt(numericId)),
    ])

    cropData = cData
    currentHolder = holder
    movementsRaw = hist || []
    isHarvested = Boolean(harvested)
  } catch (err: any) {
    const msg = err?.message || String(err)
    if (msg.includes('Crop not found') || err?.data === 'Crop not found') {
      throw new Error(`Crop #${numericId} was not found on the blockchain.`)
    }
    throw new Error(err?.reason || msg)
  }

  // 2. Fetch PostgreSQL transaction records
  const dbTransactions = await fetchDbTransactions(numericId).catch(() => [])

  // 3. Match DB transaction hash/block with blockchain movement history if possible
  const movements: BlockchainMovement[] = movementsRaw.map((m, index) => {
    const fromAddr = String(m.from ?? m[0])
    const toAddr = String(m.to ?? m[1])
    const toRole = String(m.toRole ?? m[2])
    const ts = Number(m.timestamp ?? m[3])

    // Match with corresponding DB transaction
    const matchedTx = dbTransactions[index]

    return {
      from: fromAddr,
      to: toAddr,
      toRole: toRole,
      timestamp: ts,
      transactionHash: matchedTx?.transaction_hash,
      blockNumber: matchedTx?.block_number,
    }
  })

  // 4. Optionally fetch Farmer ID from PostgreSQL crops API
  let farmerId: string | undefined
  try {
    const cropResp = await fetch(`${API_BASE_URL}/api/crops?farmer_id=DEMO-FARMER-001`)
    if (cropResp.ok) {
      const records = await cropResp.json()
      const found = records.find((r: any) => r.blockchain_crop_id === numericId)
      if (found) {
        farmerId = found.farmer_id
      }
    }
  } catch {
    // Non-critical if backend crops query fails
  }

  const crop: CropDetails = {
    cropId: numericId,
    farmer: String(cropData.farmer ?? cropData[1]),
    cropName: String(cropData.cropName ?? cropData[2]),
    cropType: String(cropData.cropType ?? cropData[3]),
    quantity: (cropData.quantity ?? cropData[4]).toString(),
    unit: String(cropData.unit ?? cropData[5]),
    cultivationDate: dateFromUnix(cropData.cultivationDate ?? cropData[6]),
    expectedHarvestDate: dateFromUnix(cropData.expectedHarvestDate ?? cropData[7]),
    location: String(cropData.location ?? cropData[8]),
    createdAt: dateFromUnix(cropData.createdAt ?? cropData[9]),
    currentHolder: String(currentHolder),
    isHarvested,
    farmerId,
  }

  return { crop, movements, dbTransactions }
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

  const provider = await getProvider()
  const contractForCheck = new ethers.Contract(CONTRACT_ADDRESS, abi, provider)

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

  let tx: ethers.ContractTransactionResponse
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
  let receipt: ethers.ContractTransactionReceipt | null = null
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

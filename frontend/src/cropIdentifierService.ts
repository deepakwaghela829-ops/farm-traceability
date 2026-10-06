import {
  getSharedReadOnlyContract,
  CONTRACT_ADDRESS,
  REQUIRED_CHAIN_ID,
} from './blockchainService'
import {
  fetchCropById,
  fetchCropTransactions,
  type CropRecord,
  type SupplyChainTransaction,
} from './api'
import type {
  CropDetails,
  BlockchainMovement,
  DbTransaction,
} from './supplierRetailerService'

export { CONTRACT_ADDRESS, REQUIRED_CHAIN_ID }

export type CropProvenanceStatus =
  | 'ON_CHAIN_VERIFIED'
  | 'DATABASE_VERIFIED_OFFCHAIN'
  | 'NOT_FOUND'

export interface UnifiedCropResolution {
  // Primary Identifiers
  databaseId: number | null
  blockchainCropId: number | null
  displayLabel: string

  // Status & Flags
  status: CropProvenanceStatus
  isDatabaseVerified: boolean
  isOnChainVerified: boolean
  canTransferCustody: boolean
  statusMessage: string

  // Blockchain Provenance
  contractAddress: string
  chainId: number
  txHash: string | null
  blockNumber: number | null
  farmerAddress: string | null

  // Resolved Crop Data
  crop: CropDetails | null
  dbCrop: CropRecord | null
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

function normalizeInputId(input: number | string): number | null {
  if (input === null || input === undefined) return null
  const cleaned = String(input).trim().replace(/^#/, '')
  const num = parseInt(cleaned, 10)
  return !isNaN(num) && num > 0 ? num : null
}

/**
 * Resolves a crop identifier across PostgreSQL and Ethereum Ganache smart contract.
 * Checks both PostgreSQL primary key (crop_id) and On-Chain ID (blockchain_crop_id).
 */
export async function resolveCropProvenance(
  inputId: number | string,
): Promise<UnifiedCropResolution> {
  const numericId = normalizeInputId(inputId)

  if (numericId === null) {
    return {
      databaseId: null,
      blockchainCropId: null,
      displayLabel: 'Invalid ID',
      status: 'NOT_FOUND',
      isDatabaseVerified: false,
      isOnChainVerified: false,
      canTransferCustody: false,
      statusMessage: 'Please enter a valid positive numeric Crop ID (e.g. 1).',
      contractAddress: CONTRACT_ADDRESS,
      chainId: Number(REQUIRED_CHAIN_ID),
      txHash: null,
      blockNumber: null,
      farmerAddress: null,
      crop: null,
      dbCrop: null,
      movements: [],
      dbTransactions: [],
    }
  }

  // 1. Fetch database record from FastAPI (matches crop_id OR blockchain_crop_id)
  let dbCrop: CropRecord | null = null
  try {
    dbCrop = await fetchCropById(numericId)
  } catch {
    dbCrop = null
  }

  // Determine which on-chain ID to query on the smart contract
  // If dbCrop exists, USE ITS blockchain_crop_id (never assume dbCrop.crop_id == blockchain_crop_id)
  const targetOnChainId = dbCrop?.blockchain_crop_id ?? (dbCrop ? null : numericId)

  let onChainSuccess = false
  let cropData: any = null
  let currentHolder = ''
  let movementsRaw: any[] = []
  let isHarvested = false

  // Only query the smart contract if a valid on-chain ID is expected
  if (targetOnChainId !== null && targetOnChainId > 0) {
    try {
      const contract = await getSharedReadOnlyContract()
      if (contract) {
        const [cData, holder, hist, harvested] = await Promise.all([
          contract.getCrop(BigInt(targetOnChainId)),
          contract.getCurrentHolder(BigInt(targetOnChainId)),
          contract.getMovementHistory(BigInt(targetOnChainId)),
          contract.harvested(BigInt(targetOnChainId)),
        ])
        cropData = cData
        currentHolder = holder
        movementsRaw = hist || []
        isHarvested = Boolean(harvested)
        onChainSuccess = true
      }
    } catch {
      onChainSuccess = false
    }
  }

  // Fetch PostgreSQL recorded transactions
  const queryCropId = dbCrop?.crop_id ?? numericId
  let dbTransactionsList: DbTransaction[] = []
  try {
    const rawTxs = await fetchCropTransactions(queryCropId)
    dbTransactionsList = rawTxs.map((t: SupplyChainTransaction) => ({
      id: t.id,
      crop_id: t.crop_id,
      event_type: 'TRANSFER',
      from_address: t.from_address,
      to_address: t.to_address,
      to_role: t.role,
      transaction_hash: t.tx_hash,
      block_number: t.block_number,
      timestamp: t.timestamp,
      created_at: t.timestamp,
    }))
  } catch {
    dbTransactionsList = []
  }

  // 3. CASE A: Full On-Chain Verification
  if (onChainSuccess && cropData) {
    const effectiveOnChainId = targetOnChainId as number
    const effectiveDbId = dbCrop?.crop_id ?? null

    const movements: BlockchainMovement[] = movementsRaw.map((m) => {
      const fromAddr = String(m.from ?? m[0])
      const toAddr = String(m.to ?? m[1])
      const toRole = String(m.toRole ?? m[2])
      const ts = Number(m.timestamp ?? m[3])

      const matchedTx = dbTransactionsList.find(
        (tx) =>
          tx.from_address.toLowerCase() === fromAddr.toLowerCase() &&
          tx.to_address.toLowerCase() === toAddr.toLowerCase() &&
          tx.to_role.trim().toLowerCase() === toRole.trim().toLowerCase(),
      )

      return {
        from: fromAddr,
        to: toAddr,
        toRole,
        timestamp: ts,
        transactionHash: matchedTx?.transaction_hash || dbCrop?.blockchain_tx_hash || undefined,
        blockNumber: matchedTx?.block_number || dbCrop?.blockchain_block_number || undefined,
      }
    })

    const resolvedCrop: CropDetails = {
      cropId: effectiveOnChainId,
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
      farmerId: dbCrop?.farmer_id,
    }

    const displayLabel = effectiveDbId
      ? `DB #${effectiveDbId} · Blockchain #${effectiveOnChainId}`
      : `Blockchain #${effectiveOnChainId}`

    return {
      databaseId: effectiveDbId,
      blockchainCropId: effectiveOnChainId,
      displayLabel,
      status: 'ON_CHAIN_VERIFIED',
      isDatabaseVerified: !!dbCrop,
      isOnChainVerified: true,
      canTransferCustody: true,
      statusMessage: 'On-chain provenance verified on Ethereum Ganache.',
      contractAddress: CONTRACT_ADDRESS,
      chainId: Number(REQUIRED_CHAIN_ID),
      txHash: dbCrop?.blockchain_tx_hash || null,
      blockNumber: dbCrop?.blockchain_block_number || null,
      farmerAddress: resolvedCrop.farmer,
      crop: resolvedCrop,
      dbCrop,
      movements,
      dbTransactions: dbTransactionsList,
    }
  }

  // 4. CASE B: Database Record Found (Off-Chain Verified / Blockchain Pending)
  if (dbCrop) {
    const isHarvestedNow = new Date(`${dbCrop.expected_harvest_date}T00:00:00`) <= new Date()

    const movementsFromDb: BlockchainMovement[] = dbTransactionsList.map((tx) => ({
      from: tx.from_address,
      to: tx.to_address,
      toRole: tx.to_role,
      timestamp: Math.floor(new Date(tx.timestamp).getTime() / 1000),
      transactionHash: tx.transaction_hash,
      blockNumber: tx.block_number,
    }))

    const holder =
      dbTransactionsList.length > 0
        ? dbTransactionsList[dbTransactionsList.length - 1].to_address
        : dbCrop.blockchain_farmer_address || dbCrop.farmer_id

    const resolvedCrop: CropDetails = {
      cropId: dbCrop.blockchain_crop_id || dbCrop.crop_id,
      farmer: dbCrop.blockchain_farmer_address || dbCrop.farmer_id,
      cropName: dbCrop.crop_name,
      cropType: dbCrop.crop_type,
      quantity: String(dbCrop.quantity),
      unit: dbCrop.unit,
      cultivationDate: dbCrop.cultivation_date,
      expectedHarvestDate: dbCrop.expected_harvest_date,
      location: dbCrop.location,
      createdAt: dbCrop.created_at ? dbCrop.created_at.split('T')[0] : 'N/A',
      currentHolder: holder,
      isHarvested: isHarvestedNow,
      farmerId: dbCrop.farmer_id,
    }

    const hasOnChainId = dbCrop.blockchain_crop_id !== null && dbCrop.blockchain_crop_id !== undefined
    const displayLabel = hasOnChainId
      ? `DB #${dbCrop.crop_id} · Blockchain #${dbCrop.blockchain_crop_id}`
      : `DB #${dbCrop.crop_id} (Off-Chain)`

    const statusMessage = hasOnChainId
      ? `Database record found (#${dbCrop.crop_id}). Blockchain token #${dbCrop.blockchain_crop_id} was registered in a prior deployment or node is offline.`
      : `Database record found (#${dbCrop.crop_id}). Batch registered in database; on-chain token not yet minted.`

    return {
      databaseId: dbCrop.crop_id,
      blockchainCropId: dbCrop.blockchain_crop_id ?? null,
      displayLabel,
      status: 'DATABASE_VERIFIED_OFFCHAIN',
      isDatabaseVerified: true,
      isOnChainVerified: false,
      canTransferCustody: false,
      statusMessage,
      contractAddress: CONTRACT_ADDRESS,
      chainId: Number(REQUIRED_CHAIN_ID),
      txHash: dbCrop.blockchain_tx_hash || null,
      blockNumber: dbCrop.blockchain_block_number || null,
      farmerAddress: dbCrop.blockchain_farmer_address || null,
      crop: resolvedCrop,
      dbCrop,
      movements: movementsFromDb,
      dbTransactions: dbTransactionsList,
    }
  }

  // 5. CASE C: Neither Database nor Blockchain Found
  return {
    databaseId: null,
    blockchainCropId: null,
    displayLabel: `Crop #${numericId}`,
    status: 'NOT_FOUND',
    isDatabaseVerified: false,
    isOnChainVerified: false,
    canTransferCustody: false,
    statusMessage: `Crop #${numericId} was not found in the PostgreSQL database or on the blockchain.`,
    contractAddress: CONTRACT_ADDRESS,
    chainId: Number(REQUIRED_CHAIN_ID),
    txHash: null,
    blockNumber: null,
    farmerAddress: null,
    crop: null,
    dbCrop: null,
    movements: [],
    dbTransactions: [],
  }
}

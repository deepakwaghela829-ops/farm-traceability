import abi from './blockchain/CropRegistry.abi.json'
import deploymentInfo from './blockchain/deployment-info.json'

export const GANACHE_RPC = 'http://127.0.0.1:7545'
export const REQUIRED_CHAIN_ID = 1337n
export const CONTRACT_ADDRESS: string = deploymentInfo.contractAddress

// Cached module and singletons
let ethersModule: typeof import('ethers') | null = null
let sharedProvider: any = null
let sharedReadOnlyContract: any = null

/**
 * Lazy loads the ethers.js library on-demand.
 * This prevents bundling ~250 kB of cryptographic modules into initial page loads.
 */
export async function getEthers(): Promise<typeof import('ethers')> {
  if (!ethersModule) {
    ethersModule = await import('ethers')
  }
  return ethersModule
}

/**
 * Returns a cached, singleton JsonRpcProvider instance.
 * Eliminates duplicate provider instantiations on every component mount or watcher cycle.
 */
export async function getSharedProvider(rpcUrl = GANACHE_RPC): Promise<any> {
  if (!sharedProvider) {
    const { ethers } = await getEthers()
    sharedProvider = new ethers.JsonRpcProvider(rpcUrl)
  }
  return sharedProvider
}

/**
 * Returns a cached, singleton read-only Contract instance.
 */
export async function getSharedReadOnlyContract(
  address = CONTRACT_ADDRESS,
  contractAbi = abi,
): Promise<any> {
  if (!sharedReadOnlyContract) {
    const { ethers } = await getEthers()
    const provider = await getSharedProvider()
    sharedReadOnlyContract = new ethers.Contract(address, contractAbi, provider)
  }
  return sharedReadOnlyContract
}

/**
 * Lightweight JSON-RPC probe using native browser fetch.
 * Checks Ganache health and fetches accounts without loading ethers.js.
 */
export async function quickCheckGanache(
  rpcUrl = GANACHE_RPC,
): Promise<{ connected: boolean; accounts: string[]; chainId: number }> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 2000)

    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([
        { jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 },
        { jsonrpc: '2.0', method: 'eth_accounts', params: [], id: 2 },
      ]),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      return { connected: false, accounts: [], chainId: 0 }
    }

    const data = await response.json()
    const chainId = parseInt(data[0]?.result || '0', 16)
    const accounts = Array.isArray(data[1]?.result) ? data[1].result : []

    return {
      connected: chainId === Number(REQUIRED_CHAIN_ID),
      accounts,
      chainId,
    }
  } catch {
    return { connected: false, accounts: [], chainId: 0 }
  }
}

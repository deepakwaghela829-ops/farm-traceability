// blockchain.js - EVM Smart Contract & Ganache Integration for AgriTrace OS
import { ethers } from 'ethers';
import abi from '../blockchain/CropRegistry.abi.json';
import deploymentInfo from '../blockchain/deployment-info.json';
import { API_BASE_URL } from './api.js';

export const LOCAL_GANACHE_RPC = 'http://127.0.0.1:7545';
export const GANACHE_RPC =
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? LOCAL_GANACHE_RPC
    : `${API_BASE_URL || ''}/api/blockchain/rpc`;

export const REQUIRED_CHAIN_ID = 1337;
export let CONTRACT_ADDRESS = deploymentInfo.contractAddress;

let cachedProvider = null;
let cachedReadOnlyContract = null;

export function updateContractAddress(newAddress) {
  if (newAddress && newAddress.startsWith('0x') && newAddress !== CONTRACT_ADDRESS) {
    CONTRACT_ADDRESS = newAddress;
    cachedReadOnlyContract = null;
  }
}

export function getProvider() {
  if (!cachedProvider) {
    cachedProvider = new ethers.JsonRpcProvider(GANACHE_RPC);
  }
  return cachedProvider;
}

export function getReadOnlyContract() {
  if (!cachedReadOnlyContract) {
    const provider = getProvider();
    cachedReadOnlyContract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);
  }
  return cachedReadOnlyContract;
}

export async function quickCheckGanache() {
  try {
    // 1. In production, check backend status endpoint first (supports remote Ganache)
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      try {
        const statusRes = await fetch(`${API_BASE_URL || ''}/api/blockchain/status`);
        if (statusRes.ok) {
          const statusJson = await statusRes.json();
          if (statusJson.contract_address) {
            updateContractAddress(statusJson.contract_address);
          }
          if (statusJson.online) {
            return {
              connected: true,
              remote: true,
              contractDeployed: statusJson.contract_deployed,
              chainId: statusJson.chain_id,
              latestBlock: statusJson.latest_block,
              contractAddress: CONTRACT_ADDRESS,
              notice: statusJson.notice,
              accounts: [],
            };
          }
          return {
            connected: false,
            remote: true,
            notice: statusJson.notice || 'Remote Ganache offline',
            accounts: [],
          };
        }
      } catch (err) {
        console.warn('Backend blockchain status check notice:', err);
      }
    }

    // 2. Direct / Local check
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(GANACHE_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_accounts',
        params: [],
        id: 1,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) return { connected: false, accounts: [] };
    const json = await res.json();
    return {
      connected: true,
      remote: false,
      accounts: json.result || [],
    };
  } catch {
    return { connected: false, accounts: [] };
  }
}

export async function getAccounts() {
  try {
    const provider = getProvider();
    const accounts = await provider.listAccounts();
    if (accounts && accounts.length > 0) {
      return accounts.map((acc) => acc.address);
    }
  } catch (err) {
    console.warn('Could not list accounts from provider:', err);
  }
  return [];
}

export async function getContractWithSigner(signerAddress) {
  const provider = getProvider();
  const signer = await provider.getSigner(signerAddress);
  return new ethers.Contract(CONTRACT_ADDRESS, abi, signer);
}

function unixTime(dateStr) {
  if (!dateStr) return Math.floor(Date.now() / 1000);
  return Math.floor(new Date(`${dateStr}T00:00:00`).getTime() / 1000);
}

export async function registerCropOnChain(cropData, signerAddress) {
  const contract = await getContractWithSigner(signerAddress);
  const tx = await contract.registerCrop(
    cropData.crop_name.trim(),
    cropData.crop_type.trim(),
    BigInt(Math.round(Number(cropData.quantity))),
    cropData.unit.trim(),
    unixTime(cropData.cultivation_date),
    unixTime(cropData.expected_harvest_date),
    cropData.location.trim()
  );

  const receipt = await tx.wait();
  const farmerCrops = await contract.getFarmerCrops(signerAddress);
  const blockchainCropId = Number(farmerCrops[farmerCrops.length - 1]);

  return {
    blockchainCropId,
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
    contractAddress: CONTRACT_ADDRESS,
  };
}

export async function transferCropOnChain(blockchainCropId, toAddress, toRole, signerAddress) {
  const contract = await getContractWithSigner(signerAddress);
  const tx = await contract.transferCrop(
    BigInt(blockchainCropId),
    toAddress.trim(),
    toRole.trim()
  );

  const receipt = await tx.wait();
  return {
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
  };
}

export async function getCropFromChain(blockchainCropId) {
  const contract = getReadOnlyContract();
  return contract.getCrop(BigInt(blockchainCropId));
}

export async function getCurrentHolderFromChain(blockchainCropId) {
  const contract = getReadOnlyContract();
  return contract.getCurrentHolder(BigInt(blockchainCropId));
}

export async function getMovementHistoryFromChain(blockchainCropId) {
  const contract = getReadOnlyContract();
  return contract.getMovementHistory(BigInt(blockchainCropId));
}

export async function isHarvestedOnChain(blockchainCropId) {
  const contract = getReadOnlyContract();
  return contract.harvested(BigInt(blockchainCropId));
}

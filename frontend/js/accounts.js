// accounts.js - Friendly Account Resolution & Partner Directory for AgriTrace OS
import { fetchPartnerDirectoryApi } from './api.js';

export const TRUSTED_PARTICIPANTS = [
  {
    username: 'farmer1',
    full_name: 'Ramesh Patel (Farmer)',
    role: 'FARMER',
    wallet_address: '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1',
  },
  {
    username: 'supplier1',
    full_name: 'Wasi Mumbai',
    role: 'SUPPLIER',
    wallet_address: '0xFFcf8FDEE72ac11b5c542428B35EEF5769C409f0',
  },
  {
    username: 'retailer1',
    full_name: 'Apex Organic Mart (Retailer)',
    role: 'RETAILER',
    wallet_address: '0x22d491Bde2303f2f43325b2108D26f1eAbA1e32b',
  },
  {
    username: 'retailer2',
    full_name: 'GreenField Supermarket (Retailer)',
    role: 'RETAILER',
    wallet_address: '0x95cED938F7991cd0dFcb48f0a06a40FA1aF46EBC',
  },
  {
    username: 'retailer3',
    full_name: 'FreshHarvest Daily (Retailer)',
    role: 'RETAILER',
    wallet_address: '0x3E5e9111Ae8eC78Da1746604721f453730005D56',
  },
  {
    username: 'consumer1',
    full_name: 'Ananya Sharma (Consumer)',
    role: 'CONSUMER',
    wallet_address: '0xE11BA2b4D45Eaed5996Cd0823791E0C93114882d',
  },
  {
    username: 'admin1',
    full_name: 'System Auditor (Admin)',
    role: 'ADMIN',
    wallet_address: '0xd03ea8624C8C5987235048901fB614fDcA89b117',
  },
];

let cachedDirectory = null;

export async function getPartnerDirectory(token = null) {
  if (cachedDirectory && cachedDirectory.length > 0) {
    return cachedDirectory;
  }
  try {
    const remote = await fetchPartnerDirectoryApi(token);
    if (Array.isArray(remote) && remote.length > 0) {
      cachedDirectory = remote;
      return cachedDirectory;
    }
  } catch (err) {
    console.debug('Partner directory remote lookup note:', err);
  }
  cachedDirectory = [...TRUSTED_PARTICIPANTS];
  return cachedDirectory;
}

export function formatAddress(address) {
  if (!address || typeof address !== 'string') return '—';
  const clean = address.trim();
  if (clean.length <= 12) return clean;
  return `${clean.slice(0, 6)}…${clean.slice(-4)}`;
}

export function resolveUserByAddress(address, directory = TRUSTED_PARTICIPANTS) {
  if (!address) return null;
  const target = String(address).trim().toLowerCase();
  const list = Array.isArray(directory) && directory.length > 0 ? directory : TRUSTED_PARTICIPANTS;
  return list.find((u) => u.wallet_address && u.wallet_address.toLowerCase() === target) || null;
}

export function resolveAddressByUsername(username, directory = TRUSTED_PARTICIPANTS) {
  if (!username) return null;
  const target = String(username).trim().toLowerCase();
  const list = Array.isArray(directory) && directory.length > 0 ? directory : TRUSTED_PARTICIPANTS;
  const found = list.find((u) => u.username && u.username.toLowerCase() === target);
  return found?.wallet_address || null;
}

export function getUserWallet(user, directory = TRUSTED_PARTICIPANTS) {
  if (!user) return null;
  if (user.wallet_address && user.wallet_address.startsWith('0x')) {
    return user.wallet_address;
  }
  const byUsername = resolveAddressByUsername(user.username, directory);
  if (byUsername) return byUsername;
  const roleUpper = (user.role || '').toUpperCase();
  if (roleUpper === 'FARMER') return '0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1';
  if (roleUpper === 'SUPPLIER') return '0xFFcf8FDEE72ac11b5c542428B35EEF5769C409f0';
  if (roleUpper === 'RETAILER') return '0x22d491Bde2303f2f43325b2108D26f1eAbA1e32b';
  return null;
}

export function getFriendlyAccountLabel(address, directory = TRUSTED_PARTICIPANTS) {
  if (!address) return '—';
  const user = resolveUserByAddress(address, directory);
  if (user) {
    return `${user.username} (${user.full_name || user.role})`;
  }
  return formatAddress(address);
}

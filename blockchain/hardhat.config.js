require("@nomicfoundation/hardhat-ethers");
require("dotenv").config();

// Ganache GUI 2.x / ganache CLI v7 both report chain ID 1337 by default
// (the GUI's "Network ID" of 5777 is NOT the chain ID). Confirm yours with
// `npx hardhat run scripts/check-network.js --network ganache`.
const GANACHE_URL = process.env.GANACHE_URL || "http://127.0.0.1:7545";
const GANACHE_CHAIN_ID = Number(process.env.GANACHE_CHAIN_ID || 1337);

module.exports = {
  solidity: "0.8.24",
  networks: {
    ganache: {
      url: GANACHE_URL,
      chainId: GANACHE_CHAIN_ID,
      // Default "remote" = use Ganache's own unlocked accounts (gives 10 signers,
      // which the tests need). Set PRIVATE_KEY in .env to force one specific account.
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : "remote",
    },
  },
};

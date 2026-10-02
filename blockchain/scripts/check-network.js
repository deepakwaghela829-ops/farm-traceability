// Prints the real chain ID / accounts of the connected node (use this to fill MetaMask).
const { ethers } = require("hardhat");

async function main() {
  const net = await ethers.provider.getNetwork();
  const block = await ethers.provider.getBlockNumber();
  const signers = await ethers.getSigners();
  console.log("Chain ID     :", net.chainId.toString());
  console.log("Block number :", block);
  console.log("Accounts     :", signers.length);
  for (const s of signers.slice(0, 3)) {
    const bal = await ethers.provider.getBalance(s.address);
    console.log(" ", s.address, ethers.formatEther(bal), "ETH");
  }
}
main().catch((e) => { console.error(e); process.exit(1); });

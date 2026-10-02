// Uses node:assert only (no extra dependencies). Works on Ganache or the built-in Hardhat network.
const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

const DAY = 86400;

describe("CropRegistry", function () {
  let registry, farmerA, farmerB;
  const now = Math.floor(Date.now() / 1000);
  const args = ["Wheat", "Cereal", 500, "kg", now, now + 120 * DAY, "Nashik, Maharashtra"];

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    assert.ok(signers.length >= 2, "Need at least 2 accounts (use Ganache's unlocked accounts)");
    [farmerA, farmerB] = signers;
    registry = await (await ethers.getContractFactory("CropRegistry")).deploy();
    await registry.waitForDeployment();
  });

  it("registerCrop stores data on-chain and emits CropRegistered", async function () {
    const returnedId = await registry.connect(farmerA).registerCrop.staticCall(...args);
    assert.equal(returnedId, 1n);

    const tx = await registry.connect(farmerA).registerCrop(...args);
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    const ev = receipt.logs
      .map((l) => { try { return registry.interface.parseLog(l); } catch { return null; } })
      .find((p) => p && p.name === "CropRegistered");
    assert.ok(ev, "CropRegistered event missing");
    assert.equal(ev.args.cropId, 1n);
    assert.equal(ev.args.farmer, farmerA.address);
    assert.equal(ev.args.cropName, "Wheat");
  });

  it("getCrop returns exactly what was registered", async function () {
    await (await registry.connect(farmerA).registerCrop(...args)).wait();
    const c = await registry.getCrop(1);
    assert.equal(c.cropId, 1n);
    assert.equal(c.farmer, farmerA.address);
    assert.equal(c.cropName, "Wheat");
    assert.equal(c.cropType, "Cereal");
    assert.equal(c.quantity, 500n);
    assert.equal(c.unit, "kg");
    assert.equal(c.cultivationDate, BigInt(args[4]));
    assert.equal(c.expectedHarvestDate, BigInt(args[5]));
    assert.equal(c.location, "Nashik, Maharashtra");
    assert.ok(c.createdAt > 0n);
  });

  it("getFarmerCrops lists only that farmer's crops", async function () {
    await (await registry.connect(farmerA).registerCrop(...args)).wait();
    await (await registry.connect(farmerB).registerCrop("Rice", "Cereal", 200, "kg", now, now + 90 * DAY, "Pune")).wait();
    await (await registry.connect(farmerA).registerCrop("Onion", "Vegetable", 300, "kg", now, now + 60 * DAY, "Nashik")).wait();

    assert.deepEqual((await registry.getFarmerCrops(farmerA.address)).map(Number), [1, 3]);
    assert.deepEqual((await registry.getFarmerCrops(farmerB.address)).map(Number), [2]);
    assert.deepEqual([...(await registry.getFarmerCrops(ethers.Wallet.createRandom().address))], []);
  });

  it("rejects invalid input and unknown crop IDs", async function () {
    const bad = (i, v) => { const a = [...args]; a[i] = v; return a; };
    await assert.rejects(registry.registerCrop(...bad(0, "")), /Crop name required/);
    await assert.rejects(registry.registerCrop(...bad(1, "")), /Crop type required/);
    await assert.rejects(registry.registerCrop(...bad(2, 0)), /Quantity must be positive/);
    await assert.rejects(registry.registerCrop(...bad(5, now - DAY)), /Invalid harvest date/);
    await assert.rejects(registry.getCrop(999), /Crop not found/);
  });
});

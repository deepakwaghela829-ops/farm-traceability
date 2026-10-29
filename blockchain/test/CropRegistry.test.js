// Uses node:assert only (no extra dependencies). Works on Ganache or the built-in Hardhat network.
const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

const DAY = 86400;

describe("CropRegistry", function () {
  let registry, farmerA, farmerB, supplier, retailer, unauthorized;
  const now = Math.floor(Date.now() / 1000);
  const args = ["Wheat", "Cereal", 500, "kg", now, now + 120 * DAY, "Nashik, Maharashtra"];

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    assert.ok(signers.length >= 4, "Need at least 4 accounts (use Ganache's unlocked accounts)");
    [farmerA, farmerB, supplier, retailer, unauthorized] = signers;
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

    // Verify initial current holder is farmer
    const holder = await registry.getCurrentHolder(1);
    assert.equal(holder, farmerA.address);
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

  // Focused transferCrop() tests
  it("transferCrop allows valid custody transfer from current holder and emits ProductMoved", async function () {
    await (await registry.connect(farmerA).registerCrop(...args)).wait();
    assert.equal(await registry.getCurrentHolder(1), farmerA.address);

    const tx = await registry.connect(farmerA).transferCrop(1, supplier.address, "Supplier");
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);

    const ev = receipt.logs
      .map((l) => { try { return registry.interface.parseLog(l); } catch { return null; } })
      .find((p) => p && p.name === "ProductMoved");
    assert.ok(ev, "ProductMoved event missing");
    assert.equal(ev.args.cropId, 1n);
    assert.equal(ev.args.from, farmerA.address);
    assert.equal(ev.args.to, supplier.address);
    assert.equal(ev.args.toRole, "Supplier");

    // Holder is updated to supplier
    assert.equal(await registry.getCurrentHolder(1), supplier.address);
  });

  it("transferCrop rejects unauthorized transfer attempt by non-holder with exact revert reason", async function () {
    await (await registry.connect(farmerA).registerCrop(...args)).wait();
    assert.equal(await registry.getCurrentHolder(1), farmerA.address);

    // Supplier attempts to transfer crop that still belongs to farmer -> must revert
    await assert.rejects(
      registry.connect(supplier).transferCrop(1, retailer.address, "Retailer"),
      /Only current holder can transfer/
    );

    // Unauthorized external account attempts transfer -> must revert
    await assert.rejects(
      registry.connect(unauthorized || farmerB).transferCrop(1, retailer.address, "Retailer"),
      /Only current holder can transfer/
    );

    // Holder remains farmerA
    assert.equal(await registry.getCurrentHolder(1), farmerA.address);
  });

  it("transferCrop updates currentHolder sequentially through Farmer -> Supplier -> Retailer chain", async function () {
    await (await registry.connect(farmerA).registerCrop(...args)).wait();
    assert.equal(await registry.getCurrentHolder(1), farmerA.address);

    // Step 1: Farmer -> Supplier
    await (await registry.connect(farmerA).transferCrop(1, supplier.address, "Supplier")).wait();
    assert.equal(await registry.getCurrentHolder(1), supplier.address);

    // Step 2: Former holder (Farmer) can no longer transfer
    await assert.rejects(
      registry.connect(farmerA).transferCrop(1, retailer.address, "Retailer"),
      /Only current holder can transfer/
    );

    // Step 3: Current holder (Supplier) transfers to Retailer
    await (await registry.connect(supplier).transferCrop(1, retailer.address, "Retailer")).wait();
    assert.equal(await registry.getCurrentHolder(1), retailer.address);

    // Step 4: Former holder (Supplier) can no longer transfer
    await assert.rejects(
      registry.connect(supplier).transferCrop(1, farmerB.address, "Farmer"),
      /Only current holder can transfer/
    );
  });

  it("movementHistory records complete, chronological provenance events", async function () {
    await (await registry.connect(farmerA).registerCrop(...args)).wait();

    // Transfer 1: Farmer -> Supplier
    await (await registry.connect(farmerA).transferCrop(1, supplier.address, "Supplier")).wait();

    // Transfer 2: Supplier -> Retailer
    await (await registry.connect(supplier).transferCrop(1, retailer.address, "Retailer")).wait();

    const history = await registry.getMovementHistory(1);
    assert.equal(history.length, 2);

    // Verify first movement
    assert.equal(history[0].from, farmerA.address);
    assert.equal(history[0].to, supplier.address);
    assert.equal(history[0].toRole, "Supplier");
    assert.ok(history[0].timestamp > 0n);

    // Verify second movement
    assert.equal(history[1].from, supplier.address);
    assert.equal(history[1].to, retailer.address);
    assert.equal(history[1].toRole, "Retailer");
    assert.ok(history[1].timestamp >= history[0].timestamp);
  });

  it("transferCrop rejects zero-address recipient, empty role, and unknown crop", async function () {
    await (await registry.connect(farmerA).registerCrop(...args)).wait();

    await assert.rejects(
      registry.connect(farmerA).transferCrop(1, ethers.ZeroAddress, "Supplier"),
      /Invalid recipient/
    );

    await assert.rejects(
      registry.connect(farmerA).transferCrop(1, supplier.address, ""),
      /Role required/
    );

    await assert.rejects(
      registry.connect(farmerA).transferCrop(999, supplier.address, "Supplier"),
      /Crop not found/
    );
  });
});

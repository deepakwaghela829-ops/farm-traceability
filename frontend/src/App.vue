<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ethers } from 'ethers'
import { createCrop } from './api'
import type { CropPayload, CropRecord } from './types'
import abi from './blockchain/CropRegistry.abi.json'
import deploymentInfo from './blockchain/deployment-info.json'

const DEMO_FARMER_ID = 'DEMO-FARMER-001'
const GANACHE_RPC = 'http://127.0.0.1:7545'

type BlockchainCrop = {
  cropId: string
  farmer: string
  cropName: string
  cropType: string
  quantity: string
  unit: string
  cultivationDate: string
  expectedHarvestDate: string
  location: string
  createdAt: string
}

const form = reactive<CropPayload>({
  farmer_id: DEMO_FARMER_ID,
  crop_name: '',
  crop_type: '',
  quantity: 0,
  unit: 'kg',
  cultivation_date: '',
  expected_harvest_date: '',
  location: '',
})

const crops = ref<BlockchainCrop[]>([])
const loading = ref(false)
const loadingRecords = ref(false)
const connectingWallet = ref(false)
const message = ref('')
const error = ref('')
const walletAddress = ref('')

let provider: ethers.JsonRpcProvider | null = null
let signer: ethers.JsonRpcSigner | null = null
let registry: ethers.Contract | null = null

const contractAddress = deploymentInfo.contractAddress
const requiredChainId = BigInt(deploymentInfo.chainId)

const farmerAddress = walletAddress
const connecting = connectingWallet

const shortWallet = computed(() => {
  if (!walletAddress.value) return 'Ganache not connected'
  return `${walletAddress.value.slice(0, 6)}...${walletAddress.value.slice(-4)}`
})

const formValid = computed(() => {
  const quantity = Number(form.quantity)

  return (
    form.crop_name.trim() &&
    form.crop_type.trim() &&
    quantity > 0 &&
    Number.isInteger(quantity) &&
    form.unit.trim() &&
    form.cultivation_date &&
    form.expected_harvest_date &&
    form.expected_harvest_date >= form.cultivation_date &&
    form.location.trim()
  )
})

function resetForm() {
  form.crop_name = ''
  form.crop_type = ''
  form.quantity = 0
  form.unit = 'kg'
  form.cultivation_date = ''
  form.expected_harvest_date = ''
  form.location = ''
}

function unixDate(date: string) {
  return Math.floor(new Date(`${date}T00:00:00`).getTime() / 1000)
}

function dateFromUnix(value: bigint | string) {
  const date = new Date(Number(value) * 1000)

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

async function connectGanache() {
  message.value = ''
  error.value = ''
  connectingWallet.value = true

  try {
    provider = new ethers.JsonRpcProvider(GANACHE_RPC)

    const network = await provider.getNetwork()

    if (network.chainId !== requiredChainId) {
      throw new Error(
        `Wrong blockchain network. Expected chain ID ${requiredChainId.toString()}, got ${network.chainId.toString()}.`,
      )
    }

    const accounts = await provider.send('eth_accounts', [])

    if (!accounts.length) {
      throw new Error('No Ganache accounts found. Make sure Ganache is running.')
    }

    walletAddress.value = accounts[0]
    signer = await provider.getSigner(accounts[0])
    registry = new ethers.Contract(contractAddress, abi, signer)

    message.value = `Connected to Ganache: ${shortWallet.value}`
    await loadCrops()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unable to connect to Ganache.'
  } finally {
    connectingWallet.value = false
  }
}

async function connectWallet() {
  await connectGanache()
}

async function loadCrops() {
  if (!registry || !walletAddress.value) {
    crops.value = []
    return
  }

  loadingRecords.value = true
  error.value = ''

  try {
    const ids = await registry.getFarmerCrops(walletAddress.value)

    const records = await Promise.all(
      ids.map(async (id: bigint) => {
        const c = await registry!.getCrop(id)

        return {
          cropId: c.cropId.toString(),
          farmer: c.farmer,
          cropName: c.cropName,
          cropType: c.cropType,
          quantity: c.quantity.toString(),
          unit: c.unit,
          cultivationDate: dateFromUnix(c.cultivationDate),
          expectedHarvestDate: dateFromUnix(c.expectedHarvestDate),
          location: c.location,
          createdAt: dateFromUnix(c.createdAt),
        }
      }),
    )

    crops.value = records
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unable to load blockchain crop records.'
  } finally {
    loadingRecords.value = false
  }
}

async function submitCrop() {
  message.value = ''
  error.value = ''

  if (!formValid.value) {
    error.value = 'Please complete all fields and check the crop dates and quantity.'
    return
  }

  if (!registry || !provider || !signer || !walletAddress.value) {
    error.value = 'Ganache is not connected. Start Ganache and connect again.'
    return
  }

  loading.value = true

  try {
    const pendingNonce = await provider.getTransactionCount(walletAddress.value, 'pending')

    const tx = await registry.registerCrop(
      form.crop_name.trim(),
      form.crop_type.trim(),
      BigInt(Math.round(Number(form.quantity))),
      form.unit.trim(),
      unixDate(form.cultivation_date),
      unixDate(form.expected_harvest_date),
      form.location.trim(),
      { nonce: pendingNonce },
    )

    message.value = 'Transaction submitted to Ganache. Waiting for confirmation...'

    const receipt = await tx.wait()

    const ids = await registry.getFarmerCrops(walletAddress.value)
    const cropId = ids[ids.length - 1]?.toString() ?? 'unknown'

    await createCrop({
      farmer_id: DEMO_FARMER_ID,
      crop_name: form.crop_name.trim(),
      crop_type: form.crop_type.trim(),
      quantity: Number(form.quantity),
      unit: form.unit.trim(),
      cultivation_date: form.cultivation_date,
      expected_harvest_date: form.expected_harvest_date,
      location: form.location.trim(),
      blockchain_crop_id: Number(cropId),
      blockchain_tx_hash: tx.hash,
      blockchain_contract_address: contractAddress,
      blockchain_block_number: receipt.blockNumber,
      blockchain_farmer_address: walletAddress.value,
      blockchain_chain_id: Number(requiredChainId),
    })

    message.value =
      `Crop #${cropId} registered on blockchain. Block ${receipt.blockNumber}. Tx: ${tx.hash}`

    resetForm()
    await loadCrops()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unable to register crop on blockchain.'
  } finally {
    loading.value = false
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`))
}

onMounted(async () => {
  await connectGanache()
})
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div>
        <span class="eyebrow">FARM TRACEABILITY Â· FARMER MODULE</span>
        <h1>Crop Entry</h1>
        <p>
          Record your crop information on Ethereum and sync it
          with the application database.
        </p>
      </div>

      <div class="farmer-chip">
        <span class="dot"></span>
        Ganache Connected
      </div>
    </header>

    <main class="content">
      <section class="hero-card">
        <div>
          <span class="section-kicker">FARMER VIEW</span>
          <h2>Register a new crop</h2>
          <p>
            Enter the cultivation details exactly as recorded on the farm.
          </p>
        </div>

        <div class="scope-badge">Ethereum + Solidity</div>
      </section>

      <div v-if="message" class="alert success">
        {{ message }}
      </div>

      <div v-if="error" class="alert error">
        {{ error }}
      </div>

      <section class="grid">
        <form
          class="panel form-panel"
          @submit.prevent="submitCrop"
        >
          <div class="panel-heading">
            <div>
              <h3>Crop information</h3>
              <p>Fields marked with * are required.</p>
            </div>
          </div>

          <div class="field-grid">
            <label class="field">
              <span>Crop name *</span>

              <input
                v-model="form.crop_name"
                type="text"
                placeholder="e.g. Banana"
                maxlength="120"
              />
            </label>

            <label class="field">
              <span>Crop type *</span>

              <input
                v-model="form.crop_type"
                type="text"
                placeholder="e.g. Fruit"
                maxlength="120"
              />
            </label>

            <label class="field">
              <span>Quantity *</span>

              <input
                v-model.number="form.quantity"
                type="number"
                min="1"
                step="1"
                placeholder="0"
              />
            </label>

            <label class="field">
              <span>Unit *</span>

              <select v-model="form.unit">
                <option value="kg">kg</option>
                <option value="quintal">quintal</option>
                <option value="tonne">tonne</option>
                <option value="box">box</option>
              </select>
            </label>

            <label class="field">
              <span>Cultivation date *</span>

              <input
                v-model="form.cultivation_date"
                type="date"
              />
            </label>

            <label class="field">
              <span>Expected harvest date *</span>

              <input
                v-model="form.expected_harvest_date"
                type="date"
                :min="
                  form.cultivation_date || undefined
                "
              />
            </label>

            <label class="field full">
              <span>Location *</span>

              <input
                v-model="form.location"
                type="text"
                placeholder="e.g. Palghar, Maharashtra"
                maxlength="200"
              />
            </label>
          </div>

          <div class="form-footer">
            <span class="helper">
              Farmer blockchain address:
              {{ farmerAddress || 'Connecting...' }}
            </span>

            <button
              type="submit"
              :disabled="
                loading ||
                connecting ||
                !farmerAddress
              "
            >
              {{
                loading
                  ? 'Registering...'
                  : connecting
                    ? 'Connecting...'
                    : 'Register on blockchain'
              }}
            </button>
          </div>
        </form>

        <aside class="panel info-panel">
          <div class="panel-heading">
            <div>
              <h3>Current blockchain flow</h3>
              <p>
                The crop is recorded on-chain and then
                synchronized with PostgreSQL.
              </p>
            </div>
          </div>

          <div class="flow">
            <div class="flow-step active">
              Farmer View
            </div>

            <div class="flow-line"></div>

            <div class="flow-step active">
              Crop Entry
            </div>

            <div class="flow-line"></div>

            <div class="flow-step active">
              Ganache
            </div>

            <div class="flow-line"></div>

            <div class="flow-step active">
              Ethereum Blockchain
            </div>

            <div class="flow-line"></div>

            <div class="flow-step active">
              CropRegistry Smart Contract
            </div>

            <div class="flow-line"></div>

            <div class="flow-step active">
              FastAPI
            </div>

            <div class="flow-line"></div>

            <div class="flow-step active">
              PostgreSQL
            </div>
          </div>

          <p class="scope-note">
            Crop details are registered through the Solidity
            CropRegistry smart contract. After blockchain
            confirmation, the application stores the crop
            information and blockchain transaction metadata
            in PostgreSQL.
          </p>
        </aside>
      </section>

      <section class="panel records-panel">
        <div class="panel-heading records-heading">
          <div>
            <h3>Blockchain crop records</h3>

            <p>
              Crop records registered by the farmer account.
            </p>
          </div>

          <button
            class="secondary"
            type="button"
            @click="loadCrops"
            :disabled="
              loadingRecords || !farmerAddress
            "
          >
            {{
              loadingRecords
                ? 'Refreshing...'
                : 'Refresh'
            }}
          </button>
        </div>

        <div
          v-if="loadingRecords"
          class="empty-state"
        >
          Loading blockchain crop records...
        </div>

        <div
          v-else-if="!farmerAddress"
          class="empty-state"
        >
          Connecting to Ganache...
        </div>

        <div
          v-else-if="crops.length === 0"
          class="empty-state"
        >
          No blockchain crop records yet.
          Register your first crop above.
        </div>

        <div
          v-else
          class="table-wrap"
        >
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Crop</th>
                <th>Type</th>
                <th>Quantity</th>
                <th>Cultivation</th>
                <th>Harvest</th>
                <th>Location</th>
              </tr>
            </thead>

            <tbody>
              <tr
                v-for="crop in crops"
                :key="crop.cropId"
              >
                <td>
                  #{{ crop.cropId }}
                </td>

                <td>
                  {{ crop.cropName }}
                </td>

                <td>
                  {{ crop.cropType }}
                </td>

                <td>
                  {{ crop.quantity }}
                  {{ crop.unit }}
                </td>

                <td>
                  {{ formatDate(crop.cultivationDate) }}
                </td>

                <td>
                  {{ formatDate(crop.expectedHarvestDate) }}
                </td>

                <td>
                  {{ crop.location }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  </div>
</template>


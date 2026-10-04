<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  fetchGanacheAccounts,
  loadCrop,
  executeTransfer,
  saveTransactionToBackend,
  formatDateTime,
  truncateAddress,
  type CropDetails,
  type BlockchainMovement,
  type DbTransaction,
  type GanacheAccount,
  CONTRACT_ADDRESS,
  REQUIRED_CHAIN_ID,
  GANACHE_RPC,
} from '../supplierRetailerService'

// Search & initialization state
const searchCropId = ref<string | number>('')
const loadingCrop = ref<boolean>(false)
const cropError = ref<string>('')
const initError = ref<string>('')

// Sanitized & normalized Crop ID string
const normalizedCropId = computed<string>(() => {
  if (searchCropId.value === null || searchCropId.value === undefined) return ''
  return String(searchCropId.value).trim()
})

// Parsed integer Crop ID if valid positive integer, otherwise null
const parsedCropId = computed<number | null>(() => {
  const val = normalizedCropId.value
  if (!val) return null
  const num = Number(val)
  return !isNaN(num) && Number.isInteger(num) && num > 0 ? num : null
})

// Whether the Load Crop button should be enabled
const canLoadCrop = computed<boolean>(() => {
  return parsedCropId.value !== null && !loadingCrop.value
})


// Loaded data
const crop = ref<CropDetails | null>(null)
const movements = ref<BlockchainMovement[]>([])
const dbTransactions = ref<DbTransaction[]>([])

// Ganache accounts state
const accounts = ref<GanacheAccount[]>([])
const selectedAccount = ref<string>('')
const loadingAccounts = ref<boolean>(false)

// Transfer form state
const destinationAddress = ref<string>('')
const destinationRole = ref<string>('Supplier')
const transferring = ref<boolean>(false)
const transferProgress = ref<string>('')
const transferError = ref<string>('')
const transferSuccess = ref<{
  txHash: string
  blockNumber: number
  from: string
  to: string
  role: string
  cropId: number
  dbSynced: boolean
  dbErrorMsg?: string
} | null>(null)

// Copied clipboard state
const copiedText = ref<string | null>(null)

// Current holder role identification
const currentHolderStage = computed<'Farmer' | 'Supplier' | 'Retailer' | 'Unknown'>(() => {
  if (!crop.value) return 'Unknown'
  const holder = crop.value.currentHolder.toLowerCase()
  const farmer = crop.value.farmer.toLowerCase()

  if (holder === farmer) {
    return 'Farmer'
  }

  // Look through movement history in reverse
  const lastMatching = [...movements.value].reverse().find((m) => m.to.toLowerCase() === holder)
  if (lastMatching) {
    const roleLower = lastMatching.toRole.toLowerCase()
    if (roleLower.includes('supplier')) return 'Supplier'
    if (roleLower.includes('retailer')) return 'Retailer'
  }

  return 'Unknown'
})

// Validation: Is selected Ganache account authorized as the current holder?
const isSignerCurrentHolder = computed<boolean>(() => {
  if (!crop.value || !selectedAccount.value) return false
  return crop.value.currentHolder.toLowerCase() === selectedAccount.value.toLowerCase()
})

// Validation: Is the transfer form valid?
const isTransferValid = computed<boolean>(() => {
  if (!crop.value) return false
  if (!isSignerCurrentHolder.value) return false
  const dest = destinationAddress.value.trim().toLowerCase()
  if (!dest) return false
  if (dest === crop.value.currentHolder.toLowerCase()) return false
  if (!destinationRole.value) return false
  return true
})

// Load Ganache accounts
async function loadAccountsList() {
  loadingAccounts.value = true
  initError.value = ''
  try {
    const list = await fetchGanacheAccounts()
    accounts.value = list
    if (list.length && !selectedAccount.value) {
      selectedAccount.value = list[0].address
    }
  } catch (err: any) {
    initError.value = err?.message || 'Failed to load Ganache accounts.'
  } finally {
    loadingAccounts.value = false
  }
}

// Load Crop Data
async function handleLoadCrop() {
  cropError.value = ''
  transferError.value = ''
  transferSuccess.value = null

  const validId = parsedCropId.value
  if (validId === null) {
    cropError.value = 'Please enter a valid positive integer Crop ID (e.g. 1).'
    return
  }

  loadingCrop.value = true
  try {
    const result = await loadCrop(validId)
    crop.value = result.crop
    movements.value = result.movements
    dbTransactions.value = result.dbTransactions

    // If selectedAccount is not the current holder, auto-select current holder if it's in accounts
    if (result.crop?.currentHolder && accounts.value.length) {
      const matchingAccount = accounts.value.find(
        (a) => a.address.toLowerCase() === result.crop.currentHolder.toLowerCase(),
      )
      if (matchingAccount) {
        selectedAccount.value = matchingAccount.address
      }
    }
  } catch (err: any) {
    crop.value = null
    movements.value = []
    dbTransactions.value = []
    cropError.value = err instanceof Error ? err.message : 'Failed to load crop.'
  } finally {
    loadingCrop.value = false
  }
}

// Quick select account as destination
function setDestinationAddress(addr: string) {
  destinationAddress.value = addr
}

// Execute Crop Transfer
async function handleTransfer() {
  transferError.value = ''
  transferSuccess.value = null

  if (!crop.value) {
    transferError.value = 'Please load a crop first.'
    return
  }

  if (!isSignerCurrentHolder.value) {
    transferError.value =
      'Selected Ganache account is not the current holder of this crop. Transfer cannot proceed.'
    return
  }

  const dest = destinationAddress.value.trim()
  if (!dest) {
    transferError.value = 'Destination wallet address is required.'
    return
  }

  if (dest.toLowerCase() === selectedAccount.value.toLowerCase()) {
    transferError.value = 'Destination address cannot be the same as the current holder address.'
    return
  }

  transferring.value = true
  transferProgress.value = 'Initiating transaction on Ethereum / Ganache...'

  try {
    const fromAddr = selectedAccount.value
    const toAddr = dest
    const toRole = destinationRole.value
    const cropIdNum = crop.value.cropId

    // 1. Submit on-chain transfer
    transferProgress.value = 'Waiting for blockchain block confirmation...'
    const onChainResult = await executeTransfer(cropIdNum, fromAddr, toAddr, toRole)

    transferProgress.value = 'Blockchain confirmed! Synchronizing with PostgreSQL...'

    // 2. Save transaction in PostgreSQL
    let dbSuccess = true
    let dbErrMsg = ''
    try {
      await saveTransactionToBackend({
        crop_id: cropIdNum,
        event_type: 'TRANSFER',
        from_address: fromAddr,
        to_address: toAddr,
        to_role: toRole,
        transaction_hash: onChainResult.txHash,
        block_number: onChainResult.blockNumber,
        timestamp: onChainResult.timestamp,
      })
    } catch (dbErr: any) {
      dbSuccess = false
      dbErrMsg = dbErr?.message || 'Database sync failed.'
    }

    // 3. Set success state
    transferSuccess.value = {
      txHash: onChainResult.txHash,
      blockNumber: onChainResult.blockNumber,
      from: fromAddr,
      to: toAddr,
      role: toRole,
      cropId: cropIdNum,
      dbSynced: dbSuccess,
      dbErrorMsg: dbErrMsg,
    }

    // 4. Reset form fields
    destinationAddress.value = ''

    // 5. Refresh data from blockchain and PostgreSQL immediately
    transferProgress.value = 'Refreshing on-chain data...'
    const refreshed = await loadCrop(cropIdNum)
    crop.value = refreshed.crop
    movements.value = refreshed.movements
    dbTransactions.value = refreshed.dbTransactions

    // Refresh account balances
    await loadAccountsList()
  } catch (err: any) {
    transferError.value = err instanceof Error ? err.message : 'Transfer failed.'
  } finally {
    transferring.value = false
    transferProgress.value = ''
  }
}

function copyToClipboard(text: string) {
  if (navigator?.clipboard?.writeText) {
    navigator.clipboard.writeText(text)
    copiedText.value = text
    setTimeout(() => {
      if (copiedText.value === text) {
        copiedText.value = null
      }
    }, 2000)
  }
}

onMounted(async () => {
  await loadAccountsList()

  // Auto-load if query param exists (e.g. ?cropId=1)
  const urlParams = new URLSearchParams(window.location.search)
  const urlCropId = urlParams.get('cropId') || urlParams.get('id')
  if (urlCropId) {
    searchCropId.value = urlCropId
    await handleLoadCrop()
  }
})
</script>

<template>
  <div class="supplier-retailer-app app-shell">
    <!-- Topbar Navigation -->
    <header class="topbar">
      <div>
        <span class="eyebrow">FARM TRACEABILITY · SUPPLY CHAIN MODULE</span>
        <h1>Supplier / Retailer Supply Chain</h1>
        <p>
          Transfer product custody across the supply chain with on-chain Ethereum
          settlement and PostgreSQL synchronization.
        </p>
      </div>

      <div class="header-nav">
        <a href="/" class="nav-chip">🌾 Farmer Portal</a>
        <a href="/consumer.html" class="nav-chip">🔍 Consumer Portal</a>
        <a href="/ai-price-prediction.html" class="nav-chip">🤖 AI Price Prediction</a>
        <div class="network-badge" :class="{ 'network-error': !!initError }">
          <span class="dot" :class="{ 'dot-error': !!initError }"></span>
          {{ accounts.length > 0 ? `Ganache (${accounts.length} accounts)` : (loadingAccounts ? 'Connecting Ganache...' : 'Ganache Disconnected') }}
        </div>
      </div>
    </header>

    <main class="content">
      <!-- Initialization Error Alert -->
      <div v-if="initError" class="alert error init-error">
        <div><strong>Blockchain Connection Warning:</strong> {{ initError }}</div>
        <button type="button" class="retry-btn" :disabled="loadingAccounts" @click="loadAccountsList">
          {{ loadingAccounts ? 'Connecting...' : '↻ Retry Connection' }}
        </button>
      </div>

      <!-- Section 1: Find Crop Search Card -->
      <section class="hero-card search-hero">
        <div class="hero-text">
          <span class="section-kicker">SECTION 1 · SEARCH & VERIFY</span>
          <h2>Find & Load Crop</h2>
          <p>
            Enter the blockchain Crop ID to inspect on-chain custody and movement history.
          </p>
        </div>

        <form class="search-form" @submit.prevent="handleLoadCrop">
          <div class="input-wrap">
            <span class="input-prefix">ID #</span>
            <input
              v-model="searchCropId"
              type="number"
              min="1"
              step="1"
              placeholder="e.g. 1"
              class="search-input"
              :disabled="loadingCrop"
            />
          </div>

          <button
            type="submit"
            class="action-btn"
            :disabled="!canLoadCrop"
          >
            <span v-if="loadingCrop" class="spinner"></span>
            <span>{{ loadingCrop ? 'Loading...' : 'Load Crop' }}</span>
          </button>
        </form>
      </section>

      <!-- Global Error Alert -->
      <div v-if="cropError" class="alert error">
        <strong>Error:</strong> {{ cropError }}
      </div>

      <!-- Loaded Crop Content -->
      <div v-if="crop" class="module-body">
        <!-- Section 8: Visual Supply Chain Summary Banner -->
        <section class="panel summary-panel">
          <div class="panel-heading">
            <div>
              <span class="section-kicker">SECTION 8 · END-TO-END JOURNEY</span>
              <h3>Supply Chain Custody Pipeline</h3>
              <p>Visual path from farm harvest to consumer retail</p>
            </div>
          </div>

          <div class="pipeline-flow">
            <!-- Stage 1: Farmer -->
            <div
              class="pipeline-node"
              :class="{
                active: currentHolderStage === 'Farmer',
                completed: currentHolderStage !== 'Farmer',
              }"
            >
              <div class="node-icon">👨‍🌾</div>
              <div class="node-label">Farmer</div>
              <div class="node-status">
                {{ currentHolderStage === 'Farmer' ? '● Current Holder' : '✓ Completed' }}
              </div>
            </div>

            <div class="pipeline-connector" :class="{ filled: currentHolderStage !== 'Farmer' }">
              <span class="connector-arrow">→</span>
            </div>

            <!-- Stage 2: Supplier -->
            <div
              class="pipeline-node"
              :class="{
                active: currentHolderStage === 'Supplier',
                completed: currentHolderStage === 'Retailer',
              }"
            >
              <div class="node-icon">🚚</div>
              <div class="node-label">Supplier</div>
              <div class="node-status">
                {{
                  currentHolderStage === 'Supplier'
                    ? '● Current Holder'
                    : currentHolderStage === 'Retailer'
                      ? '✓ Completed'
                      : '⏳ Pending'
                }}
              </div>
            </div>

            <div class="pipeline-connector" :class="{ filled: currentHolderStage === 'Retailer' }">
              <span class="connector-arrow">→</span>
            </div>

            <!-- Stage 3: Retailer -->
            <div
              class="pipeline-node"
              :class="{
                active: currentHolderStage === 'Retailer',
              }"
            >
              <div class="node-icon">🏪</div>
              <div class="node-label">Retailer</div>
              <div class="node-status">
                {{ currentHolderStage === 'Retailer' ? '● Current Holder' : '⏳ Pending' }}
              </div>
            </div>

            <div class="pipeline-connector">
              <span class="connector-arrow">→</span>
            </div>

            <!-- Stage 4: Consumer -->
            <div class="pipeline-node consumer">
              <div class="node-icon">🛒</div>
              <div class="node-label">Consumer</div>
              <div class="node-status">End Point</div>
            </div>
          </div>
        </section>

        <!-- Section 2: Current Holder Highlight Panel -->
        <section class="panel current-holder-banner">
          <div class="holder-badge-col">
            <span class="holder-kicker">SECTION 2 · CURRENT BLOCKCHAIN CUSTODIAN</span>
            <div class="holder-main-row">
              <span class="stage-tag" :class="currentHolderStage.toLowerCase()">
                {{ currentHolderStage }}
              </span>
              <code class="holder-addr" :title="crop.currentHolder">
                {{ crop.currentHolder }}
              </code>
              <button
                type="button"
                class="copy-btn"
                @click="copyToClipboard(crop.currentHolder)"
              >
                {{ copiedText === crop.currentHolder ? 'Copied!' : 'Copy Address' }}
              </button>
            </div>
          </div>

          <div class="holder-meta-col">
            <span class="holder-meta-label">Custody Status</span>
            <span class="holder-meta-val">Verified on Ethereum State</span>
          </div>
        </section>

        <!-- Section 1 Display: Specifications Grid -->
        <section class="panel specs-panel">
          <div class="panel-heading">
            <div>
              <h3>Crop Specifications</h3>
              <p>On-chain records from CropRegistry smart contract</p>
            </div>
            <span class="badge-pill">Chain ID: {{ REQUIRED_CHAIN_ID }}</span>
          </div>

          <div class="specs-grid">
            <div class="spec-card">
              <span class="spec-label">Crop ID</span>
              <span class="spec-value highlight">#{{ crop.cropId }}</span>
            </div>

            <div class="spec-card">
              <span class="spec-label">Crop Name</span>
              <span class="spec-value">{{ crop.cropName }}</span>
            </div>

            <div class="spec-card">
              <span class="spec-label">Crop Type</span>
              <span class="spec-value">{{ crop.cropType }}</span>
            </div>

            <div class="spec-card">
              <span class="spec-label">Quantity</span>
              <span class="spec-value">{{ crop.quantity }} {{ crop.unit }}</span>
            </div>

            <div class="spec-card">
              <span class="spec-label">Farmer ID</span>
              <span class="spec-value">{{ crop.farmerId || 'DEMO-FARMER-001' }}</span>
            </div>

            <div class="spec-card">
              <span class="spec-label">Location</span>
              <span class="spec-value">{{ crop.location }}</span>
            </div>

            <div class="spec-card">
              <span class="spec-label">Cultivation Date</span>
              <span class="spec-value">{{ crop.cultivationDate }}</span>
            </div>

            <div class="spec-card">
              <span class="spec-label">Expected Harvest Date</span>
              <span class="spec-value">{{ crop.expectedHarvestDate }}</span>
            </div>

            <div class="spec-card">
              <span class="spec-label">Harvest Status</span>
              <span
                class="status-pill"
                :class="crop.isHarvested ? 'harvested' : 'pending'"
              >
                {{ crop.isHarvested ? '✓ Harvested' : '⏳ In Cultivation' }}
              </span>
            </div>

            <div class="spec-card">
              <span class="spec-label">Contract Address</span>
              <span class="spec-value mono" :title="CONTRACT_ADDRESS">
                {{ truncateAddress(CONTRACT_ADDRESS) }}
              </span>
            </div>

            <div class="spec-card full-span">
              <span class="spec-label">Farmer Blockchain Address</span>
              <div class="addr-row">
                <code class="mono-full" :title="crop.farmer">{{ crop.farmer }}</code>
                <button
                  type="button"
                  class="copy-btn-small"
                  @click="copyToClipboard(crop.farmer)"
                >
                  {{ copiedText === crop.farmer ? 'Copied' : 'Copy' }}
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- Section 3 & 4: Action Grid (Signer Account + Transfer Form) -->
        <div class="actions-grid">
          <!-- Section 3: Ganache Account Selection -->
          <section class="panel account-panel">
            <div class="panel-heading">
              <div>
                <span class="section-kicker">SECTION 3 · LOCAL BLOCKCHAIN SIGNER</span>
                <h3>Ganache Account</h3>
                <p>Select the unlocked account that executes this transfer</p>
              </div>
              <button
                type="button"
                class="refresh-btn"
                @click="loadAccountsList"
                :disabled="loadingAccounts"
              >
                {{ loadingAccounts ? 'Refreshing...' : '↻ Refresh' }}
              </button>
            </div>

            <label class="field-label">Select Signer Account:</label>
            <select v-model="selectedAccount" class="select-input">
              <option
                v-for="(acc, i) in accounts"
                :key="acc.address"
                :value="acc.address"
              >
                Account {{ i }}: {{ truncateAddress(acc.address, 6, 4) }} ({{ acc.balance }} ETH)
                {{ acc.address.toLowerCase() === crop.currentHolder.toLowerCase() ? '★ [CURRENT HOLDER]' : '' }}
              </option>
            </select>

            <!-- Verification Indicator: Does selected account match current holder? -->
            <div
              class="auth-indicator"
              :class="isSignerCurrentHolder ? 'auth-ok' : 'auth-fail'"
            >
              <span class="auth-icon">{{ isSignerCurrentHolder ? '✓' : '⚠' }}</span>
              <div class="auth-text">
                <strong v-if="isSignerCurrentHolder">
                  Authorized Signer: Selected account matches the current on-chain holder.
                </strong>
                <strong v-else>
                  Selected Ganache account is not the current holder of this crop.
                </strong>
                <p>
                  Current Holder:
                  <code>{{ truncateAddress(crop.currentHolder) }}</code>
                </p>
              </div>
            </div>

            <!-- Account list quick-selector -->
            <div class="quick-accounts">
              <span class="quick-title">Quick Select Destination:</span>
              <div class="account-pills">
                <button
                  v-for="(acc, i) in accounts"
                  :key="acc.address"
                  type="button"
                  class="pill-btn"
                  :class="{ disabled: acc.address.toLowerCase() === crop.currentHolder.toLowerCase() }"
                  @click="setDestinationAddress(acc.address)"
                  :disabled="acc.address.toLowerCase() === crop.currentHolder.toLowerCase()"
                  :title="`Use Account ${i} as destination`"
                >
                  Acc {{ i }} ({{ truncateAddress(acc.address, 4, 3) }})
                </button>
              </div>
            </div>
          </section>

          <!-- Section 4: Transfer Form -->
          <section class="panel transfer-panel">
            <div class="panel-heading">
              <div>
                <span class="section-kicker">SECTION 4 · CUSTODY TRANSFER</span>
                <h3>Transfer Crop</h3>
                <p>Transfer ownership on Ethereum via <code>transferCrop()</code></p>
              </div>
            </div>

            <form @submit.prevent="handleTransfer">
              <div class="form-fields">
                <label class="field">
                  <span>Destination Wallet Address *</span>
                  <input
                    v-model="destinationAddress"
                    type="text"
                    placeholder="0x..."
                    class="text-input"
                    maxlength="42"
                    :disabled="transferring"
                  />
                </label>

                <label class="field">
                  <span>Destination Role *</span>
                  <select
                    v-model="destinationRole"
                    class="select-input"
                    :disabled="transferring"
                  >
                    <option value="Supplier">Supplier</option>
                    <option value="Retailer">Retailer</option>
                  </select>
                </label>
              </div>

              <!-- Error Alert -->
              <div v-if="transferError" class="alert error transfer-alert">
                {{ transferError }}
              </div>

              <!-- Progress Indicator -->
              <div v-if="transferProgress" class="progress-box">
                <span class="spinner-blue"></span>
                <span>{{ transferProgress }}</span>
              </div>

              <div class="form-footer">
                <button
                  type="submit"
                  class="transfer-submit-btn"
                  :disabled="transferring || !isTransferValid"
                >
                  {{ transferring ? 'Processing Transfer...' : 'Transfer Crop' }}
                </button>
              </div>
            </form>
          </section>
        </div>

        <!-- Section 5: Transaction Result Banner -->
        <section v-if="transferSuccess" class="panel result-banner">
          <div class="result-header">
            <div class="result-icon">✓</div>
            <div>
              <h3>Transfer Successful</h3>
              <p>Crop custody successfully transferred on the Ethereum blockchain.</p>
            </div>
          </div>

          <div class="result-details-grid">
            <div class="result-item">
              <span class="result-label">Transaction Hash</span>
              <div class="res-hash-row">
                <code class="mono-full" :title="transferSuccess.txHash">
                  {{ transferSuccess.txHash }}
                </code>
                <button
                  type="button"
                  class="copy-btn-small"
                  @click="copyToClipboard(transferSuccess.txHash)"
                >
                  Copy
                </button>
              </div>
            </div>

            <div class="result-item">
              <span class="result-label">Block Number</span>
              <span class="result-val">#{{ transferSuccess.blockNumber }}</span>
            </div>

            <div class="result-item">
              <span class="result-label">From Address</span>
              <code class="mono">{{ truncateAddress(transferSuccess.from) }}</code>
            </div>

            <div class="result-item">
              <span class="result-label">To Address</span>
              <code class="mono">{{ truncateAddress(transferSuccess.to) }}</code>
            </div>

            <div class="result-item">
              <span class="result-label">Destination Role</span>
              <span class="role-pill">{{ transferSuccess.role }}</span>
            </div>

            <div class="result-item">
              <span class="result-label">Crop ID</span>
              <span class="result-val">#{{ transferSuccess.cropId }}</span>
            </div>
          </div>

          <!-- PostgreSQL Sync Status -->
          <div
            v-if="transferSuccess.dbSynced"
            class="db-sync-notice success"
          >
            ✓ PostgreSQL synchronization complete (saved to <code>transactions</code> table).
          </div>
          <div
            v-else
            class="db-sync-notice warning"
          >
            ⚠ Blockchain transfer succeeded, but PostgreSQL synchronization failed: {{ transferSuccess.dbErrorMsg }}
          </div>
        </section>

        <!-- Section 6: Blockchain Movement History -->
        <section class="panel history-panel">
          <div class="panel-heading">
            <div>
              <span class="section-kicker">SECTION 6 · ON-CHAIN AUDIT TRAIL</span>
              <h3>Blockchain Movement History</h3>
              <p>Read from smart contract <code>getMovementHistory()</code></p>
            </div>
            <span class="count-badge">{{ movements.length }} Transfers</span>
          </div>

          <div v-if="movements.length === 0" class="empty-state">
            No on-chain movements recorded yet. Crop is held by the original Farmer.
          </div>

          <div v-else class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Role</th>
                  <th>Tx Hash</th>
                  <th>Block</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(m, i) in movements" :key="i">
                  <td>
                    <span class="event-tag">TRANSFER</span>
                  </td>
                  <td>
                    <code :title="m.from">{{ truncateAddress(m.from) }}</code>
                  </td>
                  <td>
                    <code :title="m.to">{{ truncateAddress(m.to) }}</code>
                  </td>
                  <td>
                    <span class="role-badge" :class="m.toRole.toLowerCase()">
                      {{ m.toRole }}
                    </span>
                  </td>
                  <td>
                    <code v-if="m.transactionHash" :title="m.transactionHash">
                      {{ truncateAddress(m.transactionHash, 6, 4) }}
                    </code>
                    <span v-else class="text-muted">On-chain</span>
                  </td>
                  <td>
                    <span v-if="m.blockNumber">#{{ m.blockNumber }}</span>
                    <span v-else class="text-muted">—</span>
                  </td>
                  <td>
                    <span class="date-text">{{ formatDateTime(m.timestamp) }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- Section 7: PostgreSQL Transaction History -->
        <section class="panel db-panel">
          <div class="panel-heading">
            <div>
              <span class="section-kicker">SECTION 7 · DATABASE PERSISTENCE</span>
              <h3>PostgreSQL Transaction Records</h3>
              <p>Persisted ledger from <code>GET /api/transactions/{crop_id}</code></p>
            </div>
            <span class="count-badge db">{{ dbTransactions.length }} DB Records</span>
          </div>

          <div v-if="dbTransactions.length === 0" class="empty-state">
            No PostgreSQL transaction records found for Crop #{{ crop.cropId }}.
          </div>

          <div v-else class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Crop ID</th>
                  <th>Event</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Role</th>
                  <th>Transaction Hash</th>
                  <th>Block</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="t in dbTransactions" :key="t.id">
                  <td>#{{ t.crop_id }}</td>
                  <td>
                    <span class="event-tag">{{ t.event_type }}</span>
                  </td>
                  <td>
                    <code :title="t.from_address">{{ truncateAddress(t.from_address) }}</code>
                  </td>
                  <td>
                    <code :title="t.to_address">{{ truncateAddress(t.to_address) }}</code>
                  </td>
                  <td>
                    <span class="role-badge" :class="t.to_role.toLowerCase()">
                      {{ t.to_role }}
                    </span>
                  </td>
                  <td>
                    <code :title="t.transaction_hash">
                      {{ truncateAddress(t.transaction_hash, 6, 4) }}
                    </code>
                  </td>
                  <td>#{{ t.block_number }}</td>
                  <td>
                    <span class="date-text">{{ formatDateTime(t.timestamp) }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>

<style scoped>
.supplier-retailer-app {
  min-height: 100vh;
}

.header-nav {
  display: flex;
  align-items: center;
  gap: 10px;
}

.nav-chip {
  padding: 8px 14px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 999px;
  color: white;
  text-decoration: none;
  font-size: 13px;
  font-weight: 700;
  transition: all 0.2s;
}

.nav-chip:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: translateY(-1px);
}

.network-badge {
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  font-size: 13px;
  font-weight: 700;
  color: white;
  display: flex;
  align-items: center;
}

.network-badge.network-error {
  border-color: rgba(239, 68, 68, 0.4);
  background: rgba(239, 68, 68, 0.15);
  color: #fca5a5;
}

.dot.dot-error {
  background: #ef4444;
}

.init-error {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 20px;
}

.retry-btn {
  padding: 6px 14px;
  background: #991b1b;
  color: white;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  border: 1px solid rgba(255, 255, 255, 0.25);
  cursor: pointer;
  transition: background 0.15s;
}

.retry-btn:hover:not(:disabled) {
  background: #7f1d1d;
}

.search-hero {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}

.search-form {
  display: flex;
  gap: 10px;
  align-items: center;
  min-width: 320px;
}

.input-wrap {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
}

.input-prefix {
  position: absolute;
  left: 14px;
  color: #94a3b8;
  font-weight: 800;
  font-size: 14px;
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 11px 14px 11px 48px;
  border: 1.5px solid #cbd5e1;
  border-radius: 12px;
  font-weight: 700;
  font-size: 16px;
  outline: none;
  transition: border-color 0.15s;
}

.search-input:focus {
  border-color: #0f172a;
}

.action-btn {
  padding: 12px 20px;
  background: #0f172a;
  color: white;
  border: 0;
  border-radius: 12px;
  font-weight: 800;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.action-btn:hover:not(:disabled) {
  background: #1e293b;
}

.module-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-top: 20px;
}

/* Pipeline Flow */
.summary-panel {
  padding: 24px;
}

.pipeline-flow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 16px;
  overflow-x: auto;
  padding-bottom: 8px;
}

.pipeline-node {
  flex: 1;
  min-width: 150px;
  padding: 16px;
  border-radius: 16px;
  background: #f8fafc;
  border: 2px solid #e2e8f0;
  text-align: center;
  transition: all 0.2s;
}

.pipeline-node.active {
  border-color: #10b981;
  background: #ecfdf5;
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);
}

.pipeline-node.completed {
  border-color: #93c5fd;
  background: #eff6ff;
}

.node-icon {
  font-size: 26px;
  margin-bottom: 6px;
}

.node-label {
  font-weight: 800;
  font-size: 15px;
  color: #0f172a;
}

.node-status {
  font-size: 11px;
  font-weight: 700;
  margin-top: 4px;
  color: #64748b;
}

.pipeline-node.active .node-status {
  color: #059669;
  font-weight: 800;
}

.pipeline-connector {
  font-size: 22px;
  color: #cbd5e1;
  font-weight: 900;
}

.pipeline-connector.filled {
  color: #3b82f6;
}

/* Current Holder Banner */
.current-holder-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  padding: 20px 24px;
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  color: white;
  border-radius: 20px;
}

.holder-kicker {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #94a3b8;
  font-weight: 700;
}

.holder-main-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 6px;
  flex-wrap: wrap;
}

.stage-tag {
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
}

.stage-tag.farmer {
  background: #fef08a;
  color: #854d0e;
}

.stage-tag.supplier {
  background: #bfdbfe;
  color: #1e40af;
}

.stage-tag.retailer {
  background: #bbf7d0;
  color: #166534;
}

.holder-addr {
  font-family: monospace;
  font-size: 14px;
  background: rgba(255, 255, 255, 0.1);
  padding: 4px 8px;
  border-radius: 6px;
  color: #f1f5f9;
}

.copy-btn {
  padding: 4px 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.15);
  border: 0;
  color: white;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.copy-btn:hover {
  background: rgba(255, 255, 255, 0.25);
}

.holder-meta-col {
  text-align: right;
}

.holder-meta-label {
  display: block;
  font-size: 11px;
  color: #94a3b8;
  text-transform: uppercase;
  font-weight: 700;
}

.holder-meta-val {
  font-size: 13px;
  font-weight: 800;
  color: #34d399;
}

/* Specs Panel */
.specs-panel {
  padding: 24px;
}

.specs-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.spec-card {
  padding: 12px 14px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.spec-card.full-span {
  grid-column: 1 / -1;
}

.spec-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: #64748b;
}

.spec-value {
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
}

.spec-value.highlight {
  font-size: 17px;
  color: #059669;
}

.spec-value.mono {
  font-family: monospace;
}

.addr-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.mono-full {
  font-family: monospace;
  font-size: 13px;
  color: #0f172a;
  word-break: break-all;
}

.copy-btn-small {
  padding: 3px 8px;
  border-radius: 6px;
  background: #e2e8f0;
  color: #1e293b;
  border: 0;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  flex-shrink: 0;
}

.status-pill {
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  width: fit-content;
}

.status-pill.harvested {
  background: #dcfce7;
  color: #166534;
}

.status-pill.pending {
  background: #fef9c3;
  color: #854d0e;
}

/* Actions Grid (Signer Account + Transfer Form) */
.actions-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1.4fr);
  gap: 18px;
}

.account-panel,
.transfer-panel {
  padding: 24px;
}

.field-label {
  display: block;
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 6px;
  color: #334155;
}

.select-input,
.text-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  font-size: 14px;
  color: #0f172a;
  background: white;
  outline: none;
}

.select-input:focus,
.text-input:focus {
  border-color: #0f172a;
}

.auth-indicator {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px 14px;
  border-radius: 12px;
  margin-top: 14px;
  font-size: 13px;
}

.auth-indicator.auth-ok {
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  color: #065f46;
}

.auth-indicator.auth-fail {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
}

.auth-icon {
  font-size: 16px;
  font-weight: 900;
}

.auth-text p {
  margin: 4px 0 0;
  font-size: 12px;
}

.auth-text code {
  font-family: monospace;
}

.quick-accounts {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid #e2e8f0;
}

.quick-title {
  display: block;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: #64748b;
  margin-bottom: 8px;
}

.account-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pill-btn {
  padding: 4px 8px;
  border-radius: 8px;
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.pill-btn:hover:not(:disabled) {
  background: #e2e8f0;
}

.pill-btn.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.form-fields {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field span {
  font-size: 13px;
  font-weight: 700;
  color: #334155;
}

.transfer-submit-btn {
  width: 100%;
  margin-top: 16px;
  padding: 12px 18px;
  background: #0f172a;
  color: white;
  border: 0;
  border-radius: 12px;
  font-weight: 800;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.transfer-submit-btn:hover:not(:disabled) {
  background: #1e293b;
  transform: translateY(-1px);
}

.transfer-submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.progress-box {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 10px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1d4ed8;
  font-size: 13px;
  font-weight: 700;
  margin-top: 12px;
}

.spinner-blue {
  width: 14px;
  height: 14px;
  border: 2px solid #bfdbfe;
  border-top-color: #1d4ed8;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

/* Result Banner */
.result-banner {
  padding: 24px;
  background: #ecfdf5;
  border: 2px solid #a7f3d0;
  border-radius: 20px;
}

.result-header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 18px;
}

.result-icon {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: #10b981;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 900;
}

.result-header h3 {
  margin: 0 0 2px;
  color: #065f46;
  font-size: 18px;
}

.result-header p {
  margin: 0;
  color: #047857;
  font-size: 13px;
}

.result-details-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  background: white;
  padding: 16px;
  border-radius: 14px;
  border: 1px solid #d1fae5;
}

.result-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.result-label {
  font-size: 10px;
  text-transform: uppercase;
  font-weight: 700;
  color: #64748b;
}

.result-val {
  font-size: 14px;
  font-weight: 800;
  color: #0f172a;
}

.res-hash-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.db-sync-notice {
  margin-top: 14px;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 700;
}

.db-sync-notice.success {
  background: #d1fae5;
  color: #065f46;
}

.db-sync-notice.warning {
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fde68a;
}

/* History Tables */
.history-panel,
.db-panel {
  padding: 24px;
}

.count-badge {
  padding: 4px 10px;
  border-radius: 999px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 800;
}

.count-badge.db {
  background: #ecfdf5;
  color: #047857;
}

.event-tag {
  padding: 2px 6px;
  border-radius: 4px;
  background: #f1f5f9;
  font-size: 11px;
  font-weight: 800;
  color: #475569;
}

.role-badge {
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
}

.role-badge.supplier {
  background: #dbeafe;
  color: #1e40af;
}

.role-badge.retailer {
  background: #dcfce7;
  color: #166534;
}

.role-pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 6px;
  background: #e0f2fe;
  color: #0369a1;
  font-size: 12px;
  font-weight: 800;
}

.refresh-btn {
  padding: 4px 10px;
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.refresh-btn:hover:not(:disabled) {
  background: #e2e8f0;
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 860px) {
  .actions-grid {
    grid-template-columns: 1fr;
  }
  .specs-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .result-details-grid {
    grid-template-columns: 1fr;
  }
  .current-holder-banner {
    flex-direction: column;
    align-items: flex-start;
  }
  .holder-meta-col {
    text-align: left;
  }
}

@media (max-width: 600px) {
  .specs-grid {
    grid-template-columns: 1fr;
  }
  .search-form {
    min-width: 100%;
    flex-direction: column;
  }
  .action-btn {
    width: 100%;
    justify-content: center;
  }
  .header-nav {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>

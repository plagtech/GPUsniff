/**
 * GPUSniff Popup — Main Controller
 */

import { GPU_DATABASE, RETAILERS, searchGPUs, fetchPrices, getTrendingDeals } from '../utils/api.js';

// ============================================================
// State
// ============================================================
let currentGPU = null;
let alerts = [];

// ============================================================
// DOM References
// ============================================================
const searchInput = document.getElementById('search-input');
const searchClear = document.getElementById('search-clear');
const searchResults = document.getElementById('search-results');
const dealsList = document.getElementById('deals-list');
const alertsList = document.getElementById('alerts-list');
const alertCount = document.getElementById('alert-count');
const compareContent = document.getElementById('compare-content');
const settingsBtn = document.getElementById('settings-btn');

// ============================================================
// Init
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  await loadAlerts();
  renderAlerts();
  setupTabNavigation();
  setupSearch();
  setupSettings();
  renderDeals(); // async — fetches live deals from backend
});

// ============================================================
// Tab Navigation
// ============================================================
function setupTabNavigation() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      tab.classList.add('active');
      const tabId = `tab-${tab.dataset.tab}`;
      document.getElementById(tabId).classList.add('active');
    });
  });
}

// ============================================================
// Search
// ============================================================
function setupSearch() {
  let debounceTimer;
  
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const query = searchInput.value.trim();
    
    searchClear.classList.toggle('hidden', !query);
    
    if (!query) {
      searchResults.classList.add('hidden');
      return;
    }
    
    debounceTimer = setTimeout(() => {
      const results = searchGPUs(query);
      renderSearchResults(results);
    }, 150);
  });
  
  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchClear.classList.add('hidden');
    searchResults.classList.add('hidden');
    searchInput.focus();
  });
  
  // Close search results when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) {
      searchResults.classList.add('hidden');
    }
  });
}

function renderSearchResults(results) {
  if (!results.length) {
    searchResults.innerHTML = `
      <div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 12px;">
        No GPUs found. Try "RTX 5070" or "RX 9070".
      </div>
    `;
    searchResults.classList.remove('hidden');
    return;
  }
  
  searchResults.innerHTML = results.map(gpu => `
    <div class="search-result-item" data-gpu-id="${gpu.id}">
      <div class="search-result-info">
        <span class="search-result-name">${gpu.brand} ${gpu.name}</span>
        <span class="search-result-brand">${gpu.tier.charAt(0).toUpperCase() + gpu.tier.slice(1)} tier</span>
      </div>
      <span class="search-result-msrp">MSRP $${gpu.msrp}</span>
    </div>
  `).join('');
  
  searchResults.classList.remove('hidden');
  
  // Click handlers
  searchResults.querySelectorAll('.search-result-item').forEach(item => {
    item.addEventListener('click', () => {
      const gpuId = item.dataset.gpuId;
      selectGPU(gpuId);
    });
  });
}

async function selectGPU(gpuId) {
  const gpu = GPU_DATABASE.find(g => g.id === gpuId);
  if (!gpu) return;
  
  currentGPU = gpu;
  searchInput.value = `${gpu.brand} ${gpu.name}`;
  searchResults.classList.add('hidden');
  searchClear.classList.remove('hidden');
  
  // Switch to compare tab
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector('[data-tab="compare"]').classList.add('active');
  document.getElementById('tab-compare').classList.add('active');
  
  // Show loading
  compareContent.innerHTML = '<div class="loading">Sniffing out prices</div>';
  
  // Fetch prices
  const prices = await fetchPrices(gpuId);
  renderComparison(gpu, prices);
}

// ============================================================
// Deals
// ============================================================
async function renderDeals() {
  dealsList.innerHTML = '<div class="loading">Sniffing out deals</div>';
  const deals = await getTrendingDeals();

  dealsList.innerHTML = deals.map(deal => {
    const retailer = RETAILERS[deal.retailer];
    const badgeClass = deal.badge.toLowerCase().replace(/\s+/g, '-');
    
    return `
      <div class="deal-card" data-gpu-id="${deal.gpu.id}">
        <div class="deal-card-header">
          <span class="deal-gpu-name">${deal.gpu.brand} ${deal.gpu.name}</span>
          <span class="deal-badge deal-badge-${badgeClass}">${deal.badge}</span>
        </div>
        <div class="deal-card-body">
          <div class="deal-retailer">
            <span>${retailer.logo}</span>
            <span>${retailer.name}</span>
          </div>
          <div class="deal-pricing">
            ${deal.originalPrice ? `<span class="deal-original-price">$${deal.originalPrice.toFixed(2)}</span>` : ''}
            <span class="deal-price">$${deal.price.toFixed(2)}</span>
            ${deal.savings ? `<span class="deal-savings">-$${deal.savings}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  // Click handlers on deal cards
  dealsList.querySelectorAll('.deal-card').forEach(card => {
    card.addEventListener('click', () => {
      selectGPU(card.dataset.gpuId);
    });
  });
}

// ============================================================
// Price Comparison
// ============================================================
function renderComparison(gpu, prices) {
  const bestPrice = prices.find(p => p.inStock)?.price || prices[0]?.price;
  
  compareContent.innerHTML = `
    <div class="gpu-header">
      <h3>${gpu.brand} ${gpu.name}</h3>
      <div class="msrp">MSRP: $${gpu.msrp} · Best found: $${bestPrice?.toFixed(2) || 'N/A'}</div>
    </div>
    <div class="price-table">
      ${prices.map((p, i) => `
        <div class="price-row ${i === 0 && p.inStock ? 'best-price' : ''}" 
             data-url="${p.url}" title="Open on ${p.retailerName}">
          <span class="price-row-rank">${i + 1}</span>
          <div class="price-row-retailer">
            <span>${p.retailerLogo}</span>
            <span>${p.retailerName}</span>
          </div>
          <span class="price-row-stock ${p.inStock ? 'stock-in' : 'stock-out'}">
            ${p.inStock ? 'In Stock' : 'OOS'}
          </span>
          ${p.shipping ? `<span class="price-row-shipping">${p.shipping}</span>` : ''}
          <span class="price-row-price">$${p.price.toFixed(2)}</span>
        </div>
      `).join('')}
    </div>
    <div class="compare-actions">
      <button class="btn btn-primary btn-full" id="set-alert-btn">
        🔔 Set Price Alert
      </button>
    </div>
  `;
  
  // Click to open retailer links
  compareContent.querySelectorAll('.price-row').forEach(row => {
    row.addEventListener('click', () => {
      const url = row.dataset.url;
      if (url && url !== '#') {
        chrome.tabs.create({ url });
      }
    });
  });
  
  // Set alert button
  document.getElementById('set-alert-btn')?.addEventListener('click', () => {
    showAlertModal(gpu, bestPrice);
  });
}

// ============================================================
// Alerts
// ============================================================
async function loadAlerts() {
  const data = await chrome.storage.local.get('priceAlerts');
  alerts = data.priceAlerts || [];
}

async function saveAlerts() {
  await chrome.storage.local.set({ priceAlerts: alerts });
  // Notify background to update alarms
  chrome.runtime.sendMessage({ type: 'ALERTS_UPDATED', alerts });
}

function renderAlerts() {
  alertCount.textContent = alerts.length;
  
  if (!alerts.length) {
    alertsList.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🔕</span>
        <p>No price alerts set.</p>
        <p class="empty-hint">Search for a GPU and click "Set Alert" to get notified when prices drop.</p>
      </div>
    `;
    return;
  }
  
  alertsList.innerHTML = alerts.map((alert, i) => `
    <div class="alert-card">
      <div class="alert-info">
        <span class="alert-gpu-name">${alert.brand} ${alert.name}</span>
        <span class="alert-target">Alert when below <span>$${alert.targetPrice.toFixed(2)}</span></span>
      </div>
      <button class="alert-remove" data-index="${i}" title="Remove alert">✕</button>
    </div>
  `).join('');
  
  // Remove handlers
  alertsList.querySelectorAll('.alert-remove').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index);
      alerts.splice(idx, 1);
      await saveAlerts();
      renderAlerts();
    });
  });
}

function showAlertModal(gpu, currentBestPrice) {
  // Remove any existing modal
  document.querySelector('.modal-overlay')?.remove();
  
  const suggestedTarget = Math.floor(currentBestPrice * 0.9); // suggest 10% below current
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <h3>🔔 Price Alert</h3>
      <p class="modal-subtitle">${gpu.brand} ${gpu.name} · Current best: $${currentBestPrice?.toFixed(2) || 'N/A'}</p>
      <div class="modal-field">
        <label for="target-price">Notify me when price drops below:</label>
        <input type="number" id="target-price" value="${suggestedTarget}" min="50" max="5000" step="10">
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
        <button class="btn btn-primary" id="modal-save">Set Alert</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  document.getElementById('target-price').focus();
  
  document.getElementById('modal-cancel').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
  
  document.getElementById('modal-save').addEventListener('click', async () => {
    const targetPrice = parseFloat(document.getElementById('target-price').value);
    if (isNaN(targetPrice) || targetPrice < 1) return;
    
    // Check for duplicate
    const exists = alerts.find(a => a.gpuId === gpu.id);
    if (exists) {
      exists.targetPrice = targetPrice;
    } else {
      alerts.push({
        gpuId: gpu.id,
        brand: gpu.brand,
        name: gpu.name,
        targetPrice: targetPrice,
        createdAt: new Date().toISOString(),
      });
    }
    
    await saveAlerts();
    renderAlerts();
    modal.remove();
    
    // Switch to alerts tab
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector('[data-tab="alerts"]').classList.add('active');
    document.getElementById('tab-alerts').classList.add('active');
  });
}

// ============================================================
// Settings
// ============================================================
function setupSettings() {
  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
}

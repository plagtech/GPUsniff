/**
 * GPUSniff Background Service Worker
 * 
 * Handles:
 * - Periodic price checking via alarms
 * - Browser notifications for price drops
 * - Message passing between popup/content scripts
 */

import { fetchPrices, GPU_DATABASE, identifyGPU } from '../utils/api.js';

// ============================================================
// Alarm Setup — check prices every 2 hours
// ============================================================
const PRICE_CHECK_ALARM = 'gpusniff-price-check';
const CHECK_INTERVAL_MINUTES = 120; // 2 hours

chrome.runtime.onInstalled.addListener(() => {
  console.log('[GPUSniff] Extension installed');
  
  // Set up periodic price checking
  chrome.alarms.create(PRICE_CHECK_ALARM, {
    delayInMinutes: 1, // first check 1 min after install
    periodInMinutes: CHECK_INTERVAL_MINUTES,
  });
  
  // Initialize storage
  chrome.storage.local.get('priceAlerts', (data) => {
    if (!data.priceAlerts) {
      chrome.storage.local.set({ priceAlerts: [] });
    }
  });
  
  chrome.storage.local.get('settings', (data) => {
    if (!data.settings) {
      chrome.storage.local.set({
        settings: {
          notifications: true,
          checkInterval: CHECK_INTERVAL_MINUTES,
          theme: 'dark',
        }
      });
    }
  });
});

// ============================================================
// Alarm Handler — periodic price checks
// ============================================================
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== PRICE_CHECK_ALARM) return;
  
  console.log('[GPUSniff] Running price check...');
  
  const data = await chrome.storage.local.get(['priceAlerts', 'settings']);
  const alerts = data.priceAlerts || [];
  const settings = data.settings || {};
  
  if (!alerts.length) {
    console.log('[GPUSniff] No alerts set, skipping check');
    return;
  }
  
  for (const alert of alerts) {
    try {
      const prices = await fetchPrices(alert.gpuId);
      const bestInStock = prices.find(p => p.inStock);
      
      if (bestInStock && bestInStock.price <= alert.targetPrice) {
        // Price dropped below target!
        console.log(`[GPUSniff] Price alert triggered: ${alert.name} at $${bestInStock.price}`);
        
        if (settings.notifications !== false) {
          chrome.notifications.create(`price-alert-${alert.gpuId}-${Date.now()}`, {
            type: 'basic',
            iconUrl: '../icons/icon128.png',
            title: `🐕‍🦺 GPUSniff Price Alert!`,
            message: `${alert.brand} ${alert.name} dropped to $${bestInStock.price.toFixed(2)} at ${bestInStock.retailerName}! (Target: $${alert.targetPrice.toFixed(2)})`,
            priority: 2,
            buttons: [
              { title: 'View Deal' },
            ],
          });
          
          // Store the notification data for click handling
          await chrome.storage.local.set({
            [`lastAlert_${alert.gpuId}`]: {
              url: bestInStock.url,
              price: bestInStock.price,
              retailer: bestInStock.retailerName,
              timestamp: Date.now(),
            }
          });
        }
      }
    } catch (err) {
      console.error(`[GPUSniff] Error checking price for ${alert.name}:`, err);
    }
  }
});

// ============================================================
// Notification Click Handler
// ============================================================
chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (!notificationId.startsWith('price-alert-')) return;
  
  // Extract GPU ID from notification ID
  const parts = notificationId.replace('price-alert-', '').split('-');
  const gpuId = parts.slice(0, -1).join('-'); // everything except timestamp
  
  const data = await chrome.storage.local.get(`lastAlert_${gpuId}`);
  const alertData = data[`lastAlert_${gpuId}`];
  
  if (alertData?.url) {
    chrome.tabs.create({ url: alertData.url });
  }
});

// ============================================================
// Message Handler (from popup and content scripts)
// ============================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'ALERTS_UPDATED':
      // Alerts were updated from popup, refresh alarm
      console.log('[GPUSniff] Alerts updated:', message.alerts?.length, 'active');
      break;
      
    case 'GET_PRICES':
      // Content script requesting prices for detected GPU
      fetchPrices(message.gpuId).then(prices => {
        sendResponse({ prices });
      });
      return true; // keep channel open for async response
      
    case 'IDENTIFY_GPU':
      // Content script sending product title for identification
      const gpu = identifyGPU(message.text);
      sendResponse({ gpu });
      break;
      
    case 'GET_GPU_DATABASE':
      sendResponse({ gpus: GPU_DATABASE });
      break;
  }
});

// ============================================================
// Context Menu (right-click on page)
// ============================================================
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'gpusniff-search',
    title: 'Search GPUSniff for "%s"',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'gpusniff-search' && info.selectionText) {
    // Open popup with search query
    // Since we can't programmatically open the popup, we'll open the website
    const query = encodeURIComponent(info.selectionText);
    chrome.tabs.create({ url: `https://gpusniff.com/search?q=${query}` });
  }
});

/**
 * GPUSniff Content Script
 * 
 * Runs on supported retailer product pages.
 * Detects GPU products from page title/content and shows
 * a floating price comparison widget.
 */

(function() {
  'use strict';
  
  // Prevent double injection
  if (window.__gpusniff_loaded) return;
  window.__gpusniff_loaded = true;
  
  // ============================================================
  // Retailer-specific product detection
  // ============================================================
  
  const DETECTORS = {
    'bestbuy.com': {
      getTitle: () => document.querySelector('.sku-title h1, .heading-5')?.textContent,
      getPrice: () => {
        const el = document.querySelector('[data-testid="customer-price"] span, .priceView-customer-price span');
        return el ? parseFloat(el.textContent.replace(/[^0-9.]/g, '')) : null;
      },
      getImage: () => document.querySelector('.primary-image img, .shop-media-gallery img')?.src,
    },
    'newegg.com': {
      getTitle: () => document.querySelector('.product-title, h1.product-title')?.textContent,
      getPrice: () => {
        const el = document.querySelector('.price-current strong, li.price-current');
        if (!el) return null;
        const text = el.textContent.replace(/[^0-9.]/g, '');
        return parseFloat(text) || null;
      },
      getImage: () => document.querySelector('.swiper-slide img, .product-view-img-original')?.src,
    },
    'amazon.com': {
      getTitle: () => document.getElementById('productTitle')?.textContent?.trim(),
      getPrice: () => {
        const whole = document.querySelector('.a-price-whole')?.textContent?.replace(/[^0-9]/g, '');
        const fraction = document.querySelector('.a-price-fraction')?.textContent || '00';
        return whole ? parseFloat(`${whole}.${fraction}`) : null;
      },
      getImage: () => document.getElementById('landingImage')?.src,
    },
    'bhphotovideo.com': {
      getTitle: () => document.querySelector('[data-selenium="productTitle"] h1, h1[data-selenium="productTitle"]')?.textContent,
      getPrice: () => {
        const el = document.querySelector('[data-selenium="pricingPrice"]');
        return el ? parseFloat(el.textContent.replace(/[^0-9.]/g, '')) : null;
      },
      getImage: () => document.querySelector('.hero-image img, [data-selenium="mainImage"] img')?.src,
    },
    'microcenter.com': {
      getTitle: () => document.querySelector('#product-top h1, .summary h1 span')?.textContent,
      getPrice: () => {
        const el = document.querySelector('#pricing, .summary .price span');
        return el ? parseFloat(el.textContent.replace(/[^0-9.]/g, '')) : null;
      },
      getImage: () => document.querySelector('#defined-images img, .product-image img')?.src,
    },
    'walmart.com': {
      getTitle: () => document.querySelector('[itemprop="name"], h1#main-title')?.textContent,
      getPrice: () => {
        const el = document.querySelector('[itemprop="price"], span[data-testid="price-wrap"]');
        return el ? parseFloat(el.textContent.replace(/[^0-9.]/g, '')) : null;
      },
      getImage: () => document.querySelector('[data-testid="hero-image"] img')?.src,
    },
    'ebay.com': {
      getTitle: () => document.querySelector('.x-item-title__mainTitle span, h1.it-ttl')?.textContent,
      getPrice: () => {
        const el = document.querySelector('.x-price-primary span, #prcIsum');
        return el ? parseFloat(el.textContent.replace(/[^0-9.]/g, '')) : null;
      },
      getImage: () => document.querySelector('.ux-image-carousel-item img, #icImg')?.src,
    },
  };
  
  // ============================================================
  // Detect current retailer and product
  // ============================================================
  
  function getCurrentRetailer() {
    const hostname = window.location.hostname.replace('www.', '');
    for (const [domain, detector] of Object.entries(DETECTORS)) {
      if (hostname.includes(domain)) {
        return { domain, detector };
      }
    }
    return null;
  }
  
  function detectProduct() {
    const retailer = getCurrentRetailer();
    if (!retailer) return null;
    
    const title = retailer.detector.getTitle();
    if (!title) return null;
    
    return {
      title: title.trim(),
      price: retailer.detector.getPrice(),
      image: retailer.detector.getImage?.() || null,
      domain: retailer.domain,
    };
  }
  
  // ============================================================
  // Widget UI
  // ============================================================
  
  function createWidget(gpu, product, prices) {
    // Remove existing widget
    document.getElementById('gpusniff-widget')?.remove();
    
    const bestPrice = prices.find(p => p.inStock);
    const currentRetailerPrice = product.price;
    const savingsAvailable = bestPrice && currentRetailerPrice && bestPrice.price < currentRetailerPrice;
    
    const widget = document.createElement('div');
    widget.id = 'gpusniff-widget';
    widget.innerHTML = `
      <div class="gpusniff-widget-inner">
        <div class="gpusniff-header">
          <div class="gpusniff-brand">
            <span class="gpusniff-icon">🐕‍🦺</span>
            <span class="gpusniff-title">GPU<span class="gpusniff-accent">Sniff</span></span>
          </div>
          <button class="gpusniff-close" id="gpusniff-close">✕</button>
        </div>
        
        <div class="gpusniff-detected">
          <span class="gpusniff-gpu-name">${gpu.brand} ${gpu.name}</span>
          ${savingsAvailable ? `
            <div class="gpusniff-savings-banner">
              💰 Save $${(currentRetailerPrice - bestPrice.price).toFixed(2)} at ${bestPrice.retailerName}!
            </div>
          ` : ''}
        </div>
        
        <div class="gpusniff-prices">
          ${prices.slice(0, 5).map((p, i) => `
            <a href="${p.url}" class="gpusniff-price-row ${i === 0 && p.inStock ? 'gpusniff-best' : ''}" 
               target="_blank" rel="noopener">
              <span class="gpusniff-retailer">${p.retailerLogo} ${p.retailerName}</span>
              <span class="gpusniff-stock ${p.inStock ? 'gpusniff-in-stock' : 'gpusniff-oos'}">
                ${p.inStock ? '✓' : '✕'}
              </span>
              <span class="gpusniff-price ${i === 0 && p.inStock ? 'gpusniff-price-best' : ''}">
                $${p.price.toFixed(2)}
              </span>
            </a>
          `).join('')}
        </div>
        
        <div class="gpusniff-actions">
          <button class="gpusniff-btn gpusniff-btn-alert" id="gpusniff-set-alert">
            🔔 Set Price Alert
          </button>
          <button class="gpusniff-btn gpusniff-btn-expand" id="gpusniff-expand">
            See All Prices
          </button>
        </div>
        
        <div class="gpusniff-footer">
          Prices updated just now · <a href="https://gpusniff.com" target="_blank" rel="noopener">gpusniff.com</a>
        </div>
      </div>
    `;
    
    document.body.appendChild(widget);
    
    // Event listeners
    document.getElementById('gpusniff-close').addEventListener('click', () => {
      widget.classList.add('gpusniff-hiding');
      setTimeout(() => widget.remove(), 200);
    });
    
    document.getElementById('gpusniff-set-alert').addEventListener('click', () => {
      // Send to background/popup to handle alert creation
      chrome.runtime.sendMessage({
        type: 'GET_PRICES',
        gpuId: gpu.id,
      });
      // For now, show quick feedback
      const btn = document.getElementById('gpusniff-set-alert');
      btn.textContent = '✓ Open extension to set target price';
      btn.disabled = true;
    });
    
    document.getElementById('gpusniff-expand').addEventListener('click', () => {
      // Open gpusniff.com with this GPU
      window.open(`https://gpusniff.com/gpu/${gpu.id}`, '_blank');
    });
    
    // Animate in
    requestAnimationFrame(() => {
      widget.classList.add('gpusniff-visible');
    });
  }
  
  // ============================================================
  // Initialize
  // ============================================================
  
  async function init() {
    // Wait a moment for page to fully render
    await new Promise(r => setTimeout(r, 1500));
    
    const product = detectProduct();
    if (!product) {
      console.log('[GPUSniff] No product detected on this page');
      return;
    }
    
    console.log('[GPUSniff] Product detected:', product.title);
    
    // Send to background for GPU identification
    chrome.runtime.sendMessage(
      { type: 'IDENTIFY_GPU', text: product.title },
      async (response) => {
        if (!response?.gpu) {
          console.log('[GPUSniff] Product is not a recognized GPU');
          return;
        }
        
        console.log('[GPUSniff] GPU identified:', response.gpu.brand, response.gpu.name);
        
        // Fetch comparison prices
        chrome.runtime.sendMessage(
          { type: 'GET_PRICES', gpuId: response.gpu.id },
          (priceResponse) => {
            if (priceResponse?.prices) {
              createWidget(response.gpu, product, priceResponse.prices);
            }
          }
        );
      }
    );
  }
  
  // Run on page load
  if (document.readyState === 'complete') {
    init();
  } else {
    window.addEventListener('load', init);
  }
  
  // Also re-check on SPA navigation (for Amazon, Walmart etc.)
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(init, 2000);
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
  
})();

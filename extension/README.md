# 🐕‍🦺 GPUSniff — Chrome Extension

Sniff out the best GPU & gaming hardware deals across retailers.
Price comparison, alerts, and deal tracking — all from your browser.

## Quick Start (Load Unpacked)

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select this `gpusniff-extension` folder
5. Pin the extension — click the puzzle icon in toolbar, pin GPUSniff

## What It Does

### Popup (click the extension icon)
- **Search** any GPU model (RTX 5070, RX 9070 XT, Arc B580, etc.)
- **Trending Deals** tab shows current best prices
- **Price Comparison** across 7 retailers: Best Buy, Newegg, Amazon, B&H Photo, Micro Center, Walmart, eBay
- **Price Alerts** — set a target price and get browser notifications when it drops

### Content Script (automatic on product pages)
- Detects GPU products when you browse retailer sites
- Shows a floating widget with price comparisons from other stores
- Highlights savings if the GPU is cheaper elsewhere
- One-click alert setting

### Background Worker
- Periodic price checking (configurable: 1hr to daily)
- Browser notifications when price targets are hit
- Click notification → opens the deal

## Architecture

```
gpusniff-extension/
├── manifest.json          # Manifest V3 config
├── popup/
│   ├── popup.html         # Extension popup UI
│   ├── popup.css          # Dark theme styles
│   └── popup.js           # Search, deals, alerts, comparison
├── content/
│   ├── content.js         # Product detection on retailer sites
│   └── content.css        # Floating widget styles
├── background/
│   └── background.js      # Service worker: alarms, notifications
├── utils/
│   └── api.js             # API layer (mock → real swap point)
├── options/
│   └── options.html       # Settings page
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Current State: Mock Data

The extension runs with mock price data so you can see the full UX flow.
The API layer (`utils/api.js`) is structured with clear swap points for
plugging in real affiliate APIs.

## Next Steps: Wiring Real APIs

### Phase 1 — Backend API Server
Build a Next.js/Express backend at `api.gpusniff.com` that:
- Aggregates prices from affiliate APIs server-side (keeps keys secret)
- Caches results (avoid rate limits, faster responses)
- Stores price history for charts
- Manages user alert preferences

### Phase 2 — Affiliate Network Integration
1. **CJ Affiliate** → Best Buy, B&H Photo product feeds
2. **Impact Radius** → Walmart, Target product data
3. **eBay Partner Network** → eBay Browse API
4. **Partnerize** → Newegg product catalog
5. **Amazon PA-API 5.0** (optional) → Amazon product data

### Phase 3 — Chrome Web Store Submission
1. Replace mock data with live backend
2. Add proper privacy policy at gpusniff.com/privacy
3. Create promotional images (1280×800, 440×280)
4. Submit to Chrome Web Store ($5 developer fee)

### Phase 4 — Growth Features
- Price history charts (7/30/90 day)
- PC build compatibility checking
- Community deal submissions
- Crypto cashback integration (Spraay 💧)
- Firefox/Edge extension ports

## Supported Retailers

| Retailer     | Detection | Affiliate Network |
|-------------|-----------|-------------------|
| Best Buy     | ✅        | CJ Affiliate      |
| Newegg       | ✅        | Partnerize        |
| Amazon       | ✅        | PA-API 5.0        |
| B&H Photo    | ✅        | CJ Affiliate      |
| Micro Center | ✅        | ShareASale        |
| Walmart      | ✅        | Impact Radius     |
| eBay         | ✅        | eBay Partner Net  |

## GPU Database

Covers NVIDIA RTX 50/40 series, AMD RX 9000/7000 series, and Intel Arc.
Expandable — add entries to `GPU_DATABASE` in `utils/api.js`.

---

**GPUSniff** · [gpusniff.com](https://gpusniff.com) · Built by LP

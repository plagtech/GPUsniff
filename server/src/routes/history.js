import { Router } from 'express';
import { getHistory } from '../supabase.js';
import { getGpuById } from '../gpuDatabase.js';

export const historyRouter = Router();

// GET /api/history/:gpuId?days=30
// Returns raw snapshots plus a per-day best-price series ready for charting.
historyRouter.get('/:gpuId', async (req, res, next) => {
  try {
    const gpu = getGpuById(req.params.gpuId);
    if (!gpu) return res.status(404).json({ error: 'Unknown GPU id' });

    const days = clampDays(req.query.days);
    const snapshots = await getHistory(req.params.gpuId, days);

    res.set('Cache-Control', 'public, max-age=300');
    res.json({
      gpuId: req.params.gpuId,
      days,
      series: bestPricePerDay(snapshots),
      snapshots,
    });
  } catch (err) {
    next(err);
  }
});

function clampDays(raw) {
  const n = Number(raw) || 30;
  return Math.min(Math.max(n, 1), 365);
}

// Collapse snapshots to one lowest-in-stock price per calendar day.
function bestPricePerDay(snapshots) {
  const byDay = new Map();
  for (const s of snapshots) {
    const day = s.captured_at.slice(0, 10); // YYYY-MM-DD
    const price = Number(s.price);
    if (!Number.isFinite(price)) continue;
    const current = byDay.get(day);
    if (!current || price < current.price) {
      byDay.set(day, { date: day, price, retailer: s.retailer });
    }
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

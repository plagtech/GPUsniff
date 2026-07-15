import { Router } from 'express';
import { getPrices } from '../aggregator.js';

export const pricesRouter = Router();

// GET /api/prices/:gpuId
// Returns the sorted, display-ready price array (mirrors the shape the
// extension's mock fetchPrices() used, so the UI is unchanged).
pricesRouter.get('/:gpuId', async (req, res, next) => {
  try {
    const result = await getPrices(req.params.gpuId);
    // The extension consumes the array directly; keep that contract.
    res.set('Cache-Control', 'public, max-age=60');
    res.json(result.prices);
  } catch (err) {
    next(err);
  }
});

import { Router } from 'express';
import { addToWaitlist } from '../supabase.js';

export const waitlistRouter = Router();

// Simple, permissive email shape check — real validation is delivery.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/waitlist  { email }
waitlistRouter.post('/', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) {
      return res.status(400).json({ ok: false, error: 'Please enter a valid email address.' });
    }

    await addToWaitlist(email, {
      source: String(req.body?.source || 'landing').slice(0, 40),
      userAgent: req.get('user-agent')?.slice(0, 300),
      referrer: req.get('referer')?.slice(0, 300),
    });

    res.json({ ok: true, message: "You're on the list!" });
  } catch (err) {
    next(err);
  }
});

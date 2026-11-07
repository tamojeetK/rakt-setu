// Shared helpers for the Vercel API functions.
// Files starting with "_" are not exposed as routes by Vercel.
import { createHash } from 'node:crypto';

const URL_ = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Error codes raised by the database that are safe to show to users.
const USER_ERRORS = {
  RATE_LIMIT: 429, ALREADY_REGISTERED: 409, NOT_FOUND: 404, UNAVAILABLE: 409,
  BAD_TOKEN: 404, BAD_PHONE: 400, BAD_PINCODE: 400, BAD_INPUT: 400, BAD_DATE: 400,
  NO_CONSENT: 400, NOT_ELIGIBLE: 400, AGE: 400, WEIGHT: 400, NEED_HOSPITAL: 400,
};

export class ApiError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}

// Call a Postgres function through Supabase's REST API.
export async function rpc(fn, args) {
  if (!URL_ || !KEY) throw new ApiError('SERVER_NOT_CONFIGURED', 500);
  const headers = { 'content-type': 'application/json', apikey: KEY };
  // Legacy service_role keys are JWTs and also go in Authorization.
  // New "sb_secret_..." keys must only be sent as apikey.
  if (KEY.startsWith('eyJ')) headers.authorization = `Bearer ${KEY}`;
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers, body: JSON.stringify(args),
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) {
    const code = data && data.message;
    if (code in USER_ERRORS) throw new ApiError(code, USER_ERRORS[code]);
    console.error('rpc', fn, r.status, text);
    throw new ApiError('SERVER_ERROR', 500);
  }
  return data;
}

// We never store raw IP addresses, only a salted hash, for rate limiting.
export function ipHash(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = fwd || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
  return createHash('sha256').update((process.env.IP_SALT || 'change-me') + ip).digest('hex').slice(0, 32);
}

export function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

export function handler(methods, fn) {
  return async (req, res) => {
    res.setHeader('cache-control', 'no-store');
    if (!methods.includes(req.method)) {
      res.setHeader('allow', methods.join(', '));
      return res.status(405).json({ error: 'METHOD' });
    }
    try {
      const out = await fn(req, res);
      if (!res.headersSent) res.status(200).json(out ?? {});
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 500;
      if (!(e instanceof ApiError)) console.error(e);
      res.status(status).json({ error: e instanceof ApiError ? e.code : 'SERVER_ERROR' });
    }
  };
}

export const GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
export const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

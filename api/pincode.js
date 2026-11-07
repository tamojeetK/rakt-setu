import { handler, rpc, str, ApiError } from './_lib.js';

// GET /api/pincode?p=721301  → { district, state } or { found:false }
export default handler(['GET'], async (req, res) => {
  const p = str(req.query.p, 6);
  if (!/^[1-9][0-9]{5}$/.test(p)) throw new ApiError('BAD_PINCODE', 400);
  const rows = await rpc('lookup_pincode', { p_pincode: p });
  res.setHeader('cache-control', 'public, max-age=86400');
  res.status(200).json(rows[0] ? { found: true, ...rows[0] } : { found: false });
});

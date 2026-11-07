import { handler, rpc, body, ipHash, str, ApiError } from './_lib.js';

// POST /api/register
export default handler(['POST'], async (req) => {
  const b = body(req);
  if (b.website) throw new ApiError('BAD_INPUT', 400); // honeypot: bots fill hidden fields
  const p = {
    name: str(b.name, 60), phone: str(b.phone, 20), blood_group: str(b.blood_group, 3),
    sex: str(b.sex, 1), birth_year: parseInt(b.birth_year, 10) || null,
    weight_kg: parseInt(b.weight_kg, 10) || null, pincode: str(b.pincode, 6),
    district: str(b.district, 60), locality: str(b.locality, 80),
    lang: ['en', 'hi', 'bn'].includes(b.lang) ? b.lang : 'en',
    last_donated_on: /^\d{4}-\d{2}-\d{2}$/.test(b.last_donated_on || '') ? b.last_donated_on : null,
    consent: b.consent === true, healthy: b.healthy === true,
  };
  const rows = await rpc('register_donor', { p, p_ip_hash: ipHash(req) });
  return { token: rows[0].manage_token, next_eligible: rows[0].next_eligible };
});

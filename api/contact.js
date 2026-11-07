import { handler, rpc, body, ipHash, str, GROUPS, ApiError } from './_lib.js';
import { waMessage } from './_messages.js';

// POST /api/contact  { donor_id, hospital, units?, from?, group }
// The only endpoint that ever returns a phone number — rate-limited & logged in the DB.
export default handler(['POST'], async (req) => {
  const b = body(req);
  if (b.website) throw new ApiError('BAD_INPUT', 400);
  const id = str(b.donor_id, 36);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError('BAD_INPUT', 400);
  const hospital = str(b.hospital, 80);
  const units = /^[1-9][0-9]?$/.test(String(b.units || '')) ? String(b.units) : '';
  const group = GROUPS.includes(b.group) ? b.group : '';
  const from = str(b.from, 40);

  const rows = await rpc('request_contact', {
    p_donor: id, p_ip_hash: ipHash(req), p: { hospital, units, group },
  });
  const d = rows[0];
  const text = waMessage(d.lang, {
    name: d.first_name, site: process.env.APP_NAME || 'Rakt Setu',
    hospital, group: group || d.blood_group, units, from,
  });
  return {
    whatsapp: `https://wa.me/91${d.phone}?text=${encodeURIComponent(text)}`,
    call: `tel:+91${d.phone}`,
  };
});

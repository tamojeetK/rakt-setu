import { handler, rpc, str, GROUPS, ApiError } from './_lib.js';

// GET /api/search?place=721301&group=A%2B
export default handler(['GET'], async (req) => {
  const place = str(req.query.place, 60);
  const group = str(req.query.group, 3);
  if (!GROUPS.includes(group) || place.length < 3) throw new ApiError('BAD_INPUT', 400);
  const donors = await rpc('search_donors', { p_place: place, p_group: group, p_limit: 30 });
  return { donors };
});

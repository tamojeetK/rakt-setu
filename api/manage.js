import { handler, rpc, body, str, ApiError } from './_lib.js';

const ACTIONS = ['get', 'pause', 'resume', 'donated', 'confirm', 'delete'];

// POST /api/manage { token, action, date? }  (donor's private link)
export default handler(['POST'], async (req) => {
  const b = body(req);
  const action = str(b.action, 10);
  if (!ACTIONS.includes(action)) throw new ApiError('BAD_INPUT', 400);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : null;
  const rows = await rpc('manage_donor', { p_token: str(b.token, 64), p_action: action, p_date: date });
  return rows[0];
});

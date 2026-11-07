// Netlify scheduled function: once a day, keeps the free Supabase project
// awake and deletes request logs older than 30 days.
import { rpc } from '../../api/_lib.js';
export default async () => {
  try { const purged = await rpc('daily_maintenance', {}); console.log('keepalive ok, purged', purged); }
  catch (e) { console.error('keepalive failed', e); }
  return new Response('ok');
};
export const config = { schedule: '@daily' };

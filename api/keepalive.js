import { rpc } from './_lib.js';

// Called daily by Vercel Cron (see vercel.json). Keeps the free Supabase
// project from pausing and deletes request logs older than 30 days.
export default async function keepalive(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }
  try {
    const purged = await rpc('daily_maintenance', {});
    res.status(200).json({ ok: true, purged });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false });
  }
}

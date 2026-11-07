// Runs the Vercel-style handlers in api/ on Netlify Functions,
// so the same code works on both hosts.
export function adapt(handler) {
  return async (request, context) => {
    const url = new URL(request.url);
    const headers = Object.fromEntries(request.headers);
    const ip = context?.ip || headers['x-nf-client-connection-ip'];
    if (ip) headers['x-forwarded-for'] = ip;
    let body = {};
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const text = await request.text();
      try { body = text ? JSON.parse(text) : {}; } catch { body = text; }
    }
    const req = { method: request.method, headers, query: Object.fromEntries(url.searchParams), body, socket: {} };

    let status = 200; const outHeaders = new Headers(); let payload = '';
    let finish; const done = new Promise((r) => { finish = r; });
    const res = {
      headersSent: false,
      setHeader(k, v) { outHeaders.set(k, String(v)); return res; },
      getHeader(k) { return outHeaders.get(k); },
      status(c) { status = c; return res; },
      json(o) {
        if (!outHeaders.has('content-type')) outHeaders.set('content-type', 'application/json');
        payload = JSON.stringify(o); res.headersSent = true; finish(); return res;
      },
      end(s) { payload = s ?? ''; res.headersSent = true; finish(); return res; },
    };
    await Promise.race([Promise.resolve(handler(req, res)).then(() => done), done]);
    return new Response(payload, { status, headers: outHeaders });
  };
}

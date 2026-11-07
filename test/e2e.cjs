const { chromium, devices } = require('playwright');
const S = process.argv[2], B = 'http://localhost:3000';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 5'] });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 300, downloadThroughput: 750 * 1024 / 8, uploadThroughput: 250 * 1024 / 8 }); // "Slow 3G"-ish
  let bytes = 0; p.on('response', async r => { try { bytes += (await r.body()).length; } catch {} });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));

  let t0 = Date.now(); await p.goto(B + '/'); console.log('home load ms', Date.now() - t0, 'bytes', bytes);
  await p.click('[data-lang=hi]'); await p.screenshot({ path: S + '/s1-home-hi.png' });

  // register in Hindi
  bytes = 0; await p.click('a[href="/register"]'); await p.waitForSelector('#reg');
  console.log('register page bytes', bytes);
  await p.fill('#name', 'Sunita Kumari'); await p.fill('#phone', '+91 99887 76655');
  await p.selectOption('#blood_group', 'A+'); await p.check('input[name=sex][value=F]');
  await p.fill('#birth_year', '1996'); await p.fill('#weight_kg', '50'); await p.fill('#pincode', '721301');
  await p.waitForFunction(() => document.querySelector('#pinInfo').textContent.includes('Medinipur'));
  await p.click('button.btn'); // submit without checks
  console.log('validation msg:', await p.textContent('#regErr'));
  for (const c of await p.$$('.hq')) if (await c.isVisible()) await c.check();
  await p.check('#consent'); await p.screenshot({ path: S + '/s2-reg-hi.png', fullPage: true });
  await p.click('#reg button.btn');
  await p.waitForSelector('#doneView:not([hidden])');
  const link = await p.textContent('#link'); console.log('manage link', link);
  await p.screenshot({ path: S + '/s3-done.png' });

  // find in Bengali
  await p.goto(B + '/find'); await p.click('[data-lang=bn]');
  await p.fill('#place', '721301'); await p.selectOption('#group', 'A+'); await p.click('#search button');
  await p.waitForSelector('.donor');
  console.log('results:', await p.$$eval('.donor', ds => ds.map(d => d.innerText.replace(/\n/g, ' | '))));
  await p.screenshot({ path: S + '/s4-find-bn.png', fullPage: true });
  await p.click('.donor button'); await p.click('#contactForm button[value=wa]');
  console.log('contact err:', await p.textContent('#contactErr'));
  await p.fill('#hospital', 'Kharagpur SDH'); await p.check('#genuine');
  await p.screenshot({ path: S + '/s5-contact.png' });
  const [req] = await Promise.all([p.waitForRequest(r => r.url().startsWith('https://wa.me/')), p.click('#contactForm button[value=wa]')]);
  console.log('navigated to', decodeURIComponent(req.url()).slice(0, 120));

  // manage page in English
  const p2 = await ctx.newPage(); await p2.goto(link); await p2.click('[data-lang=en]');
  await p2.waitForSelector('#meView:not([hidden])'); console.log('me status:', await p2.textContent('#meStatus'));
  await p2.click('[data-act=donated]'); await p2.waitForFunction(() => /Resting/.test(document.querySelector('#meStatus').textContent));
  console.log('after donated:', await p2.textContent('#meStatus'));
  await p2.screenshot({ path: S + '/s6-me.png' });
  p2.on('dialog', d => d.accept()); await p2.click('[data-act=delete]');
  await p2.waitForFunction(() => /deleted/.test(document.querySelector('#meErr').textContent)); console.log('deleted ok');
  // layout check at 360px
  const p3 = await b.newPage({ viewport: { width: 360, height: 700 } });
  for (const u of ['/', '/find', '/register', '/privacy']) { await p3.goto(B + u); const w = await p3.evaluate(() => document.documentElement.scrollWidth); if (w > 360) console.log('OVERFLOW', u, w); }
  console.log('errors:', errs);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });

const { chromium } = require('playwright');
const fs = require('fs');
const script = fs.readFileSync(process.argv[2], 'utf8');
const characters = Array.from({ length: 50 }, (_, i) => ({ id: i, name: `Perso ${i}`, rarity: 'R', series: 'S', image: '' }));
const day = 864e5; const now = Date.now();
// 12 pages of sales (50 each) going back 2 days per page -> pages 1-6 cover ~12 days... make page n items at now - n*5 days
const pageItems = (kind, n) => Array.from({ length: 50 }, (_, i) => ({ id: `${kind}-${n}-${i}`, type: 'fixed', status: 'sold', isMine: true, price: 100, finalPrice: 120, createdAt: new Date(now - n * 5 * day - i * 1000).toISOString(), endsAt: new Date(now - n * 5 * day).toISOString(), character: { id: i % 50, name: `Perso ${i % 50}` }, seller: { id: 'me' } }));
const PAGES = 3;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = []; const calls = []; const t0 = Date.now();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://kyara.games/**', async (route) => {
    const url = new URL(route.request().url()); const p = url.pathname;
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'x-kyara-rush': '1' }, body: JSON.stringify(body) });
    if (p.startsWith('/api/')) {
      calls.push([Date.now() - t0, p + url.search.slice(0, 40)]);
      await new Promise((r) => setTimeout(r, 120));
      if (p === '/api/characters') return json(characters);
      if (p === '/api/me/bootstrap') return json({ me: { id: 'me', chakraHeld: 0 }, wishlist: [] });
      if (p === '/api/me/collection') return json([]);
      if (p === '/api/me/market') return json({ listings: [], bids: [], buyOrders: [], holds: [] });
      if (p === '/api/me/trades') return json({ incoming: [], outgoing: [] });
      if (p === '/api/trades/offers/mine') return json([]);
      if (p === '/api/me/notifications') return json({ items: [] });
      if (p === '/api/me/collection/prices') return json([]);
      if (p === '/api/fair-play/prices') return json({});
      if (p === '/api/me/market/history') { const kind = url.searchParams.get('kind'); const n = Number(url.searchParams.get('page') || 1); if (kind === 'echanges') return json({ trades: [], offers: [], more: false }); return json({ items: n <= PAGES ? pageItems(kind, n) : [], more: n < PAGES }); }
      return json({});
    }
    if (p === '/marche') return route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><html><body><header class="hdr"><nav class="nav"><a class="navlink" href="/marche">Marché</a></nav></header><main><div class="wrap"><div class="layout"><div role="tablist"><button role="tab" class="on">Mon activité</button></div><div role="tabpanel"></div><section class="board"></section><aside class="chat-side"></aside></div></div></main></body></html>` });
    return route.fulfill({ status: 404, body: '' });
  });
  await page.addInitScript(() => { localStorage.setItem('kyara_token', 'fake'); });
  await page.goto('https://kyara.games/marche?onglet=ventes');
  await page.evaluate(() => {
    window.__t = { start: performance.now(), ready: null, rows: null };
    new MutationObserver(() => {
      const body = document.querySelector('.kp-act__body');
      if (!body) return;
      if (window.__t.ready == null && !/Chargement de ton activité/.test(body.textContent)) window.__t.ready = performance.now() - window.__t.start;
      if (window.__t.rows == null && body.querySelector('.kp-act__row')) window.__t.rows = performance.now() - window.__t.start;
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  const tInject = Date.now();
  await page.addScriptTag({ content: script });
  await page.waitForFunction(() => window.__t.rows != null, null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(300);
  const t = await page.evaluate(() => window.__t);
  const api = calls.filter(([, u]) => !/collection\/prices|fair-play/.test(u)).map(([at, u]) => at + ' ' + u.replace('/api/', '').slice(0, 34));
  console.log(JSON.stringify({ readyMs: Math.round(t.ready), firstRowsMs: Math.round(t.rows), requests: api.slice(0, 14), errors }, null, 1));
  await browser.close();
})();

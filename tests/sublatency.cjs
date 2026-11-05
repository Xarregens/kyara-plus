// Measures click -> DOM update -> paint latency for the Échanges sub-category chips, with history loading and loaded.
const { chromium } = require('playwright');
const fs = require('fs');
const script = fs.readFileSync(process.argv[2], 'utf8');
const LATENCY = Number(process.argv[3] || 300); // simulated API latency per request (ms)
const PAGES = Number(process.argv[4] || 8);     // pages of trade history (more pages = longer loading)
const characters = Array.from({ length: 80 }, (_, i) => ({ id: i, name: `Perso ${i}`, rarity: 'R', series: 'S', image: `https://kyara.games/cards/sm/${i}.webp` }));
const day = 864e5; const now = Date.now(); const iso = (ms) => new Date(ms).toISOString();
const trade = (id, incoming, status, ageMs) => ({ id, status, createdAt: iso(now - ageMs), expiresAt: iso(now + day), from: incoming ? { id: 'u1', pseudo: 'Ami' } : { id: 'me', pseudo: 'moi' }, to: incoming ? { id: 'me', pseudo: 'moi' } : { id: 'u1', pseudo: 'Ami' }, give: { cards: [{ characterId: id.length % 80, qty: 1 }], chakra: 0 }, want: { cards: [{ characterId: (id.length * 7) % 80, qty: 1 }], chakra: 0 }, message: '', messages: [] });
const offer = (id, ageMs) => ({ id, status: 'accepted', createdAt: iso(now - ageMs - 36e5), expiresAt: iso(now + day), closedAt: iso(now - ageMs), user: { id: 'me', pseudo: 'moi' }, taker: { id: 'u2', pseudo: 'Preneur' }, characterId: 9, wantIds: [10, 11], takenWith: 10 });
const tradePage = (n) => ({ trades: Array.from({ length: 35 }, (_, i) => trade(`t${n}-${i}`, i % 2 === 0, i % 5 === 0 ? 'declined' : 'accepted', (n * 35 + i) * 3e5)), offers: Array.from({ length: 15 }, (_, i) => offer(`o${n}-${i}`, (n * 15 + i) * 6e5)), more: n < PAGES });
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://kyara.games/**', async (route) => {
    const url = new URL(route.request().url()); const p = url.pathname;
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'x-kyara-rush': '1' }, body: JSON.stringify(body) });
    if (p.startsWith('/api/')) {
      await new Promise((r) => setTimeout(r, LATENCY));
      if (p === '/api/characters') return json(characters);
      if (p === '/api/me/bootstrap') return json({ me: { id: 'me', chakraHeld: 0 }, wishlist: [] });
      if (p === '/api/me/collection') return json([]);
      if (p === '/api/me/market') return json({ listings: [], bids: [], buyOrders: [], holds: [] });
      if (p === '/api/me/trades') return json({ incoming: [], outgoing: [] });
      if (p === '/api/trades/offers/mine') return json([]);
      if (p === '/api/me/notifications') return json({ items: [] });
      if (p === '/api/me/collection/prices') return json(url.searchParams.get('ids').split(',').map((id) => ({ characterId: Number(id), median7d: 100 + Number(id) })));
      if (p === '/api/fair-play/prices') return json({});
      if (p === '/api/me/market/history') { const kind = url.searchParams.get('kind'); const n = Number(url.searchParams.get('page') || 1); return json(kind === 'echanges' ? tradePage(n) : { items: [], more: false }); }
      return json({});
    }
    if (p.startsWith('/cards/')) return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') });
    if (p === '/marche') return route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><html><body><header class="hdr"><nav class="nav"><a class="navlink" href="/marche">Marché</a></nav></header><main><div class="wrap"><div class="layout"><div role="tablist"><button role="tab" class="on">Mon activité</button></div><div role="tabpanel"></div><section class="board"></section><aside class="chat-side"></aside></div></div></main></body></html>` });
    return route.fulfill({ status: 404, body: '' });
  });
  await page.addInitScript(() => { localStorage.setItem('kyara_token', 'fake'); });
  await page.goto('https://kyara.games/marche?onglet=echanges');
  await page.addScriptTag({ content: script });
  await page.evaluate(() => {
    window.__measure = (selector) => new Promise((resolve) => {
      const body = document.querySelector('.kp-act__body');
      const before = body.innerHTML.length;
      const t0 = performance.now();
      let firstMutation = null;
      const observer = new MutationObserver(() => { if (firstMutation == null) firstMutation = performance.now(); });
      observer.observe(body, { childList: true, subtree: true, attributes: true });
      [...document.querySelectorAll('.kp-act__sub')].find((b) => b.textContent.startsWith(selector)).click();
      const t1 = performance.now();
      const check = () => {
        if (firstMutation != null || performance.now() - t0 > 3000) {
          requestAnimationFrame(() => requestAnimationFrame(() => {
            observer.disconnect();
            const imgs = [...body.querySelectorAll('img')];
            resolve({ handlerMs: Math.round(t1 - t0), toMutationMs: firstMutation == null ? null : Math.round(firstMutation - t0), toPaintMs: Math.round(performance.now() - t0), changed: body.innerHTML.length !== before, rows: body.querySelectorAll('article, .kp-act__row, li').length, imgs: imgs.length, imgsDecoded: imgs.filter((img) => img.complete).length });
          }));
        } else setTimeout(check, 5);
      };
      check();
    });
  });
  const out = { latencyMs: LATENCY, pages: PAGES, duringLoading: [], afterLoading: [] };
  // wait until the panel shows the sub row (the category is mounted), then click while the history is still loading
  await page.waitForSelector('.kp-act__subs:not([hidden])', { timeout: 20000 });
  await page.waitForFunction(() => /Chargement/.test(document.querySelector('.kp-act__notice')?.textContent ?? ''), null, { timeout: 20000 }).catch(() => {});
  for (const sub of ['Reçus', 'Envoyés', 'Tableau', 'Tous']) {
    const stillLoading = await page.evaluate(() => /Chargement/.test(document.querySelector('.kp-act__notice')?.textContent ?? ''));
    out.duringLoading.push({ sub, stillLoading, ...(await page.evaluate((s) => window.__measure(s), sub)) });
    await page.waitForTimeout(150);
  }
  await page.waitForFunction(() => !document.querySelector('.kp-act__notice') || /derniers jours/.test(document.querySelector('.kp-act__notice').textContent), null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  out.items = await page.evaluate(() => [...document.querySelectorAll('.kp-act__tab')].map((t) => t.textContent.replace(/\s+/g, ' ')));
  for (const sub of ['Reçus', 'Envoyés', 'Tableau', 'Tous', 'Reçus', 'Tableau']) {
    out.afterLoading.push({ sub, ...(await page.evaluate((s) => window.__measure(s), sub)) });
    await page.waitForTimeout(400);
  }
  out.errors = errors;
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();

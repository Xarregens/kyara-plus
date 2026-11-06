// Auto-accept et fair-play : la carte la plus rentable qui passe les barres est choisie (pas la plus rentable tout court),
// une offre refusée par le site est retentée une fois avec la carte suivante, une offre sans carte possible n'est jamais tentée.
const { chromium } = require('playwright');
const accepted = [];
const fs = require('fs');
const script = fs.readFileSync(process.argv[2], 'utf8');
const characters = [
  { id: 'r1', name: 'Reçue 1', rarity: 'M', series: 'S', image: '' }, { id: 'a', name: 'Carte A', rarity: 'L', series: 'S', image: '' }, { id: 'b', name: 'Carte B', rarity: 'L', series: 'S', image: '' },
  { id: 'r2', name: 'Reçue 2', rarity: 'M', series: 'S', image: '' }, { id: 'c', name: 'Carte C', rarity: 'L', series: 'S', image: '' }, { id: 'd', name: 'Carte D', rarity: 'L', series: 'S', image: '' },
  { id: 'r3', name: 'Reçue 3', rarity: 'M', series: 'S', image: '' }, { id: 'e', name: 'Carte E', rarity: 'L', series: 'S', image: '' },
];
// prices: gift = received − 2 × given on the Dons bar (1 200 left), the rest of the gap on Écart (4 000 left)
const prices = { r1: 6000, a: 1000, b: 2500, r2: 3000, c: 1200, d: 1400, r3: 6000, e: 500 };
const collection = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ characterId: id, qty: 2, listable: 2, pinned: false }));
const expires = new Date(Date.now() + 36e5 * 24).toISOString();
const offers = [
  // o1: A is the most profitable (gain 5 000) but its gift of 4 000 exceeds my bar; B (gain 3 500, gift 1 000) passes
  { id: 'o1', status: 'open', characterId: 'r1', wantIds: ['a', 'b'], user: { id: 'u1', pseudo: 'Un' }, expiresAt: expires },
  // o2: both pass by the script's reading, but the site refuses C (stale counters): retried with D
  { id: 'o2', status: 'open', characterId: 'r2', wantIds: ['c', 'd'], user: { id: 'u2', pseudo: 'Deux' }, expiresAt: expires },
  // o3: the only card would be refused: never attempted
  { id: 'o3', status: 'open', characterId: 'r3', wantIds: ['e'], user: { id: 'u3', pseudo: 'Trois' }, expiresAt: expires },
];
const fair = { enabled: true, myReceivedLeft: 1200, myFreeLeft: 4000, receivedDays: 2, pairDays: 2, freeRatio: 2, ignoreBelow: 100, maxRatio: 3, maxMargin: 10000, minPrice: 0 };
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/TUNNEL|409/.test(m.text())) errors.push(m.text()); });
  await page.route('https://kyara.games/**', async (route) => {
    const url = new URL(route.request().url()); const p = url.pathname;
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'x-kyara-rush': '1' }, body: JSON.stringify(body) });
    if (p.startsWith('/api/')) {
      await new Promise((r) => setTimeout(r, 60));
      if (p === '/api/characters') return json(characters);
      if (p === '/api/me/bootstrap') return json({ me: { id: 'me' }, wishlist: ['c7', 'c14', 'c21'] });
      if (p === '/api/me/collection') return json(collection);
      if (p === '/api/me/collection/prices') return json(url.searchParams.get('ids').split(',').map((id) => ({ characterId: id, median7d: prices[id] })));
      if (p === '/api/trades/offers/search') return json({ items: offers, more: false });
      if (p.startsWith('/api/fair-play/with/')) return json(fair);
      if (p === '/api/fair-play/prices') return json([]);
      if (p === '/api/trades/offers/mine') return json([]);
      if (p === '/api/me/trades') return json({ incoming: [], outgoing: [] });
      if (p === '/api/me/notifications') return json({ items: [] });
      if (p === '/api/me/market') return json({ listings: [], bids: [], buyOrders: [] });
      if (/\/api\/trades\/offers\/.*\/accept$/.test(p)) { const withId = route.request().postDataJSON().withId; const offerId = p.split('/')[4]; accepted.push(`${offerId}:${withId}`); if (offerId === 'o2' && withId === 'c') return json({ error: 'gift_limit', message: 'Limite de dons atteinte.' }, 409); return json({ ok: true }); }
      return json({ error: 'not_found' }, 404);
    }
    if (p.startsWith('/cards/')) return route.fulfill({ status: 200, contentType: 'image/webp', body: Buffer.alloc(0) });
    if (p === '/marche') return route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><html><body><header class="hdr"><nav class="nav"><a class="navlink on" href="/marche">Marché</a></nav></header><main><div class="wrap"><div class="layout"><div role="tablist"><button role="tab" class="on">Offres</button></div><section class="board"><div class="bh"><button class="btn-acc">Proposer</button></div></section><aside class="chat-side"></aside></div></div></main></body></html>` });
    return route.fulfill({ status: 404, body: '' });
  });
  await page.addInitScript(() => { localStorage.setItem('kyara_token', 'fake'); localStorage.setItem('kyara_device', 'dev'); });
  await page.goto('https://kyara.games/marche?onglet=offres');
  await page.addScriptTag({ content: script });
  await page.waitForFunction(() => /\d+ offres?$/.test(document.querySelector('.kp-board .kp-muted')?.textContent ?? ''), null, { timeout: 30000 });
  await page.click('.kp-side__tabs [role="tab"]:has-text("Auto-accept")');
  await page.waitForFunction(() => document.querySelector('.kp-bar__value') !== null, null, { timeout: 15000 }).catch(() => {});
  await page.check('.kp-check__box >> nth=0'); await page.fill('.kp-check .kp-input', '1'); await page.waitForTimeout(100);
  await page.click('.kp-auto__head .kp-btn:has-text("Activer")');
  await page.waitForFunction(() => document.querySelectorAll('.kp-deal--auto').length >= 2, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.click('.kp-auto__head .kp-btn:has-text("Arrêter")'); await page.waitForTimeout(200);
  const out = {};
  out.accepted = accepted;
  out.rows = await page.evaluate(() => [...document.querySelectorAll('.kp-deal--auto')].map((r) => r.querySelector('.kp-name').textContent + ' contre ' + r.querySelector('.kp-note').textContent.split(' · ')[0].replace('contre ', '')));
  out.status = await page.evaluate(() => document.querySelector('.kp-auto .kp-muted').textContent);
  out.errors = errors;
  const ok = accepted.includes('o1:b') && !accepted.includes('o1:a') && accepted.indexOf('o2:c') >= 0 && accepted.indexOf('o2:d') > accepted.indexOf('o2:c') && !accepted.some((a) => a.startsWith('o3:'))
    && accepted.length === 3 && out.rows.length === 2 && !/ignorées/.test(out.status) && errors.length === 0;
  console.log(JSON.stringify(out, null, 1));
  console.log(ok ? 'PASS' : 'FAIL');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();

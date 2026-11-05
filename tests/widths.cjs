const { chromium } = require('playwright');
const fs = require('fs');
const script = fs.readFileSync(process.argv[2], 'utf8');
const RARITIES = ['C', 'R', 'SR', 'E', 'L', 'M'];
const characters = Array.from({ length: 400 }, (_, i) => ({ id: `c${i}`, name: `Perso ${i}`, rarity: RARITIES[i % 6], series: `Serie ${i % 7}`, image: '' }));
const priceOf = (i) => 200 + (i * 37) % 4000;
const collection = characters.filter((_, i) => i % 3 === 0).map((c, k) => ({ characterId: c.id, qty: 1 + (k % 3), listable: 1 + (k % 3), pinned: false }));
const PAGE = 60, PAGES = 2;
const offers = Array.from({ length: PAGE * PAGES }, (_, i) => ({ id: `o${i}`, status: 'open', characterId: `c${(i * 7) % 400}`, wantIds: [`c${(i * 3) % 400}`, `c${(i * 3 + 3) % 400}`, `c${(i * 3 + 6) % 400}`], user: { id: `u${i % 20}`, pseudo: `Joueur${i % 20}` }, expiresAt: new Date(Date.now() + 36e5 * 24).toISOString() }));
const fair = { enabled: true, myReceivedLeft: 1200, myFreeLeft: 4000, receivedDays: 2, pairDays: 2, freeRatio: 1.5, ignoreBelow: 50, maxRatio: 3, maxMargin: 10000, minPrice: 0 };
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/TUNNEL/.test(m.text())) errors.push(m.text()); });
  await page.route('https://kyara.games/**', async (route) => {
    const url = new URL(route.request().url()); const p = url.pathname;
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'x-kyara-rush': '1' }, body: JSON.stringify(body) });
    if (p.startsWith('/api/')) {
      await new Promise((r) => setTimeout(r, 60));
      if (p === '/api/characters') return json(characters);
      if (p === '/api/me/bootstrap') return json({ me: { id: 'me' }, wishlist: ['c7', 'c14', 'c21'] });
      if (p === '/api/me/collection') return json(collection);
      if (p === '/api/me/collection/prices') return json(url.searchParams.get('ids').split(',').map((id) => ({ characterId: id, median7d: priceOf(Number(id.slice(1))) })));
      if (p === '/api/trades/offers/search') { const n = Number(url.searchParams.get('page') || 1); return json({ items: offers.slice((n - 1) * PAGE, n * PAGE), more: n < PAGES }); }
      if (p.startsWith('/api/fair-play/with/')) return json(fair);
      if (p === '/api/fair-play/prices') return json([]);
      if (p === '/api/trades/offers/mine') return json([]);
      if (p === '/api/me/trades') return json({ incoming: [], outgoing: [] });
      if (p === '/api/me/notifications') return json({ items: [] });
      if (p === '/api/me/market') return json({ listings: [], bids: [], buyOrders: [] });
      if (/\/api\/trades\/offers\/.*\/accept$/.test(p)) return json({ error: 'offer_taken', message: 'Offre déjà prise.' }, 409);
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

  const out = {};
  out.firstCard = await page.evaluate(() => { const c = document.querySelector('.kp-profit'); return { columns: [...c.children].map((e) => e.className.split(' ')[0]), get: c.querySelector('.kp-profit__get').textContent, badge: c.querySelector('.kp-profit__get .kp-badge')?.textContent, tileWidth: c.querySelector('.kp-ptile')?.getBoundingClientRect().width }; });
  out.chips = await page.evaluate(() => [...new Set([...document.querySelectorAll('.kp-ptile .kp-cost, .kp-ptile .kp-costs')].map((el) => el.className.replace(/kp-cost /, '') + ' | ' + el.textContent))].slice(0, 8));
  out.sellerLines = await page.evaluate(() => [...document.querySelectorAll('.kp-profit .kp-note')].map((n) => n.textContent).filter((t) => /·/.test(t)).length);
  out.boardChipsSample = await page.evaluate(() => [...new Set([...document.querySelectorAll('.kp-board .kp-option .kp-cost, .kp-board .kp-option .kp-costs')].map((el) => el.textContent))].slice(0, 6));
  out.redTilesWithRefused = await page.evaluate(() => document.querySelectorAll(".kp-ptile.is-best .kp-cost--over").length); out.bestTiles = await page.evaluate(() => document.querySelectorAll(".kp-ptile.is-best").length); out.cards = await page.evaluate(() => document.querySelectorAll(".kp-profit").length); out.clipped = await page.evaluate(() => [...document.querySelectorAll(".kp-ptile .kp-btn")].filter((b) => b.scrollWidth > b.clientWidth + 1).length); out.buttons = await page.evaluate(() => document.querySelectorAll(".kp-ptile .kp-btn").length); out.widest = await page.evaluate(() => Math.max(...[...document.querySelectorAll(".kp-ptile")].map((t) => t.getBoundingClientRect().width))); out.nonBestBg = await page.evaluate(() => { const b = document.querySelector(".kp-ptile:not(.is-best) .kp-btn--single, .kp-ptile:not(.is-best) .kp-btn--double"); return b && getComputedStyle(b).backgroundColor; }); out.tileWidths = await page.evaluate(() => [...new Set([...document.querySelectorAll(".kp-ptile")].map((t) => Math.round(t.getBoundingClientRect().width)))]); out.longestName = await page.evaluate(() => Math.max(...[...document.querySelectorAll(".kp-ptile .kp-name")].map((n) => n.scrollWidth - n.clientWidth))); out.errors = errors;
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();

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
  // Each tile is checked from its card name: "Perso N" gives the rarity (N % 6) and the price, as in the fake data
  const snapshot = () => page.evaluate((RARITIES) => {
    const info = (el) => { const n = Number(el.querySelector('.kp-name').textContent.replace('Perso ', '')); return { rarity: RARITIES[n % 6], price: 200 + (n * 37) % 4000 }; };
    const offers = [...document.querySelectorAll('.kp-board .kp-offer')].map((offer) => {
      const got = info(offer.querySelector('.kp-offer__get'));
      return [...offer.querySelectorAll('.kp-option')].map((tile) => { const give = info(tile); return { sameRarity: give.rarity === got.rarity, loss: got.price - give.price <= 0 }; });
    });
    const tiles = offers.flat();
    return { status: document.querySelector('.kp-board .kp-muted').textContent, offers: offers.length, tiles: tiles.length,
      crossLoss: tiles.filter((t) => t.loss && !t.sameRarity).length, sameLoss: tiles.filter((t) => t.loss && t.sameRarity).length };
  }, RARITIES);
  const pressed = () => page.evaluate(() => [...document.querySelectorAll('.kp-chip-pair .kp-chip--side')].map((b) => b.getAttribute('aria-pressed')));
  const LEFT = '.kp-chip-pair .kp-chip--side:has-text("Sans perte ≠ rareté")';
  const RIGHT = '.kp-chip-pair .kp-chip--side:has-text("Sans aucune perte")';
  const out = {};
  out.titles = await page.evaluate(() => [...document.querySelectorAll('.kp-chip-pair .kp-chip--side')].map((b) => b.title.slice(0, 40)));
  out.before = { ...(await snapshot()), pressed: await pressed() };
  await page.click(LEFT); await page.waitForTimeout(150);
  out.cross = { ...(await snapshot()), pressed: await pressed() };
  await page.click(RIGHT); await page.waitForTimeout(150);
  out.all = { ...(await snapshot()), pressed: await pressed() };
  await page.click(LEFT); await page.waitForTimeout(150);
  out.backToCross = { ...(await snapshot()), pressed: await pressed() };
  await page.click(LEFT); await page.waitForTimeout(150);
  out.off = { ...(await snapshot()), pressed: await pressed() };
  out.errors = errors;
  const ok = out.before.crossLoss > 0
    && out.cross.crossLoss === 0 && out.cross.sameLoss > 0 && out.cross.pressed.join() === 'true,false'
    && out.all.crossLoss === 0 && out.all.sameLoss === 0 && out.all.pressed.join() === 'false,true'
    && out.backToCross.pressed.join() === 'true,false' && out.off.pressed.join() === 'false,false' && out.off.tiles === out.before.tiles
    && errors.length === 0;
  console.log(JSON.stringify(out, null, 1));
  console.log(ok ? 'PASS' : 'FAIL');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();

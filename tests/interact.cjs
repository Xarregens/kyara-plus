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
  const count = () => page.evaluate(() => ({ status: document.querySelector('.kp-board .kp-muted').textContent, shown: document.querySelectorAll('.kp-board .kp-offer').length, hiddenBtn: document.querySelector('.kp-board .kp-btn--ghost:not(.kp-more)')?.hidden, more: !!document.querySelector('.kp-more') }));
  const out = {};
  out.start = await count();
  await page.click('.kp-board .kp-offer .kp-hide'); await page.waitForTimeout(100); out.afterHide = await count();
  await page.click('.kp-board .kp-btn--ghost:not(.kp-more)'); await page.waitForTimeout(100); out.afterUnhide = await count();
  if (out.start.more) { await page.click('.kp-more'); await page.waitForTimeout(100); out.afterMore = await count(); }
  await page.click('.kp-filters .kp-chip:has-text("Ma wishlist")'); await page.waitForTimeout(100); out.afterWishlistFilter = await count();
  await page.click('.kp-filters .kp-chip:has-text("Ma wishlist")'); await page.waitForTimeout(100); out.afterWishlistOff = await count();
  await page.fill('.kp-board__search', 'Perso 12'); await page.waitForTimeout(100); out.afterSearch = await count();
  await page.fill('.kp-board__search', ''); await page.waitForTimeout(100); out.afterSearchCleared = await count();
  // Give: busy then server refusal -> toast, offer stays
  const first = page.locator('.kp-board .kp-offer').first();
  await first.locator('button.kp-btn:has-text("Donner")').first().click();
  await page.waitForTimeout(50);
  out.busyDuringGive = await first.evaluate((el) => el.classList.contains('is-busy'));
  await page.waitForTimeout(800);
  out.afterGive = { busy: await first.evaluate((el) => el.classList.contains('is-busy')), toast: await page.evaluate(() => [...document.querySelectorAll('[class*="toast"]')].map((t) => t.textContent).join(' | ')) };
  // Side panel min gain input must re-render the profit list
  out.profitBefore = await page.evaluate(() => document.querySelectorAll('.kp-profit').length);
  await page.fill('.kp-side .kp-input[inputmode="numeric"]', '3500'); await page.waitForTimeout(100);
  out.profitAfterMinGain3500 = await page.evaluate(() => document.querySelectorAll('.kp-profit').length);
  await page.screenshot({ path: 'shot-interact.png' });
  out.errors = errors;
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();

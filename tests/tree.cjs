const { chromium } = require('playwright');
const fs = require('fs');
const script = fs.readFileSync(process.argv[2], 'utf8');
const characters = Array.from({ length: 50 }, (_, i) => ({ id: i, name: `Perso ${i}`, rarity: 'R', series: 'S', image: '' }));
const day = 864e5; const now = Date.now(); const iso = (ms) => new Date(ms).toISOString();
const listing = (id, i, extra) => ({ id, type: 'fixed', status: 'sold', isMine: true, price: 100, finalPrice: 120, createdAt: iso(now - day), endsAt: iso(now - day / 2), character: { id: i % 50, name: `Perso ${i % 50}` }, seller: { id: 'other', pseudo: 'Vendeur' }, ...extra });
const sales = { items: Array.from({ length: 5 }, (_, i) => listing(`s${i}`, i, {})), more: false };
const bids = { items: [
  listing('won1', 1, { type: 'auction', status: 'sold', leading: true, isMine: false, myMaxBid: 150, currentBid: 150 }),
  listing('bought1', 2, { type: 'fixed', status: 'sold', leading: true, isMine: false, myMaxBid: 120 }),
  listing('lost1', 3, { type: 'auction', status: 'sold', leading: false, isMine: false, myMaxBid: 90, currentBid: 200 }),
  listing('lost2', 4, { type: 'auction', status: 'ended', leading: false, isMine: false, myMaxBid: 90 }),
  listing('active1', 5, { type: 'auction', status: 'active', leading: true, isMine: false, myMaxBid: 50, currentBid: 50, endsAt: iso(now + day) }),
], more: false };
const trade = (id, incoming, status) => ({ id, status, createdAt: iso(now - 2 * day), expiresAt: iso(now + day), from: incoming ? { id: 'u1', pseudo: 'Ami' } : { id: 'me', pseudo: 'moi' }, to: incoming ? { id: 'me', pseudo: 'moi' } : { id: 'u1', pseudo: 'Ami' }, give: { cards: [{ characterId: 7, qty: 1 }], chakra: 0 }, want: { cards: [{ characterId: 8, qty: 1 }], chakra: 0 }, message: '', messages: [] });
const offer = (id, status) => ({ id, status, createdAt: iso(now - 3 * day), expiresAt: iso(now + day), closedAt: status === 'accepted' ? iso(now - day) : null, user: { id: 'me', pseudo: 'moi' }, taker: status === 'accepted' ? { id: 'u2', pseudo: 'Preneur' } : null, characterId: 9, wantIds: [10, 11], takenWith: status === 'accepted' ? 10 : null });
const echanges = { trades: [trade('t1', true, 'accepted'), trade('t2', false, 'accepted'), trade('t3', true, 'declined')], offers: [offer('o1', 'accepted'), offer('o2', 'accepted')], more: false };
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = []; const calls = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/TUNNEL|404|409/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
  await page.route('https://kyara.games/**', async (route) => {
    const url = new URL(route.request().url()); const p = url.pathname;
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'x-kyara-rush': '1' }, body: JSON.stringify(body) });
    if (p.startsWith('/api/')) {
      calls.push(p + url.search.slice(0, 40));
      if (p === '/api/characters') return json(characters);
      if (p === '/api/me/bootstrap') return json({ me: { id: 'me', chakraHeld: 0 }, wishlist: [] });
      if (p === '/api/me/collection') return json([]);
      if (p === '/api/me/market') return json({ listings: [], bids: [], buyOrders: [], holds: [] });
      if (p === '/api/me/trades') return json({ incoming: [], outgoing: [] });
      if (p === '/api/trades/offers/mine') return json([]);
      if (p === '/api/me/notifications') return json({ items: [] });
      if (p === '/api/me/collection/prices') return json([]);
      if (p === '/api/fair-play/prices') return json({});
      if (p === '/api/me/market/history') { const kind = url.searchParams.get('kind'); return json(kind === 'ventes' ? sales : kind === 'mises' ? bids : echanges); }
      return json({});
    }
    if (p === '/marche') return route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><html><body><header class="hdr"><nav class="nav"><a class="navlink" href="/marche">Marché</a></nav></header><main><div class="wrap"><div class="layout"><div role="tablist"><button role="tab" class="on">Mon activité</button></div><div role="tabpanel"></div><section class="board"></section><aside class="chat-side"></aside></div></div></main></body></html>` });
    return route.fulfill({ status: 404, body: '' });
  });
  await page.addInitScript(() => { localStorage.setItem('kyara_token', 'fake'); });
  await page.goto('https://kyara.games/marche?onglet=ventes');
  await page.addScriptTag({ content: script });
  const histCalls = () => calls.filter((u) => /history/.test(u)).map((u) => u.match(/kind=(\w+)/)[1]);
  const snap = () => page.evaluate(() => ({
    tabs: [...document.querySelectorAll('.kp-act__tab')].map((t) => t.querySelector('.kp-act__tab-label').textContent + ':' + t.querySelector('.n').textContent + (t.classList.contains('on') ? '*' : '')),
    subsHidden: document.querySelector('.kp-act__subs').hidden,
    subs: [...document.querySelectorAll('.kp-act__sub')].map((s) => s.textContent + (s.getAttribute('aria-pressed') === 'true' ? '*' : '')),
    rows: document.querySelectorAll('.kp-act__body .kp-act__item, .kp-act__body [class*="kp-act__row"], .kp-act__body article').length,
    notice: document.querySelector('.kp-act__notice')?.textContent ?? null,
    bodyText: document.querySelector('.kp-act__body').innerText.replace(/\s+/g, ' ').slice(0, 160),
  }));
  await page.waitForFunction(() => document.querySelector('.kp-act__tab.on') && !/Chargement/.test(document.querySelector('.kp-act__body')?.textContent ?? 'Chargement') && !document.querySelector('.kp-act__notice'), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const out = {};
  out.ventes = { ...(await snap()), hist: histCalls() };
  await page.click('.kp-act__tab:has-text("Achats")'); await page.waitForTimeout(1500);
  out.achats = { ...(await snap()), hist: histCalls() };
  await page.click('.kp-act__tab:has-text("Échanges")'); await page.waitForTimeout(1500);
  out.echanges = { ...(await snap()), hist: histCalls() };
  await page.click('.kp-act__sub:has-text("Reçus")'); await page.waitForTimeout(300);
  out.recus = await snap();
  await page.click('.kp-act__sub:has-text("Tableau")'); await page.waitForTimeout(300);
  out.tableau = await snap();
  await page.click('.kp-act__tab:has-text("Tout")'); await page.waitForTimeout(1500);
  out.tout = { ...(await snap()), hist: histCalls() };
  out.tree = await page.evaluate(() => { document.head.insertAdjacentHTML("beforeend", "<style>:root{--line3:#4a5568;--acc:#e8503a;--panel:#1b1d22;--line:#2a2d35;--fg2:#ccc;--mono:monospace;--body:sans-serif;--t-sm:13px;--t-meta:11px;--r-lg:12px;--r-md:8px;--r-pill:999px;--s-2:8px;--s-3:12px}</style>"); const subs = document.querySelector(".kp-act__subs"); const cs = getComputedStyle(subs); return { hidden: subs.hidden, stem: subs.style.getPropertyValue("--kp-notch-x"), left: subs.style.getPropertyValue("--kp-root-left"), right: subs.style.getPropertyValue("--kp-root-right"), toolbarDir: getComputedStyle(document.querySelector(".kp-act__toolbar")).flexDirection, tabsJustify: getComputedStyle(document.querySelector(".kp-act__tabs")).justifyContent }; });
  await page.click(".kp-act__tab:has-text(\"Échanges\")"); await page.waitForTimeout(300);
  await page.setViewportSize({ width: 1100, height: 700 }); await page.waitForTimeout(200);
  await page.screenshot({ path: "shot-tree.png", clip: { x: 0, y: 0, width: 1100, height: 330 } });
  out.treeAfter = await page.evaluate(() => { const subs = document.querySelector(".kp-act__subs"); return { hidden: subs.hidden, stem: subs.style.getPropertyValue("--kp-notch-x"), left: subs.style.getPropertyValue("--kp-root-left"), right: subs.style.getPropertyValue("--kp-root-right") }; });
  out.errors = errors;
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();

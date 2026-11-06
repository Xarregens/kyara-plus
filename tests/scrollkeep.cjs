// Mon activité, longue liste du Tableau : la page ne remonte pas quand les lignes sont reconstruites (nouvelle minute,
// rafraîchissement) alors qu'on a fait défiler vers le bas.
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
// the site gives the last 30 accepted offers only: between two visits, 20 of them have been pushed out by newer ones
const boardOffer = (i) => ({ ...offer(`b${i}`, 'accepted'), createdAt: iso(now - 3 * day + i * 6e4), closedAt: iso(now - day + i * 6e4) });
const firstVisit = [...Array.from({ length: 30 }, (_, i) => boardOffer(i)), { ...offer('open1', 'open'), closedAt: null }];
const secondVisit = Array.from({ length: 30 }, (_, i) => boardOffer(i + 20));
let liveOffers = firstVisit;
const echanges = { trades: [trade('t1', true, 'accepted'), trade('t2', false, 'accepted'), trade('t3', true, 'declined')], offers: [], more: false };
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
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
      if (p === '/api/trades/offers/mine') return json(liveOffers);
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
  const snap = () => page.evaluate(() => ({
    tabs: [...document.querySelectorAll('.kp-act__tab')].map((t) => t.querySelector('.kp-act__tab-label').textContent + ':' + t.querySelector('.n').textContent + (t.classList.contains('on') ? '*' : '')),
    subs: [...document.querySelectorAll('.kp-act__sub')].map((s) => s.textContent + (s.getAttribute('aria-pressed') === 'true' ? '*' : '')),
    rows: document.querySelectorAll('.kp-act__body .kp-act__row').length,
    kinds: [...new Set([...document.querySelectorAll('.kp-act__body .kp-act__row')].map((r) => r.dataset.kind))],
  }));
  const histCalls = () => calls.filter((u) => /history/.test(u)).map((u) => u.match(/kind=(\w+)/)[1]);
  const settle = async () => { await page.waitForFunction(() => !/Chargement/.test(document.querySelector('.kp-act__body')?.textContent ?? 'Chargement') && !document.querySelector('.kp-act__notice'), null, { timeout: 30000 }).catch(() => {}); await page.waitForTimeout(400); };
  // 200 remembered offers already in memory, as after a week of use
  await page.addInitScript((list) => { localStorage.setItem('kyara-plus:board-offers', JSON.stringify(list)); }, Array.from({ length: 200 }, (_, i) => boardOffer(100 + i)));
  await page.goto('https://kyara.games/marche?onglet=echanges');
  await page.addScriptTag({ content: script });
  await settle();
  await page.click('.kp-act__sub:has-text("Tableau")'); await settle();
  for (let i = 0; i < 6; i++) { const more = await page.$('.kp-act__body .kp-more'); if (!more) break; await more.click(); await page.waitForTimeout(200); }
  const out = {};
  out.rows = await page.evaluate(() => document.querySelectorAll('.kp-act__body .kp-act__row').length);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(300);
  await page.evaluate(() => window.scrollBy(0, -800)); await page.waitForTimeout(300);
  out.before = await page.evaluate(() => Math.round(window.scrollY));
  const topRow = () => page.evaluate(() => { const r = [...document.querySelectorAll('.kp-act__row')].find((r) => r.getBoundingClientRect().bottom > 0); return r ? `${r.id} @${Math.round(r.getBoundingClientRect().top)}` : ''; });
  out.topRowBefore = await topRow();
  // a minute change rebuilds every row; the live refresh (60 s) rebuilds them again
  await page.evaluate(() => { document.querySelectorAll('.kp-act__row').forEach((r) => { r.dataset.mark = '1'; }); window.__rerenders = 0; const target = document.querySelector('.kp-act__body'); new MutationObserver(() => { window.__rerenders++; }).observe(target, { childList: true, subtree: true }); });
  out.samples = [];
  let last = '';
  for (let t = 0; t < 140; t++) { await page.waitForTimeout(500); const sample = await page.evaluate(() => `y=${Math.round(window.scrollY)} h=${document.documentElement.scrollHeight} top=${[...document.querySelectorAll('.kp-act__row')].find((r) => r.getBoundingClientRect().bottom > 0)?.id.slice(-6) ?? ''} rows=${document.querySelectorAll('.kp-act__row').length} unmarked=${document.querySelectorAll('.kp-act__row:not([data-mark])').length} h120=${[...document.querySelectorAll('.kp-act__row')].filter((r) => Math.round(r.getBoundingClientRect().height) === 120).length} mutations=${window.__rerenders}`); if (sample !== last) { out.samples.push(`${new Date().toISOString().slice(14, 19)} ${sample}`); last = sample; } }
  out.after = await page.evaluate(() => Math.round(window.scrollY));
  out.topRowAfter = await topRow();
  out.errors = errors;
  const unmarked = Number(out.samples.at(-1).match(/unmarked=(\d+)/)[1]);
  // the same row stays at the top of the viewport, at the same place on screen; only the live row ("expire dans…") is rebuilt
  const ok = out.rows >= 200 && out.before > 2000 && out.topRowAfter === out.topRowBefore && unmarked <= 1 && errors.length === 0;
  console.log(JSON.stringify(out, null, 1));
  console.log(ok ? 'PASS' : 'FAIL');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();

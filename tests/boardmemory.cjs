// Tableau de Mon activité : les offres du tableau que le site ne renvoie plus (il s'arrête aux 30 dernières) restent
// visibles grâce à la mémoire du script ; les offres ouvertes ne sont pas mémorisées.
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
  await page.goto('https://kyara.games/marche?onglet=echanges');
  await page.addScriptTag({ content: script });
  await settle();
  await page.click('.kp-act__sub:has-text("Tableau")'); await settle();
  const out = {};
  const tableau = () => page.evaluate(() => ({
    sub: [...document.querySelectorAll('.kp-act__sub')].find((s) => /Tableau/.test(s.textContent))?.textContent ?? '',
    rows: document.querySelectorAll('.kp-act__body .kp-act__row').length,
    more: document.querySelector('.kp-act__body .kp-more')?.textContent ?? '',
    stored: JSON.parse(localStorage.getItem('kyara-plus:board-offers') ?? '[]').map((o) => o.id),
  }));
  out.first = await tableau();
  liveOffers = secondVisit;
  await page.reload(); await page.addScriptTag({ content: script }); await settle();
  await page.click('.kp-act__sub:has-text("Tableau")'); await settle();
  out.second = await tableau();
  await page.click('.kp-act__body .kp-more'); await page.waitForTimeout(300);
  out.afterMore = await tableau();
  out.errors = errors;
  const ok = out.first.sub === 'Tableau31' && out.first.rows === 30 && /Voir plus \(1 élément\)/.test(out.first.more) && out.first.stored.length === 30 && !out.first.stored.includes('open1')
    && out.second.sub === 'Tableau50' && out.second.rows === 30 && /Voir plus \(20 éléments\)/.test(out.second.more) && out.second.stored.length === 50
    && out.afterMore.rows === 50 && out.afterMore.more === '' && errors.length === 0;
  console.log(JSON.stringify(out, null, 1));
  console.log(ok ? 'PASS' : 'FAIL');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();

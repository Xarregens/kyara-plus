// Mon activité se rafraîchit dès que le site a lui-même relu ses échanges (nouvel échange reçu) ou redessiné son panneau,
// sans attendre la minute du rafraîchissement périodique ; les propres requêtes du script ne le déclenchent pas.
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
  const incoming = [];
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
      if (p === '/api/me/trades') return json({ incoming: incoming.slice(), outgoing: [] });
      if (p === '/api/trades/offers/mine') return json([]);
      if (p === '/api/me/notifications') return json({ items: [] });
      if (p === '/api/me/collection/prices') return json([]);
      if (p === '/api/fair-play/prices') return json({});
      if (p === '/api/me/market/history') { const kind = url.searchParams.get('kind'); return json(kind === 'ventes' ? sales : kind === 'mises' ? bids : echanges); }
      return json({});
    }
    if (p === '/marche') return route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><html><body><header class="hdr"><nav class="nav"><a class="navlink" href="/marche">Marché</a></nav></header><main><div class="wrap"><div class="layout"><div role="tablist"><button role="tab" class="on">Mon activité</button></div><div role="tabpanel"><div class="site-list">Aucun échange</div></div><section class="board"></section><aside class="chat-side"></aside></div></div></main></body></html>` });
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
  const out = {};
  const rows = () => page.evaluate(() => [...document.querySelectorAll('.kp-act__body .kp-act__row')].map((r) => r.id));
  const tradeCalls = () => calls.filter((c) => c === '/api/me/trades').length;
  out.before = { rows: await rows(), tradeCalls: tradeCalls() };
  // 1. the site reads its trades again (as it does when a trade arrives): the new trade shows within two seconds
  incoming.push(trade('n1', true, 'pending'));
  await page.evaluate(() => fetch('/api/me/trades', { headers: { authorization: 'Bearer fake' } }).then((r) => r.json()));
  const t0 = Date.now();
  await page.waitForFunction(() => document.querySelector('#kp-act-t\\:n1'), null, { timeout: 8000 }).catch(() => {});
  out.afterSiteRead = { rows: await rows(), delayMs: Date.now() - t0, tradeCalls: tradeCalls() };
  // 2. the site redraws its (hidden) panel with new text: same thing
  incoming.push(trade('n2', true, 'pending'));
  await page.waitForTimeout(4500); // past the minimum gap between two wakes
  await page.evaluate(() => { document.querySelector('.site-list').textContent = '1 échange attend ta réponse'; });
  const t1 = Date.now();
  await page.waitForFunction(() => document.querySelector('#kp-act-t\\:n2'), null, { timeout: 8000 }).catch(() => {});
  out.afterPanelChange = { rows: await rows(), delayMs: Date.now() - t1, tradeCalls: tradeCalls() };
  // 3. the script's own reads never wake it again (no runaway loop): the number of calls settles
  const callsNow = tradeCalls();
  await page.waitForTimeout(6000);
  out.quiet = { extraCalls: tradeCalls() - callsNow };
  out.errors = errors;
  const ok = !out.before.rows.includes('kp-act-t:n1') && out.afterSiteRead.rows.includes('kp-act-t:n1') && out.afterSiteRead.delayMs < 3000
    && out.afterPanelChange.rows.includes('kp-act-t:n2') && out.afterPanelChange.delayMs < 3000 && out.quiet.extraCalls <= 1 && errors.length === 0;
  console.log(JSON.stringify(out, null, 1));
  console.log(ok ? 'PASS' : 'FAIL');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();

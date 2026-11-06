// Discussion d'un échange dans la ligne de Mon activité : « Discuter (N) » ouvre la boîte, les messages du site sont
// lus (/trades/<id>/messages), un message envoyé (POST { text }) s'ajoute à la suite, sans quitter la vue Kyara Plus.
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
  const errors = []; const calls = []; const posted = [];
  const messages = [{ id: 'm1', senderId: 'u1', text: 'Salut, ça te va ?', createdAt: iso(now - 3600e3) }, { id: 'm2', senderId: 'me', text: 'Je regarde', createdAt: iso(now - 1800e3) }];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/TUNNEL|404|409/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
  await page.route('https://kyara.games/**', async (route) => {
    const url = new URL(route.request().url()); const p = url.pathname;
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'x-kyara-rush': '1' }, body: JSON.stringify(body) });
    if (p.startsWith('/api/')) {
      calls.push(p + url.search.slice(0, 40));
      if (/^\/api\/trades\/p1\/messages$/.test(p)) { if (route.request().method() === 'POST') { const body = route.request().postDataJSON(); posted.push(body); const sent = { id: `m${messages.length + 1}`, senderId: 'me', text: body.text, createdAt: iso(now) }; messages.push(sent); return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(sent) }); } return json(messages); }
      if (p === '/api/characters') return json(characters);
      if (p === '/api/me/bootstrap') return json({ me: { id: 'me', chakraHeld: 0 }, wishlist: [] });
      if (p === '/api/me/collection') return json([]);
      if (p === '/api/me/market') return json({ listings: [], bids: [], buyOrders: [], holds: [] });
      if (p === '/api/me/trades') return json({ incoming: [{ ...trade('p1', true, 'pending'), messages: 2 }], outgoing: [trade('p2', false, 'pending')] });
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
  const row = '#kp-act-t\\:p1';
  const read = () => page.evaluate((row) => {
    const r = document.querySelector(row);
    return {
      button: r.querySelector('.kp-act__talk-btn')?.textContent ?? '',
      pressed: r.querySelector('.kp-act__talk-btn')?.getAttribute('aria-pressed'),
      box: Boolean(r.querySelector('.kp-talk')),
      bubbles: [...r.querySelectorAll('.kp-talk__msg')].map((m) => `${m.classList.contains('kp-talk__msg--me') ? 'moi' : 'lui'}: ${m.querySelector('.kp-talk__text').textContent}`),
      native: document.body.classList.contains('kp-activity--native'),
      url: location.pathname + location.search,
    };
  }, row);
  out.before = await read();
  await page.click(`${row} .kp-act__talk-btn`);
  await page.waitForFunction((row) => document.querySelectorAll(`${row} .kp-talk__msg`).length >= 2, row, { timeout: 10000 }).catch(() => {});
  out.opened = await read();
  await page.fill(`${row} .kp-talk__input`, 'test');
  await page.press(`${row} .kp-talk__input`, 'Enter');
  await page.waitForFunction((row) => document.querySelectorAll(`${row} .kp-talk__msg`).length >= 3, row, { timeout: 10000 }).catch(() => {});
  out.sent = await read();
  out.posted = posted;
  out.inputAfterSend = await page.evaluate((row) => document.querySelector(`${row} .kp-talk__input`).value, row);
  await page.click(`${row} .kp-act__talk-btn`); await page.waitForTimeout(200);
  out.closed = await read();
  // the sent trade has its button too, with no messages
  await page.click('.kp-act__sub:has-text("Envoyés")'); await settle();
  out.outButton = await page.evaluate(() => document.querySelector('#kp-act-t\\:p2 .kp-act__talk-btn')?.textContent ?? '');
  // an address kept from the old "Discuter" link stays in this view and opens the discussion of that trade
  await page.goto('https://kyara.games/marche?onglet=echanges&echange=p1&discussion=1');
  await page.addScriptTag({ content: script });
  await page.waitForFunction((row) => document.querySelectorAll(`${row} .kp-talk__msg`).length >= 2, row, { timeout: 15000 }).catch(() => {});
  out.fromAddress = await read();
  out.errors = errors;
  const ok = out.before.button === 'Discuter (2)' && !out.before.box
    && out.opened.box && out.opened.pressed === 'true' && out.opened.bubbles.join(' | ') === 'lui: Salut, ça te va ? | moi: Je regarde' && !out.opened.native && out.opened.url === '/marche?onglet=echanges'
    && out.posted.length === 1 && out.posted[0].text === 'test' && out.sent.bubbles.at(-1) === 'moi: test' && out.sent.button === 'Discuter (3)' && out.inputAfterSend === ''
    && !out.closed.box && out.closed.pressed === 'false' && out.outButton === 'Discuter'
    && !out.fromAddress.native && out.fromAddress.box && out.fromAddress.bubbles.length >= 2 && errors.length === 0;
  console.log(JSON.stringify(out, null, 1));
  console.log(ok ? 'PASS' : 'FAIL');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();

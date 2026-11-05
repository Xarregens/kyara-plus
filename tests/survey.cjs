const { chromium } = require('playwright');
const fs = require('fs');
const script = fs.readFileSync(process.argv[2], 'utf8');
const characters = Array.from({ length: 60 }, (_, i) => ({ id: `c${i}`, name: `Perso ${i}`, rarity: 'R', series: 'S', image: '' }));
const collection = characters.map((c) => ({ characterId: c.id, qty: 2, listable: 2, pinned: false }));
const offers = Array.from({ length: 20 }, (_, i) => ({ id: `o${i}`, status: 'open', characterId: `c${i}`, wantIds: [`c${(i + 1) % 60}`], user: { id: `u1`, pseudo: `J1` }, expiresAt: new Date(Date.now() + 36e5).toISOString() }));
const fair = { enabled: true, myReceivedLeft: 1200, myFreeLeft: 4000, receivedDays: 2, pairDays: 2, freeRatio: 1.5, ignoreBelow: 50 };
const hist = { ventes: [{ items: [{ id: 'l1', type: 'fixed', status: 'sold', isMine: true, finalPrice: 900, createdAt: new Date(Date.now() - 36e5).toISOString(), endsAt: new Date().toISOString(), character: { id: 'c3', name: 'Perso 3' }, seller: { id: 'me' } }], more: true }, { items: [], more: false }], mises: [{ items: [], more: false }], echanges: [{ trades: [], offers: [], more: false }] };
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ acceptDownloads: true });
  const errors = []; const calls = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://kyara.games/**', async (route) => {
    const url = new URL(route.request().url()); const p = url.pathname;
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (p.startsWith('/api/')) {
      calls.push(p + url.search);
      if (p === '/api/characters') return json(characters);
      if (p === '/api/me/bootstrap') return json({ me: { id: 'me' }, wishlist: [] });
      if (p === '/api/me/collection') return json(collection);
      if (p === '/api/me/collection/prices') return json(url.searchParams.get('ids').split(',').map((id) => ({ characterId: id, median7d: 1000 })));
      if (p === '/api/trades/offers/search') return json({ items: offers, more: false });
      if (p.startsWith('/api/fair-play/with/')) return json({ ...fair, pairLeftDemo: 1234 });
      if (p === '/api/fair-play/prices') return json(Object.fromEntries(url.searchParams.get('ids').split(',').map((id) => [id, id === 'c40' ? 6000 : 1000])));
      if (p === '/api/trades/offers/mine') return json([{ id: 'ox', status: 'accepted', closedAt: new Date(Date.now() - 72e5).toISOString(), user: { id: 'me', pseudo: 'moi' }, taker: { id: 'u2', pseudo: 'J2' }, characterId: 'c5', wantIds: ['c6'], takenWith: 'c6' }, { id: 'oy', status: 'accepted', closedAt: new Date(Date.now() - 36e5).toISOString(), user: { id: 'u1', pseudo: 'J1' }, taker: { id: 'me', pseudo: 'moi' }, characterId: 'c40', wantIds: ['c41'], takenWith: 'c41' }]);
      if (p === '/api/me/trades') return json({ incoming: [{ id: 't1', status: 'accepted', createdAt: new Date(Date.now() - 5e6).toISOString(), expiresAt: new Date(Date.now() + 5e6).toISOString(), from: { id: 'u3', pseudo: 'J3' }, to: { id: 'me', pseudo: 'moi' }, give: { cards: [{ characterId: 'c9', qty: 1 }], chakra: 0 }, want: { cards: [{ characterId: 'c10', qty: 1 }], chakra: 0 } }], outgoing: [] });
      if (p === '/api/me/notifications') return json({ items: [{ type: 'trade_accepted', createdAt: new Date().toISOString(), data: { tradeId: 't1' }, secret: 'x' }] });
      if (p === '/api/me/market') return json({ listings: [{ id: 'l1', type: 'fixed', status: 'sold', isMine: true, price: 900, finalPrice: 900, createdAt: new Date(Date.now() - 36e5).toISOString(), endsAt: new Date().toISOString(), character: { id: 'c3', name: 'Perso 3' }, seller: { id: 'me' } }], bids: [], buyOrders: [] });
      if (p === '/api/me/market/history') { const k = url.searchParams.get('kind'); const n = Number(url.searchParams.get('page') || 1); return json(hist[k][n - 1] ?? { items: [], more: false }); }
      return json({ error: 'not_found' }, 404);
    }
    if (p === '/marche') return route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><html><body><main><section class="board"></section><aside class="chat-side"></aside></main></body></html>` });
    return route.fulfill({ status: 404, body: '' });
  });
  await page.addInitScript(() => { localStorage.setItem('kyara_token', 'fake'); });
  await page.goto('https://kyara.games/marche?onglet=offres');
  await page.addScriptTag({ content: script });
  await page.waitForSelector('.kp-fair .kp-survey', { timeout: 15000 });
  await page.waitForTimeout(1500);
  const before = calls.length;
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('.kp-fair .kp-survey')]);
  const file = await download.path();
  const survey = JSON.parse(fs.readFileSync(file, 'utf8'));
  const toasts = await page.evaluate(() => [...document.querySelectorAll('.kp-toast')].map((t) => t.textContent));
  console.log(JSON.stringify({
    fileName: download.suggestedFilename(), size: fs.statSync(file).size,
    surveyCalls: calls.slice(before).filter((c) => !/offers\/search|collection\/prices/.test(c)),
    keys: Object.keys(survey), problemes: survey.problemes,
    echanges: survey.echanges.map((e) => ({ type: e.type, partenaire: e.partenaire, donne: e.valeurDonnee, recu: e.valeurRecue, modele: e.modele, avant: e.jaugesAvant && [e.jaugesAvant.dons, e.jaugesAvant.ecart], apres: e.jaugesApres && [e.jaugesApres.dons, e.jaugesApres.ecart], variation: e.variationObservee, autres: e.autresEchangesDansLeMemeIntervalle })),
    releves: survey.relevesDesJauges.map((r) => [r.declencheur, r.dons, r.ecart]),
    jaugesMaintenant: survey.jaugesMaintenant, usageParPartenaire: survey.usageParPartenaire, limites: survey.limitesParPaireSupposees, partenairesLus: survey.fairPlayParPartenaire.map((x) => x.partenaire), autresChampsDernier: survey.relevesDesJauges.at(-1).autresChamps, fairBrutKeys: Object.keys(survey.fairPlayBrut.reponseBrute),
    toasts, buttonText: await page.textContent('.kp-survey'), errors
  }, null, 1));
  // console command too
  const viaConsole = await page.evaluate(async () => { const s = await window.kyaraPlusReleve.build(); return s.versionReleve; });
  console.log('console build ->', viaConsole);
  await browser.close();
})();

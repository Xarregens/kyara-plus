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
  // an old-style switch list (2.35.6, plain array) is dropped at start: it never survives a new version of the script
  await page.addInitScript(() => { localStorage.setItem('kyara_token', 'fake'); localStorage.setItem('kyara_device', 'dev'); if (!localStorage.getItem('kyara-plus:settings')) localStorage.setItem('kyara-plus:settings', JSON.stringify({ disabledFeatures: ['market-offers', 'collection-albums'] })); });
  await page.goto('https://kyara.games/marche?onglet=offres');
  await page.addScriptTag({ content: script });
  await page.waitForFunction(() => /\d+ offres?$/.test(document.querySelector('.kp-board .kp-muted')?.textContent ?? ''), null, { timeout: 30000 });
  const out = {};
  out.version = script.match(/@version\s+(\S+)/)[1];
  out.oldFormatDropped = await page.evaluate(() => (JSON.parse(localStorage.getItem('kyara-plus:settings')).disabledFeatures ?? null) === null && Boolean(document.querySelector('.kp-board')));
  out.features = await page.evaluate(() => kyaraPlusDiag.features().split('\n').filter((l) => /market-offers|collection-ghosts|header-nav/.test(l)));
  out.started = await page.evaluate(() => kyaraPlusDiag.menu(5));
  await page.click('.kp-filters .kp-chip:has-text("Ma wishlist")'); await page.waitForTimeout(100);
  out.stopped = await page.evaluate(() => kyaraPlusDiag.stop());
  out.lines = await page.evaluate(() => kyaraPlusDiag.last.lines.filter((l) => l.kind === 'event').map((l) => `${l.type} ${l.target}`).slice(0, 6));
  out.headerMutations = await page.evaluate(() => kyaraPlusDiag.last.lines.filter((l) => l.kind === 'mutation').length);
  out.mask = await page.evaluate(() => { const d = document.createElement('div'); d.textContent = 'contact max@mail.fr ok'; return kyaraPlusDiag.last && (document.body.append(d), kyaraPlusDiag.menu(1), d.click(), kyaraPlusDiag.stop(), kyaraPlusDiag.last.lines.find((l) => l.kind === 'event' && /email/.test(l.target))?.target); });
  const [download] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => kyaraPlusDiag.download())]);
  out.downloadName = download.suggestedFilename();
  out.dialogNone = await page.evaluate(() => kyaraPlusDiag.dialog());
  await page.evaluate(() => { const d = document.createElement('div'); d.setAttribute('role', 'dialog'); d.innerHTML = '<p>Proposer à joueur@mail.fr</p>'; document.body.append(d); });
  const [dialogFile, dialogResult] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => kyaraPlusDiag.dialog())]);
  out.dialogName = dialogFile.suggestedFilename();
  out.dialogResult = dialogResult;
  out.dialogHtml = JSON.parse(require('fs').readFileSync(await dialogFile.path(), 'utf8')).html;
  await page.evaluate(() => document.querySelector('[role="dialog"]').remove());
  out.offUnknown = await page.evaluate(() => kyaraPlusDiag.off('nimportequoi').slice(0, 40));
  out.off = await page.evaluate(() => kyaraPlusDiag.off('market-offers'));
  await page.waitForTimeout(100);
  out.boardGone = await page.evaluate(() => !document.querySelector('.kp-board'));
  out.stored = await page.evaluate(() => JSON.parse(localStorage.getItem('kyara-plus:settings')).disabledFeatures);
  await page.reload(); await page.addScriptTag({ content: script }); await page.waitForTimeout(1500);
  out.boardStillGoneAfterReload = await page.evaluate(() => !document.querySelector('.kp-board'));
  out.toastAfterReload = await page.evaluate(() => document.querySelector('.kp-toast')?.textContent ?? '');
  // the same switch stored by another version is dropped at start
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('kyara-plus:settings')); s.disabledFeatures.version = '0.0.0'; localStorage.setItem('kyara-plus:settings', JSON.stringify(s)); });
  await page.reload(); await page.addScriptTag({ content: script }); await page.waitForTimeout(1500);
  out.boardBackAfterUpdate = await page.evaluate(() => Boolean(document.querySelector('.kp-board')));
  out.storedAfterUpdate = await page.evaluate(() => JSON.parse(localStorage.getItem('kyara-plus:settings')).disabledFeatures ?? null);
  await page.evaluate(() => kyaraPlusDiag.off('market-offers')); await page.waitForTimeout(100);
  out.on = await page.evaluate(() => kyaraPlusDiag.on('market-offers'));
  await page.waitForTimeout(300);
  out.boardBack = await page.evaluate(() => Boolean(document.querySelector('.kp-board')));
  out.errors = errors;
  const ok = out.lines.some((l) => /^click button\.kp-chip/.test(l)) && /<email>/.test(out.mask ?? '') && /^kyara-diag-.*\.json$/.test(out.downloadName)
    && /aucune fenêtre/.test(out.dialogNone) && /^kyara-dialog-.*\.json$/.test(out.dialogName) && /<email>/.test(out.dialogHtml) && !/joueur@/.test(out.dialogHtml) && /role="dialog"/.test(out.dialogHtml)
    && out.oldFormatDropped && out.boardGone && out.stored.ids.join() === 'market-offers' && out.stored.version === out.version && out.boardStillGoneAfterReload
    && /désactivées par kyaraPlusDiag\.off : market-offers\./.test(out.toastAfterReload) && out.boardBackAfterUpdate && out.storedAfterUpdate === null && out.boardBack && errors.length === 0;
  console.log(JSON.stringify(out, null, 1));
  console.log(ok ? 'PASS' : 'FAIL');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();

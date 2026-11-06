// Auto-accept : gain estimé sur chaque ligne « Acceptés », total depuis l'activation (avec le détail par rareté en
// infobulle), mémorisé au rechargement et remis à zéro par « Activer ».
const { chromium } = require('playwright');
const accepted = [];
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
      if (/\/api\/trades\/offers\/.*\/accept$/.test(p)) { accepted.push(p); return json({ ok: true }); }
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
  await page.click('.kp-side__tabs [role="tab"]:has-text("Auto-accept")');
  const out = {};
  const read = () => page.evaluate(() => ({
    status: document.querySelector('.kp-auto .kp-muted')?.textContent ?? '',
    titleHidden: document.querySelector('.kp-auto__subtitle--log').hidden,
    total: document.querySelector('.kp-auto__total').textContent,
    totalGain: document.querySelector('.kp-auto__total-gain').hidden ? '' : document.querySelector('.kp-auto__total-gain').textContent + ' | ' + document.querySelector('.kp-auto__total-gain').className,
    totalTitle: document.querySelector('.kp-auto__total').title,
    rows: [...document.querySelectorAll('.kp-deal--auto')].map((r) => `${r.querySelector('.kp-name').textContent} | ${r.querySelector('.kp-gain').textContent} | ${r.querySelector('.kp-gain').className}`),
    stored: JSON.parse(localStorage.getItem('kyara-plus:settings')).autoSession ?? null,
  }));
  out.initial = await read();
  await page.click('.kp-auto__shortcut:has-text("tout")'); await page.waitForTimeout(100);
  await page.check('.kp-check__box >> nth=0'); await page.fill('.kp-check .kp-input', '1'); await page.waitForTimeout(100);
  // only the cards I lack: the received card of every accepted offer must be absent from my collection (ids multiple of 3 are owned)
  await page.check('.kp-check__box >> nth=2'); await page.waitForTimeout(100);
  out.missingStored = await page.evaluate(() => JSON.parse(localStorage.getItem('kyara-plus:settings')).autoMissingOnly);
  await page.click('.kp-auto__head .kp-btn:has-text("Activer")');
  await page.waitForFunction(() => document.querySelectorAll('.kp-deal--auto').length >= 3, null, { timeout: 20000 });
  // while it runs, the rules are frozen: controls disabled, a click on a chip changes nothing and says why
  const lockState = () => page.evaluate(() => ({
    locked: document.querySelector('.kp-auto').classList.contains('kp-auto--locked'),
    chipsDisabled: [...document.querySelectorAll('.kp-rule-chip')].every((c) => c.disabled),
    inputsDisabled: [...document.querySelectorAll('.kp-rule-row__gain')].every((i) => i.disabled) && document.querySelector('.kp-check .kp-input').disabled && [...document.querySelectorAll('.kp-check__box')].every((c) => c.disabled) && [...document.querySelectorAll('.kp-auto__shortcut')].every((b) => b.disabled),
    pressed: document.querySelectorAll('.kp-rule-chip[aria-pressed="true"]').length,
  }));
  out.lockedWhileRunning = await lockState();
  await page.evaluate(() => document.querySelector('.kp-rule-chip[aria-pressed="true"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))); await page.waitForTimeout(100);
  out.afterForcedClick = { pressed: (await lockState()).pressed, toast: await page.evaluate(() => [...document.querySelectorAll('.kp-toast')].map((t) => t.textContent).find((t) => /Arrête l’auto-accept/.test(t)) ?? '') };
  await page.click('.kp-auto__head .kp-btn:has-text("Arrêter")'); await page.waitForTimeout(300);
  out.unlockedAfterStop = await lockState();
  out.afterRun = await read();
  out.acceptedCalls = accepted.length;
  out.receivedOwned = await page.evaluate(() => JSON.parse(localStorage.getItem('kyara-plus:settings')).autoSession.log.map((e) => Number(e.received.id.slice(1)) % 3 === 0));
  // the sum shown equals the sum of the rows' badges (every exchange has known prices here)
  out.sumOfRows = await page.evaluate(() => [...document.querySelectorAll('.kp-deal--auto .kp-gain')].map((b) => Number(b.textContent.replace(/[+\s\u202f]/g, '').replace('−', '-'))).reduce((a, b) => a + b, 0));
  out.shownTotal = Number((out.afterRun.totalGain.match(/([+−±][\d\s\u202f]+) ◆/) ?? [])[1]?.replace(/[+\s\u202f]/g, '').replace('−', '-'));
  await page.reload(); await page.addScriptTag({ content: script });
  await page.waitForFunction(() => /\d+ offres?$/.test(document.querySelector('.kp-board .kp-muted')?.textContent ?? ''), null, { timeout: 30000 });
  await page.click('.kp-side__tabs [role="tab"]:has-text("Auto-accept")'); await page.waitForTimeout(200);
  out.afterReload = await read();
  await page.click('.kp-auto__shortcut:has-text("rien")'); await page.waitForTimeout(100);
  await page.fill('.kp-check .kp-input', '999999'); await page.waitForTimeout(100);
  await page.click('.kp-auto__head .kp-btn:has-text("Activer")'); await page.waitForTimeout(500);
  out.afterRestart = await read();
  out.errors = errors;
  const ok = out.initial.titleHidden && out.initial.total === ''
    && out.missingStored === true && out.receivedOwned.length >= 3 && out.receivedOwned.every((owned) => !owned)
    && out.lockedWhileRunning.locked && out.lockedWhileRunning.chipsDisabled && out.lockedWhileRunning.inputsDisabled && out.afterForcedClick.pressed === out.lockedWhileRunning.pressed && /Arrête l’auto-accept/.test(out.afterForcedClick.toast) && !out.unlockedAfterStop.locked && !out.unlockedAfterStop.chipsDisabled && !out.unlockedAfterStop.inputsDisabled
    && out.afterRun.rows.length >= 3 && out.afterRun.rows.every((r) => /kp-gain--(up|down|flat)/.test(r)) && out.sumOfRows === out.shownTotal
    && new RegExp(`^${out.afterRun.rows.length} échanges · depuis \\d\\d:\\d\\d$`).test(out.afterRun.total) && /kp-gain--up$/.test(out.afterRun.totalGain)
    && /Par rareté donnée :\n/.test(out.afterRun.totalTitle) && out.afterRun.stored.session.count === out.afterRun.rows.length
    && out.afterReload.total === out.afterRun.total && out.afterReload.totalGain === out.afterRun.totalGain && out.afterReload.rows.join() === out.afterRun.rows.join()
    && out.afterRestart.rows.length === 0 && out.afterRestart.total === '' && out.afterRestart.totalGain === '' && out.afterRestart.titleHidden && out.afterRestart.stored.session.count === 0
    && /auto-accept actif, 0 échange/.test(out.afterRestart.status) && errors.length === 0;
  console.log(JSON.stringify(out, null, 1));
  console.log(ok ? 'PASS' : 'FAIL');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();

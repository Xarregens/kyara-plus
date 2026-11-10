// Fenêtre « Échange à perte » : un « Donner » à gain négatif ouvre une confirmation (Annuler, Échap,
// « Donner quand même »), un gain positif passe direct, la puce « Confirmer les pertes » désactive la fenêtre.
const { chromium } = require('playwright');
const fs = require('fs');
const script = fs.readFileSync(process.argv[2], 'utf8');
const RARITIES = ['C', 'R', 'SR', 'E', 'L', 'M'];
const characters = Array.from({ length: 400 }, (_, i) => ({ id: `c${i}`, name: `Perso ${i}`, rarity: RARITIES[i % 6], series: `Serie ${i % 7}`, image: '' }));
const priceOf = (i) => 200 + (i * 37) % 4000;
const collection = characters.filter((_, i) => i % 3 === 0).map((c, k) => ({ characterId: c.id, qty: 1 + (k % 3), listable: 1 + (k % 3), pinned: false }));
const PAGE = 60;
const offers = Array.from({ length: PAGE }, (_, i) => ({ id: `o${i}`, status: 'open', characterId: `c${(i * 7) % 400}`, wantIds: [`c${(i * 3) % 400}`, `c${(i * 3 + 3) % 400}`, `c${(i * 3 + 6) % 400}`], user: { id: `u${i % 20}`, pseudo: `Joueur${i % 20}` }, expiresAt: new Date(Date.now() + 36e5 * 24).toISOString() }));
const fair = { enabled: true, myReceivedLeft: 1200, myFreeLeft: 4000, receivedDays: 2, pairDays: 2, freeRatio: 1.5, ignoreBelow: 50, maxRatio: 3, maxMargin: 10000, minPrice: 0 };
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  let accepts = 0;
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/TUNNEL/.test(m.text())) errors.push(m.text()); });
  await page.route('https://kyara.games/**', async (route) => {
    const url = new URL(route.request().url()); const p = url.pathname;
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'x-kyara-rush': '1' }, body: JSON.stringify(body) });
    if (p.startsWith('/api/')) {
      await new Promise((r) => setTimeout(r, 60));
      if (p === '/api/characters') return json(characters);
      if (p === '/api/me/bootstrap') return json({ me: { id: 'me' }, wishlist: [] });
      if (p === '/api/me/collection') return json(collection);
      if (p === '/api/me/collection/prices') return json(url.searchParams.get('ids').split(',').map((id) => ({ characterId: id, median7d: priceOf(Number(id.slice(1))) })));
      if (p === '/api/trades/offers/search') return json({ items: offers, more: false });
      if (p.startsWith('/api/fair-play/with/')) return json(fair);
      if (p === '/api/fair-play/prices') return json([]);
      if (p === '/api/trades/offers/mine') return json([]);
      if (p === '/api/me/trades') return json({ incoming: [], outgoing: [] });
      if (p === '/api/me/notifications') return json({ items: [] });
      if (p === '/api/me/market') return json({ listings: [], bids: [], buyOrders: [] });
      if (/\/api\/trades\/offers\/.*\/accept$/.test(p)) { accepts++; return json({ ok: true }); }
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
  const out = {}; const fail = [];
  const check = (name, ok) => { out[name] = ok; if (!ok) fail.push(name); };
  const dialogVisible = () => page.evaluate(() => !!document.querySelector('.kp-confirm'));
  const chip = page.locator('.kp-filters .kp-chip:has-text("Confirmer les pertes")');
  const lossGive = page.locator('.kp-board .kp-offer button.kp-btn:has-text("Donner"):has(.kp-gain--down)').first();
  const winGive = page.locator('.kp-board .kp-offer button.kp-btn:has-text("Donner"):has(.kp-gain--up)').first();

  check('chipShownAndOn', await chip.count() === 1 && await chip.getAttribute('aria-pressed') === 'true');
  check('lossButtonExists', await lossGive.count() === 1);

  // 1. Donner à perte -> fenêtre, aucune acceptation envoyée ; Annuler referme sans rien envoyer
  await lossGive.click(); await page.waitForTimeout(150);
  check('dialogOnLoss', await dialogVisible() && accepts === 0);
  out.dialogText = await page.evaluate(() => document.querySelector('.kp-confirm')?.textContent.replace(/\s+/g, ' ').trim().slice(0, 140));
  await page.screenshot({ path: 'shot-lossconfirm.png' });
  await page.click('.kp-confirm button:has-text("Annuler")'); await page.waitForTimeout(100);
  check('cancelCloses', !(await dialogVisible()) && accepts === 0);

  // 2. Échap referme aussi
  await lossGive.click(); await page.waitForTimeout(150);
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  check('escapeCloses', !(await dialogVisible()) && accepts === 0);

  // 3. « Donner quand même » envoie l'acceptation
  await lossGive.click(); await page.waitForTimeout(150);
  await page.click('.kp-confirm button:has-text("Donner quand même")');
  await page.waitForTimeout(800);
  check('confirmAccepts', !(await dialogVisible()) && accepts === 1);

  // 4. Gain positif : aucune fenêtre, acceptation directe
  await winGive.click(); await page.waitForTimeout(150);
  check('noDialogOnGain', !(await dialogVisible()));
  await page.waitForTimeout(800);
  check('gainAccepted', accepts === 2);

  // 5. Puce éteinte : plus de fenêtre, même à perte ; réglage mémorisé
  await chip.click(); await page.waitForTimeout(100);
  check('chipTurnsOff', await chip.getAttribute('aria-pressed') === 'false');
  check('settingSaved', await page.evaluate(() => JSON.parse(localStorage.getItem('kyara-plus:settings')).lossConfirm === false));
  const lossGive2 = page.locator('.kp-board .kp-offer button.kp-btn:has-text("Donner"):has(.kp-gain--down)').first();
  await lossGive2.click(); await page.waitForTimeout(150);
  check('noDialogWhenOff', !(await dialogVisible()));
  await page.waitForTimeout(800);
  check('lossAcceptedWhenOff', accepts === 3);

  out.errors = errors;
  check('noPageErrors', errors.length === 0);
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
  if (fail.length) { console.error(`ÉCHEC : ${fail.join(', ')}`); process.exit(1); }
})();

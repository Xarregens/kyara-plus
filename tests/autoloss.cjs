// Auto-accept : « Ou si elle me manque, perte ≤ X en donnant : (C)(U)(R)(E)(L)(M) ». Décochée (défaut) : aucune perte
// acceptée, même par une règle de rareté sans seuil. Cochée : une carte qui me manque est prise si la perte ne dépasse pas
// X, une seule fois par carte, jamais une carte déjà possédée, jamais une perte plus grosse, toujours avec un doublon
// (même case « Seulement mes doublons » décochée), seulement pour les raretés allumées (L et M éteintes par défaut), et
// sans tenir compte des seuils « gain ≥ » des lignes.
const { chromium } = require('playwright');
const fs = require('fs');
const script = fs.readFileSync(process.argv[2], 'utf8');
const accepted = [];
const card = (id, rarity, price) => ({ id, name: `Perso ${id}`, rarity, series: 'Serie', image: '', price });
const cards = [
  // reçues
  card('H', 'M', 20000), card('A', 'R', 1000), card('B', 'R', 1000), card('C', 'R', 1000), card('D', 'E', 1000), card('G', 'R', 1000), card('K', 'R', 1000),
  // à donner (toutes en double)
  card('X', 'R', 1003), card('Y', 'R', 1050), card('Z', 'R', 1002), card('W', 'R', 1001), card('V', 'U', 1020), card('Q', 'R', 900), card('P', 'M', 20003),
  // à donner, un seul exemplaire
  card('S', 'R', 1001),
];
const characters = cards.map(({ price, ...c }) => c);
const priceOf = Object.fromEntries(cards.map((c) => [c.id, c.price]));
const collection = ['X', 'Y', 'Z', 'W', 'V', 'Q', 'P'].map((id) => ({ characterId: id, qty: 3, listable: 3, pinned: false }))
  .concat([{ characterId: 'C', qty: 1, listable: 1, pinned: false }, { characterId: 'S', qty: 1, listable: 1, pinned: false }]);
const offer = (id, receive, give, user) => ({ id, status: 'open', characterId: receive, wantIds: [give], user: { id: user, pseudo: user }, expiresAt: new Date(Date.now() + 864e5).toISOString() });
const offers = [
  offer('o1', 'A', 'X', 'u1'), // manque, perte 3
  offer('o2', 'B', 'Y', 'u2'), // manque, perte 50
  offer('o3', 'C', 'Z', 'u3'), // déjà possédée, perte 2
  offer('o4', 'A', 'W', 'u4'), // même carte manquante que o1, perte 1
  offer('o5', 'D', 'V', 'u5'), // manque, U → E (règle de rareté), perte 20
  offer('o6', 'G', 'Q', 'u6'), // manque, gain +100
  offer('o7', 'H', 'P', 'u7'), // Mythique manquante contre une Mythique en double, perte 3
  offer('o8', 'K', 'S', 'u8'), // manque, perte 1, mais avec mon dernier exemplaire
];
const fair = { enabled: true, myReceivedLeft: 3000, myFreeLeft: 5000, receivedDays: 2, pairDays: 2, freeRatio: 2, ignoreBelow: 100, maxMargin: 10000, minPrice: 0 };
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
      await new Promise((r) => setTimeout(r, 30));
      if (p === '/api/characters') return json(characters);
      if (p === '/api/me/bootstrap') return json({ me: { id: 'me' }, wishlist: [] });
      if (p === '/api/me/collection') return json(collection);
      if (p === '/api/me/collection/prices') return json(url.searchParams.get('ids').split(',').map((id) => ({ characterId: id, median7d: priceOf[id] })));
      if (p === '/api/trades/offers/search') return json({ items: offers, more: false });
      if (p.startsWith('/api/fair-play/with/')) return json(fair);
      if (p === '/api/fair-play/prices') return json([]);
      if (p === '/api/trades/offers/mine') return json([]);
      if (p === '/api/me/trades') return json({ incoming: [], outgoing: [] });
      if (p === '/api/me/notifications') return json({ items: [] });
      if (p === '/api/me/market') return json({ listings: [], bids: [], buyOrders: [] });
      const m = p.match(/\/api\/trades\/offers\/(.*)\/accept$/);
      if (m) { accepted.push(m[1]); return json({ ok: true }); }
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
  const LOSS = '.kp-check:has-text("Ou si elle me manque")';
  const out = {}; const fail = [];
  const check = (name, ok) => { out[name] = ok; if (!ok) fail.push(name); };
  const run = async (ms = 6000) => {
    await page.click('.kp-auto__head .kp-btn:has-text("Activer")');
    await page.waitForTimeout(ms);
    await page.click('.kp-auto__head .kp-btn:has-text("Arrêter")'); await page.waitForTimeout(200);
  };

  // par défaut : case décochée, champ et pastilles grisés, valeur 5, pastilles C U R E allumées, L M éteintes
  const lossState = () => page.evaluate(() => { const l = [...document.querySelectorAll('.kp-check')].find((e) => /Ou si elle me manque/.test(e.textContent)); const chips = [...document.querySelectorAll('.kp-auto__loss-chip')]; return l && { checked: l.querySelector('.kp-check__box').checked, disabled: l.querySelector('.kp-input').disabled, value: l.querySelector('.kp-input').value, lit: chips.filter((c) => c.getAttribute('aria-pressed') === 'true').map((c) => c.textContent).join(''), chipsDisabled: chips.every((c) => c.disabled) }; });
  out.initial = await lossState();
  check('defaultOff', out.initial?.checked === false && out.initial.disabled && out.initial.value === '5' && out.initial.chipsDisabled);
  check('defaultRarities', out.initial?.lit === 'CURE');

  // 1. toutes les règles de rareté, pas de perte permise : seule l'offre gagnante o6 est prise
  await page.click('.kp-auto__shortcut:has-text("tout")'); await page.waitForTimeout(100);
  const MYTHIC_FLOOR = '.kp-rule-row__gain[aria-label="Gain minimum quand je donne une Mythique"]';
  await page.fill(MYTHIC_FLOOR, '200'); await page.waitForTimeout(100);
  // un seuil sur la ligne Rare et la case doublons décochée : la règle des pertes ne doit en tenir aucun compte
  await page.fill('.kp-rule-row__gain[aria-label="Gain minimum quand je donne une Rare"]', '20'); await page.waitForTimeout(100);
  await page.uncheck('.kp-check:has-text("Seulement mes doublons") .kp-check__box'); await page.waitForTimeout(100);
  await run();
  out.phase1 = [...accepted];
  check('noLossByDefault', accepted.length === 1 && accepted[0] === 'o6');

  // 2. perte ≤ 5 : une seule des deux offres de A (la moins chère, o4), ni B (−50), ni C (possédée), ni D (−20)
  await page.check(`${LOSS} .kp-check__box`); await page.waitForTimeout(100);
  check('inputEnabledWhenOn', await page.isEnabled(`${LOSS} .kp-input`) && !(await lossState()).chipsDisabled);
  check('settingsSaved', await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('kyara-plus:settings')); return s.autoLossEnabled === true && s.autoMaxLoss === 5; }));
  await run();
  out.phase2 = accepted.slice(1);
  check('smallLossOncePerCard', out.phase2.length === 1 && out.phase2[0] === 'o4');
  check('lastCopyNeverGiven', !accepted.includes('o8'));

  // 3. perte ≤ 25 : D (−20) passe, B (−50) jamais, C (possédée) jamais, A déjà reçue
  await page.fill(`${LOSS} .kp-input`, '25'); await page.waitForTimeout(100);
  await run();
  out.phase3 = accepted.slice(2);
  check('biggerLimit', out.phase3.length === 1 && out.phase3[0] === 'o5');
  check('neverOwnedOrTooBig', !accepted.includes('o2') && !accepted.includes('o3'));
  check('mythicOffByDefault', !accepted.includes('o7'));

  // 4. pastille M allumée (le seuil Mythique de 200 reste en place) : la Mythique manquante (perte 3) part
  await page.click('.kp-auto__loss-chip:has-text("M")'); await page.waitForTimeout(100);
  check('raritiesSaved', await page.evaluate(() => JSON.parse(localStorage.getItem('kyara-plus:settings')).autoLossRarities.join('') === 'CUREM'));
  await run();
  out.phase4 = accepted.slice(3);
  check('mythicWhenLit', out.phase4.length === 1 && out.phase4[0] === 'o7');
  check('lastCopyStillNever', !accepted.includes('o8'));

  out.accepted = accepted;
  out.errors = errors;
  check('noPageErrors', errors.length === 0);
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
  if (fail.length) { console.error(`ÉCHEC : ${fail.join(', ')}`); process.exit(1); }
})();

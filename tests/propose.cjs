// « Proposer une carte » du tableau des offres : clique le bouton « Proposer » du site, même renommé ou déplacé ; si aucune
// fenêtre ne s'ouvre, le tableau du site est réaffiché avec un message ; kyaraPlusDiag.board() enregistre le tableau du site.
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
// three versions of the site's board: as known, with the button renamed and moved, with a button that opens nothing
const boards = {
  known: '<section class="board"><div class="bh"><button class="btn-acc" onclick="openDialog(this)">Proposer</button></div></section>',
  renamed: '<section class="board"><div class="head-row"><button class="btn primary" onclick="openDialog(this)">Proposer un échange</button></div></section>',
  dead: '<section class="board"><div class="bh"><button class="btn-acc">Proposer</button></div></section>',
};
let boardHtml = boards.known;
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
    if (p === '/marche') return route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><html><body><header class="hdr"><nav class="nav"><a class="navlink on" href="/marche">Marché</a></nav></header><main><div class="wrap"><div class="layout"><div role="tablist"><button role="tab" class="on">Offres</button></div>${boardHtml}<aside class="chat-side"></aside></div></div></main></body></html>` });
    return route.fulfill({ status: 404, body: '' });
  });
  await page.addInitScript(() => {
    localStorage.setItem('kyara_token', 'fake'); localStorage.setItem('kyara_device', 'dev');
    window.openDialog = (button) => { const d = document.createElement('div'); d.setAttribute('role', 'dialog'); d.className = 'site-dialog'; d.textContent = 'Proposer une offre'; button.closest('section.board').append(d); };
  });
  const out = {};
  const run = async (name) => {
    boardHtml = boards[name];
    await page.goto('https://kyara.games/marche?onglet=offres');
    await page.addScriptTag({ content: script });
    await page.waitForSelector('.kp-board', { timeout: 15000 });
    await page.click('.kp-board__actions .kp-btn:has-text("Proposer une carte")');
    await page.waitForTimeout(1600);
    return page.evaluate(() => {
      const dialog = document.querySelector('.site-dialog');
      return {
        dialogVisible: Boolean(dialog && dialog.getBoundingClientRect().height > 0),
        revealed: document.body.classList.contains('kp-offers--site'),
        siteBoardVisible: [...document.querySelectorAll('main section.board > :not([role="dialog"])')].some((n) => n.getBoundingClientRect().height > 0),
        toast: [...document.querySelectorAll('.kp-toast')].map((t) => t.textContent).find((t) => /Proposer/.test(t)) ?? '',
      };
    });
  };
  out.known = await run('known');
  out.renamed = await run('renamed');
  out.dead = await run('dead');
  const [file] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => kyaraPlusDiag.board())]);
  out.boardFile = JSON.parse(fs.readFileSync(await file.path(), 'utf8'));
  out.boardFile = { name: file.suggestedFilename(), trouve: out.boardFile.trouve, boutons: out.boardFile.boutons.length, html: out.boardFile.html.length };
  out.errors = errors;
  const ok = out.known.dialogVisible && !out.known.revealed && !out.known.siteBoardVisible
    && out.renamed.dialogVisible && !out.renamed.revealed
    && !out.dead.dialogVisible && out.dead.revealed && out.dead.siteBoardVisible && /ne s’est pas ouverte/.test(out.dead.toast)
    && /^kyara-board-.*\.json$/.test(out.boardFile.name) && /button\.btn-acc/.test(out.boardFile.trouve) && out.boardFile.html > 0 && errors.length === 0;
  console.log(JSON.stringify(out, null, 1));
  console.log(ok ? 'PASS' : 'FAIL');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();

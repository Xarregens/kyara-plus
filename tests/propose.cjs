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
  // the site's window as a <dialog> element, or as a plain <div> with no dialog markup, both inside its header
  nativeDialog: '<section class="board"><div class="bh"><input class="search" placeholder="Chercher"><button class="btn-acc" onclick="openNative(this)">Proposer une carte</button></div><ul class="offers"><li>offre</li></ul></section>',
  // the site's redesigned board (08/11/2026): "Proposer une carte" in .filters .line, the window opened at the end of the page
  redesigned: '<section class="board" aria-label="Offres d’échange"><div class="filters"><div class="line"><div class="sbox"><input type="search" class="search"></div><button class="btn btn-acc btn-sm prop" type="button" onclick="openPopover(this)">Proposer une carte</button></div></div><ul class="offers"><li class="offer"><div class="acts"><button class="btn btn-ghost btn-sm">Proposer autre chose</button></div></li></ul></section>',
  plainModal: '<section class="board"><div class="bh"><input class="search" placeholder="Chercher"><button class="btn-acc" onclick="openPlain(this)">Proposer une carte</button></div><ul class="offers"><li>offre</li></ul></section>',
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
    window.openNative = (button) => { const d = document.createElement('dialog'); d.className = 'site-dialog'; d.textContent = 'Proposer une offre'; button.parentElement.append(d); d.showModal(); };
    window.openPlain = (button) => { const d = document.createElement('div'); d.className = 'site-dialog modal'; d.style.cssText = 'position:fixed;inset:20%;background:#222;color:#fff'; d.innerHTML = '<p>Proposer une offre</p><button class="close" onclick="this.parentElement.remove()">Fermer</button>'; button.parentElement.append(d); };
    // the site's popover: opened next to its button, closed by any click outside it (the user's click on our button
    // reaches the document after the script's synthetic click, and closed it before 2.35.34)
    window.openPopover = (button) => {
      const d = document.createElement('div'); d.className = 'site-dialog pop'; d.style.cssText = 'position:fixed;inset:25%;z-index:50;background:#222;color:#fff'; d.textContent = 'Proposer une offre';
      button.parentElement.append(d);
      const closeOutside = (event) => { if (!d.contains(event.target) && event.target !== button) { d.remove(); document.removeEventListener('click', closeOutside); } };
      document.addEventListener('click', closeOutside);
    };
    window.openPortal = () => { const d = document.createElement('div'); d.className = 'site-dialog portal'; d.style.cssText = 'position:fixed;inset:25%;z-index:50;background:#222;color:#fff'; d.textContent = 'Proposer une offre'; document.body.append(d); };
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
        siteBoardVisible: [...document.querySelectorAll('main section.board :is(button.btn-acc, input.search, ul.offers)')].some((n) => n.getBoundingClientRect().height > 0),
        backButton: Boolean(document.querySelector('.kp-back-to-kp')),
        toast: [...document.querySelectorAll('.kp-toast')].map((t) => t.textContent).find((t) => /Proposer/.test(t)) ?? '',
      };
    });
  };
  out.known = await run('known');
  out.renamed = await run('renamed');
  out.dead = await run('dead');
  await page.click('.kp-back-to-kp'); await page.waitForTimeout(200);
  out.afterBack = await page.evaluate(() => ({ revealed: document.body.classList.contains('kp-offers--site'), backButton: Boolean(document.querySelector('.kp-back-to-kp')) }));
  out.nativeDialog = await run('nativeDialog');
  out.redesigned = await run('redesigned');
  out.plainModal = await run('plainModal');
  await page.click('.site-dialog .close'); await page.waitForTimeout(300);
  out.afterClose = await page.evaluate(() => ({ flags: document.querySelectorAll('.kp-site-modal, .kp-site-modal-path').length, siteBoardVisible: [...document.querySelectorAll('main section.board :is(button.btn-acc, input.search, ul.offers)')].some((n) => n.getBoundingClientRect().height > 0) }));
  out.redesignedFound = await (async () => { boardHtml = boards.redesigned; await page.goto('https://kyara.games/marche?onglet=offres'); await page.addScriptTag({ content: script }); await page.waitForSelector('.kp-board'); const [file] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => kyaraPlusDiag.board())]); return JSON.parse(fs.readFileSync(await file.path(), 'utf8')).trouve; })();
  // the capture works on this page too
  await run('dead');
  const [file] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => kyaraPlusDiag.board())]);
  out.boardFile = JSON.parse(fs.readFileSync(await file.path(), 'utf8'));
  out.boardFile = { name: file.suggestedFilename(), trouve: out.boardFile.trouve, essai: out.boardFile.dernierEssai?.resultat, corps: out.boardFile.corps.length, boutons: out.boardFile.boutons.length, html: out.boardFile.html.length };
  out.errors = errors;
  const ok = out.known.dialogVisible && !out.known.revealed && !out.known.siteBoardVisible
    && out.renamed.dialogVisible && !out.renamed.revealed
    && !out.dead.dialogVisible && out.dead.revealed && out.dead.siteBoardVisible && out.dead.backButton && /ne s’est pas ouverte/.test(out.dead.toast)
    && !out.afterBack.revealed && !out.afterBack.backButton
    && out.nativeDialog.dialogVisible && !out.nativeDialog.revealed && !out.nativeDialog.siteBoardVisible
    && out.plainModal.dialogVisible && !out.plainModal.revealed && !out.plainModal.siteBoardVisible
    && /button\.btn\.btn-acc\.btn-sm\.prop "Proposer une carte"/.test(out.redesignedFound) && out.redesigned.dialogVisible && !out.redesigned.revealed && !out.redesigned.siteBoardVisible && !out.redesigned.backButton
    && out.afterClose.flags === 0 && !out.afterClose.siteBoardVisible
    && /^kyara-board-.*\.json$/.test(out.boardFile.name) && /button\.btn-acc/.test(out.boardFile.trouve) && out.boardFile.essai === 'rien' && out.boardFile.corps > 0 && out.boardFile.html > 0 && errors.length === 0;
  console.log(JSON.stringify(out, null, 1));
  console.log(ok ? 'PASS' : 'FAIL');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();

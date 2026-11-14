// Fenêtre « Proposer un échange » : filtres du script (Mes doubles / Il lui manque, Ses doubles / Il me manque) dans une
// rangée à eux, jamais en double même quand le site redessine sa rangée ; « Il me manque » agit tout de suite, « Ses doubles »
// dès que les exemplaires du partenaire sont connus (demandés en priorité).
const { chromium } = require('playwright');
const fs = require('fs');
const script = fs.readFileSync(process.argv[2], 'utf8');
const PARTNER = '9c0dd3ed-8c47-44ff-8725-4871f97a016d';
const characters = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, name: `Perso ${i + 1}`, rarity: 'R', series: 'S', image: '' }));
const collection = [{ characterId: 1, qty: 1, listable: 1 }, { characterId: 2, qty: 3, listable: 3 }];
const theirCounts = [{ characterId: 3, n: 2 }, { characterId: 4, n: 1 }, { characterId: 5, n: 3 }, { characterId: 6, n: 1 }, { characterId: 1, n: 2 }, { characterId: 2, n: 1 }];
const tile = (id) => `<li><button type="button" class="tile" aria-label="Ajouter Perso ${id}"><img alt="" src="https://cdn.kyara.games/cards/sm/${id}.webp"> <span class="nm">Perso ${id}</span> ${[3, 4, 5, 6].includes(id) ? '<span class="lack">Il me manque</span>' : ''} <span class="pr mono">10 ◆</span></button></li>`;
const chipsRow = () => `<div class="chips svelte-x"><button type="button" class="only svelte-x" aria-pressed="false">Je l’ai</button><button type="button" class="only svelte-x" aria-pressed="false">Il me manque</button></div>`;
const dialog = `<div role="dialog" aria-label="Proposer un échange à ItoVeVe"><form><div class="trays"></div><div class="shelf"><div class="tabs" role="tablist"><button type="button" role="tab" aria-selected="false">Mes cartes</button><button type="button" role="tab" aria-selected="true">Cartes de ItoVeVe</button></div><div class="filters"><input type="search">${chipsRow()}<div class="chips svelte-r" role="group" aria-label="Filtrer par rareté"><button type="button" class="chip on">Toutes</button></div></div><ul class="grid">${[1, 2, 3, 4, 5, 6].map(tile).join('')}</ul></div></form></div>`;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const order = [];
  await page.route('https://kyara.games/**', async (route) => {
    const url = new URL(route.request().url()); const p = url.pathname;
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (p.startsWith('/api/')) order.push(p);
    if (p === '/api/characters') return json(characters);
    if (p === '/api/me/bootstrap') return json({ me: { id: 'me' }, wishlist: [] });
    if (p === '/api/me/collection') return json(collection);
    if (p === '/api/me/collection/prices') { await new Promise((r) => setTimeout(r, 1500)); return json(url.searchParams.get('ids').split(',').map((id) => ({ characterId: Number(id), median7d: 10 }))); }
    if (p === `/api/trades/available/${PARTNER}`) { await new Promise((r) => setTimeout(r, 2000)); return json(theirCounts); }
    if (p.startsWith('/api/fair-play/with/')) return json({ enabled: true, freeRatio: 2, ignoreBelow: 100, receivedDays: 2, pairDays: 2, giveLeft: 3000, getLeft: 3000, giveBalanceLeft: 5000, getBalanceLeft: 5000, myReceivedLeft: 9000, theirReceivedLeft: 10000, myFreeLeft: 15000, theirFreeLeft: 20000 });
    if (p.startsWith('/api/')) return json({});
    if (p === `/profil/${PARTNER}` || p === `/amis/${PARTNER}/collection`) return route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><html><body><main><h1>ItoVeVe</h1></main></body></html>` });
    return route.fulfill({ status: 404, body: '' });
  });
  await page.addInitScript(() => { localStorage.setItem('kyara_token', 'fake'); });
  await page.goto(`https://kyara.games/profil/${PARTNER}`);
  await page.addScriptTag({ content: script });
  await page.waitForTimeout(300);
  await page.evaluate((html) => document.body.insertAdjacentHTML('beforeend', html), dialog);
  await page.waitForSelector('.kp-dialog-chips', { timeout: 5000 });
  const out = {};
  const read = () => page.evaluate(() => ({
    ourRows: document.querySelectorAll('.kp-dialog-chips').length,
    ourChips: [...document.querySelectorAll('.kp-dialog-chips button:not([hidden]):not([data-kp-add-missing])')].map((b) => b.textContent),
    siteRowHidden: getComputedStyle(document.querySelector('.filters > .chips:not(.kp-dialog-chips):not([aria-label])')).display === 'none',
    visible: [...document.querySelectorAll('ul.grid > li')].filter((li) => !li.classList.contains('kp-filtered-out')).map((li) => li.querySelector('.nm').textContent.replace('Perso ', '')).join(','),
  }));
  out.initial = await read();
  // the site redraws its chips row (new node): ours stay single
  await page.evaluate((row) => { const old = document.querySelector('.filters > .chips:not(.kp-dialog-chips):not([aria-label])'); old.insertAdjacentHTML('afterend', row); old.remove(); }, chipsRow());
  await page.waitForTimeout(300);
  out.afterRedraw = await read();
  // "Il me manque" applies at once, before the partner's counts (2 s) are known
  await page.click('.kp-dialog-chips button:has-text("Il me manque")');
  await page.waitForTimeout(300);
  out.iLackFast = await read();
  // "Ses doubles" applies once the counts arrive, and the counts were asked before the price batches
  await page.click('.kp-dialog-chips button:has-text("Il me manque")');
  await page.click('.kp-dialog-chips button:has-text("Ses doubles")');
  await page.waitForFunction(() => document.querySelectorAll('ul.grid > li.kp-filtered-out').length > 0, null, { timeout: 6000 }).catch(() => {});
  out.theirDoubles = await read();
  out.countsBeforePrices = order.indexOf(`/api/trades/available/${PARTNER}`) < order.indexOf('/api/me/collection/prices');
  // switching to my tab shows my chips only, still one row
  await page.evaluate(() => { const tabs = document.querySelectorAll('[role="tab"]'); tabs[1].setAttribute('aria-selected', 'false'); tabs[0].setAttribute('aria-selected', 'true'); });
  await page.waitForTimeout(300);
  out.mineTab = await read();
  // the same dialog opened from a private message (/amis/<id>/collection) gets the same filters and the fair-play block
  await page.goto(`https://kyara.games/amis/${PARTNER}/collection`);
  await page.addScriptTag({ content: script });
  await page.waitForTimeout(300);
  await page.evaluate((html) => document.body.insertAdjacentHTML('beforeend', html), dialog.replace('<div class="trays"></div>', '<div class="trays"><section class="tray mine"><header><h3>Tu donnes</h3> <span class="total mono">≈ 400 ◆</span></header><ul class="slots"></ul></section><section class="tray"><header><h3>Tu reçois</h3> <span class="total mono">≈ 100 ◆</span></header><ul class="slots"></ul></section></div><div class="verdict"></div>'));
  await page.waitForSelector('.kp-dialog-chips', { timeout: 5000 }).catch(() => {});
  await page.waitForSelector('.kp-verdict', { timeout: 5000 }).catch(() => {});
  out.fromFriends = await page.evaluate(() => ({ chips: document.querySelectorAll('.kp-dialog-chips').length, verdict: Boolean(document.querySelector('.kp-verdict')) }));
  out.errors = errors;
  const ok = out.initial.ourRows === 1 && out.initial.ourChips.join() === 'Ses doubles,Il me manque' && out.initial.siteRowHidden && out.initial.visible === '1,2,3,4,5,6'
    && out.afterRedraw.ourRows === 1 && out.afterRedraw.ourChips.join() === 'Ses doubles,Il me manque' && out.afterRedraw.siteRowHidden
    && out.iLackFast.visible === '3,4,5,6'
    && out.theirDoubles.visible === '1,3,5' && out.countsBeforePrices
    && out.mineTab.ourRows === 1 && out.mineTab.ourChips.join() === 'Mes doubles,Il lui manque'
    && out.fromFriends.chips === 1 && out.fromFriends.verdict && errors.length === 0;
  console.log(JSON.stringify(out, null, 1));
  console.log(ok ? 'PASS' : 'FAIL');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();

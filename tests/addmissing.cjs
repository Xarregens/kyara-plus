// Fenêtre « Proposer un échange » : bouton « + Ce qui me manque » (onglet du partenaire). Ajoute une fois chacune les cartes
// affichées que je n'ai pas, saute celles déjà dans son plateau et celles cachées par un filtre, s'arrête si le site refuse.
const { chromium } = require('playwright');
const fs = require('fs');
const script = fs.readFileSync(process.argv[2], 'utf8');
const PARTNER = '9c0dd3ed-8c47-44ff-8725-4871f97a016d';
const characters = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, name: `Perso ${i + 1}`, rarity: i + 1 >= 9 && i + 1 <= 12 ? 'L' : 'R', series: 'S', image: '' }));
const collection = [{ characterId: 1, qty: 1, listable: 1 }, { characterId: 2, qty: 3, listable: 3 }];
const tile = (id) => `<li><button type="button" class="tile" aria-label="Ajouter Perso ${id}"><img alt="" src="https://cdn.kyara.games/cards/sm/${id}.webp"> <span class="nm">Perso ${id}</span> <span class="pr mono">10 ◆</span></button></li>`;
// tuile réelle (relevé du 17/11/2026) : lettre de rareté .seal, légende .cap avec « Il me manque » (.lack) posé par le site
const realTile = (id, lack, seal) => `<li><button type="button" class="tile" aria-label="Ajouter Perso ${id}"><span class="card"><div class="shw"><img alt="" src="https://cdn.kyara.games/cards/sm/${id}.webp"><div class="top"><span class="name">Perso ${id}</span> <span class="seal">${seal}</span></div></div></span> <span class="cap"><span class="pr mono">10 ◆</span> ${lack ? '<span class="lack">Il me manque</span>' : ''}</span></button></li>`;
const slot = (id) => `<li><img src="https://cdn.kyara.games/cards/sm/${id}.webp"></li>`;
// fenêtre redessinée (relevé du 17/11/2026) : plateaux dans section.table, un inventaire par joueur (section.inv.mine /
// section.inv.theirs, celui qui n'est pas à l'écran a la classe « hid »), filtres du site dans .filters
const inv = (side, ids, hid) => `<section class="inv ${side} svelte-adlc8v${hid ? ' hid' : ''}"><header class="inv-head"><h3>${side === 'mine' ? 'Mes cartes' : 'Cartes de ItoVeVe'}</h3></header> <div class="filters svelte-adlc8v"><input type="search"> <div class="chips svelte-adlc8v"><button type="button" class="only svelte-adlc8v" aria-pressed="false">Je l’ai</button><button type="button" class="only svelte-adlc8v" aria-pressed="false">Ses doubles</button></div> <div class="rbar-o"><div class="rbar" role="group" aria-label="Rareté"><button type="button" class="r all on">Toutes</button></div></div></div> <div class="inv-scroll"><ul class="grid svelte-adlc8v">${ids.map(tile).join('')}</ul></div></section>`;
const dialog = (inTray, n = 8) => `<style>.hid{display:none}</style><div role="dialog" aria-label="Proposer un échange à ItoVeVe"><div class="body"><form class="desk svelte-adlc8v" data-step="theirs"><div role="status" class="strip idle"><div class="scale"><span class="amt"><small>Tu donnes</small><b class="mono">0 ◆</b></span> <span class="amt r"><small>Tu reçois</small><b class="mono">0 ◆</b></span></div><div class="say"><p class="v-d">…</p></div></div> <section class="table"><section class="tray mine compact"><header><h3>Tu donnes</h3></header><ul class="slots"></ul></section> <div class="swap">⇅</div> <section class="tray compact"><header><h3>Tu reçois</h3></header><ul class="slots">${inTray.map(slot).join('')}</ul></section></section> ${inv('mine', [1, 2], true)} ${inv('theirs', Array.from({ length: n }, (_, i) => i + 1), false)} <div class="foot"><div class="steps" role="tablist"><button type="button" role="tab" aria-selected="false">Tu donnes</button><button type="button" role="tab" aria-selected="true">Tu reçois</button></div></div></form></div></div>`;
// the site's behaviour: a click on a tile adds the card to the partner's tray, up to `cap` cards
const siteBehaviour = (cap) => {
  window.__clicks = [];
  document.querySelector('[role="dialog"] section.inv.theirs ul.grid').addEventListener('click', (e) => {
    const t = e.target.closest('button.tile'); if (!t) return;
    const id = t.querySelector('img').src.match(/(\d+)\.webp/)[1];
    window.__clicks.push(Number(id));
    const slots = document.querySelector('section.tray:not(.mine) .slots');
    if (slots.children.length >= cap) return;
    slots.insertAdjacentHTML('beforeend', `<li><img src="https://cdn.kyara.games/cards/sm/${id}.webp"></li>`);
  });
};
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://kyara.games/**', async (route) => {
    const url = new URL(route.request().url()); const p = url.pathname;
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (p === '/api/characters') return json(characters);
    if (p === '/api/me/bootstrap') return json({ me: { id: 'me' }, wishlist: [] });
    if (p === '/api/me/collection') return json(collection);
    if (p === '/api/me/collection/prices') return json(url.searchParams.get('ids').split(',').map((id) => ({ characterId: Number(id), median7d: 10 })));
    if (p === `/api/trades/available/${PARTNER}`) return json(characters.map(({ id }) => ({ characterId: id, n: id === 5 ? 3 : 1 })));
    if (p.startsWith('/api/fair-play/with/')) return json({ enabled: true, freeRatio: 2, ignoreBelow: 100, giveLeft: 3000, getLeft: 3000, giveBalanceLeft: 5000, getBalanceLeft: 5000, myReceivedLeft: 9000, theirReceivedLeft: 10000, myFreeLeft: 15000, theirFreeLeft: 20000 });
    if (p.startsWith('/api/')) return json({});
    if (p === `/profil/${PARTNER}`) return route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><html><body><main><h1>ItoVeVe</h1></main></body></html>` });
    return route.fulfill({ status: 404, body: '' });
  });
  await page.addInitScript(() => { localStorage.setItem('kyara_token', 'fake'); });
  const out = {};
  const btn = '[data-kp-add-missing]';
  const state = () => page.evaluate(() => ({
    label: document.querySelector('[data-kp-add-missing]')?.textContent,
    disabled: document.querySelector('[data-kp-add-missing]')?.disabled,
    tray: [...document.querySelectorAll('section.tray:not(.mine) .slots img')].map((i) => Number(i.src.match(/(\d+)\.webp/)[1])).join(','),
    clicks: window.__clicks.join(','),
    toast: [...document.querySelectorAll('.kp-toast')].map((t) => t.textContent).pop() ?? null,
  }));
  // A: card 4 already in their tray, card 8 hidden by "Ses doubles"? no — use our filter on 7 via the class the script sets
  await page.goto(`https://kyara.games/profil/${PARTNER}`);
  await page.addScriptTag({ content: script });
  await page.waitForTimeout(300);
  await page.evaluate((html) => document.body.insertAdjacentHTML('beforeend', html), dialog([4]));
  await page.evaluate(siteBehaviour, 99);
  await page.waitForFunction(() => /\(\d+\)/.test(document.querySelector('[data-kp-add-missing]')?.textContent ?? ''), null, { timeout: 5000 });
  await page.waitForTimeout(300);
  out.before = await state();
  // a site filter (here: cards 3, 4, 6, 7, 8 taken out of the grid by the site) leaves only card 5 among the missing ones
  await page.evaluate(() => { window.__kept = [...document.querySelectorAll('section.inv.theirs ul.grid > li')].filter((li) => ![1, 2, 5].includes(Number(li.querySelector('img').src.match(/(\d+)\.webp/)[1]))); window.__kept.forEach((li) => li.remove()); });
  await page.waitForTimeout(300);
  out.filtered = await state();
  await page.evaluate(() => { const grid = document.querySelector('section.inv.theirs ul.grid'); window.__kept.forEach((li) => grid.append(li)); [...grid.children].sort((a, b) => a.querySelector('img').src.match(/(\d+)\.webp/)[1] - b.querySelector('img').src.match(/(\d+)\.webp/)[1]).forEach((li) => grid.append(li)); });
  await page.waitForTimeout(300);
  await page.click(btn);
  await page.waitForTimeout(800);
  out.after = await state();
  out.dialogOpen = await page.evaluate(() => Boolean(document.querySelector('[role="dialog"]')));
  // B: the site stops accepting after 2 cards
  await page.evaluate(() => document.querySelector('[role="dialog"]').remove());
  await page.evaluate((html) => document.body.insertAdjacentHTML('beforeend', html), dialog([]));
  await page.evaluate(siteBehaviour, 2);
  await page.waitForFunction(() => /\(6\)/.test(document.querySelector('[data-kp-add-missing]')?.textContent ?? ''), null, { timeout: 5000 }).catch(() => {});
  await page.click(btn);
  await page.waitForTimeout(1000);
  out.capped = await state();
  // C: 30 cards, card 30 already twice in their tray (one place only): the 19 first missing cards in display order
  await page.evaluate(() => document.querySelector('[role="dialog"]').remove());
  await page.evaluate((html) => document.body.insertAdjacentHTML('beforeend', html), dialog([30, 30], 30));
  await page.evaluate(siteBehaviour, 99);
  await page.waitForFunction(() => /\(19\)/.test(document.querySelector('[data-kp-add-missing]')?.textContent ?? ''), null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(2500);
  out.bigLabel = (await state()).label;
  const expected = await page.evaluate(() => [...document.querySelectorAll('section.inv.theirs ul.grid > li')].map((li, i) => ({ id: Number(li.querySelector('img').src.match(/(\d+)\.webp/)[1]), at: li.style.order ? Number(li.style.order) : i })).sort((a, b) => a.at - b.at).map((x) => x.id).filter((id) => id > 2 && id !== 30).slice(0, 19).join(','));
  const t0 = Date.now();
  await page.click(btn);
  await page.waitForFunction(() => /\(0\)/.test(document.querySelector('[data-kp-add-missing]').textContent), null, { timeout: 5000 });
  out.bigMs = Date.now() - t0;
  await page.waitForTimeout(300);
  out.big = await state();
  out.bigOk = out.big.clicks === expected;
  out.bigTitle = await page.evaluate(() => document.querySelector('[data-kp-add-missing]').title);
  // my inventory on screen (partner's hidden by the site): our row goes with it, counts shown on my tiles too
  await page.evaluate(() => { document.querySelector('section.inv.theirs').classList.add('hid'); document.querySelector('section.inv.mine').classList.remove('hid'); });
  await page.waitForTimeout(300);
  out.mineHidden = await page.evaluate(() => document.querySelector('[data-kp-add-missing]').getClientRects().length === 0 && document.querySelectorAll('.kp-dialog-chips').length === 1 && document.querySelector('.kp-dialog-chips').closest('section.inv.theirs') !== null);
  out.myCounts = await page.evaluate(() => [...document.querySelectorAll('section.inv.mine .kp-count')].map((b) => b.textContent).join(','));
  // D: pastille L turned off → Légendaires (9–12) never added; the choice survives a reload (next trade)
  const openDialog = async () => {
    await page.evaluate((html) => document.body.insertAdjacentHTML('beforeend', html), dialog([], 12));
    await page.evaluate(siteBehaviour, 99);
  };
  await page.evaluate(() => document.querySelector('[role="dialog"]').remove());
  await openDialog();
  await page.waitForFunction(() => /\(10\)/.test(document.querySelector('[data-kp-add-missing]')?.textContent ?? ''), null, { timeout: 5000 }).catch(() => {});
  out.allRarities = (await state()).label;
  await page.click('[data-kp-add-rarity="L"]');
  await page.waitForTimeout(300);
  out.noLegend = (await state()).label;
  await page.goto(`https://kyara.games/profil/${PARTNER}`);
  await page.addScriptTag({ content: script });
  await page.waitForTimeout(300);
  await openDialog();
  await page.waitForFunction(() => /\(\d+\)/.test(document.querySelector('[data-kp-add-missing]')?.textContent ?? ''), null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);
  out.reload = await page.evaluate(() => ({ L: document.querySelector('[data-kp-add-rarity="L"]').getAttribute('aria-pressed'), R: document.querySelector('[data-kp-add-rarity="R"]').getAttribute('aria-pressed'), pills: [...document.querySelectorAll('[data-kp-add-rarity]')].map((b) => b.textContent).join(''), label: document.querySelector('[data-kp-add-missing]').textContent }));
  await page.click(btn);
  await page.waitForTimeout(800);
  out.reloadAdded = await state();
  // E: the site's mark is the truth: card 1 and 2 owned per my collection but marked missing, 3 marked owned (no .lack)
  // while absent from my collection, 4 a Mythique (seal M) marked missing, catalog says R
  await page.evaluate(() => document.querySelector('[role="dialog"]').remove());
  await page.evaluate((html) => document.body.insertAdjacentHTML('beforeend', html), dialog([], 0).replace('<ul class="grid svelte-adlc8v"></ul></div></section> <div class="foot">', `<ul class="grid svelte-adlc8v">${[[1, true, 'R'], [2, true, 'R'], [3, false, 'R'], [4, true, 'M'], [5, false, 'R']].map(([id, lack, seal]) => realTile(id, lack, seal)).join('')}</ul></div></section> <div class="foot">`));
  await page.evaluate(siteBehaviour, 99);
  await page.waitForTimeout(500);
  out.siteMark = (await state()).label;
  await page.click('[data-kp-add-rarity="M"]');
  await page.waitForTimeout(300);
  out.siteMarkNoM = (await state()).label;
  await page.click('[data-kp-add-rarity="M"]');
  out.errors = errors;
  const ok = out.before.label === '+ Ce qui me manque (5)' && out.filtered.label === '+ Ce qui me manque (1)'
    && out.after.tray === '4,3,5,6,7,8' && out.after.clicks === '3,5,6,7,8' && out.after.label === '+ Ce qui me manque (0)' && out.after.disabled && /5 cartes ajoutées/.test(out.after.toast)
    && out.dialogOpen
    && out.capped.tray === '3,4' && out.capped.clicks === '3,4,5,6,7' && /n’accepte plus/.test(out.capped.toast)
    && out.bigLabel === '+ Ce qui me manque (19)' && out.bigOk && out.big.tray.split(',').length === 21 && /8 autres non ajoutées/.test(out.big.toast) && out.big.disabled && /maximum/.test(out.bigTitle)
    && out.allRarities === '+ Ce qui me manque (10)' && out.noLegend === '+ Ce qui me manque (6)'
    && out.reload.L === 'false' && out.reload.R === 'true' && out.reload.pills === 'CUREL' + 'M' && out.reload.label === '+ Ce qui me manque (6)'
    && out.reloadAdded.clicks.split(',').sort((a, b) => a - b).join(',') === '3,4,5,6,7,8'
    && out.mineHidden && out.bigMs < 400 && out.siteMark === '+ Ce qui me manque (3)' && out.siteMarkNoM === '+ Ce qui me manque (2)' && out.myCounts === '×1,×3' && errors.length === 0;
  console.log(JSON.stringify(out, null, 1));
  console.log(ok ? 'PASS' : 'FAIL');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();

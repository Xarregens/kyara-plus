// Fenêtre « Proposer un échange » : bouton « + Ce qui me manque » (onglet du partenaire). Ajoute une fois chacune les cartes
// affichées que je n'ai pas, saute celles déjà dans son plateau et celles cachées par un filtre, s'arrête si le site refuse.
const { chromium } = require('playwright');
const fs = require('fs');
const script = fs.readFileSync(process.argv[2], 'utf8');
const PARTNER = '9c0dd3ed-8c47-44ff-8725-4871f97a016d';
const characters = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, name: `Perso ${i + 1}`, rarity: i + 1 >= 9 && i + 1 <= 12 ? 'L' : 'R', series: 'S', image: '' }));
const collection = [{ characterId: 1, qty: 1, listable: 1 }, { characterId: 2, qty: 3, listable: 3 }];
const tile = (id) => `<li><button type="button" class="tile" aria-label="Ajouter Perso ${id}"><img alt="" src="https://cdn.kyara.games/cards/sm/${id}.webp"> <span class="nm">Perso ${id}</span> <span class="pr mono">10 ◆</span></button></li>`;
const slot = (id) => `<li><img src="https://cdn.kyara.games/cards/sm/${id}.webp"></li>`;
const dialog = (inTray, n = 8) => `<div role="dialog" aria-label="Proposer un échange à ItoVeVe"><form><div class="trays"><section class="tray mine"><header><h3>Tu donnes</h3> <span class="total mono">≈ 0 ◆</span></header><ul class="slots"></ul></section><section class="tray"><header><h3>Tu reçois</h3> <span class="total mono">≈ 0 ◆</span></header><ul class="slots">${inTray.map(slot).join('')}</ul></section></div><div class="verdict"></div><div class="shelf"><div class="tabs" role="tablist"><button type="button" role="tab" aria-selected="false">Mes cartes</button><button type="button" role="tab" aria-selected="true">Cartes de ItoVeVe</button></div><div class="filters"><input type="search"><div class="chips svelte-x"><button type="button" class="only svelte-x">Je l’ai</button></div></div><ul class="grid">${Array.from({ length: n }, (_, i) => i + 1).map(tile).join('')}</ul></div></form></div>`;
// the site's behaviour: a click on a tile adds the card to the partner's tray, up to `cap` cards
const siteBehaviour = (cap) => {
  window.__clicks = [];
  document.querySelector('[role="dialog"] .shelf ul.grid').addEventListener('click', (e) => {
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
  // with "Ses doubles" on, only card 5 (3 copies) stays visible among the missing ones
  await page.click('.kp-dialog-chips button:has-text("Ses doubles")');
  await page.waitForTimeout(300);
  out.filtered = await state();
  await page.click('.kp-dialog-chips button:has-text("Ses doubles")');
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
  const expected = await page.evaluate(() => [...document.querySelectorAll('ul.grid > li')].map((li, i) => ({ id: Number(li.querySelector('img').src.match(/(\d+)\.webp/)[1]), at: li.style.order ? Number(li.style.order) : i })).sort((a, b) => a.at - b.at).map((x) => x.id).filter((id) => id > 2 && id !== 30).slice(0, 19).join(','));
  await page.click(btn);
  await page.waitForTimeout(1500);
  out.big = await state();
  out.bigOk = out.big.clicks === expected;
  out.bigTitle = await page.evaluate(() => document.querySelector('[data-kp-add-missing]').title);
  // my tab: button hidden
  await page.evaluate(() => { const tabs = document.querySelectorAll('[role="tab"]'); tabs[1].setAttribute('aria-selected', 'false'); tabs[0].setAttribute('aria-selected', 'true'); });
  await page.waitForTimeout(300);
  out.mineHidden = await page.evaluate(() => document.querySelector('[data-kp-add-missing]').hidden && document.querySelector('.kp-add-rarities').hidden);
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
  out.errors = errors;
  const ok = out.before.label === '+ Ce qui me manque (5)' && out.filtered.label === '+ Ce qui me manque (1)'
    && out.after.tray === '4,3,5,6,7,8' && out.after.clicks === '3,5,6,7,8' && out.after.label === '+ Ce qui me manque (0)' && out.after.disabled && /5 cartes ajoutées/.test(out.after.toast)
    && out.dialogOpen
    && out.capped.tray === '3,4' && out.capped.clicks === '3,4,5,6,7' && /n’accepte plus/.test(out.capped.toast)
    && out.bigLabel === '+ Ce qui me manque (19)' && out.bigOk && out.big.tray.split(',').length === 21 && /8 autres non ajoutées/.test(out.big.toast) && out.big.disabled && /maximum/.test(out.bigTitle)
    && out.allRarities === '+ Ce qui me manque (10)' && out.noLegend === '+ Ce qui me manque (6)'
    && out.reload.L === 'false' && out.reload.R === 'true' && out.reload.pills === 'CUREL' + 'M' && out.reload.label === '+ Ce qui me manque (6)'
    && out.reloadAdded.clicks.split(',').sort((a, b) => a - b).join(',') === '3,4,5,6,7,8'
    && out.mineHidden && errors.length === 0;
  console.log(JSON.stringify(out, null, 1));
  console.log(ok ? 'PASS' : 'FAIL');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();

// Fenêtre « Proposer un échange » (relevé du 17/11/2026) : le site montre les cartes du partenaire 60 par 60, de la
// plus rare à la moins rare, chaque carte est un dessin animé lourd. Le script ne doit jamais tout charger (2.35.44 le
// faisait : page lente, ventilateurs). « + Ce qui me manque » compte d'après les données (collection, catalogue,
// /trades/available), et au clic se sert des filtres du site (« Il me manque », une rareté à la fois) puis les remet.
// Avec seulement C et U allumées : 20 cartes C / U ajoutées, peu de cartes dessinées, filtres du joueur rendus.
const { chromium } = require('playwright');
const fs = require('fs');
const script = fs.readFileSync(process.argv[2], 'utf8');
const PARTNER = '9c0dd3ed-8c47-44ff-8725-4871f97a016d';
const N = 4856;
const seals = ['M', 'L', 'E', 'R', 'U', 'C'];
const rarityOf = (i) => seals[Math.min(5, Math.floor(i / (N / 6)))];
const owned = (i) => i % 5 === 0; // one card in five already in my collection
const BASE = 100000;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const characters = Array.from({ length: N }, (_, i) => ({ id: BASE + i, name: `P${i}`, rarity: rarityOf(i), series: 'S', image: '' }));
  await page.route('https://kyara.games/**', async (route) => {
    const url = new URL(route.request().url()); const p = url.pathname;
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (p === '/api/characters') return json(characters);
    if (p === '/api/me/collection') return json(characters.filter((_, i) => owned(i)).map((c) => ({ characterId: c.id, qty: 1, listable: 0 })));
    if (p === '/api/me/bootstrap') return json({ me: { id: 'me' }, wishlist: [] });
    if (p === `/api/trades/available/${PARTNER}`) return json(characters.map((c) => ({ characterId: c.id, n: 1 })));
    if (p.startsWith('/api/')) return json({});
    if (p === `/profil/${PARTNER}`) return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body><main></main></body></html>' });
    return route.fulfill({ status: 404, body: '' });
  });
  await page.addInitScript(() => { localStorage.setItem('kyara_token', 'fake'); localStorage.setItem('kyara-plus:settings', JSON.stringify({ addMissingRarities: ['C', 'U'] })); });
  await page.goto(`https://kyara.games/profil/${PARTNER}`);
  await page.addScriptTag({ content: script });
  await page.waitForTimeout(300);
  // a small Svelte-like site: filters + "Voir plus" change the state, the grid is redrawn once in a microtask
  await page.evaluate(({ N, seals, BASE }) => { window.__open = () => {
    const rarityOf = (i) => seals[Math.min(5, Math.floor(i / (N / 6)))];
    const owned = (i) => i % 5 === 0;
    const letters = ['C', 'U', 'R', 'E', 'L', 'M'];
    const bar = `<div class="rbar-o"><div class="rbar" role="group" aria-label="Rareté"><button type="button" class="r all on" aria-pressed="true" title="Toutes"><span class="g"></span><span class="n">Toutes</span></button> ${letters.map((l) => `<button type="button" class="r" aria-pressed="false" title="${l}"><span class="g">${l}</span></button>`).join('')}</div></div>`;
    const inv = (side, hid) => `<section class="inv ${side}${hid ? ' hid' : ''}"><div class="filters"><input type="search"> <div class="chips"><button type="button" class="only" aria-pressed="false">Je l’ai</button><button type="button" class="only" aria-pressed="false">Il me manque</button></div> ${bar}</div><div class="inv-scroll"><ul class="grid"></ul></div></section>`;
    document.body.insertAdjacentHTML('beforeend', `<style>.hid{display:none}</style><div role="dialog" aria-label="Proposer un échange à ItoVeVe"><form class="desk" data-step="mine"><div class="strip"><span class="amt"><b>0 ◆</b></span><span class="amt r"><b>0 ◆</b></span></div><section class="table"><section class="tray mine"><ul class="slots"></ul></section><section class="tray"><ul class="slots"></ul></section></section>${inv('mine', false)}${inv('theirs', true)}</form></div>`);
    window.__maxTiles = 0; window.__drawn = 0;
    const section = document.querySelector('section.inv.theirs');
    const scroll = section.querySelector('.inv-scroll'); const grid = scroll.querySelector('ul.grid');
    const st = { limit: 60, lack: false, rar: null };
    let queued = false;
    const tile = (i) => `<li><button type="button" class="tile"><span class="card"><img alt="" src="https://cdn.kyara.games/cards/sm/${BASE + i}.webp"><div class="top"><span class="seal">${rarityOf(i)}</span></div></span> <span class="cap"><span class="pr mono">10 ◆</span> ${owned(i) ? '' : '<span class="lack">Il me manque</span>'}</span></button></li>`;
    const draw = () => {
      queued = false;
      const list = Array.from({ length: N }, (_, i) => i).filter((i) => (!st.lack || !owned(i)) && (!st.rar || rarityOf(i) === st.rar));
      const shown = list.slice(0, st.limit);
      grid.innerHTML = shown.map(tile).join('');
      window.__drawn += shown.length; window.__maxTiles = Math.max(window.__maxTiles, shown.length);
      let more = scroll.querySelector('button.more');
      if (list.length <= st.limit) more?.remove();
      else {
        if (!more) { more = document.createElement('button'); more.type = 'button'; more.className = 'btn more'; more.addEventListener('click', () => { st.limit += 60; redraw(); }); scroll.append(more); }
        more.textContent = `Voir plus (${list.length - st.limit} autres)`;
      }
      const lackBtn = [...section.querySelectorAll('.chips button')][1];
      lackBtn.setAttribute('aria-pressed', String(st.lack)); lackBtn.classList.toggle('on', st.lack);
      for (const b of section.querySelectorAll('.rbar button')) {
        const on = b.classList.contains('all') ? st.rar == null : b.querySelector('.g').textContent === st.rar;
        b.setAttribute('aria-pressed', String(on)); b.classList.toggle('on', on);
      }
    };
    const redraw = () => { if (!queued) { queued = true; queueMicrotask(draw); } };
    [...section.querySelectorAll('.chips button')][1].addEventListener('click', () => { st.lack = !st.lack; st.limit = 60; redraw(); });
    for (const b of section.querySelectorAll('.rbar button')) b.addEventListener('click', () => { st.rar = b.classList.contains('all') ? null : b.querySelector('.g').textContent; st.limit = 60; redraw(); });
    grid.addEventListener('click', (e) => {
      const t = e.target.closest('button.tile'); if (!t) return;
      document.querySelectorAll('section.tray')[1].querySelector('.slots').insertAdjacentHTML('beforeend', `<li><img src="${t.querySelector('img').src}"></li>`);
    });
    draw();
    const m = document.querySelector('section.inv.mine ul.grid'); m.innerHTML = Array.from({ length: 60 }, (_, i) => tile(i)).join('');
    m.insertAdjacentHTML('afterend', '<button type="button" class="btn more">Voir plus (4000 autres)</button>');
    window.__st = st;
  }; window.__open(); }, { N, seals, BASE });
  await page.waitForTimeout(1500);
  const out = {};
  out.mineTilesAfterWait = await page.evaluate(() => document.querySelectorAll('section.inv.mine button.tile').length);
  await page.evaluate(() => { document.querySelector('section.inv.mine').classList.add('hid'); document.querySelector('section.inv.theirs').classList.remove('hid'); });
  await page.waitForFunction(() => /\(\d+\)/.test(document.querySelector('[data-kp-add-missing]')?.textContent ?? ''), null, { timeout: 10000 }).catch(() => {});
  out.label = await page.evaluate(() => [document.querySelector('[data-kp-add-missing]').textContent, document.querySelector('[data-kp-add-missing]').disabled]);
  out.title = await page.evaluate(() => document.querySelector('[data-kp-add-missing]').title);
  const t1 = Date.now();
  await page.click('[data-kp-add-missing]');
  await page.waitForFunction(() => /ajoutée/.test([...document.querySelectorAll('.kp-toast')].map((t) => t.textContent).join(' ')), null, { timeout: 10000 }).catch(() => {});
  out.addMs = Date.now() - t1;
  out.toast = await page.evaluate(() => [...document.querySelectorAll('.kp-toast')].map((t) => t.textContent).pop());
  out.after = await page.evaluate((BASE) => {
    const imgs = [...document.querySelectorAll('section.tray')[1].querySelectorAll('img')].map((i) => Number(i.src.match(/(\d+)\.webp/)[1]) - BASE);
    return { n: new Set(imgs).size, ids: imgs.slice(0, 5), maxTiles: window.__maxTiles, drawn: window.__drawn, filters: [...document.querySelectorAll('section.inv.theirs .filters button')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent.trim()).join(','), label: document.querySelector('[data-kp-add-missing]').textContent };
  }, BASE);
  out.rarities = [...new Set(out.after.ids.map(rarityOf))].join('');
  out.allOk = await page.evaluate((args) => [...document.querySelectorAll('section.tray')[1].querySelectorAll('img')].every((i) => { const k = Number(i.src.match(/(\d+)\.webp/)[1]) - args.BASE; return k % 5 !== 0 && ['U', 'C'].includes(args.seals[Math.min(5, Math.floor(k / (args.N / 6)))]); }), { BASE, seals, N });
  // filters remembered: the player turns on "Il me manque" and rarity L on the partner's side, then opens a new trade
  await page.click('section.inv.theirs .chips button:has-text("Il me manque")');
  await page.click('section.inv.theirs .rbar button:has(.g:text-is("L"))');
  await page.waitForTimeout(300);
  out.saved = await page.evaluate(() => JSON.parse(localStorage.getItem('kyara-plus:settings')).tradeFilters);
  await page.evaluate(() => { document.querySelector('[role="dialog"]').remove(); document.querySelector('style').remove(); window.__open(); document.querySelector('section.inv.mine').classList.add('hid'); document.querySelector('section.inv.theirs').classList.remove('hid'); });
  await page.waitForTimeout(800);
  out.reopened = await page.evaluate(() => ({ lack: window.__st.lack, rar: window.__st.rar, pressed: [...document.querySelectorAll('section.inv.theirs .filters button')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent.trim()).join(',') }));
  // turned off again by the player: the next trade opens without them
  await page.click('section.inv.theirs .rbar button.all');
  await page.click('section.inv.theirs .chips button:has-text("Il me manque")');
  await page.waitForTimeout(300);
  await page.evaluate(() => { document.querySelector('[role="dialog"]').remove(); document.querySelector('style').remove(); window.__open(); document.querySelector('section.inv.mine').classList.add('hid'); document.querySelector('section.inv.theirs').classList.remove('hid'); });
  await page.waitForTimeout(800);
  out.cleared = await page.evaluate(() => ({ lack: window.__st.lack, rar: window.__st.rar }));
  out.errors = errors;
  const expected = Array.from({ length: N }, (_, i) => i).filter((i) => !owned(i) && ['C', 'U'].includes(rarityOf(i))).length;
  const ok = out.mineTilesAfterWait === 60 && out.label[0] === '+ Ce qui me manque (20)' && !out.label[1] && new RegExp(`\\(${expected} en tout\\)`).test(out.title.replace(/\s/g, ' '))
    && out.after.n === 20 && out.allOk && out.after.maxTiles <= 120 && out.after.filters === 'Toutes' && /20 cartes ajoutées/.test(out.toast) && out.after.label === '+ Ce qui me manque (0)' && out.saved?.theirs?.chips?.join() === 'Il me manque' && out.saved.theirs.rarities.join() === 'L' && out.reopened.lack === true && out.reopened.rar === 'L' && out.cleared.lack === false && out.cleared.rar === null && errors.length === 0;
  console.log(JSON.stringify(out, null, 1));
  console.log(ok ? 'PASS' : 'FAIL');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();

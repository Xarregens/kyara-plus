// Fenêtre « Proposer un échange » (relevé du 17/11/2026) : le site trie les cartes du partenaire de la plus rare à la
// moins rare et n'en montre que 60, « Voir plus (N autres) » en ajoute 60 par clic. Avec seulement C et U allumées,
// « + Ce qui me manque » ne doit pas rester grisé à 0 : toutes les cartes sont chargées d'un coup (un seul dessin du
// site), l'inventaire à l'écran d'abord puis l'autre, et le bouton compte les Communes / Peu communes qui manquent.
const { chromium } = require('playwright');
const fs = require('fs');
const script = fs.readFileSync(process.argv[2], 'utf8');
const PARTNER = '9c0dd3ed-8c47-44ff-8725-4871f97a016d';
const N = 4856;
const seals = ['M', 'L', 'E', 'R', 'U', 'C'];
const rarityOf = (i) => seals[Math.min(5, Math.floor(i / (N / 6)))];
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://kyara.games/**', async (route) => {
    const url = new URL(route.request().url()); const p = url.pathname;
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (p === '/api/characters') return json([]);
    if (p === '/api/me/collection') return json([]);
    if (p === '/api/me/bootstrap') return json({ me: { id: 'me' }, wishlist: [] });
    if (p.startsWith('/api/')) return json(p.startsWith('/api/trades/available/') ? [] : {});
    if (p === `/profil/${PARTNER}`) return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body><main></main></body></html>' });
    return route.fulfill({ status: 404, body: '' });
  });
  await page.addInitScript(() => { localStorage.setItem('kyara_token', 'fake'); localStorage.setItem('kyara-plus:settings', JSON.stringify({ addMissingRarities: ['C', 'U'] })); });
  await page.goto(`https://kyara.games/profil/${PARTNER}`);
  await page.addScriptTag({ content: script });
  await page.waitForTimeout(300);
  // a small Svelte-like site: "Voir plus" raises the limit, the grid is drawn once in a microtask
  await page.evaluate(({ N, seals }) => {
    const rarityOf = (i) => seals[Math.min(5, Math.floor(i / (N / 6)))];
    const tile = (i, base) => `<li><button type="button" class="tile"><span class="card"><img alt="" src="https://cdn.kyara.games/cards/sm/${base + i}.webp"><div class="top"><span class="seal">${rarityOf(i)}</span></div></span> <span class="cap"><span class="pr mono">10 ◆</span> <span class="lack">Il me manque</span></span></button></li>`;
    const inv = (side, hid) => `<section class="inv ${side}${hid ? ' hid' : ''}"><div class="filters"><input type="search"><div class="chips"><button type="button" class="only">Il me manque</button></div></div><div class="inv-scroll"><ul class="grid"></ul></div></section>`;
    document.body.insertAdjacentHTML('beforeend', `<style>.hid{display:none}</style><div role="dialog" aria-label="Proposer un échange à ItoVeVe"><form class="desk" data-step="mine"><div class="strip"><span class="amt"><b>0 ◆</b></span><span class="amt r"><b>0 ◆</b></span></div><section class="table"><section class="tray mine"><ul class="slots"></ul></section><section class="tray"><ul class="slots"></ul></section></section>${inv('mine', false)}${inv('theirs', true)}</form></div>`);
    window.__draws = { mine: 0, theirs: 0 };
    for (const side of ['mine', 'theirs']) {
      const section = document.querySelector(`section.inv.${side}`);
      const scroll = section.querySelector('.inv-scroll'); const grid = scroll.querySelector('ul.grid');
      const base = side === 'mine' ? 1 : 100000;
      let limit = 60; let queued = false;
      const draw = () => {
        queued = false; window.__draws[side]++;
        const shown = grid.children.length;
        grid.insertAdjacentHTML('beforeend', Array.from({ length: Math.min(limit, N) - shown }, (_, k) => tile(shown + k, base)).join(''));
        let more = scroll.querySelector('button.more');
        if (limit >= N) return more?.remove();
        if (!more) { more = document.createElement('button'); more.type = 'button'; more.className = 'btn more'; more.addEventListener('click', () => { limit += 60; if (!queued) { queued = true; queueMicrotask(draw); } }); scroll.append(more); }
        more.textContent = `Voir plus (${N - limit} autres)`;
      };
      draw();
      section.querySelector('ul.grid').addEventListener('click', (e) => {
        const t = e.target.closest('button.tile'); if (!t) return;
        (window.__times ??= []).push(performance.now()); document.querySelectorAll('section.tray')[1].querySelector('.slots').insertAdjacentHTML('beforeend', `<li><img src="${t.querySelector('img').src}"></li>`);
      });
    }
  }, { N, seals });
  const t0 = Date.now();
  await page.waitForFunction((N) => document.querySelectorAll('section.inv.theirs button.tile').length === N && document.querySelectorAll('section.inv.mine button.tile').length === N, N, { timeout: 30000 }).catch(() => {});
  const out = { loadMs: Date.now() - t0 };
  out.draws = await page.evaluate(() => window.__draws);
  // the player goes to "Tu reçois"
  await page.evaluate(() => { document.querySelector('section.inv.mine').classList.add('hid'); document.querySelector('section.inv.theirs').classList.remove('hid'); });
  await page.waitForFunction(() => /\(20\)/.test(document.querySelector('[data-kp-add-missing]')?.textContent ?? ''), null, { timeout: 10000 }).catch(() => {});
  out.label = await page.evaluate(() => [document.querySelector('[data-kp-add-missing]').textContent, document.querySelector('[data-kp-add-missing]').disabled]);
  const t1 = Date.now();
  await page.click('[data-kp-add-missing]');
  await page.waitForFunction(() => document.querySelectorAll('section.tray')[1].querySelectorAll('img').length === 20, null, { timeout: 10000 }).catch(() => {});
  out.addMs = Date.now() - t1;
  out.added = await page.evaluate(() => [...new Set([...document.querySelectorAll('section.tray')[1].querySelectorAll('img')].map((i) => i.src))].length);
  out.addedRarities = await page.evaluate(() => { const ids = new Set([...document.querySelectorAll('section.tray')[1].querySelectorAll('img')].map((i) => i.src)); return [...new Set([...document.querySelectorAll('section.inv.theirs button.tile')].filter((t) => ids.has(t.querySelector('img').src)).map((t) => t.querySelector('.seal').textContent))].join(''); });
  out.inPageMs = await page.evaluate(() => Math.round(window.__times.at(-1) - window.__times[0]));
  out.errors = errors;
  const ok = out.draws.mine <= 3 && out.draws.theirs <= 3 && out.label[0] === '+ Ce qui me manque (20)' && !out.label[1] && out.added === 20 && /^[CU]+$/.test(out.addedRarities) && errors.length === 0;
  console.log(JSON.stringify(out, null, 1));
  console.log(ok ? 'PASS' : 'FAIL');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();

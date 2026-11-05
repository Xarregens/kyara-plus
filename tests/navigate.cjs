// Navigation interne du site (sans rechargement) vers /collection : la barre de filtres des albums doit apparaître même
// quand le site navigue avec une référence au pushState natif prise avant l'injection du script (cas des routeurs
// Svelte/SvelteKit), que le script ne peut donc pas intercepter. Vérifie aussi le retour vers une autre page.
const { chromium } = require('playwright');
const fs = require('fs');
const script = fs.readFileSync(process.argv[2], 'utf8');
const series = ['Serie A', 'Serie B', 'Serie C'];
const characters = []; let id = 0;
for (const s of series) for (let i = 0; i < 6; i++) characters.push({ id: id++, name: `${s} ${i}`, rarity: 'R', series: s, image: '' });
const collection = characters.filter((c) => !c.name.endsWith(' 0')).map((c) => ({ characterId: c.id, qty: 1, listable: 1 }));
const albumsHtml = `<div class="al-tools"><span>Trier</span></div><ul class="albums">${series.map((s) => `<li><button class="album"><span class="a-name">${s}</span></button></li>`).join('')}</ul>`;
const homeHtml = '<h1>Accueil</h1>';
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
    if (p === '/api/me/progress') return json({ now: new Date().toISOString(), series: [] });
    if (p.startsWith('/api/')) return json({});
    if (p === '/' ) return route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><html><body><header class="hdr"><a class="navlink" href="/collection">Collection</a></header><main>${homeHtml}</main></body></html>` });
    return route.fulfill({ status: 404, body: '' });
  });
  // the site's router keeps the native pushState before the userscript exists, like SvelteKit does
  await page.addInitScript(() => {
    localStorage.setItem('kyara_token', 'fake');
    const nativePush = history.pushState;
    window.siteGoto = (path, html) => { nativePush.call(history, {}, '', path); document.querySelector('main').innerHTML = html; };
  });
  await page.goto('https://kyara.games/');
  await page.addScriptTag({ content: script });
  await page.waitForTimeout(300);
  const out = {};
  out.barOnHome = await page.evaluate(() => Boolean(document.querySelector('.kp-album-filters')));
  await page.evaluate(([html]) => siteGoto('/collection', html), [albumsHtml]);
  const t0 = Date.now();
  await page.waitForSelector('.kp-album-filters', { timeout: 5000 }).catch(() => {});
  out.barAfterSiteNavigation = await page.evaluate(() => Boolean(document.querySelector('main .al-tools + .kp-album-filters')));
  out.delayMs = Date.now() - t0;
  out.chips = await page.evaluate(() => [...document.querySelectorAll('.kp-album-filters .kp-gem-chip')].map((c) => c.textContent).join(' '));
  await page.evaluate(([html]) => siteGoto('/', html), [homeHtml]);
  await page.waitForTimeout(300);
  out.barRemovedOnLeave = await page.evaluate(() => !document.querySelector('.kp-album-filters'));
  // back with the browser's own history (popstate), the view re-rendered by the site
  await page.evaluate(([html]) => { window.addEventListener('popstate', () => { document.querySelector('main').innerHTML = html; }, { once: true }); history.back(); }, [albumsHtml]);
  await page.waitForSelector('.kp-album-filters', { timeout: 5000 }).catch(() => {});
  out.barAfterBack = await page.evaluate(() => Boolean(document.querySelector('main .al-tools + .kp-album-filters')));
  out.errors = errors;
  const ok = !out.barOnHome && out.barAfterSiteNavigation && out.chips === 'C U R E L M' && out.barRemovedOnLeave && out.barAfterBack && errors.length === 0;
  console.log(JSON.stringify(out, null, 1));
  console.log(ok ? 'PASS' : 'FAIL');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();

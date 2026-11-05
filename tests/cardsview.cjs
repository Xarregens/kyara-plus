// Collection, "Cartes" view: no album list, but the cards' own "Afficher plus" and the site's profile menu (closes on
// any click outside). The album filters saved from the Albums view must not click that button, so the menu stays open.
const { chromium } = require('playwright');
const fs = require('fs');
const script = fs.readFileSync(process.argv[2], 'utf8');
const characters = Array.from({ length: 40 }, (_, i) => ({ id: i, name: `Perso ${i}`, rarity: 'R', series: `Serie ${i % 5}`, image: '' }));
const collection = characters.map((c) => ({ characterId: c.id, qty: 1, listable: 1 }));
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://kyara.games/**', async (route) => {
    const url = new URL(route.request().url()); const p = url.pathname;
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (p === '/api/characters') return json(characters);
    if (p === '/api/me/bootstrap') return json({ me: { id: 'me', chakra: 1017 }, wishlist: [] });
    if (p === '/api/me/collection') return json(collection);
    if (p === '/api/me/progress') return json({ series: [{ series: 'Serie 0', size: 8, chakra: 50, completedAt: '2026-11-01T00:00:00Z', claimed: true }] });
    if (p.startsWith('/api/')) return json({});
    if (p === '/collection') return route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><html><body>
      <header class="hdr"><nav class="nav"><a class="navlink" href="/marche">Marché</a></nav><span class="bal">1 017</span><button id="avatar">E</button><div id="menu" hidden>MaxSkill</div></header>
      <main><div class="grid">${characters.map((c) => `<div class="cell"><a class="slot" href="/carte/${c.id}">${c.name}</a></div>`).join('')}</div><div class="more"><button type="button">Afficher plus</button></div>
      <script>
        window.__clicks = 0;
        document.querySelector('.more button').addEventListener('click', () => { window.__clicks++; const cell = document.createElement('div'); cell.className = 'cell'; cell.innerHTML = '<a class="slot" href="/carte/99">Perso 99</a>'; document.querySelector('.grid').append(cell); });
        const menu = document.getElementById('menu'), avatar = document.getElementById('avatar');
        avatar.addEventListener('click', () => { menu.hidden = !menu.hidden; });
        document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target) && !avatar.contains(e.target)) menu.hidden = true; });
      </script></main></body></html>` });
    return route.fulfill({ status: 404, body: '' });
  });
  await page.addInitScript(() => { localStorage.setItem('kyara_token', 'fake'); localStorage.setItem('kyara-plus:settings', JSON.stringify({ albumHideClaimed: true, albumMinSize: 5 })); });
  await page.goto('https://kyara.games/collection');
  await page.addScriptTag({ content: script });
  await page.waitForTimeout(1500);
  await page.click('#avatar');
  await page.waitForTimeout(1200);
  const out = await page.evaluate(() => ({
    clicks: window.__clicks, menuOpen: !document.getElementById('menu').hidden,
    loadingClass: document.body.classList.contains('kp-albums-loading-state'),
    morePointerEvents: getComputedStyle(document.querySelector('.more')).pointerEvents
  }));
  out.errors = errors;
  const ok = out.clicks === 0 && out.menuOpen && !out.loadingClass && out.morePointerEvents === 'auto' && errors.length === 0;
  console.log(JSON.stringify(out));
  console.log(ok ? 'PASS' : 'FAIL');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();

const { chromium } = require('playwright');
const fs = require('fs');
const script = fs.readFileSync(process.argv[2], 'utf8');
// 300 series: 1 to 8 cards each, the first batches are mostly small series (hidden by "min persos 5")
const series = Array.from({ length: 300 }, (_, i) => ({ name: `Serie ${String(i).padStart(3, '0')}`, size: i < 150 ? 1 + (i % 3) : 5 + (i % 4) }));
const characters = []; let id = 0;
for (const s of series) for (let i = 0; i < s.size; i++) characters.push({ id: id++, name: `${s.name} ${i}`, rarity: 'R', series: s.name, image: '' });
const collection = characters.map((c) => ({ characterId: c.id, qty: 1, listable: 1 }));
const progress = { series: series.filter((s, i) => s.size >= 5 && i % 2 === 0).map((s) => ({ series: s.name, size: s.size, chakra: 50, completedAt: '2026-11-01T00:00:00Z', claimed: true })) };
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
    if (p === '/api/me/progress') return json(progress);
    if (p.startsWith('/api/')) return json({});
    if (p === '/collection') return route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><html><body><main><div class="al-tools"></div><ul class="albums"></ul><div class="more"><button type="button">Afficher plus</button></div>
      <script>
        const names = ${JSON.stringify(series.map((s) => s.name))}; let shown = 0; let clicks = 0;
        function more() { const ul = document.querySelector('ul.albums'); for (const n of names.slice(shown, shown + 30)) { const li = document.createElement('li'); li.innerHTML = '<button class="album"><span class="a-name">' + n + '</span></button>'; ul.append(li); } shown += 30; if (shown >= names.length) document.querySelector('.more').remove(); }
        document.querySelector('.more button').addEventListener('click', () => { clicks++; window.__clicks = clicks; setTimeout(more, 20); });
        more();
      </script></main></body></html>` });
    return route.fulfill({ status: 404, body: '' });
  });
  await page.addInitScript(() => { localStorage.setItem('kyara_token', 'fake'); localStorage.setItem('kyara-plus:settings', JSON.stringify({})); });
  await page.goto('https://kyara.games/collection');
  await page.addScriptTag({ content: script });
  const seen = []; let flashes = 0; for (let i = 0; i < 150; i++) { await page.waitForTimeout(20); flashes += await page.evaluate(() => [...document.querySelectorAll("main ul.albums > li")].filter((li) => !li.classList.contains("kp-checked") && getComputedStyle(li).display !== "none").length); seen.push(await page.evaluate(() => (document.body.classList.contains("kp-albums-loading-state") ? "L" : "-") + (document.querySelector(".kp-albums-loading")?.hidden ? "" : "n"))); } await page.waitForTimeout(1500);
  const out = await page.evaluate(() => ({
    loaded: document.querySelectorAll('main ul.albums > li').length,
    visible: [...document.querySelectorAll('main ul.albums > li')].filter((li) => !li.classList.contains('kp-filtered-out')).length,
    clicks: window.__clicks ?? 0,
    moreStillThere: !!document.querySelector('.more button'), loadingNow: document.body.classList.contains('kp-albums-loading-state'), opacityNow: getComputedStyle(document.querySelector('ul.albums')).opacity,
  }));
  out.unfilteredItemsSeenOnScreen = flashes; out.timeline = seen.filter((x, i) => i % 6 === 0).join(""); out.errors = errors;
  console.log(JSON.stringify(out));
  await browser.close();
})();

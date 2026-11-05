const { chromium } = require('playwright');
const fs = require('fs');
const script = fs.readFileSync(process.argv[2], 'utf8');
const characters = Array.from({ length: 30 }, (_, i) => ({ id: `c${i}`, name: `Perso ${i}`, rarity: 'R', series: `Serie ${i % 3}`, image: '' }));
const collection = characters.filter((_, i) => i % 3 !== 2).map((c) => ({ characterId: c.id, qty: 1, listable: 1 }));
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ acceptDownloads: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://kyara.games/**', async (route) => {
    const url = new URL(route.request().url()); const p = url.pathname;
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (p === '/api/characters') return json(characters);
    if (p === '/api/me/bootstrap') return json({ me: { id: 'me', email: 'secret@x', pseudo: 'moi' }, wishlist: [], claimedAlbums: ['Serie 0'] });
    if (p === '/api/me/collection') return json(collection);
    if (p === '/api/me/missions') return json({ albums: [{ series: 'Serie 0', claimedAt: '2026-11-01T10:00:00Z' }, { series: 'Serie 1', claimedAt: null }] });
    if (p.startsWith('/api/')) return json({});
    if (p === '/missions') return route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><html><body><main><section aria-labelledby="albums-t"><header><h2 id="albums-t">Séries finies</h2></header><ul class="quests"><li class="q"><span class="name">Serie 0</span><span class="done">Réclamée</span><img src="/x.png"></li><li class="q"><span class="name">Serie 1</span><button class="claim">Réclamer</button></li></ul></section></main>
      <script>fetch('/api/me/missions').then((r) => r.json()); const x = new XMLHttpRequest(); x.open('GET', '/api/me/bootstrap'); x.send();</script></body></html>` });
    if (p === '/collection') return route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><html><body><main><div class="al-tools"></div><ul class="albums"><li><button class="album"><span class="a-name">Serie 0</span></button></li><li><button class="album"><span class="a-name">Serie 1</span></button></li></ul></main></body></html>` });
    return route.fulfill({ status: 404, body: '' });
  });
  await page.addInitScript(() => { localStorage.setItem('kyara_token', 'fake'); });
  await page.goto('https://kyara.games/missions');
  await page.addScriptTag({ content: script });
  await page.waitForTimeout(800);
  // the site's own requests ran before the script: trigger them again now that the taps are installed
  await page.evaluate(() => { fetch('/api/me/missions'); const x = new XMLHttpRequest(); x.open('GET', '/api/me/bootstrap'); x.send(); });
  await page.waitForTimeout(500);
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.evaluate(() => window.kyaraPlusSeries.download())]);
  const survey = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  console.log(JSON.stringify({
    page: survey.page, requetes: survey.requetes.map((r) => `${r.kind} ${r.status} ${r.path} ${JSON.stringify(r.body).slice(0, 60)}`),
    missions: survey.missions && { items: survey.missions.items, boutons: survey.missions.boutonsReclamer, htmlHasImgSrc: /src=/.test(survey.missions.html), premier: survey.missions.premiersItems[0] },
    completude: survey.completude, bootstrap: survey.bootstrap, catalogueFields: survey.catalogue.cardFields, errors
  }, null, 1));
  await browser.close();
})();

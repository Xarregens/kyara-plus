const { chromium } = require('playwright');
const fs = require('fs');
const script = fs.readFileSync(process.argv[2], 'utf8');
const characters = Array.from({ length: 20 }, (_, i) => ({ id: i, name: `Perso ${i}`, rarity: 'R', series: 'S', image: '' }));
let held = 434;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://kyara.games/**', async (route) => {
    const url = new URL(route.request().url()); const p = url.pathname;
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (p === '/api/characters') return json(characters);
    if (p === '/api/me/bootstrap') return json({ me: { id: 'me', chakra: 2557, chakraHeld: held }, wishlist: [] });
    if (p === '/api/me/collection') return json([]);
    if (p === '/api/me/market') return json({ listings: [], bids: [], buyOrders: [], holds: [] });
    if (p === '/api/me/trades') return json({ incoming: [], outgoing: [] });
    if (p === '/api/trades/offers/mine') return json([]);
    if (p === '/api/me/notifications') return json({ items: [] });
    if (p === '/api/me/market/history') return json({ items: [], trades: [], offers: [], more: false });
    if (p.startsWith('/api/')) return json({});
    if (p === '/marche') return route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><html><body><header class="hdr"><nav class="nav"><a class="navlink" href="/marche">Marché</a></nav><div class="pills"><button class="pill"><span class="ic">▬</span> <span class="n">5</span>/<span>10</span></button><button class="pill chakra"><span class="ic">◇</span> <span class="n">2 557</span></button></div></header><main><div role="tablist"><button role="tab" class="on">Mon activité</button></div><div role="tabpanel"></div><section class="board"></section><aside class="chat-side"></aside></main>
    <script>fetch('/api/me/bootstrap');</script></body></html>` });
    return route.fulfill({ status: 404, body: '' });
  });
  await page.addInitScript(() => { localStorage.setItem('kyara_token', 'fake'); });
  await page.goto('https://kyara.games/marche?onglet=ventes');
  await page.addScriptTag({ content: script });
  await page.waitForSelector('.kp-held', { timeout: 15000 });
  await page.waitForTimeout(1500);
  const out = {};
  out.badge = await page.evaluate(() => { const b = document.querySelector('.kp-held'); return { text: b.textContent, hidden: b.hidden, title: b.title, after: b.previousElementSibling?.outerHTML, inHeader: !!b.closest('header.hdr') }; });
  out.activityPills = await page.evaluate(() => [...document.querySelectorAll('.kp-act__stat')].map((s) => s.textContent));
  // the site re-fetches bootstrap (XHR) with a new held amount: the badge must follow without any script request
  held = 1200;
  await page.evaluate(() => { const x = new XMLHttpRequest(); x.open('GET', '/api/me/bootstrap'); x.send(); });
  await page.waitForTimeout(600);
  out.afterSiteXhr = await page.evaluate(() => document.querySelector('.kp-held').textContent);
  // held back to zero: badge hidden
  held = 0;
  await page.evaluate(() => fetch('/api/me/bootstrap'));
  await page.waitForTimeout(600);
  out.afterZero = await page.evaluate(() => ({ hidden: document.querySelector('.kp-held').hidden, text: document.querySelector('.kp-held').textContent }));
  // the site re-renders its header: the badge is re-attached
  await page.evaluate(() => { const pills = document.querySelector('header.hdr .pills'); pills.innerHTML = pills.innerHTML; });
  held = 50; await page.evaluate(() => fetch('/api/me/bootstrap')); await page.waitForTimeout(600);
  out.afterHeaderRerender = await page.evaluate(() => { const b = document.querySelector('header.hdr .kp-held'); return b ? { text: b.textContent, after: b.previousElementSibling?.className } : null; });
  out.errors = errors;
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();

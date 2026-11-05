// Smoke test: fake kyara.games + fake /api, inject the userscript, observe the offers board.
const { chromium } = require('playwright');
const fs = require('fs');
const scriptPath = process.argv[2];
const script = fs.readFileSync(scriptPath, 'utf8');

const RARITIES = ['C', 'R', 'SR', 'E', 'L', 'M'];
const characters = Array.from({ length: 400 }, (_, i) => ({ id: `c${i}`, name: `Perso ${i}`, rarity: RARITIES[i % 6], series: `Serie ${i % 7}`, image: '' }));
const priceOf = (i) => 200 + (i * 37) % 4000;
const collection = characters.filter((_, i) => i % 3 === 0).map((c, k) => ({ characterId: c.id, qty: 1 + (k % 3), listable: 1 + (k % 3), pinned: false }));
const PAGE = 60, PAGES = 5;
const offers = Array.from({ length: PAGE * PAGES }, (_, i) => ({
  id: `o${i}`, status: 'open', characterId: `c${(i * 7) % 400}`, wantIds: [`c${(i * 3) % 400}`, `c${(i * 3 + 3) % 400}`, `c${(i * 3 + 6) % 400}`],
  user: { id: `u${i % 20}`, pseudo: `Joueur${i % 20}` }, expiresAt: new Date(Date.now() + 36e5 * 24).toISOString()
}));
const fair = { enabled: true, myReceivedLeft: 1200, myFreeLeft: 4000, receivedDays: 2, pairDays: 2, freeRatio: 1.5, ignoreBelow: 50, maxRatio: 3, maxMargin: 10000, minPrice: 0 };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const log = [];
  const t0 = Date.now();
  const requests = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log.push(`[console.${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => log.push(`[pageerror] ${e.message}`));
  await page.route('https://kyara.games/**', async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'x-kyara-rush': '1' }, body: JSON.stringify(body) });
    if (p.startsWith('/api/')) {
      requests.push([Date.now() - t0, p + url.search.slice(0, 40)]);
      await new Promise((r) => setTimeout(r, 120)); // network latency
      if (p === '/api/characters') return json(characters);
      if (p === '/api/me/bootstrap') return json({ me: { id: 'me' }, wishlist: ['c7', 'c14'] });
      if (p === '/api/me/collection') return json(collection);
      if (p === '/api/me/collection/prices') return json(url.searchParams.get('ids').split(',').map((id) => ({ characterId: id, median7d: priceOf(Number(id.slice(1))) })));
      if (p === '/api/trades/offers/search') { const n = Number(url.searchParams.get('page') || 1); return json({ items: offers.slice((n - 1) * PAGE, n * PAGE), more: n < PAGES }); }
      if (p.startsWith('/api/fair-play/with/')) return json(fair);
      if (p === '/api/fair-play/prices') return json([]);
      if (p === '/api/trades/offers/mine') return json([]);
      if (p === '/api/me/trades') return json({ incoming: [], outgoing: [] });
      if (p === '/api/me/notifications') return json({ items: [] });
      if (p === '/api/me/market') return json({ listings: [], bids: [], buyOrders: [] });
      if (p === '/api/config') return json({});
      log.push(`[unhandled api] ${p}`); return json({ error: 'not_found' }, 404);
    }
    if (p.startsWith('/cards/')) return route.fulfill({ status: 200, contentType: 'image/webp', body: Buffer.alloc(0) });
    if (p === '/marche') return route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><html><head><title>Kyara</title></head><body>
      <header class="hdr"><nav class="nav"><a class="navlink on" href="/marche">Marché</a></nav></header>
      <main><div class="wrap"><div class="layout"><div role="tablist"><button role="tab" class="on">Offres</button></div>
      <section class="board"><div class="bh"><button class="btn-acc">Proposer</button></div><p>site board</p></section>
      <aside class="chat-side"><p>site chat</p></aside></div></div></main></body></html>` });
    return route.fulfill({ status: 404, body: '' });
  });
  await page.addInitScript(() => { localStorage.setItem('kyara_token', 'fake'); localStorage.setItem('kyara_device', 'dev'); });
  await page.goto('https://kyara.games/marche?onglet=offres');
  await page.evaluate(() => {
    window.__t = { start: performance.now(), marks: {} };
    const mark = (name, test) => { if (!(name in window.__t.marks) && test()) window.__t.marks[name] = Math.round(performance.now() - window.__t.start); };
    new MutationObserver(() => {
      mark('tableau', () => document.querySelector('.kp-board .kp-offer'));
      mark('jauge', () => document.querySelector('.kp-fair strong'));
      mark('barres', () => document.querySelector('.kp-fair .kp-bar'));
      mark('pastille', () => document.querySelector('.kp-option .kp-cost'));
      mark('analyse terminée', () => /\d+ offres?$/.test(document.querySelector('.kp-board .kp-muted')?.textContent ?? ''));
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
    window.__renders = 0;
    new MutationObserver((records) => { if (records.some((r) => r.target.classList?.contains('kp-board__list'))) window.__renders++; }).observe(document.body, { childList: true, subtree: true });
  });
  await page.addScriptTag({ content: script });
  const tStart = Date.now();
  const timeline = {};
  const waitFor = async (name, selector, timeout = 20000) => {
    try { await page.waitForSelector(selector, { timeout }); timeline[name] = Date.now() - tStart; } catch { timeline[name] = `absent après ${timeout} ms`; }
  };
  await waitFor('tableau', '.kp-board .kp-offer');
  await waitFor('jauge (barres)', '.kp-fair .kp-bars, .kp-fair strong');
  await page.waitForFunction(() => /\d+ offres?$/.test(document.querySelector('.kp-board .kp-muted')?.textContent ?? ''), null, { timeout: 30000 }).catch(() => log.push('[timeout] scan never reached READY'));
  timeline['analyse terminée'] = Date.now() - tStart;
  const marks = await page.evaluate(() => ({ ...window.__t.marks, boardRebuilds: window.__renders }));
  const snapshot = await page.evaluate(() => ({
    status: document.querySelector('.kp-board .kp-muted')?.textContent,
    offers: document.querySelectorAll('.kp-board .kp-offer').length,
    tiles: document.querySelectorAll('.kp-option').length,
    chips: [...document.querySelectorAll('.kp-cost')].reduce((acc, el) => { const t = [...el.classList].find((c) => /^kp-cost--(none|free|gift|over)$/.test(c)); acc[t] = (acc[t] ?? 0) + 1; return acc; }, {}),
    chipSamples: [...new Set([...document.querySelectorAll('.kp-option .kp-cost')].map((el) => el.textContent))].slice(0, 6),
    bars: [...document.querySelectorAll('.kp-bar')].map((b) => b.textContent.trim().replace(/\s+/g, ' ')),
    fairText: document.querySelector('.kp-fair strong')?.textContent,
    sideProfit: document.querySelectorAll('.kp-profit').length,
    sideBangers: document.querySelectorAll('.kp-deal').length,
    toasts: [...document.querySelectorAll('[class*="toast"]')].map((t) => t.textContent),
  }));
  // Click "Donner" on the first tile to check the busy path (accept endpoint is unhandled -> error toast expected)
  await page.screenshot({ path: `shot-${require('path').basename(scriptPath, '.js')}.png`, fullPage: false });
  console.log(JSON.stringify({ marks, timeline, snapshot, apiRequests: requests.length, firstRequests: requests.slice(0, 9).map(([t, u]) => `${t} ${u.slice(0, 45)}`), ledgerRequests: requests.filter(([, u]) => /offers\/mine|me\/trades|notifications|me\/market/.test(u)).map(([t, u]) => `${t} ${u}`), errors: log }, null, 1));
  await browser.close();
})();

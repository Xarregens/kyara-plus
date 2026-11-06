// « Proposer un échange » : bloc Fair-play du script sous la bande du site, avec ce que l'échange retire aux barres de
// chaque joueur et aux limites entre eux, d'après les totaux des deux plateaux et la réponse /fair-play/with/<joueur>
// (formes de l'enregistrement kyaraPlusDiag.dialog() du 06/11/2026).
const { chromium } = require('playwright');
const fs = require('fs');
const script = fs.readFileSync(process.argv[2], 'utf8');
const PARTNER = '9c0dd3ed-8c47-44ff-8725-4871f97a016d';
const fair = { enabled: true, freeRatio: 2, ignoreBelow: 100, maxRatio: 3, maxMargin: { C: 50, U: 50, R: 60, E: 100, L: 250, M: 800 }, minPrice: { C: 1, U: 1, R: 3, E: 15, L: 100, M: 500 }, receivedDays: 2, pairDays: 2, giveLeft: 3000, getLeft: 3000, giveBalanceLeft: 5000, getBalanceLeft: 5000, myReceivedLeft: 9215, theirReceivedLeft: 10000, myFreeLeft: 15726, theirFreeLeft: 20000 };
const tray = (mine, total, cards) => `<section class="tray svelte-io2rn7${mine ? ' mine' : ''}"><header class="svelte-io2rn7"><h3>${mine ? 'Tu donnes' : 'Tu reçois'}</h3> <span class="total mono svelte-io2rn7">≈ ${total} ◆</span></header><ul class="slots">${cards.map(([id, name, price]) => `<li style="--rc: #F5C518;"><button type="button" class="slot" aria-label="Retirer ${name}"><img alt="" src="https://cdn.kyara.games/cards/sm/${id}.webp"> <span class="x" aria-hidden="true">×</span></button> <span class="nm">${name}</span> <span class="pr mono">${price} ◆</span></li>`).join('')}</ul> <label class="ch"><span>Chakra</span> <input type="number" min="0" step="1" inputmode="numeric"> <b aria-hidden="true">◆</b></label></section>`;
const dialog = `<div role="dialog" aria-modal="true" tabindex="-1" class="box wide" aria-label="Proposer un échange à ItoVeVe"><div class="head"><h2>Proposer un échange à ItoVeVe</h2> <button class="x" type="button" aria-label="Fermer">×</button></div><div class="body"><form class="form"><div class="trays">${tray(true, '423', [[3568, 'Yotsuba Koiwai', 100], [123528, 'Yuu Koito', 100], [140637, 'Adam', 23]])} <div class="swap" aria-hidden="true">⇄</div> ${tray(false, '1 100', [[260329, 'Chisato Nishikigi', '1 100']])}</div> <div role="status" class="verdict gift"><div class="bar" aria-hidden="true"><span style="width: 28%;"></span></div> <p class="v-h">ItoVeVe te fait un don de 254 ◆</p> <p class="v-d">C’est permis : encore 2 746 ◆ de dons possibles entre vous sur 48 h après cet échange.</p></div> <div class="shelf"><div class="tabs"><button role="tab" aria-selected="true">Mes cartes</button><button role="tab" aria-selected="false">Cartes de ItoVeVe</button></div><div class="chips"></div><ul class="grid"></ul></div><div class="actions"><button type="button">Annuler</button><button type="submit">Envoyer la proposition</button></div></form></div></div>`;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let fairCalls = 0;
  await page.route('https://kyara.games/**', async (route) => {
    const url = new URL(route.request().url()); const p = url.pathname;
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (p === `/api/fair-play/with/${PARTNER}`) { fairCalls++; return json(fair); }
    if (p === '/api/characters') return json([]);
    if (p === '/api/me/collection') return json([]);
    if (p === '/api/me/bootstrap') return json({ me: { id: 'me' }, wishlist: [] });
    if (p.startsWith('/api/trades/available/')) return json([]);
    if (p.startsWith('/api/')) return json({});
    if (p === `/profil/${PARTNER}`) return route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><html><body><header class="hdr"></header><main><h1>ItoVeVe</h1><button id="open">Proposer un échange</button></main></body></html>` });
    return route.fulfill({ status: 404, body: '' });
  });
  await page.addInitScript(() => { localStorage.setItem('kyara_token', 'fake'); });
  await page.goto(`https://kyara.games/profil/${PARTNER}`);
  await page.addScriptTag({ content: script });
  await page.waitForTimeout(300);
  const out = {};
  out.beforeOpen = await page.evaluate(() => Boolean(document.querySelector('.kp-verdict')));
  await page.evaluate((html) => { document.body.insertAdjacentHTML('beforeend', html); }, dialog);
  await page.waitForSelector('.kp-verdict', { timeout: 5000 });
  const read = () => page.evaluate(() => {
    const v = document.querySelector('.kp-verdict');
    if (!v) return null;
    return {
      afterSiteBand: v.previousElementSibling?.classList.contains('verdict') ?? false,
      status: v.querySelector('.kp-verdict__status').textContent + ' | ' + v.querySelector('.kp-verdict__status').className.replace(/kp-verdict__status\s*/g, '').trim(),
      rows: [...v.querySelectorAll('.kp-verdict__row')].map((r) => r.querySelector('.kp-verdict__who').textContent + ' : ' + [...r.querySelectorAll('.kp-cost')].map((c) => `${[...c.childNodes].map((n) => n.classList?.contains('kp-verdict__arrow') ? ' → ' : n.textContent).join('')} [${c.className.match(/kp-cost--(\w+)/)[1]}]`).join(' · ')),
      titles: [...v.querySelectorAll('.kp-verdict__row .kp-cost')].map((c) => c.title),
    };
  });
  const setTotals = (mine, theirs) => page.evaluate(([a, b]) => { const t = document.querySelectorAll('.trays .total'); t[0].textContent = `≈ ${a} ◆`; t[1].textContent = `≈ ${b} ◆`; }, [mine, theirs]);
  out.initial = await read();
  out.arrowIcon = await page.evaluate(() => Boolean(document.querySelector('.kp-verdict .kp-cost .kp-verdict__arrow i.fa-arrow-right-long')));
  await setTotals('2 000', '100'); await page.waitForTimeout(150);
  out.giving = await read();
  await setTotals('100', '20 000'); await page.waitForTimeout(150);
  out.refused = await read();
  await setTotals('500', '500'); await page.waitForTimeout(150);
  out.balanced = await read();
  await page.evaluate(() => document.querySelector('[role="dialog"]').remove()); await page.waitForTimeout(150);
  out.afterClose = await page.evaluate(() => Boolean(document.querySelector('.kp-verdict')));
  out.fairCalls = fairCalls;
  out.errors = errors;
  const norm = (s) => s.replace(/[\s  ]/g, ' ');
  const rows = (r) => r.rows.map(norm);
  const ok = out.arrowIcon && !out.beforeOpen && out.initial.afterSiteBand
    && /devrait passer/.test(out.initial.status) && /--ok/.test(out.initial.status)
    && rows(out.initial)[0] === 'Toi : Dons 9 215 → 8 961 [gift] · Écart 15 726 → 15 303 [free]' && rows(out.initial)[1] === 'ItoVeVe : Dons 10 000 [none] · Écart 20 000 [none]' && rows(out.initial)[2] === 'Entre vous : Dons 3 000 → 2 746 [gift] · Écart 5 000 → 4 323 [free]'
    && /9 215 ◆ disponibles avant cet échange, 8 961 ◆ après \(10 000 ◆ au maximum\)/.test(norm(out.initial.titles[0])) && /15 303 ◆ après \(20 000 ◆ au maximum\)/.test(norm(out.initial.titles[1])) && /3 000 ◆ disponibles avant cet échange, 2 746 ◆ après \(3 000 ◆ au maximum\)/.test(norm(out.initial.titles[4]))
    && rows(out.giving)[0] === 'Toi : Dons 9 215 [none] · Écart 15 726 [none]' && rows(out.giving)[1] === 'ItoVeVe : Dons 10 000 → 8 200 [gift] · Écart 20 000 → 19 900 [free]' && rows(out.giving)[2] === 'Entre vous : Dons 3 000 → 1 200 [gift] · Écart 5 000 → 3 100 [free]' && /10 000 ◆ disponibles avant cet échange, 8 200 ◆ après/.test(norm(out.giving.titles[2]))
    && /refusera/.test(out.refused.status) && /--no/.test(out.refused.status) && rows(out.refused)[0] === 'Toi : Dons manque 10 585 [over] · Écart 15 726 → 15 626 [free]' && rows(out.refused)[2] === 'Entre vous : Dons manque 16 800 [over] · Écart manque 14 900 [over]'
    && /sans effet/.test(out.balanced.status) && rows(out.balanced)[0] === 'Toi : Dons 9 215 [none] · Écart 15 726 [none]' && rows(out.balanced)[2] === 'Entre vous : Dons 3 000 [none] · Écart 5 000 [none]'
    && !out.afterClose && out.fairCalls === 1 && errors.length === 0;
  console.log(JSON.stringify(out, null, 1));
  console.log(ok ? 'PASS' : 'FAIL');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();

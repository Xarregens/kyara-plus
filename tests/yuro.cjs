// Yuro Plus (yurocollection.fr) : commandes yuroDiag — mémoire des requêtes (e-mails et clés sensibles masqués),
// enregistrement des événements et mutations, photo immédiate page(), téléchargement, WebSocket noté.
const { chromium } = require('playwright');
const fs = require('fs');
const script = fs.readFileSync(process.argv[2], 'utf8');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://yurocollection.fr/**', async (route) => {
    const url = new URL(route.request().url()); const p = url.pathname;
    if (p === '/api/profil') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pseudo: 'Xarre', email: 'xarre@mail.fr', token: 'abcd1234' }) });
    if (p === '/api/combat/replay') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    if (p === '/farm') return route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><html><body><main><h1>Farm</h1><label><input type="checkbox" id="replay" checked> Replay auto</label><button class="btn-fight">Lancer le combat</button><div id="arena">contact admin@yuro.fr</div></main></body></html>` });
    return route.fulfill({ status: 404, body: '' });
  });
  await page.goto('https://yurocollection.fr/farm');
  await page.addScriptTag({ content: script });
  const out = {};
  out.version = await page.evaluate(() => yuroDiag.version);
  // requêtes notées en permanence, même sans enregistrement en cours ; clés sensibles masquées
  await page.evaluate(() => fetch('/api/profil').then((r) => r.json()));
  await page.waitForTimeout(200);
  out.menu = await page.evaluate(() => yuroDiag.menu(5));
  await page.click('.btn-fight');
  await page.evaluate(() => fetch('/api/combat/replay', { method: 'POST', body: JSON.stringify({ combat: 7 }) }).then((r) => r.json()));
  await page.evaluate(() => { try { new WebSocket('wss://yurocollection.fr/ws'); } catch {} });
  await page.evaluate(() => { document.querySelector('#arena').append(Object.assign(document.createElement('div'), { textContent: 'combat en cours' })); });
  await page.waitForTimeout(300);
  out.stopped = await page.evaluate(() => yuroDiag.stop());
  const [file] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => yuroDiag.download())]);
  const data = JSON.parse(fs.readFileSync(await file.path(), 'utf8'));
  out.name = file.suggestedFilename();
  out.clicLigne = data.enregistrement.some((l) => l.genre === 'evenement' && l.type === 'click' && /btn-fight/.test(l.cible));
  out.mutations = data.enregistrement.some((l) => l.genre === 'mutations');
  const profil = data.api.find((a) => a.chemin === '/api/profil');
  const replay = data.api.find((a) => a.chemin === '/api/combat/replay');
  out.profil = profil && { statut: profil.statut, email: profil.reponse.email, token: profil.reponse.token };
  out.replay = replay && { methode: replay.methode, requete: replay.requete, reponse: replay.reponse };
  out.ws = data.ws.some((w) => w.sens === 'ouverture' && /yurocollection\.fr\/ws/.test(w.texte));
  out.controles = data.controles.filter((c) => /replay|btn-fight/.test(c.element) || c.coche !== undefined).length;
  out.htmlMasque = !/admin@yuro\.fr/.test(data.html) && /<email>/.test(data.html);
  // photo immédiate, sans enregistrement
  const [file2] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => yuroDiag.page())]);
  const data2 = JSON.parse(fs.readFileSync(await file2.path(), 'utf8'));
  out.photo = { enregistrement: data2.enregistrement, api: data2.api.length >= 2 };
  out.errors = errors;
  const ok = out.version === data.version && /^yuro-diag-.*\.json$/.test(out.name)
    && out.clicLigne && out.mutations
    && out.profil.statut === 200 && out.profil.email === '<masqué>' && out.profil.token === '<masqué>'
    && out.replay.methode === 'POST' && out.replay.requete.combat === 7 && out.replay.reponse.ok === true
    && out.ws && out.controles >= 2 && out.htmlMasque
    && out.photo.enregistrement === null && out.photo.api && errors.length === 0;
  console.log(JSON.stringify(out, null, 1));
  console.log(ok ? 'PASS' : 'FAIL');
  await browser.close();
  process.exit(ok ? 0 : 1);
})();

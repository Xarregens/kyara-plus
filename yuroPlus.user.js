// ==UserScript==
// @name         Yuro Plus
// @namespace    https://github.com/xarregens/kyara-plus
// @version      0.1.0
// @description  Compagnon pour yurocollection.fr. Première étape : commandes d'enregistrement (yuroDiag) pour comprendre le mode farm ; la relance du replay auto bloqué viendra dans une prochaine version, construite sur ces enregistrements.
// @author       Xarregens
// @homepageURL  https://github.com/xarregens/kyara-plus
// @supportURL   https://github.com/xarregens/kyara-plus/issues
// @updateURL    https://raw.githubusercontent.com/xarregens/kyara-plus/main/yuroPlus.user.js
// @downloadURL  https://raw.githubusercontent.com/xarregens/kyara-plus/main/yuroPlus.user.js
// @match        https://yurocollection.fr/*
// @match        https://www.yurocollection.fr/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  if (window.top !== window) return;
  const YURO_VERSION = "0.1.0";

  // ---- masquage : e-mails partout, clés sensibles dans les JSON ----
  const SECRET_KEY = /e-?mail|token|password|secret|session|auth|cookie/i;
  const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
  const mask = (text) => String(text).replace(EMAIL, "<email>");
  function maskJson(value) {
    if (typeof value === "string") return mask(value);
    if (Array.isArray(value)) return value.map(maskJson);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, SECRET_KEY.test(key) ? "<masqué>" : maskJson(inner)]));
    }
    return value;
  }
  const short = (text) => mask(text ?? "").replace(/\s+/g, " ").trim().slice(0, 48);
  function describeNode(node) {
    if (!node || node === window) return node === window ? "window" : String(node);
    if (node === document) return "document";
    if (node.nodeType === Node.TEXT_NODE) return `#text "${short(node.textContent)}"`;
    if (node.nodeType !== Node.ELEMENT_NODE) return node.nodeName;
    const classes = [...node.classList].slice(0, 5).join(".");
    return `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ""}${classes ? `.${classes}` : ""} "${short(node.textContent ?? "")}"`;
  }
  const stamp = () => new Date().toISOString().slice(11, 23);

  // ---- mémoire glissante des échanges avec le serveur, active en permanence :
  // le blocage arrive sans prévenir, ses requêtes doivent déjà être notées ----
  const LIMITS = { api: 200, body: 2e4, ws: 300, wsMsg: 2e3, lines: 5000, html: 2e5 };
  const apiLog = [];
  const wsLog = [];
  const push = (list, max, entry) => {
    list.push(entry);
    if (list.length > max) list.splice(0, list.length - max);
  };
  function recordApi(method, url, status, startedAt, requestBody, text) {
    let path;
    try {
      const parsed = new URL(url, location.origin);
      if (parsed.origin !== location.origin) return;
      path = parsed.pathname + parsed.search;
    } catch {
      return;
    }
    const capped = (value) => {
      if (value == null || typeof value !== "string") return null;
      try {
        return maskJson(JSON.parse(value));
      } catch {
        return mask(value).slice(0, LIMITS.body);
      }
    };
    push(apiLog, LIMITS.api, {
      t: stamp(),
      methode: method.toUpperCase(),
      chemin: mask(path).slice(0, 300),
      statut: status,
      dureeMs: Math.round(performance.now() - startedAt),
      requete: capped(requestBody),
      reponse: text == null ? null : JSON.stringify(capped(text)).length > LIMITS.body ? JSON.stringify(capped(text)).slice(0, LIMITS.body) : capped(text)
    });
  }
  const originalFetch = window.fetch;
  window.fetch = function(input, init) {
    const startedAt = performance.now();
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    const method = init?.method ?? input?.method ?? "GET";
    const requestBody = typeof init?.body === "string" ? init.body : null;
    const result = originalFetch.apply(this, arguments);
    result.then((response) => {
      response.clone().text().then((text) => recordApi(method, url, response.status, startedAt, requestBody, text)).catch(() => {});
    }).catch(() => recordApi(method, url, 0, startedAt, requestBody, null));
    return result;
  };
  const { open: xhrOpen, send: xhrSend } = XMLHttpRequest.prototype;
  XMLHttpRequest.prototype.open = function(method, url) {
    this.__yuroMethod = method;
    this.__yuroUrl = url;
    this.__yuroStart = performance.now();
    return xhrOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function(body) {
    this.addEventListener("load", () => {
      try {
        recordApi(this.__yuroMethod ?? "GET", this.__yuroUrl, this.status, this.__yuroStart ?? performance.now(), typeof body === "string" ? body : null, this.responseText);
      } catch {}
    });
    return xhrSend.apply(this, arguments);
  };
  // les jeux de combat passent souvent par une connexion continue : notée aussi
  const OriginalWebSocket = window.WebSocket;
  function TappedWebSocket(url, protocols) {
    const ws = protocols === void 0 ? new OriginalWebSocket(url) : new OriginalWebSocket(url, protocols);
    push(wsLog, LIMITS.ws, { t: stamp(), sens: "ouverture", texte: mask(String(url)).slice(0, 200) });
    const note = (sens, data) => push(wsLog, LIMITS.ws, { t: stamp(), sens, texte: typeof data === "string" ? mask(data).slice(0, LIMITS.wsMsg) : `<binaire ${data?.byteLength ?? data?.size ?? "?"} octets>` });
    ws.addEventListener("message", (event) => note("reçu", event.data));
    ws.addEventListener("close", (event) => push(wsLog, LIMITS.ws, { t: stamp(), sens: "fermeture", texte: `code ${event.code}` }));
    const send = ws.send.bind(ws);
    ws.send = (data) => {
      note("envoyé", data);
      return send(data);
    };
    return ws;
  }
  TappedWebSocket.prototype = OriginalWebSocket.prototype;
  for (const key of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"]) TappedWebSocket[key] = OriginalWebSocket[key];
  window.WebSocket = TappedWebSocket;

  // ---- enregistrement à la demande : événements et changements de page pendant N secondes ----
  const EVENTS = ["pointerdown", "click", "keydown", "visibilitychange"];
  let recording = null;
  const line = (kind, detail) => recording && recording.lines.length < LIMITS.lines && recording.lines.push({ t: stamp(), genre: kind, ...detail });
  const onEvent = (event) => line("evenement", { type: event.type, cible: describeNode(event.target), vrai: event.isTrusted });
  const onMutations = (records) => line("mutations", {
    nombre: records.length,
    exemples: records.slice(0, 3).map((record) => `${record.type === "attributes" ? `attribut ${record.attributeName} de ` : ""}${describeNode(record.target)}`)
  });
  function stop() {
    if (!recording) return "aucun enregistrement en cours";
    for (const type of EVENTS) window.removeEventListener(type, onEvent, true);
    recording.observer.disconnect();
    clearTimeout(recording.timer);
    const done = recording;
    recording = null;
    window.yuroDiag.dernier = snapshot(done.lines);
    return `${done.lines.length} ligne(s) : yuroDiag.download() pour sauvegarder`;
  }
  function menu(seconds = 30) {
    if (recording) stop();
    recording = { lines: [], observer: new MutationObserver(onMutations), timer: setTimeout(stop, seconds * 1e3) };
    for (const type of EVENTS) window.addEventListener(type, onEvent, true);
    recording.observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    return `enregistrement pendant ${seconds} s : joue normalement (ou laisse le blocage arriver), puis yuroDiag.download()`;
  }
  function snapshot(lines = null) {
    const html = document.body.outerHTML.replace(/<script[\s\S]*?<\/script>/gi, "<script/>");
    const controls = [...document.querySelectorAll('button, a[role="button"], [class*="btn"], input[type="checkbox"], [role="switch"]')].slice(0, 250).map((node) => ({
      element: describeNode(node),
      visible: node.getBoundingClientRect().height > 0,
      desactive: node.disabled === true || node.getAttribute("aria-disabled") === "true",
      coche: node.checked ?? (node.getAttribute("aria-checked") ?? void 0)
    }));
    return {
      version: YURO_VERSION,
      genereLe: new Date().toISOString(),
      page: mask(location.href),
      controles: controls,
      enregistrement: lines,
      api: apiLog.slice(),
      ws: wsLog.slice(),
      html: mask(html).slice(0, LIMITS.html)
    };
  }
  function saveJson(prefix, data) {
    const when = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    const name = `${prefix}-${when}.json`;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    return name;
  }
  function download() {
    if (recording) stop();
    const data = window.yuroDiag.dernier ?? snapshot();
    window.yuroDiag.dernier = null;
    return `fichier ${saveJson("yuro-diag", data)} téléchargé`;
  }
  // page() : photo immédiate de la page et des derniers échanges, sans enregistrement préalable —
  // à lancer au moment précis où le combat reste bloqué
  const page = () => `fichier ${saveJson("yuro-diag", snapshot())} téléchargé (photo immédiate)`;

  window.yuroDiag = { menu, stop, download, page, dernier: null, version: YURO_VERSION };
})();

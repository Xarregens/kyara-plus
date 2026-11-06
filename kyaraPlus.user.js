// ==UserScript==
// @name         Kyara Plus
// @namespace    https://github.com/xarregens/kyara-plus
// @version      2.35.17
// @description  Fork personnel de Kyara Plus (Myuki) : barres de fair-play Dons / Écart sur chaque offre, offres rentables remaniées, auto-accept par rareté avec gain minimum, séries déjà réclamées, Mon activité réorganisé et accéléré.
// @author       Myuki (script d’origine), fork Xarregens
// @homepageURL  https://github.com/xarregens/kyara-plus
// @supportURL   https://github.com/xarregens/kyara-plus/issues
// @updateURL    https://raw.githubusercontent.com/xarregens/kyara-plus/main/kyaraPlus.user.js
// @downloadURL  https://raw.githubusercontent.com/xarregens/kyara-plus/main/kyaraPlus.user.js
// @icon         https://kyara.games/brand/favicon/favicon.svg
// @match        https://kyara.games/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  // src/config.js
  var config_default = {
    api: {
      minGapMs: 250,
      jitterMs: 150,
      maxRetries: 4,
      backoffMs: 2e3,
      // up to this many requests go out at once after an idle moment (the site's own pages fire a dozen at load);
      // past the burst, one request per minGapMs × rush as before, so the sustained rate does not change
      burst: 4
    },
    offers: {
      pageSize: 60,
      maxPages: 40,
      renderStep: 40,
      priorityRarities: ["M", "L"],
      idsPerQuery: 400,
      // while the offers are still being scanned, the board and side panel are redrawn at most this often
      renderThrottleMs: 300
    },
    live: {
      // multiplied by x-kyara-rush; the search lists newest offers first, so page 1 is usually all a poll reads.
      // Auto-accept races other players for the same offers, so it polls faster (~20 requests/min at rush 2,
      // well under the 300/min general limit).
      pollMs: 6e3,
      autoPollMs: 1500,
      jitterMs: 500,
      wakeSliceMs: 250,
      maxPages: 5,
      maxFailures: 5,
      newBadgeMs: 10 * 6e4,
      maxToasts: 3
    },
    autoAccept: {
      // offer accepts count against the market bucket (x-ratelimit-limit-market: 20 per minute)
      maxPerMinute: 10,
      gapMs: 1500,
      defaultMinGain: 1e3,
      logLimit: 8
    },
    ledger: {
      // the fair-play windows are 48 h (pairDays / receivedDays = 2); one extra hour covers clock drift
      keepMs: 49 * 36e5,
      // on the trades page only, multiplied by x-kyara-rush (3 light GETs per sync)
      syncMs: 6e4
    },
    fairPlay: {
      // the limits use a rolling window, so the remaining margin is re-read now and then, not only after a trade
      refreshMs: 6e4
    },
    sorting: {
      // how long the cards on screen must stay the same before they are sorted (the site loads them in bursts)
      settleMs: 500
    },
    packs: {
      // the site's open-many never takes more than 10 packs
      maxPerOpen: 10,
      // the site keeps retrying a failed open for 2 minutes with the same request
      overrideMs: 12e4
    },
    autoOpen: {
      defaultBatch: [3, 10],
      // just under the 10 min it takes a free pack to come back, so the wait never skips a whole pack
      defaultDelayMs: [1e4, 59e4],
      maxDelayMs: 3599e3,
      wakeSliceMs: 1e3,
      // the free-pack count is predicted from nextFreeAt; this re-reads it now and then (multiplied by x-kyara-rush)
      resyncMs: 15 * 6e4,
      // when the server reports fewer packs than predicted (clock difference, packs used elsewhere)
      recheckMs: 3e4,
      gapMs: 1500,
      jitterMs: 1e3,
      maxFailures: 3,
      backoffMs: 6e4,
      uiTickMs: 1e3,
      logLimit: 8
    },
    market: {
      // GET /config does not carry them; they are constants of the site's client (chunk CV6oCC-s.js)
      saleTaxPct: 5,
      listingFeePct: 2,
      listingFeeMin: 1
    },
    activity: {
      refreshMs: 6e4,
      renderStep: 30,
      // 200 asked per page: if the site caps at 50 nothing changes, if it accepts more, four times fewer requests
      historyPageSize: 200,
      historyMaxPages: 60,
      // first load: only the recent history (this many days, at most this many pages per kind); the rest on demand
      historyDays: 30,
      historyFirstPages: 6,
      // rows kept built between renders (see rowFor in panel.js); beyond this, the rows not on screen are dropped
      rowCacheMax: 400,
      loadingRenderMs: 800,
      compactThumbLimit: 2,
      focusMs: 2600,
      withdrawConfirmMs: 4e3
    },
    prices: {
      batchSize: 300,
      ttlMs: 10 * 6e4
    },
    side: {
      defaultMinGain: 500,
      listLimit: 30
    },
    collection: {
      maxExpandClicks: 100,
      expandDelayMs: 60,
      // with filters on, "Afficher plus" is clicked automatically until this many albums are visible
      autoExpandMinVisible: 24,
      autoExpandGapMs: 150
    },
    profile: {
      duplicateMin: 2,
      renderStep: 120
    },
    profileBackground: {
      userId: "2766a197-9905-4dd8-8583-a0ec324d5ec7",
      video: "https://eudist.animemusicquiz.com/havboiqa2v48ktz0.webm",
      volume: 0.15
    },
    tradeLab: {
      historyLimit: 30,
      logLimit: 20,
      lookupDelayMs: 400,
      messageMaxLength: 200
    },
    ui: {
      toastMs: 4e3,
      iconsCss: "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css"
    }
  };

  // fair-play journal and pending-trade settings
  config_default.fairPlay.pendingGraceMs = 60 * 6e4;
  // pause between two background fair-play reads (poll, after a trade), multiplied by x-kyara-rush, so offer requests slip in between
  config_default.fairPlay.spreadMs = 1200;
  // the bars (counters only, one request) are read as soon as the first page of offers names a player;
  // once this many offers are loaded, the full read (counters + trade ledger, for the upcoming returns) runs in the background
  config_default.fairPlay.startAfterOffers = 300;
  // Limits between two players over pairDays, read in the server's refusal messages of the 05/11/2026 survey
  // ("X peut encore donner 3 000 ◆ à Y sur 48 h", "vos échanges vont déjà beaucoup dans le même sens : ... 5 000 ◆").
  // Hypothesis: 3 000 of gifts and 5 000 of gap in my favour per partner. Adjust here if a survey shows other values.
  config_default.fairPlay.pairGiftCap = 3e3;
  config_default.fairPlay.pairFlowCap = 5e3;
  // Confirmed by giveLeft / getLeft / giveBalanceLeft / getBalanceLeft of /fair-play/with (relevé du 06/11/2026).
  // A player's own bars when full (theirReceivedLeft / theirFreeLeft of a player who traded nothing, same relevé)
  config_default.fairPlay.barFull = { gifts: 1e4, free: 2e4 };
  // A background read (poll, scan) that disagrees with a read made right after an accept within this delay is ignored:
  // the site sometimes answers with stale counters for a given player (A → B → A flips seen in the survey).
  config_default.fairPlay.acceptReadGraceMs = 6e4;
  config_default.journal = {
    keepMs: 14 * 24 * 36e5,
    heartbeatMs: 30 * 6e4,
    maxSnapshots: 2500,
    maxActions: 500,
    matchMinFree: 10,
    matchTolerance: 0.1
  };

  // src/lib/time.js
  var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  var jitter = (maxMs) => Math.random() * maxMs;

  // src/api/errors.js
  var ErrorCode = {
    NETWORK: "network",
    PASS_REQUIRED: "pass_required",
    QUEUED: "queued",
    GIFT_LIMIT: "gift_limit"
  };
  var ApiError = class extends Error {
    constructor(status, code, message) {
      super(message ?? code);
      this.name = "ApiError";
      this.status = status;
      this.code = code;
    }
  };
  var CODE_MESSAGES = {
    [ErrorCode.NETWORK]: "Serveur injoignable.",
    [ErrorCode.PASS_REQUIRED]: "Le site demande une vérification : désactive Kyara Plus, fais un échange sur le site, puis réessaie."
  };
  var STATUS_MESSAGES = {
    401: "Session expirée : recharge la page.",
    402: "Pas assez de chakra.",
    404: "Introuvable : l’offre a sans doute déjà été prise.",
    429: "Trop de requêtes, patiente quelques secondes.",
    503: "Le serveur est surchargé, réessaie dans un instant."
  };
  function describeError(error) {
    if (!(error instanceof ApiError)) return "Erreur inattendue.";
    const serverMessage = error.message !== error.code ? error.message : null;
    return CODE_MESSAGES[error.code] ?? serverMessage ?? STATUS_MESSAGES[error.status] ?? `Erreur ${error.status} (${error.code}).`;
  }
  var isGiftLimit = (error) => error instanceof ApiError && error.code === ErrorCode.GIFT_LIMIT;
  var isGone = (error) => error instanceof ApiError && ([404, 410].includes(error.status) || error.status === 409 && !isGiftLimit(error));
  var isTransient = (error) => error instanceof ApiError && (error.status === 0 || error.status === 429 || error.status >= 500);

  // src/api/client.js
  var RETRYABLE_STATUS = /* @__PURE__ */ new Set([429, 503]);
  var rushFactor = 1;
  var rush = () => rushFactor;
  // Token bucket: api.burst requests may start at once, then one per minGapMs × rush (a token is earned every interval,
  // never more than api.burst in reserve). A priority request goes ahead of the ones already waiting (the first page of
  // the tab the user just opened passes before the prefetched pages of the other tabs).
  var waiters = [];
  var draining = false;
  var tokens = config_default.api.burst;
  var refilledAt = 0;
  function refillTokens(now) {
    const interval = config_default.api.minGapMs * rushFactor;
    if (!refilledAt) refilledAt = now;
    const earned = Math.floor((now - refilledAt) / interval);
    if (earned <= 0) return;
    tokens = Math.min(config_default.api.burst, tokens + earned);
    refilledAt = tokens === config_default.api.burst ? now : refilledAt + earned * interval;
  }
  async function drainQueue() {
    if (draining) return;
    draining = true;
    while (waiters.length) {
      const now = Date.now();
      refillTokens(now);
      if (tokens <= 0) {
        await sleep(Math.max(1, refilledAt + config_default.api.minGapMs * rushFactor - now) + jitter(config_default.api.jitterMs));
        continue;
      }
      tokens--;
      waiters.shift()();
    }
    draining = false;
  }
  function waitForTurn(priority = false) {
    return new Promise((resolve) => {
      if (priority) waiters.unshift(resolve);
      else waiters.push(resolve);
      drainQueue();
    });
  }
  function readPass() {
    try {
      const pass = JSON.parse(localStorage.getItem("kyara_pass"));
      return pass && pass.expiresAt > Date.now() ? pass.pass : null;
    } catch {
      return null;
    }
  }
  function buildHeaders({ hasBody, withPass, extra }) {
    const headers = { ...extra, "x-device-id": localStorage.getItem("kyara_device") ?? "" };
    const token = localStorage.getItem("kyara_token");
    const pass = withPass ? readPass() : null;
    if (token) headers.authorization = `Bearer ${token}`;
    if (hasBody) headers["content-type"] = "application/json";
    if (pass) headers["x-pass"] = pass;
    return headers;
  }
  async function send(path, { method, body, withPass, headers, priority }) {
    await waitForTurn(priority);
    try {
      return await fetch(`/api${path}`, {
        method,
        headers: buildHeaders({ hasBody: body !== void 0, withPass, extra: headers }),
        body: body === void 0 ? void 0 : JSON.stringify(body)
      });
    } catch {
      throw new ApiError(0, ErrorCode.NETWORK);
    }
  }
  async function request(path, { method = "GET", body, withPass = false, headers, priority = false } = {}) {
    for (let attempt = 0; ; attempt++) {
      const response = await send(path, { method, body, withPass, headers, priority });
      rushFactor = Number(response.headers.get("x-kyara-rush")) || 1;
      const data = await response.json().catch(() => null);
      if (response.ok) return data;
      const code = data?.error ?? `http_${response.status}`;
      const retryable = RETRYABLE_STATUS.has(response.status) && code !== ErrorCode.QUEUED;
      if (!retryable || attempt >= config_default.api.maxRetries) throw new ApiError(response.status, code, data?.message);
      await sleep(config_default.api.backoffMs * 2 ** attempt + jitter(config_default.api.jitterMs));
    }
  }

  // src/api/endpoints.js
  function query(params) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== void 0 && value !== null) search.set(key, value);
    }
    const text = search.toString();
    return text ? `?${text}` : "";
  }
  var catalogApi = {
    characters: () => request("/characters")
  };
  var meApi = {
    bootstrap: () => request("/me/bootstrap"),
    // missions progress: welcome, daily, weekly, achievements and `series` = the series whose reward was claimed, with the date
    progress: () => request("/me/progress")
  };
  var configApi = {
    get: () => request("/config")
  };
  var packsApi = {
    list: () => request("/packs"),
    // The request id is the server's idempotency key: a retry with the same id cannot open the packs twice.
    openMany: (packId, { count, maxChakra, requestId }) => request(`/packs/${encodeURIComponent(packId)}/open-many`, {
      method: "POST",
      body: { count, maxChakra },
      withPass: true,
      headers: { "x-request-id": requestId }
    })
  };
  var marketApi = {
    mine: () => request("/me/market"),
    history: (kind, page, size, { priority = false } = {}) => request(`/me/market/history${query({ kind, page, size })}`, { priority }),
    cancelListing: (listingId) => request(`/market/listings/${encodeURIComponent(listingId)}/cancel`, { method: "POST" }),
    cancelOrder: (orderId) => request(`/market/buy-orders/${encodeURIComponent(orderId)}/cancel`, { method: "POST" }),
    withdrawAll: () => request("/me/market/withdraw-all", { method: "POST" })
  };
  var collectionApi = {
    mine: () => request("/me/collection?lean=1"),
    prices: (ids) => request(`/me/collection/prices?ids=${ids.join(",")}`),
    setPinned: (characterId, pinned) => request(`/me/collection/${characterId}/pin`, { method: "POST", body: { pinned } }),
    // Response shape inferred from the site's wiki page (never captured): { user, entry, gained? }.
    recycle: (characterId, qty) => request(`/me/collection/${characterId}/recycle`, { method: "POST", body: { qty } })
  };
  var fairPlayApi = {
    withPlayer: (userId2) => request(`/fair-play/with/${encodeURIComponent(userId2)}`),
    prices: (ids) => request(`/fair-play/prices?ids=${ids.join(",")}`)
  };
  var notificationsApi = {
    list: () => request("/me/notifications")
  };
  var tradesApi = {
    mine: () => request("/me/trades"),
    // Board offers you posted or took, with closedAt, taker and takenWith once accepted.
    offersMine: () => request("/trades/offers/mine"),
    cancelOffer: (offerId) => request(`/trades/offers/${encodeURIComponent(offerId)}/cancel`, { method: "POST" }),
    propose: (body) => request("/trades", { method: "POST", body, withPass: true }),
    // Only accept is pass-protected on the site; decline and cancel are plain POSTs without a body.
    act: (tradeId, action) => request(`/trades/${encodeURIComponent(tradeId)}/${action}`, { method: "POST", withPass: action === "accept" }),
    custom: ({ method, path, body }) => request(path, { method, body, withPass: method !== "GET" }),
    availableFrom: (userId2) => request(`/trades/available/${encodeURIComponent(userId2)}`),
    ownedBy: (userId2) => request(`/trades/owned/${encodeURIComponent(userId2)}`),
    searchOffers: ({ takeable, ids, ...params }) => request(`/trades/offers/search${query({ ...params, takeable: takeable ? 1 : void 0, ids: ids?.join(",") })}`),
    acceptOffer: (offerId, withId) => request(`/trades/offers/${encodeURIComponent(offerId)}/accept`, {
      method: "POST",
      body: { withId },
      withPass: true
    })
  };

  // src/lib/rarity.js
  var RARITIES = ["M", "L", "E", "R", "U", "C"];
  var RARITY_LABELS = {
    M: "Mythique",
    L: "Légendaire",
    E: "Épique",
    R: "Rare",
    U: "Peu commune",
    C: "Commune"
  };
  function rarityRank(rarity) {
    const index = RARITIES.indexOf(rarity);
    return index === -1 ? RARITIES.length : index;
  }
  var rarityColor = (rarity) => `var(--${rarity}, var(--line3))`;

  // src/data/packs.js
  var usesFreePacks = (pack) => pack.usesFreePacks ?? pack.price === 0;
  function freeOpensLeft(pack, me) {
    if (!pack || !me) return 0;
    const granted = me.grants?.[pack.id] ?? 0;
    return granted + (usesFreePacks(pack) ? (me.freePacks ?? 0) + (me.bonusPacks ?? 0) : 0);
  }
  var withFreeCount = (body, count) => JSON.stringify({ ...JSON.parse(body), count, maxChakra: 0 });
  var newRequestId = () => crypto.randomUUID().replace(/-/g, "");
  var pulledCards = (results) => results.flatMap((result) => result.cards ?? []);
  function countByRarity(cards) {
    const counts = new Map(RARITIES.map((rarity) => [rarity, 0]));
    for (const card of cards) counts.set(card.rarity, (counts.get(card.rarity) ?? 0) + 1);
    return [...counts].filter(([, count]) => count > 0);
  }

  // src/lib/dom.js
  function h(tag, props = {}, ...children) {
    const element = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key.startsWith("on")) element.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key === "class") element.className = value;
      else if (key === "style") for (const [name, style] of Object.entries(value)) element.style.setProperty(name, style);
      else element.setAttribute(key, value === true ? "" : value);
    }
    element.append(...children.flat().filter((child) => child != null && child !== false));
    return element;
  }
  function fill(parent, ...children) {
    parent.replaceChildren(...children.flat().filter((child) => child != null && child !== false));
  }
  function keepAttached(node, anchorSelector, place) {
    let anchor = null;
    const check = () => {
      const current = document.querySelector(anchorSelector);
      if (!current || current === anchor && node.isConnected) return;
      anchor = current;
      place(current, node);
    };
    // Our own redraws mutate the document too: they never move the anchor, so they are skipped.
    const observer = new MutationObserver((records) => {
      if (records.every((record) => node.contains(record.target))) return;
      check();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    check();
    return () => observer.disconnect();
  }
  function injectStylesheet(href) {
    document.head.append(h("link", { rel: "stylesheet", href }));
  }
  function injectStyles(css) {
    document.head.append(h("style", { "data-kyara-plus": "" }, css));
  }

  // src/lib/store.js
  function createStore(initialState4) {
    const state = { ...initialState4 };
    const listeners = /* @__PURE__ */ new Set();
    return {
      get: () => state,
      set(patch) {
        Object.assign(state, patch);
        for (const listener of listeners) listener(state);
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    };
  }

  // src/lib/site.js
  var profileIdFromPath = () => location.pathname.match(/^\/profil\/([^/]+)/)?.[1];
  var cardIdFromLink = (link2) => Number(link2?.getAttribute("href")?.match(/\/wiki\/(\d+)/)?.[1]);
  var cardImageUrl = (cardId) => `/cards/sm/${cardId}.webp`;
  var packIdFromPath = () => location.pathname.match(/^\/ouvrir\/([^/]+)/)?.[1];

  // src/lib/toast.js
  var container = null;
  function toast(message, tone2 = "info") {
    if (!container?.isConnected) {
      container = h("div", { class: "kp-toasts", role: "status" });
      document.body.append(container);
    }
    const item = h("div", { class: `kp-toast kp-toast--${tone2}` }, message);
    container.append(item);
    setTimeout(() => item.remove(), config_default.ui.toastMs);
  }
  var FLASH_KEY = "kyara-plus:flash";
  function flashToast(message, tone2 = "info") {
    sessionStorage.setItem(FLASH_KEY, JSON.stringify({ message, tone: tone2 }));
  }
  function showFlashToast() {
    const stored = sessionStorage.getItem(FLASH_KEY);
    if (!stored) return;
    sessionStorage.removeItem(FLASH_KEY);
    const { message, tone: tone2 } = JSON.parse(stored);
    toast(message, tone2);
  }

  // src/lib/format.js
  var numberFormat = new Intl.NumberFormat("fr-FR");
  var formatNumber = (value) => numberFormat.format(value);
  var formatChakra = (value) => value == null ? "? ◆" : `${formatNumber(value)} ◆`;
  var formatPrice = (value) => value == null ? "prix inconnu" : `≈ ${formatNumber(value)}`;
  function formatGain(value) {
    if (value == null) return "?";
    const sign = value > 0 ? "+" : value < 0 ? "−" : "±";
    return `${sign}${formatNumber(Math.abs(value))}`;
  }
  function formatRemaining(isoDate) {
    const ms = new Date(isoDate).getTime() - Date.now();
    if (ms <= 0) return "terminé";
    const hours = Math.floor(ms / 36e5);
    if (hours >= 24) return `${Math.floor(hours / 24)} j ${hours % 24} h`;
    return `${hours} h ${Math.floor(ms / 6e4) % 60} min`;
  }
  var clockFormat = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
  var dayClockFormat = new Intl.DateTimeFormat("fr-FR", { weekday: "short", hour: "2-digit", minute: "2-digit" });
  function formatClock(ms) {
    const today = (/* @__PURE__ */ new Date()).toDateString() === new Date(ms).toDateString();
    return (today ? clockFormat : dayClockFormat).format(ms);
  }
  function formatCountdown(ms) {
    const seconds = Math.max(0, Math.ceil(ms / 1e3));
    const minutes = Math.floor(seconds / 60);
    const rest = String(seconds % 60).padStart(2, "0");
    if (minutes >= 60) return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
    return minutes > 0 ? `${minutes} min ${rest} s` : `${seconds} s`;
  }
  var plural = (count, word) => `${formatNumber(count)} ${word}${count > 1 ? "s" : ""}`;
  var searchKey = (text) => text.normalize("NFD").replace(new RegExp("\\p{Diacritic}", "gu"), "").toLowerCase();

  // src/features/auto-open/schedule.js
  var SECOND_MS = 1e3;
  var MINUTE_SECONDS = 60;
  var CLOCK_PATTERN = /^(\d{1,3}):([0-5]\d)$/;
  var SECONDS_PATTERN = /^\d{1,4}$/;
  var randomInt = (min, max, random = Math.random) => min + Math.floor(random() * (max - min + 1));
  var randomBetween = (min, max, random = Math.random) => min + random() * (max - min);
  function normalizeRange([first, second], { min, max }) {
    const clamp = (value) => Math.min(max, Math.max(min, value));
    return [clamp(Math.min(first, second)), clamp(Math.max(first, second))];
  }
  function parseDuration(text) {
    const value = String(text).trim();
    const clock = value.match(CLOCK_PATTERN);
    if (clock) return (Number(clock[1]) * MINUTE_SECONDS + Number(clock[2])) * SECOND_MS;
    return SECONDS_PATTERN.test(value) ? Number(value) * SECOND_MS : null;
  }
  function formatDuration(ms) {
    const seconds = Math.round(ms / SECOND_MS);
    return `${Math.floor(seconds / MINUTE_SECONDS)}:${String(seconds % MINUTE_SECONDS).padStart(2, "0")}`;
  }
  function rollCycle({ batchMin, batchMax, delayMinMs, delayMaxMs }, random = Math.random) {
    return {
      target: randomInt(batchMin, batchMax, random),
      delayMs: Math.round(randomBetween(delayMinMs, delayMaxMs, random))
    };
  }
  function regeneratedStock(me, now, regenMs) {
    const have = me.freePacks ?? 0;
    const max = me.freePacksMax ?? have;
    const next = Date.parse(me.nextFreeAt);
    if (have >= max || !Number.isFinite(next) || now < next) return have;
    return Math.min(max, have + 1 + Math.floor((now - next) / regenMs));
  }
  function planOpening({ pack, me, now, regenMs, cycle }) {
    const regenerates = usesFreePacks(pack);
    const have = regenerates ? me.freePacks ?? 0 : 0;
    const max = regenerates ? me.freePacksMax ?? have : 0;
    const fixed = freeOpensLeft(pack, { ...me, freePacks: 0 });
    const target = Math.min(cycle.target, fixed + max);
    const needed = target - fixed;
    const next = Date.parse(me.nextFreeAt);
    const arrivalOf = (count) => Number.isFinite(next) ? next + (count - have - 1) * regenMs : Infinity;
    const reachedAt = needed <= have ? -Infinity : arrivalOf(needed);
    const fullAt = have >= max ? -Infinity : arrivalOf(max);
    const base = Math.max(reachedAt, now);
    const openAt = Math.max(base, Math.min(base + cycle.delayMs, fullAt));
    return { target, reachedAt, openAt, leftNow: fixed + (regenerates ? regeneratedStock(me, now, regenMs) : 0) };
  }

  // src/lib/settings.js
  var STORAGE_KEY = "kyara-plus:settings";
  function readAll() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
    } catch {
      return {};
    }
  }
  var readSetting = (name, fallback) => readAll()[name] ?? fallback;
  function writeSetting(name, value) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readAll(), [name]: value }));
  }

  // src/features/auto-open/settings.js
  var BATCH_LIMITS = { min: 1, max: config_default.packs.maxPerOpen };
  var DELAY_LIMITS = { min: 0, max: config_default.autoOpen.maxDelayMs };
  function readAutoOpenSettings() {
    const [batchMin, batchMax] = normalizeRange(readSetting("autoOpenBatch", config_default.autoOpen.defaultBatch), BATCH_LIMITS);
    const [delayMinMs, delayMaxMs] = normalizeRange(
      readSetting("autoOpenDelayMs", config_default.autoOpen.defaultDelayMs),
      DELAY_LIMITS
    );
    return { batchMin, batchMax, delayMinMs, delayMaxMs };
  }
  function saveAutoOpenSettings({ batchMin, batchMax, delayMinMs, delayMaxMs }) {
    const [lowBatch, highBatch] = normalizeRange([batchMin, batchMax], BATCH_LIMITS);
    const [lowDelay, highDelay] = normalizeRange([delayMinMs, delayMaxMs], DELAY_LIMITS);
    writeSetting("autoOpenBatch", [lowBatch, highBatch]);
    writeSetting("autoOpenDelayMs", [lowDelay, highDelay]);
    return readAutoOpenSettings();
  }

  // src/features/auto-open/controller.js
  var SECONDS_PER_HOUR = 3600;
  var SECOND_MS2 = 1e3;
  var Phase = {
    IDLE: "idle",
    WAITING: "waiting",
    OPENING: "opening",
    BACKOFF: "backoff"
  };
  var initialState = () => ({
    ready: false,
    unavailable: null,
    enabled: false,
    phase: Phase.IDLE,
    target: null,
    openAt: null,
    leftNow: 0,
    opened: 0,
    log: [],
    stopReason: null,
    settings: readAutoOpenSettings()
  });
  function createAutoOpen({ store, api: api3, clock, notify: notify3, currentPackId }) {
    let pack = null;
    let regenMs = 0;
    let runId = 0;
    const state = () => store.get();
    const patch = (changes) => store.set(changes);
    const isCurrent = (id) => id === runId && state().enabled;
    async function load() {
      const packId = currentPackId();
      const [packs, serverConfig, me] = await Promise.all([api3.listPacks(), api3.getConfig(), api3.loadMe()]);
      pack = packs.find((candidate) => candidate.id === packId) ?? null;
      regenMs = Math.round(serverConfig.freePacks.regenHours * SECONDS_PER_HOUR) * SECOND_MS2;
      const unavailable = !pack ? "Booster introuvable." : !usesFreePacks(pack) ? "Ce booster n’utilise pas les boosters gratuits." : null;
      patch({ ready: true, unavailable, leftNow: freeOpensLeft(pack, me) });
    }
    async function sleepUntil(at, id, maxMs) {
      const end = Math.min(at, clock.now() + maxMs);
      while (isCurrent(id) && clock.now() < end) {
        if (currentPackId() !== pack.id) return stop("Tu as changé de booster.");
        await clock.sleep(Math.min(config_default.autoOpen.wakeSliceMs, end - clock.now()));
      }
    }
    function stop(reason = null) {
      runId++;
      patch({ enabled: false, phase: Phase.IDLE, openAt: null, stopReason: reason });
      if (reason) notify3.error(`Auto-ouverture arrêtée : ${reason}`);
    }
    function record(opened, cards) {
      if (opened === 0) return;
      const rarities = countByRarity(cards);
      const entry = { at: clock.now(), opened, rarities };
      patch({ opened: state().opened + opened, log: [entry, ...state().log].slice(0, config_default.autoOpen.logLimit) });
      const summary = rarities.map(([rarity, count]) => `${rarity}×${count}`).join(" ");
      notify3.success(`Auto-ouverture : ${plural(opened, "booster")} (${summary}).`);
    }
    async function openAll(id, known) {
      let me = known;
      let left = freeOpensLeft(pack, me);
      let opened = 0;
      const cards = [];
      while (left > 0 && isCurrent(id)) {
        const count = Math.min(left, config_default.packs.maxPerOpen);
        const { results = [], stopped = null } = await api3.openMany(pack.id, count);
        if (results.length === 0) {
          stop(stopped?.message ?? stopped?.code ?? "Le serveur n’a ouvert aucun booster.");
          break;
        }
        me = results.at(-1).user;
        notify3.pulled(results.at(-1));
        opened += results.length;
        cards.push(...pulledCards(results));
        left = stopped || results.length < count ? 0 : freeOpensLeft(pack, me);
        if (left > 0) await clock.sleep(config_default.autoOpen.gapMs * rush() + jitter(config_default.autoOpen.jitterMs));
      }
      record(opened, cards);
      return me;
    }
    async function cycleOnce(id, cycle, known) {
      const me = known ?? await api3.loadMe();
      if (!isCurrent(id)) return { me };
      const plan = planOpening({ pack, me, now: clock.now(), regenMs, cycle });
      patch({ phase: Phase.WAITING, target: plan.target, openAt: plan.openAt, leftNow: plan.leftNow });
      await sleepUntil(plan.openAt, id, config_default.autoOpen.resyncMs * rush());
      if (!isCurrent(id)) return { me };
      if (clock.now() < plan.openAt) return { me: null };
      const fresh = await api3.loadMe();
      if (freeOpensLeft(pack, fresh) < plan.target) {
        await sleepUntil(clock.now() + config_default.autoOpen.recheckMs, id, config_default.autoOpen.recheckMs);
        return { me: null };
      }
      patch({ phase: Phase.OPENING, openAt: null });
      return { me: await openAll(id, fresh), opened: true };
    }
    async function backoff(id, failures) {
      const wait = config_default.autoOpen.backoffMs * 2 ** (failures - 1) * rush() + jitter(config_default.autoOpen.jitterMs);
      patch({ phase: Phase.BACKOFF, openAt: clock.now() + wait });
      await sleepUntil(clock.now() + wait, id, wait);
    }
    async function run(id) {
      let cycle = rollCycle(state().settings);
      let me = null;
      let failures = 0;
      while (isCurrent(id)) {
        try {
          const result = await cycleOnce(id, cycle, me);
          me = result.me;
          failures = 0;
          if (result.opened) cycle = rollCycle(state().settings);
        } catch (error) {
          if (!isCurrent(id)) return;
          if (!(error instanceof ApiError)) console.error("[Kyara Plus] auto-open", error);
          if (!isTransient(error)) return stop(describeError(error));
          failures++;
          if (failures >= config_default.autoOpen.maxFailures) return stop(`${describeError(error)} (échecs répétés)`);
          me = null;
          await backoff(id, failures);
        }
      }
    }
    function start() {
      if (state().enabled || !state().ready || state().unavailable) return;
      const id = ++runId;
      patch({ enabled: true, stopReason: null, phase: Phase.WAITING });
      run(id);
    }
    function setSettings(settings) {
      patch({ settings: saveAutoOpenSettings(settings) });
    }
    function dispose() {
      runId++;
      patch({ enabled: false });
    }
    return { load, start, stop: () => stop(), setSettings, dispose };
  }

  // src/lib/icon.js
  var icon = (name) => h("i", { class: `fa-solid fa-${name}`, "aria-hidden": "true" });

  // src/data/collection.js
  var GiveStatus = {
    AVAILABLE: "available",
    PINNED: "pinned",
    BLOCKED: "blocked",
    MISSING: "missing"
  };
  async function loadCollection() {
    const entries = await collectionApi.mine();
    return new Map(entries.map((entry) => [entry.characterId, entry]));
  }
  function giveStatus(entry) {
    if (!entry || entry.qty <= 0) return GiveStatus.MISSING;
    if ((entry.listable ?? 0) > 0) return GiveStatus.AVAILABLE;
    const freeOnceUnpinned = entry.qty - (entry.locked ?? 0) - (entry.resaleLocked ?? 0) > 0;
    return entry.pinned && freeOnceUnpinned ? GiveStatus.PINNED : GiveStatus.BLOCKED;
  }
  var recyclableCopies = (entry) => entry && !entry.pinned ? Math.max(0, entry.qty - (entry.locked ?? 0) - 1) : 0;

  // src/data/progress.js
  // Series rewards already claimed, from /me/progress (relevé du 05/11/2026 : [{ series, size, chakra, completedAt, claimed }]).
  // The site only rewards series of at least rewardMinSize cards (the smallest claimed one seen was 5).
  config_default.series = { cacheMs: 15 * 6e4, rewardMinSize: 5 };
  var progressCache = null;
  function loadClaimedSeries() {
    const now = Date.now();
    if (progressCache && now - progressCache.at < config_default.series.cacheMs) return progressCache.promise;
    const promise = meApi.progress().then((progress) => {
      const claimed = /* @__PURE__ */ new Map();
      for (const item of progress?.series ?? []) {
        if (item?.series && item.claimed) claimed.set(item.series, { completedAt: item.completedAt ? Date.parse(item.completedAt) : null, chakra: item.chakra ?? null, size: item.size ?? null });
      }
      return claimed;
    }).catch((error) => {
      progressCache = null;
      throw error;
    });
    progressCache = { at: now, promise };
    return promise;
  }
  var invalidateClaimedSeries = () => {
    progressCache = null;
  };
  var unpinCard = (characterId) => collectionApi.setPinned(characterId, false);

  // src/features/market-offers/widgets.js
  function cardArt(card, size = "md", overlays = []) {
    return h(
      "a",
      {
        class: `kp-art kp-art--${size}`,
        href: `/wiki/${card.id}`,
        title: card.name,
        style: { "--kp-rarity": rarityColor(card.rarity) }
      },
      h("img", {
        src: cardImageUrl(card.id),
        alt: card.name,
        loading: "lazy",
        referrerpolicy: "no-referrer",
        onError: (event) => {
          if (card.image && event.target.src !== card.image) event.target.src = card.image;
        }
      }),
      overlays
    );
  }
  var gem = (rarity) => h("span", { class: "kp-gem", title: RARITY_LABELS[rarity], style: { "--kp-rarity": rarityColor(rarity) } }, rarity);
  // ×N badge, same colours everywhere: green = none yet, orange = last copy, blue = doubles
  var countTone = (qty) => qty === 0 ? "none" : qty === 1 ? "last" : "many";
  var countBadge = (qty, title) => h(
    "span",
    { class: `kp-badge kp-badge--count kp-count--${countTone(qty)}`, title: title ?? (qty === 0 ? "Tu ne l’as pas encore" : qty === 1 ? "Dernier exemplaire" : plural(qty, "exemplaire")) },
    `×${qty}`
  );
  function optionOverlays({ entry, status }) {
    const qty = entry?.qty ?? 0;
    return [
      qty >= 2 ? countBadge(qty) : null,
      status === GiveStatus.PINNED ? h("span", { class: "kp-badge kp-badge--lock", title: "Carte verrouillée" }, icon("lock")) : null
    ];
  }
  var hideButton = (onClick) => h("button", { class: "kp-hide", type: "button", title: "Masquer cette offre", onClick }, icon("eye-slash"));
  var swapIcon = () => h("span", { class: "kp-swap" }, icon("arrow-right-arrow-left"));
  function gainBadge(gain) {
    const tone2 = !gain ? "flat" : gain > 0 ? "up" : "down";
    return h("span", { class: `kp-gain kp-gain--${tone2}`, title: "Écart de prix moyen" }, formatGain(gain));
  }
  function giveButton(option, onClick, className = "", attributes = {}) {
    const tone2 = option.entry.qty >= 2 ? "double" : "single";
    return h(
      "button",
      { class: `kp-btn kp-btn--${tone2} ${className}`, type: "button", onClick, ...attributes },
      "Donner",
      gainBadge(option.gain)
    );
  }
  // Fair-play cost of a trade, colour-coded by the 48 h bar it draws from:
  // grey = no cost, blue = free gap ("Écart") only, orange = gifts ("Dons", plus its gap part), red = refused by the site.
  var CostTone = { NONE: "none", FREE: "free", GIFT: "gift", OVER: "over" };
  var BAR_LABELS = { gift: "Dons", free: "Écart" };
  function costTone(cost) {
    if (!cost) return null;
    if (cost.overBy) return CostTone.OVER;
    if (cost.gift > 0) return CostTone.GIFT;
    if (cost.free > 0) return CostTone.FREE;
    return CostTone.NONE;
  }
  var costParts = (cost) => [
    cost.gift > 0 ? `${BAR_LABELS.gift} −${formatNumber(cost.gift)}` : null,
    cost.free > 0 ? `${BAR_LABELS.free} −${formatNumber(cost.free)}` : null
  ].filter(Boolean);
  function costTitle(cost, fair, tone2) {
    if (tone2 === CostTone.OVER) {
      if (cost.overBy === "partenaire") {
        return `Le site refusera sans doute cet échange : limite entre deux joueurs sur 48 h (${formatChakra(config_default.fairPlay.pairGiftCap)} de dons, ${formatChakra(config_default.fairPlay.pairFlowCap)} d’écart dans le même sens avec ce joueur), dépassée de ${formatChakra(cost.overPair)}. Tes barres, elles, suffisent.`;
      }
      const isGift = cost.overBy === "dons";
      const bar = isGift ? BAR_LABELS.gift : BAR_LABELS.free;
      return `Le site refusera cet échange : il manque ${formatChakra(isGift ? cost.overGift : cost.overFree)} sur la barre ${bar} (il en demande ${formatChakra(isGift ? cost.gift : cost.free)}, il t’en reste ${formatChakra(isGift ? fair.gifts : fair.freeGaps)}).`;
    }
    if (tone2 === CostTone.NONE) return "Cet échange n’est pas à ton avantage (ou l’écart est trop petit) : il n’entame aucune barre.";
    const lines = [
      tone2 === CostTone.GIFT ? `${BAR_LABELS.gift} −${formatChakra(cost.gift)} (il te reste ${formatChakra(fair.gifts)})` : `${BAR_LABELS.free} −${formatChakra(cost.free)} (il te reste ${formatChakra(fair.freeGaps)}).`,
      tone2 === CostTone.GIFT && cost.free > 0 ? `et ${BAR_LABELS.free} −${formatChakra(cost.free)} (il te reste ${formatChakra(fair.freeGaps)}).` : null,
      "Ce qui est retiré revient 48 h plus tard."
    ].filter(Boolean);
    return lines.join("\n");
  }
  function costChip(cost, fair, { compact = false } = {}) {
    const tone2 = costTone(cost);
    if (!tone2 || !fair) return null;
    // Colour + amount only: the bar is given by the colour (see the legend) and the tooltip says it in words
    let label;
    if (tone2 === CostTone.OVER) {
      const isGift = cost.overBy === "dons";
      const missing = cost.overBy === "partenaire" ? cost.overPair : isGift ? cost.overGift : cost.overFree;
      label = formatNumber(missing);
    } else if (tone2 === CostTone.NONE) {
      label = "0";
    } else if (tone2 === CostTone.GIFT) {
      label = `−${formatNumber(cost.gift)}`;
    } else {
      label = `−${formatNumber(cost.free)}`;
    }
    const title = costTitle(cost, fair, tone2);
    const chip = (tone, text) => h("span", { class: `kp-cost kp-cost--${tone}${compact ? " kp-cost--compact" : ""}`, title }, h("span", { class: "kp-cost__dot" }), text);
    const main = chip(tone2, label);
    // a trade that draws from both bars shows two chips: orange for Dons, blue for Écart
    return tone2 === CostTone.GIFT && cost.free > 0 ? h("span", { class: "kp-costs" }, main, chip(CostTone.FREE, `−${formatNumber(cost.free)}`)) : main;
  }
  var optionCost = (analysis, option, fair) => fair ? tradeCost({ given: option.price, received: analysis.receivedPrice }, fair, analysis.offer.user?.id ?? null) : null;
  // Everything the DOM of an option or an offer depends on: a redraw is skipped when these keys are unchanged.
  var optionKey = (option) => [option.card.id, option.status, option.entry?.qty ?? 0, option.entry?.pinned ? 1 : 0, option.entry?.sellBlock ?? "", option.entry?.resaleUntil ?? "", option.price, option.gain];
  var analysisKey = (analysis) => [analysis.offer.id, analysis.isNew ? 1 : 0, analysis.owned, analysis.wished ? 1 : 0, analysis.receivedPrice, analysis.offer.user?.pseudo ?? ""];
  // The remaining time of an offer is text only: it refreshes with the next redraw, at most a minute late
  var minuteKey = () => Math.floor(Date.now() / 6e4);
  function ownershipNote(entry) {
    const qty = entry?.qty ?? 0;
    if (qty === 0) return h("span", { class: "kp-note" }, "Tu ne l’as pas");
    if (qty === 1) return h("span", { class: "kp-note kp-note--warn" }, "Dernier exemplaire");
    return null;
  }
  function blockedTag(entry) {
    const text = entry?.sellBlock === "resale_lock" && entry.resaleUntil ? `Bloquée encore ${formatRemaining(entry.resaleUntil)}` : "Indisponible";
    return h("span", { class: "kp-tag" }, text);
  }

  // src/features/auto-open/panel.js
  var timeFormat = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
  function statusText(state, now) {
    if (state.unavailable) return state.unavailable;
    if (!state.ready) return "Chargement…";
    if (!state.enabled) {
      const stock = `${plural(state.leftNow, "booster")} gratuit${state.leftNow > 1 ? "s" : ""} en stock`;
      return state.stopReason ? `Arrêtée : ${state.stopReason}` : `Inactive · ${stock}`;
    }
    const remaining = state.openAt == null ? null : state.openAt - now;
    const countdown = remaining == null || !Number.isFinite(remaining) ? "…" : formatCountdown(remaining);
    if (state.phase === Phase.OPENING) return "Ouverture en cours…";
    if (state.phase === Phase.BACKOFF) return `Erreur temporaire, nouvel essai dans ${countdown}`;
    return `Prochain lot : ${plural(state.target ?? 0, "booster")} · ouverture dans ${countdown}`;
  }
  function rangeRow({ label, parse, format, onChange }) {
    const field = (ariaLabel) => h("input", { class: "kp-input kp-input--short", type: "text", inputmode: "numeric", "aria-label": ariaLabel });
    const low = field(`${label} (minimum)`);
    const high = field(`${label} (maximum)`);
    let values = [0, 0];
    const show = () => {
      if (document.activeElement !== low) low.value = format(values[0]);
      if (document.activeElement !== high) high.value = format(values[1]);
    };
    const commit = () => {
      const parsed = [parse(low.value), parse(high.value)];
      if (parsed.every((value) => value != null)) onChange(parsed);
      else show();
    };
    low.addEventListener("change", commit);
    high.addEventListener("change", commit);
    const root = h("div", { class: "kp-field" }, h("span", { class: "kp-label" }, label), low, "–", high);
    return {
      root,
      set(next) {
        values = next;
        show();
      }
    };
  }
  function logRow({ at, opened, rarities }) {
    return h(
      "div",
      { class: "kp-auto-open__log-row" },
      h("span", { class: "kp-note" }, timeFormat.format(at)),
      h("strong", {}, plural(opened, "booster")),
      h("span", { class: "kp-auto-open__gems" }, rarities.flatMap(([rarity, count]) => [gem(rarity), `×${count}`]))
    );
  }
  function createAutoOpenPanel(controller) {
    let lastState = null;
    const parseCount = (text) => /^\d{1,2}$/.test(text.trim()) ? Number(text) : null;
    const status = h("p", { class: "kp-auto-open__status" });
    const toggle = h("button", { class: "kp-btn", type: "button" });
    const stats = h("p", { class: "kp-muted" });
    const log = h("div", { class: "kp-auto-open__log" });
    const batchRow = rangeRow({
      label: "Lot de boosters",
      parse: parseCount,
      format: String,
      onChange: ([batchMin, batchMax]) => controller.setSettings({ ...lastState.settings, batchMin, batchMax })
    });
    const delayRow = rangeRow({
      label: "Attente avant d’ouvrir",
      parse: parseDuration,
      format: formatDuration,
      onChange: ([delayMinMs, delayMaxMs]) => controller.setSettings({ ...lastState.settings, delayMinMs, delayMaxMs })
    });
    const trigger = h("button", {
      type: "button",
      class: "kp-auto-open__trigger",
      title: "Auto-ouverture",
      "aria-label": "Auto-ouverture",
      "aria-expanded": "false"
    }, icon("arrows-rotate"));
    const close = h("button", { class: "kp-hide", type: "button", title: "Fermer" }, icon("xmark"));
    const root = h(
      "section",
      { class: "kp-auto-open", hidden: true, "aria-label": "Auto-ouverture des boosters" },
      h("header", { class: "kp-auto-open__head" }, h("h3", { class: "kp-title kp-title--sm" }, "Auto-ouverture"), close),
      status,
      toggle,
      batchRow.root,
      delayRow.root,
      h(
        "p",
        { class: "kp-muted" },
        "Un lot et une attente sont tirés au hasard dans ces plages avant chaque ouverture. ",
        "Si le stock gratuit est plein, tout s’ouvre sans attendre pour ne rien perdre. ",
        "Seuls les boosters gratuits sont ouverts, jamais de chakra. Les réglages valent pour le prochain tirage."
      ),
      stats,
      log
    );
    const setOpen = (open) => {
      root.hidden = !open;
      trigger.setAttribute("aria-expanded", String(open));
    };
    trigger.addEventListener("click", () => setOpen(root.hidden));
    close.addEventListener("click", () => setOpen(false));
    toggle.addEventListener("click", () => lastState.enabled ? controller.stop() : controller.start());
    const tick = () => {
      if (lastState && !root.hidden) status.textContent = statusText(lastState, Date.now());
    };
    const timer = setInterval(tick, config_default.autoOpen.uiTickMs);
    return {
      root,
      trigger,
      setOpen,
      render(state) {
        lastState = state;
        trigger.classList.toggle("is-live", state.enabled);
        toggle.textContent = state.enabled ? "Arrêter" : "Activer";
        toggle.classList.toggle("kp-btn--warn", state.enabled);
        toggle.disabled = !state.enabled && (!state.ready || Boolean(state.unavailable));
        batchRow.set([state.settings.batchMin, state.settings.batchMax]);
        delayRow.set([state.settings.delayMinMs, state.settings.delayMaxMs]);
        stats.textContent = `Cette visite : ${plural(state.opened, "booster")} ouvert${state.opened > 1 ? "s" : ""}`;
        log.replaceChildren(...state.log.map(logRow));
        status.textContent = statusText(state, Date.now());
      },
      destroy() {
        clearInterval(timer);
        root.remove();
        trigger.remove();
      }
    };
  }

  // src/features/auto-open/site-counter.js
  var PILL = "header.bar .bar-side .pill:has(.meter)";
  var PERCENT = 100;
  var counterOf = (user) => ({
    text: `${user.freePacks}/${user.freePacksMax}`,
    percent: Math.min(PERCENT, user.freePacks / Math.max(1, user.freePacksMax) * PERCENT)
  });
  function showFreePacks(user) {
    const pill = document.querySelector(PILL);
    if (!pill || user?.freePacks == null || user.freePacksMax == null) return;
    const { text, percent } = counterOf(user);
    const label = pill.querySelector(".mono")?.firstChild;
    if (label?.nodeType === Node.TEXT_NODE && label.nodeValue !== text) label.nodeValue = text;
    const bar = pill.querySelector(".meter i");
    if (bar) bar.style.width = `${percent}%`;
  }

  // src/features/auto-open/index.js
  var BAR_BUTTONS = "header.bar .bar-side .opts-w";
  var RUNNING_CLASS = "kp-auto-open-on";
  var PULL_EVENT = "kyara:pull";
  var api = {
    loadMe: async () => (await meApi.bootstrap()).me,
    listPacks: () => packsApi.list(),
    getConfig: () => configApi.get(),
    openMany: (packId, count) => packsApi.openMany(packId, { count, maxChakra: 0, requestId: newRequestId() })
  };
  var notify = {
    success: (message) => toast(message, "success"),
    error: (message) => toast(message, "error"),
    pulled: (result) => {
      window.dispatchEvent(new CustomEvent(PULL_EVENT, { detail: result }));
      showFreePacks(result.user);
    }
  };
  var auto_open_default = {
    id: "auto-open",
    matches: (url) => /^\/ouvrir\/[^/]+\/?$/.test(url.pathname),
    mount() {
      const store = createStore(initialState());
      const controller = createAutoOpen({
        store,
        api,
        clock: { now: Date.now, sleep },
        notify,
        currentPackId: packIdFromPath
      });
      const panel = createAutoOpenPanel(controller);
      const unsubscribe = store.subscribe((state) => {
        panel.render(state);
        document.body.classList.toggle(RUNNING_CLASS, state.enabled);
      });
      const detach = keepAttached(panel.trigger, BAR_BUTTONS, (anchor, trigger) => {
        const siteButton = anchor.querySelector("button.icon");
        trigger.className = `${siteButton?.className ?? ""} kp-auto-open__trigger`.trim();
        anchor.before(trigger);
      });
      document.body.append(panel.root);
      panel.render(store.get());
      controller.load().catch((error) => toast(describeError(error), "error"));
      return () => {
        controller.dispose();
        unsubscribe();
        detach();
        panel.destroy();
        document.body.classList.remove(RUNNING_CLASS);
      };
    }
  };

  // src/data/catalog.js
  var pending = null;
  function loadCatalog() {
    pending ??= catalogApi.characters().then((characters) => new Map(characters.map((character) => [character.id, character]))).catch((error) => {
      pending = null;
      throw error;
    });
    return pending;
  }

  // src/features/collection-albums.js
  var ALBUM_TOOLS = "main .al-tools";
  var ALBUM_ITEM = "main ul.albums > li";
  var ALBUM_BUTTON = "main button.album";
  var SHOW_MORE = "main .more button";
  var ALBUM_LIST = "main ul.albums";
  var CARD_GRID_CELL = "main .cell";
  // The "Afficher plus" of the albums only. The cards view has its own, which must never be clicked for it: a synthetic
  // click reaches the site like a real one and closes whatever menu is open (the profile menu, for instance).
  function albumShowMore() {
    const albums = document.querySelector(ALBUM_LIST);
    if (!albums) return null;
    const buttons = [...document.querySelectorAll(SHOW_MORE)];
    return buttons.find((button) => albums.parentElement.contains(button)) ?? (document.querySelector(CARD_GRID_CELL) ? null : buttons[0] ?? null);
  }
  var albumUrl = (series) => `/collection?serie=${encodeURIComponent(series)}`;
  var albumName = (element) => element.querySelector(".a-name, .al-name")?.textContent.trim();
  var claimDateFormat = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  // Badge on each album: reward already claimed (with the date), or complete and still to claim; nothing otherwise
  function decorateClaims(stats, claimed) {
    for (const item of document.querySelectorAll(ALBUM_ITEM)) {
      const name = albumName(item);
      if (!name) continue;
      const done = claimed.get(name);
      const album = stats?.get(name);
      const complete = album && album.missingRarities.size === 0 && album.total >= config_default.series.rewardMinSize;
      const key = done ? `done:${done.completedAt ?? ""}` : complete ? "todo" : "none";
      let badge = item.querySelector(":scope .kp-claim");
      if (badge?.dataset.key === key) continue;
      badge?.remove();
      if (key === "none") continue;
      badge = done ? h("span", { class: "kp-claim kp-claim--done", title: `Récompense de cette série déjà réclamée${done.completedAt ? ` le ${claimDateFormat.format(done.completedAt)}` : ""}${done.chakra ? ` (+${formatNumber(done.chakra)} ◆)` : ""}.` }, "déjà réclamée") : h("span", { class: "kp-claim kp-claim--todo", title: "Série complète dont la récompense n’a pas encore été réclamée (page Missions)." }, "à réclamer");
      badge.dataset.key = key;
      (item.querySelector("button.album") ?? item).append(badge);
    }
  }
  function buildAlbumStats(catalog, collection) {
    const stats = /* @__PURE__ */ new Map();
    for (const card of catalog.values()) {
      if (!card.series) continue;
      if (!stats.has(card.series)) stats.set(card.series, { total: 0, missingRarities: /* @__PURE__ */ new Set() });
      const album = stats.get(card.series);
      album.total++;
      if (!(collection.get(card.id)?.qty > 0)) album.missingRarities.add(card.rarity);
    }
    return stats;
  }
  function matches(album, { minSize, maxSize, rarities }) {
    if (album.total < minSize) return false;
    if (maxSize && album.total > Math.max(maxSize, minSize)) return false;
    if (rarities.size === 0) return true;
    return album.missingRarities.size > 0 && [...album.missingRarities].every((rarity) => rarities.has(rarity));
  }
  // While filters are active, an album stays hidden until this has looked at it (class kp-checked): a freshly loaded
  // batch never flashes on screen before being filtered.
  function applyFilters(stats, filters, claimed) {
    for (const item of document.querySelectorAll(ALBUM_ITEM)) {
      const name = albumName(item);
      const album = stats?.get(name);
      const hiddenBySize = Boolean(album) && !matches(album, filters);
      const hiddenByClaim = filters.hideClaimed && Boolean(claimed?.has(name));
      item.classList.toggle("kp-filtered-out", hiddenBySize || hiddenByClaim);
      item.classList.add("kp-checked");
    }
  }
  async function expandAllAlbums(button) {
    button.disabled = true;
    for (let click = 0; click < config_default.collection.maxExpandClicks; click++) {
      const showMore = albumShowMore();
      if (!showMore) break;
      showMore.click();
      await sleep(config_default.collection.expandDelayMs);
    }
    button.disabled = false;
  }
  function sizeInput(value, onInput, onChange) {
    return h("input", {
      class: "kp-input kp-input--short",
      type: "text",
      inputmode: "numeric",
      value: value ? String(value) : "",
      onInput: (event) => {
        event.target.value = event.target.value.replace(/\D/g, "");
        onInput(Number(event.target.value) || 0);
      },
      onChange
    });
  }
  function rarityChip(rarity, filters, onChange) {
    const chip = h(
      "button",
      {
        class: "kp-gem-chip",
        type: "button",
        title: RARITY_LABELS[rarity],
        style: { "--kp-rarity": rarityColor(rarity) },
        "aria-pressed": String(filters.rarities.has(rarity))
      },
      rarity
    );
    chip.addEventListener("click", () => {
      if (filters.rarities.has(rarity)) filters.rarities.delete(rarity);
      else filters.rarities.add(rarity);
      chip.setAttribute("aria-pressed", String(filters.rarities.has(rarity)));
      onChange();
    });
    return chip;
  }
  function createFilterBar(filters, onChange) {
    const keepMaxAboveMin = () => {
      if (!filters.maxSize || filters.maxSize >= filters.minSize) return;
      filters.maxSize = filters.minSize;
      maxInput.value = String(filters.maxSize);
      onChange();
    };
    const minInput = sizeInput(filters.minSize, (value) => {
      filters.minSize = value;
      onChange();
    }, keepMaxAboveMin);
    const maxInput = sizeInput(filters.maxSize, (value) => {
      filters.maxSize = value;
      onChange();
    }, keepMaxAboveMin);
    const expandButton = h("button", { class: "kp-btn kp-btn--ghost kp-btn--sm", type: "button" }, "Tout afficher");
    expandButton.addEventListener("click", () => expandAllAlbums(expandButton));
    // toggle: hide the series whose reward was already claimed (from /me/progress)
    const claimedChip = h("button", { class: "kp-chip", type: "button", "aria-pressed": String(filters.hideClaimed), title: "Cache les séries dont la récompense a déjà été réclamée." }, "Masquer les déjà réclamées");
    claimedChip.addEventListener("click", () => {
      filters.hideClaimed = !filters.hideClaimed;
      claimedChip.setAttribute("aria-pressed", String(filters.hideClaimed));
      onChange();
    });
    return h(
      "div",
      { class: "kp-album-filters" },
      h("label", { class: "kp-field" }, h("span", { class: "kp-label" }, "Min. persos"), minInput),
      h("label", { class: "kp-field" }, h("span", { class: "kp-label" }, "Max. persos"), maxInput),
      h(
        "div",
        { class: "kp-field" },
        h("span", { class: "kp-label" }, "Il ne manque que"),
        [...RARITIES].reverse().map((rarity) => rarityChip(rarity, filters, onChange))
      ),
      claimedChip,
      expandButton
    );
  }
  function openAlbumInNewTab(event) {
    if (event.button !== 1) return;
    const button = event.target.closest(ALBUM_BUTTON);
    const name = button && albumName(button);
    if (!name) return;
    event.preventDefault();
    window.open(albumUrl(name), "_blank", "noopener");
  }
  function blockAutoscroll(event) {
    if (event.button === 1 && event.target.closest(ALBUM_BUTTON)) event.preventDefault();
  }
  var collection_albums_default = {
    id: "collection-albums",
    matches: (url) => url.pathname === "/collection",
    mount() {
      const filters = {
        minSize: readSetting("albumMinSize", 0),
        maxSize: readSetting("albumMaxSize", 0),
        rarities: new Set(readSetting("albumMissingRarities", [])),
        hideClaimed: readSetting("albumHideClaimed", false)
      };
      let stats = null;
      let claimed = null;
      let frame = 0;
      let autoClicks = 0;
      let lastAutoClick = 0;
      let autoTimer = 0;
      const filtersActive = () => filters.minSize > 0 || filters.maxSize > 0 || filters.rarities.size > 0 || filters.hideClaimed;
      // The site shows the albums by batches: when the filters hide most of a batch, the next one is requested automatically
      // (one click per DOM update, until enough albums are visible or the button is gone), so the page is never left empty.
      // While the batches load, the list is faded out and a quiet status replaces the jumping of the page
      const loadingNote = h("span", { class: "kp-muted kp-albums-loading" });
      const setLoading = (loading, loaded) => {
        document.body.classList.toggle("kp-albums-loading-state", loading);
        loadingNote.hidden = !loading;
        if (loading) loadingNote.textContent = `Chargement des séries… ${formatNumber(loaded)} parcourues`;
      };
      // the hiding starts right away when filters are on, so the first batch is not shown and then withdrawn once the data arrives
      const syncFilteringState = () => document.body.classList.toggle("kp-albums-filtering", filtersActive());
      const autoExpand = () => {
        const items = [...document.querySelectorAll(ALBUM_ITEM)];
        const done = () => setLoading(false, items.length);
        if (!filtersActive() || autoClicks >= config_default.collection.maxExpandClicks) return done();
        const visible = items.filter((item) => !item.classList.contains("kp-filtered-out")).length;
        if (visible >= config_default.collection.autoExpandMinVisible) return done();
        const showMore = albumShowMore();
        if (!showMore || showMore.disabled) return done();
        setLoading(true, items.length);
        const wait = lastAutoClick + config_default.collection.autoExpandGapMs - Date.now();
        if (wait > 0) {
          clearTimeout(autoTimer);
          autoTimer = setTimeout(apply, wait);
          return;
        }
        lastAutoClick = Date.now();
        autoClicks++;
        showMore.click();
      };
      const apply = () => {
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          syncFilteringState();
          if (stats || claimed) applyFilters(stats, filters, claimed);
          if (claimed) decorateClaims(stats, claimed);
          if (stats && (claimed || !filters.hideClaimed)) autoExpand();
        });
      };
      const onChange = () => {
        autoClicks = 0;
        writeSetting("albumMinSize", filters.minSize);
        writeSetting("albumMaxSize", filters.maxSize);
        writeSetting("albumMissingRarities", [...filters.rarities]);
        writeSetting("albumHideClaimed", filters.hideClaimed);
        apply();
      };
      const bar = createFilterBar(filters, onChange);
      bar.append(loadingNote);
      syncFilteringState();
      setLoading(filtersActive(), 0);
      const detach = keepAttached(bar, ALBUM_TOOLS, (tools, node) => tools.after(node));
      const observer = new MutationObserver(apply);
      observer.observe(document.body, { childList: true, subtree: true });
      document.addEventListener("auxclick", openAlbumInNewTab, true);
      document.addEventListener("mousedown", blockAutoscroll, true);
      Promise.all([loadCatalog(), loadCollection()]).then(([catalog, collection]) => {
        stats = buildAlbumStats(catalog, collection);
        apply();
      }).catch((error) => toast(describeError(error), "error"));
      loadClaimedSeries().then((loaded) => {
        claimed = loaded;
        apply();
      }).catch((error) => toast(`Récompenses des séries non lues : ${describeError(error)}`, "error"));
      return () => {
        detach();
        observer.disconnect();
        cancelAnimationFrame(frame);
        clearTimeout(autoTimer);
        setLoading(false, 0);
        document.body.classList.remove("kp-albums-filtering");
        document.querySelectorAll(".kp-checked").forEach((item) => item.classList.remove("kp-checked"));
        document.removeEventListener("auxclick", openAlbumInNewTab, true);
        document.removeEventListener("mousedown", blockAutoscroll, true);
        bar.remove();
        document.querySelectorAll(".kp-filtered-out").forEach((item) => item.classList.remove("kp-filtered-out"));
        document.querySelectorAll(".kp-claim").forEach((badge) => badge.remove());
      };
    }
  };

  // src/features/collection-ghosts.js
  var MISSING_CARD = "main a.slot .miss";
  var FOIL_MAX_RANK = rarityRank("E");
  function findCardScope() {
    for (const sheet of document.styleSheets) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of rules) {
        const match = rule.selectorText?.match(/\.tcg-name\.(svelte-[a-z0-9]+)/);
        if (match) return match[1];
      }
    }
    return document.querySelector('.tcg-name[class*="svelte-"]')?.className.match(/svelte-[a-z0-9]+/)?.[0] ?? "";
  }
  function siteCard(card, scope) {
    const scoped = (className) => `${className} ${scope}`.trim();
    const foil = rarityRank(card.rarity) <= FOIL_MAX_RANK;
    const showLoaded = (event) => event.target.classList.add("in");
    const useCatalogImage = (event) => {
      if (event.target.src !== card.image) event.target.src = card.image;
    };
    return h(
      "div",
      {
        class: `${scoped(`tcg r-${card.rarity}`)}${foil ? " foil" : ""}${card.heritage ? " heritage" : ""} calm kp-ghost`,
        "aria-hidden": "true",
        "data-card-id": String(card.id)
      },
      h("div", { class: "tcg-top" }, h("span", { class: scoped("tcg-name") }, card.name), h("span", { class: scoped("gem") }, card.rarity)),
      h(
        "div",
        { class: "art" },
        h("img", {
          alt: "",
          decoding: "async",
          referrerpolicy: "no-referrer",
          draggable: "false",
          class: "fade",
          src: `/cards/sm/${card.id}.webp`,
          loading: "lazy",
          onLoad: showLoaded,
          onError: useCatalogImage
        }),
        card.native ? h("span", { class: scoped("art-k"), "aria-hidden": "true" }, card.native) : null,
        h("span", { class: scoped("art-n") }, card.num)
      ),
      h("div", { class: "tcg-type" }, card.series ?? ""),
      h("div", { class: "tcg-stats" }, h("span", { class: scope }, `POW ${card.pow ?? ""}`), h("span", { class: scope }, `AURA ${card.aura ?? ""}`)),
      foil ? h("div", { class: "holo", "aria-hidden": "true" }) : null
    );
  }
  function removeStaleGhosts() {
    for (const ghost of document.querySelectorAll(".kp-ghost")) {
      const slot = ghost.closest("a.slot");
      if (!slot?.querySelector(".miss") || String(cardIdFromLink(slot)) !== ghost.dataset.cardId) ghost.remove();
    }
  }
  function decorate(catalog, scope) {
    removeStaleGhosts();
    for (const missing of document.querySelectorAll(MISSING_CARD)) {
      const slot = missing.closest("a.slot");
      const card = catalog.get(cardIdFromLink(slot));
      if (!card || slot.querySelector(".kp-ghost")) continue;
      missing.classList.add("kp-replaced");
      missing.after(siteCard(card, scope));
    }
  }
  var collection_ghosts_default = {
    id: "collection-ghosts",
    matches: (url) => url.pathname === "/collection",
    mount() {
      let catalog = null;
      let scope = "";
      let frame = 0;
      const schedule = () => {
        if (!catalog || frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          scope ||= findCardScope();
          decorate(catalog, scope);
        });
      };
      const observer = new MutationObserver(schedule);
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      loadCatalog().then((loaded) => {
        catalog = loaded;
        schedule();
      }).catch((error) => toast(describeError(error), "error"));
      return () => {
        observer.disconnect();
        cancelAnimationFrame(frame);
        document.querySelectorAll(".kp-ghost").forEach((ghost) => ghost.remove());
        document.querySelectorAll(".kp-replaced").forEach((missing) => missing.classList.remove("kp-replaced"));
      };
    }
  };

  // src/features/collection-locks.js
  var CARD_CELL = "main .cell";
  function renderLockButton(button, pinned) {
    button.classList.toggle("is-locked", pinned);
    button.title = pinned ? "Déverrouiller" : "Verrouiller";
    button.setAttribute("aria-label", button.title);
    button.replaceChildren(icon(pinned ? "lock" : "lock-open"));
  }
  var collection_locks_default = {
    id: "collection-locks",
    matches: (url) => url.pathname === "/collection",
    mount() {
      let collection = null;
      let frame = 0;
      async function toggle(button, cardId) {
        const entry = collection.get(cardId);
        const pinned = !entry.pinned;
        button.disabled = true;
        try {
          await collectionApi.setPinned(cardId, pinned);
          entry.pinned = pinned;
          renderLockButton(button, pinned);
        } catch (error) {
          toast(describeError(error), "error");
        } finally {
          button.disabled = false;
        }
      }
      function lockButton(cardId) {
        const button = h("button", { class: "kp-lock", type: "button", "data-card-id": String(cardId) });
        button.addEventListener("click", () => toggle(button, cardId));
        renderLockButton(button, Boolean(collection.get(cardId).pinned));
        return button;
      }
      function decorate2() {
        for (const cell of document.querySelectorAll(CARD_CELL)) {
          const slot = cell.querySelector("a.slot");
          const cardId = cardIdFromLink(slot);
          const current = cell.querySelector(":scope > .kp-lock");
          const owned = slot && !slot.querySelector(".miss") && collection.has(cardId);
          if (current && (!owned || current.dataset.cardId !== String(cardId))) current.remove();
          cell.classList.toggle("kp-lock-host", owned);
          if (owned && !cell.querySelector(":scope > .kp-lock")) cell.prepend(lockButton(cardId));
        }
      }
      const schedule = () => {
        if (!collection || frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          decorate2();
        });
      };
      const observer = new MutationObserver(schedule);
      observer.observe(document.body, { childList: true, subtree: true });
      loadCollection().then((loaded) => {
        collection = loaded;
        schedule();
      }).catch((error) => toast(describeError(error), "error"));
      return () => {
        observer.disconnect();
        cancelAnimationFrame(frame);
        document.querySelectorAll(".kp-lock").forEach((button) => button.remove());
        document.querySelectorAll(".kp-lock-host").forEach((cell) => cell.classList.remove("kp-lock-host"));
      };
    }
  };

  // src/lib/array.js
  function chunk(items, size) {
    const chunks = [];
    for (let start = 0; start < items.length; start += size) chunks.push(items.slice(start, start + size));
    return chunks;
  }

  // src/data/prices.js
  var cache = /* @__PURE__ */ new Map();
  var unitPrice = (row) => row.median7d || row.median30d || row.lastPrice || null;
  var isFresh = (entry, now) => entry && now - entry.at < config_default.prices.ttlMs;
  async function loadPrices(ids) {
    const now = Date.now();
    const stale = [...new Set(ids)].filter((id) => !isFresh(cache.get(id), now));
    for (const batch of chunk(stale, config_default.prices.batchSize)) {
      const rows = await collectionApi.prices(batch);
      for (const id of batch) cache.set(id, { value: null, at: now });
      for (const row of rows) cache.set(row.characterId, { value: unitPrice(row), at: now });
    }
  }
  var priceOf = (id) => cache.get(id)?.value ?? null;
  var isPriceLoaded = (id) => cache.has(id);
  function createPriceRequester(onLoaded, onError) {
    const requested = /* @__PURE__ */ new Set();
    return (ids) => {
      const missing = ids.filter((id) => !requested.has(id));
      if (missing.length === 0) return;
      missing.forEach((id) => requested.add(id));
      loadPrices(missing).then(onLoaded, onError);
    };
  }

  // src/features/collection-recycle.js
  var PRECIOUS_RARITIES = /* @__PURE__ */ new Set(["L", "M"]);
  function confirmRecycle(picks) {
    const precious = picks.filter((pick) => PRECIOUS_RARITIES.has(pick.card.rarity));
    if (precious.length === 0) return true;
    const lines = precious.map((pick) => `• ${pick.card.name} (${RARITY_LABELS[pick.card.rarity]}) ×${pick.count}`);
    return window.confirm(`Tu vas recycler des cartes rares :

${lines.join("\n")}

Continuer ?`);
  }
  async function recyclePicks(picks, onRecycled) {
    for (const pick of picks) {
      const result = await collectionApi.recycle(pick.card.id, pick.count);
      onRecycled(pick, result?.gained ?? 0);
    }
  }

  // src/features/collection-select.js
  var CARD_CELL2 = "main .cell";
  function renderPick(button, count) {
    if (button.dataset.count === String(count)) return;
    button.dataset.count = String(count);
    button.classList.toggle("is-picked", count > 0);
    button.replaceChildren(count > 0 ? `×${count}` : icon("plus"));
  }
  var collection_select_default = {
    id: "collection-select",
    matches: (url) => url.pathname === "/collection",
    mount() {
      let collection = null;
      let catalog = null;
      let frame = 0;
      const selected = /* @__PURE__ */ new Map();
      const summary = h("span", { class: "kp-pick-bar__text" });
      const recycleButton = h(
        "button",
        { class: "kp-btn kp-btn--warn kp-btn--sm", type: "button", onClick: () => recycle() },
        icon("recycle"),
        " Recycler"
      );
      const bar = h(
        "div",
        { class: "kp-pick-bar", hidden: true },
        summary,
        recycleButton,
        h("button", { class: "kp-btn kp-btn--ghost kp-btn--sm", type: "button", onClick: clear }, "Vider")
      );
      async function recycle() {
        const picks = [...selected].map(([id, count]) => ({ card: catalog.get(id), count })).filter((pick) => pick.card);
        if (picks.length === 0 || !confirmRecycle(picks)) return;
        recycleButton.disabled = true;
        let copies = 0;
        let gained = 0;
        const summaryText = () => `${plural(copies, "copie")} recyclée${copies > 1 ? "s" : ""}${gained ? ` · +${formatChakra(gained)}` : ""}.`;
        try {
          await recyclePicks(picks, (pick, chakra) => {
            copies += pick.count;
            gained += chakra;
            selected.delete(pick.card.id);
            renderBar();
          });
        } catch (error) {
          recycleButton.disabled = false;
          toast(`Recyclage interrompu : ${describeError(error)} ${copies ? summaryText() : ""}`, "error");
          await reloadCollection();
          return;
        }
        flashToast(summaryText(), "success");
        location.reload();
      }
      async function reloadCollection() {
        try {
          collection = await loadCollection();
        } catch (error) {
          toast(describeError(error), "error");
        }
        schedule();
      }
      const requestPrices = createPriceRequester(
        () => renderBar(),
        (error) => toast(describeError(error), "error")
      );
      function renderBar() {
        const copies = [...selected.values()].reduce((sum, count) => sum + count, 0);
        const value = [...selected].reduce((sum, [id, count]) => sum + (priceOf(id) ?? 0) * count, 0);
        bar.hidden = copies === 0;
        summary.textContent = `Sélection : ${plural(copies, "copie")} · ${plural(selected.size, "carte")} · ≈ ${formatChakra(value)}`;
      }
      function change(cardId, delta) {
        const max = recyclableCopies(collection.get(cardId));
        const next = Math.min(max, Math.max(0, (selected.get(cardId) ?? 0) + delta));
        if (next === 0) selected.delete(cardId);
        else selected.set(cardId, next);
        requestPrices([cardId]);
        renderBar();
        schedule();
      }
      function clear() {
        selected.clear();
        renderBar();
        schedule();
      }
      function pickButton(cardId) {
        const button = h("button", {
          class: "kp-pick",
          type: "button",
          "data-card-id": String(cardId),
          title: "Clic : ajouter une copie à recycler · clic droit : en retirer une (1 exemplaire est toujours gardé)"
        });
        button.addEventListener("click", () => change(cardId, 1));
        button.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          change(cardId, -1);
        });
        return button;
      }
      function decorateCell(cell) {
        const slot = cell.querySelector("a.slot");
        const cardId = cardIdFromLink(slot);
        const pickable = Boolean(slot) && !slot.querySelector(".miss") && recyclableCopies(collection.get(cardId)) > 0;
        let button = cell.querySelector(":scope > .kp-pick");
        if (button && (!pickable || button.dataset.cardId !== String(cardId))) {
          button.remove();
          button = null;
        }
        cell.classList.toggle("kp-pick-host", pickable);
        cell.classList.toggle("kp-picked", pickable && selected.has(cardId));
        if (!pickable) return;
        if (!button) cell.prepend(button = pickButton(cardId));
        renderPick(button, selected.get(cardId) ?? 0);
      }
      function schedule() {
        if (!collection || frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          document.querySelectorAll(CARD_CELL2).forEach(decorateCell);
        });
      }
      const observer = new MutationObserver(schedule);
      observer.observe(document.body, { childList: true, subtree: true });
      document.body.append(bar);
      showFlashToast();
      Promise.all([loadCollection(), loadCatalog()]).then(([loadedCollection, loadedCatalog]) => {
        collection = loadedCollection;
        catalog = loadedCatalog;
        schedule();
      }).catch((error) => toast(describeError(error), "error"));
      return () => {
        observer.disconnect();
        cancelAnimationFrame(frame);
        bar.remove();
        document.querySelectorAll(".kp-pick").forEach((button) => button.remove());
        document.querySelectorAll(".kp-pick-host, .kp-picked").forEach((cell) => cell.classList.remove("kp-pick-host", "kp-picked"));
      };
    }
  };

  // src/features/free-packs/paid-warning.js
  var PAID_OK_KEY = "kyara.open.paidok";
  function suppressPaidWarning() {
    const previous = sessionStorage.getItem(PAID_OK_KEY);
    sessionStorage.setItem(PAID_OK_KEY, "1");
    return () => {
      if (previous === null) sessionStorage.removeItem(PAID_OK_KEY);
      else sessionStorage.setItem(PAID_OK_KEY, previous);
    };
  }

  // src/features/free-packs/site-open.js
  function createOpenOverride() {
    const siteFetch = window.fetch;
    let armed = null;
    const isArmedOpen = (input, init) => {
      if (armed && Date.now() > armed.until) armed = null;
      return Boolean(armed) && input === armed.path && init?.method === "POST" && typeof init.body === "string";
    };
    async function overridingFetch(input, init) {
      if (!isArmedOpen(input, init)) return siteFetch.call(this, input, init);
      const response = await siteFetch.call(this, input, { ...init, body: withFreeCount(init.body, armed.count) });
      if (response.ok) armed = null;
      return response;
    }
    window.fetch = overridingFetch;
    return {
      arm(packId, count) {
        const path = `/api/packs/${encodeURIComponent(packId)}/open-many`;
        armed = { path, count, until: Date.now() + config_default.packs.overrideMs };
      },
      disarm() {
        armed = null;
      },
      restore() {
        if (window.fetch === overridingFetch) window.fetch = siteFetch;
      }
    };
  }

  // src/features/free-packs/index.js
  var COUNT_GROUP = 'main .under .multi[role="group"]';
  var SITE_COUNT_BUTTONS = `${COUNT_GROUP} button:not(.kp-free-count)`;
  var OPEN_BUTTON = "main .under button.btn-open";
  var FREE_MODE_CLASS = "kp-free-mode";
  var PULL_EVENT2 = "kyara:pull";
  var siteButtons = () => [...document.querySelectorAll(SITE_COUNT_BUTTONS)];
  var buttonCount = (button) => Number(button?.textContent.replace(/\D/g, "")) || 0;
  function placeChip(chip, count) {
    const group = document.querySelector(COUNT_GROUP);
    if (!group) return;
    const next = siteButtons().find((button) => buttonCount(button) > count) ?? null;
    if (chip.parentElement !== group || chip.nextElementSibling !== next) group.insertBefore(chip, next);
  }
  function markSelection(chip, freeSelected) {
    for (const button of siteButtons()) {
      button.classList.toggle("on", !freeSelected && button.getAttribute("aria-pressed") === "true");
    }
    const template = siteButtons().find((button) => !button.classList.contains("on"));
    chip.className = `${template?.className ?? ""} kp-free-count${freeSelected ? " on" : ""}`.trim();
    chip.setAttribute("aria-pressed", String(freeSelected));
  }
  var free_packs_default = {
    id: "free-packs",
    matches: (url) => /^\/ouvrir\/[^/]+\/?$/.test(url.pathname),
    mount() {
      const chip = h("button", { type: "button", class: "kp-free-count", hidden: true, onClick: selectFree });
      const override = createOpenOverride();
      let packs = [];
      let me = null;
      let freeMode = null;
      const currentPack = () => packs.find((pack) => pack.id === packIdFromPath());
      const freeCount = () => Math.min(freeOpensLeft(currentPack(), me), config_default.packs.maxPerOpen);
      function render() {
        const count = freeCount();
        chip.hidden = count < 2 || count >= buttonCount(siteButtons().at(-1));
        chip.textContent = `×${count}`;
        chip.title = `Ouvrir tes ${count} boosters gratuits, sans payer`;
        placeChip(chip, count);
        markSelection(chip, Boolean(freeMode));
        const openButton = document.querySelector(OPEN_BUTTON);
        if (freeMode) openButton?.setAttribute("data-kp-label", `Ouvrir ×${count} · gratuits`);
        else openButton?.removeAttribute("data-kp-label");
      }
      function selectFree() {
        const pack = currentPack();
        const count = freeCount();
        if (!pack || count < 2) return;
        siteButtons().at(-1)?.click();
        leaveFreeMode();
        override.arm(pack.id, count);
        freeMode = { restoreWarning: suppressPaidWarning(), timer: setTimeout(leaveFreeMode, config_default.packs.overrideMs) };
        document.body.classList.add(FREE_MODE_CLASS);
        requestAnimationFrame(render);
      }
      function leaveFreeMode() {
        if (!freeMode) return;
        clearTimeout(freeMode.timer);
        freeMode.restoreWarning();
        freeMode = null;
        override.disarm();
        document.body.classList.remove(FREE_MODE_CLASS);
        render();
      }
      const onSiteCountClick = (event) => event.target.closest(SITE_COUNT_BUTTONS) && leaveFreeMode();
      const onPull = (event) => {
        if (!event.detail?.user) return;
        me = event.detail.user;
        leaveFreeMode();
        render();
      };
      async function load() {
        try {
          const [packList, bootstrap] = await Promise.all([packsApi.list(), meApi.bootstrap()]);
          packs = packList;
          me = bootstrap.me;
          render();
        } catch (error) {
          toast(describeError(error), "error");
        }
      }
      window.addEventListener(PULL_EVENT2, onPull);
      document.addEventListener("click", onSiteCountClick, true);
      const detach = keepAttached(chip, COUNT_GROUP, render);
      load();
      return () => {
        detach();
        leaveFreeMode();
        override.restore();
        window.removeEventListener(PULL_EVENT2, onPull);
        document.removeEventListener("click", onSiteCountClick, true);
        chip.remove();
      };
    }
  };

  // src/features/friends-list.js
  var FRIENDS_TAB = 'main [role="tablist"] [role="tab"]:first-child[aria-selected="true"]';
  var PEOPLE_LIST = "main ul.people";
  var MESSAGE_LINK = '.acts a[href*="onglet=messages"]';
  var PINNED_KEY = "pinnedFriends";
  var ACTION_ICONS = {
    Message: "comment",
    Retirer: "user-minus",
    Bloquer: "ban"
  };
  var friendId = (item) => item.querySelector("a.who")?.getAttribute("href")?.match(/\/profil\/([^/?#]+)/)?.[1];
  var friendName = (item) => item.querySelector("a.who b")?.textContent.trim() ?? "";
  var labelOf = (action) => action.textContent.trim();
  function decorateAction(action) {
    const label = labelOf(action);
    if (!action.dataset.kpIcon && ACTION_ICONS[label]) {
      action.dataset.kpIcon = label;
      action.title = label;
      action.setAttribute("aria-label", label);
      action.prepend(icon(ACTION_ICONS[label]));
    }
    if (!action.dataset.kpIcon) return;
    action.classList.add("kp-friend-act");
    action.classList.toggle("kp-friend-act--confirm", label !== action.dataset.kpIcon);
  }
  function renderPin(button, pinned) {
    button.classList.toggle("is-pinned", pinned);
    button.title = pinned ? "Retirer des favoris" : "Mettre en favori";
    button.setAttribute("aria-label", button.title);
  }
  var friends_list_default = {
    id: "friends-list",
    matches: (url) => url.pathname === "/amis",
    mount() {
      const pinned = new Set(readSetting(PINNED_KEY, []));
      let query2 = "";
      let frame = 0;
      const search = h("input", {
        class: "kp-input kp-friend-search",
        type: "search",
        placeholder: "Rechercher un ami…",
        onInput: (event) => {
          query2 = searchKey(event.target.value.trim());
          schedule();
        }
      });
      function togglePin(id) {
        if (pinned.has(id)) pinned.delete(id);
        else pinned.add(id);
        writeSetting(PINNED_KEY, [...pinned]);
        schedule();
      }
      function pinButton(item, id) {
        let button = item.querySelector(".kp-pin");
        if (button?.dataset.friendId !== id) {
          button?.remove();
          button = h("button", { class: "kp-pin", type: "button", "data-friend-id": id }, icon("thumbtack"));
          button.addEventListener("click", () => togglePin(id));
          item.querySelector(".acts")?.prepend(button);
        }
        renderPin(button, pinned.has(id));
      }
      function decorateFriend(item) {
        const id = friendId(item);
        if (!id) return;
        pinButton(item, id);
        item.querySelectorAll(".acts > a, .acts > button:not(.kp-pin)").forEach(decorateAction);
        item.classList.toggle("kp-pinned", pinned.has(id));
        item.classList.toggle("kp-filtered-out", Boolean(query2) && !searchKey(friendName(item)).includes(query2));
      }
      function decorate2() {
        const list = document.querySelector(PEOPLE_LIST);
        const onFriendsTab = Boolean(document.querySelector(FRIENDS_TAB));
        document.body.classList.toggle("kp-friends", onFriendsTab);
        if (!onFriendsTab || !list) return search.remove();
        if (search.nextElementSibling !== list) list.before(search);
        for (const item of list.children) {
          if (item.querySelector(MESSAGE_LINK)) decorateFriend(item);
        }
      }
      function schedule() {
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          decorate2();
        });
      }
      const observer = new MutationObserver(schedule);
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["aria-selected"]
      });
      schedule();
      return () => {
        observer.disconnect();
        cancelAnimationFrame(frame);
        search.remove();
        document.body.classList.remove("kp-friends");
        document.querySelectorAll(".kp-pin").forEach((button) => button.remove());
        document.querySelectorAll("[data-kp-icon]").forEach((action) => {
          action.querySelector(":scope > i.fa-solid")?.remove();
          action.classList.remove("kp-friend-act", "kp-friend-act--confirm");
          action.removeAttribute("title");
          action.removeAttribute("aria-label");
          delete action.dataset.kpIcon;
        });
        document.querySelectorAll(".kp-pinned").forEach((item) => item.classList.remove("kp-pinned"));
        document.querySelectorAll("ul.people .kp-filtered-out").forEach((item) => item.classList.remove("kp-filtered-out"));
      };
    }
  };

  // src/features/header-nav.js
  var MARKET_LINK = 'header.hdr nav.nav a.navlink[href="/marche"]';
  var FRIENDS_PATH = "/amis";
  var ACTIVE_SYNC_MS = 500;
  var header_nav_default = {
    id: "header-nav",
    matches: () => true,
    mount() {
      const link2 = h("a", { href: FRIENDS_PATH, title: "Liste d’amis" }, "Amis");
      const syncCurrent = () => {
        const current = location.pathname.startsWith(FRIENDS_PATH);
        link2.classList.toggle("on", current);
        if (current) link2.setAttribute("aria-current", "page");
        else link2.removeAttribute("aria-current");
      };
      document.body.classList.add("kp-header");
      const detach = keepAttached(link2, MARKET_LINK, (market, node) => {
        node.className = `${market.className.replace(/\bon\b/, "").trim()} kp-nav-friends`;
        market.after(node);
        syncCurrent();
      });
      const timer = setInterval(syncCurrent, ACTIVE_SYNC_MS);
      return () => {
        detach();
        clearInterval(timer);
        link2.remove();
        document.body.classList.remove("kp-header");
      };
    }
  };

  // src/features/market-counter.js
  var TAB_LIST = 'main [role="tablist"]';
  function placeLink(tabList, link2) {
    const tabClass = tabList.querySelector('[role="tab"]')?.className.replace(/\bon\b/, "") ?? "";
    link2.className = `${tabClass} kp-tab-link`;
    tabList.append(link2);
  }
  var market_counter_default = {
    id: "market-counter",
    matches: (url) => url.pathname === "/marche",
    mount() {
      const link2 = h("a", { href: "/marche/chat", title: "Ouvrir le comptoir" }, "Comptoir ↗");
      document.body.classList.add("kp-market");
      const detach = keepAttached(link2, TAB_LIST, placeLink);
      return () => {
        detach();
        link2.remove();
        document.body.classList.remove("kp-market");
      };
    }
  };

  // src/data/me.js
  var pending2 = null;
  function loadMyId() {
    pending2 ??= meApi.bootstrap().then(({ me }) => me.id).catch((error) => {
      pending2 = null;
      throw error;
    });
    return pending2;
  }

  // Every /me/bootstrap answer seen on the page (the site's own calls as well as the script's, through the fetch/XHR
  // taps) is handed to these listeners: the header badge stays current without a request of its own.
  var bootstrapListeners = /* @__PURE__ */ new Set();
  var lastBootstrap = null;
  function notifyBootstrap(data) {
    if (!data || typeof data !== "object" || !data.me) return;
    lastBootstrap = data;
    for (const listener of bootstrapListeners) {
      try {
        listener(data);
      } catch {
      }
    }
  }
  function onBootstrap(listener) {
    bootstrapListeners.add(listener);
    if (lastBootstrap) listener(lastBootstrap);
    return () => bootstrapListeners.delete(listener);
  }

  // src/data/trade-ledger.js
  var STORAGE_KEY2 = "kyara-plus:trade-ledger";
  function readEntries() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY2)) ?? [];
    } catch {
      return [];
    }
  }
  var writeEntries = (entries) => localStorage.setItem(STORAGE_KEY2, JSON.stringify(entries));
  var oneCard = (characterId) => ({ cards: [{ characterId, qty: 1 }], chakra: 0 });
  function boardOfferEvents(offers, myId) {
    return offers.filter((offer) => offer.status === "accepted" && offer.closedAt && offer.taker).map((offer) => {
      const posted = offer.user.id === myId;
      return {
        key: `offer:${offer.id}`,
        at: Date.parse(offer.closedAt),
        approximate: false,
        partner: posted ? offer.taker : offer.user,
        gave: oneCard(posted ? offer.characterId : offer.takenWith),
        got: oneCard(posted ? offer.takenWith : offer.characterId)
      };
    });
  }
  function directTradeEvents({ incoming = [], outgoing = [] }, notifications, myId, now) {
    const acceptedAt = new Map(
      notifications.filter((item) => item.type === "trade_accepted").map((item) => [item.data.tradeId, Date.parse(item.createdAt)])
    );
    return [...incoming, ...outgoing].filter((trade) => trade.status === "accepted").map((trade) => {
      const proposed = trade.from.id === myId;
      const exact = acceptedAt.get(trade.id);
      return {
        key: `trade:${trade.id}`,
        at: exact ?? Math.min(now, Date.parse(trade.expiresAt)),
        earliestAt: exact == null ? Date.parse(trade.createdAt) : null,
        approximate: exact == null,
        partner: proposed ? trade.to : trade.from,
        gave: proposed ? trade.give : trade.want,
        got: proposed ? trade.want : trade.give
      };
    });
  }
  // Market sales and purchases: the response has no sale time, so it is inferred from prices or the auction end
  var chakraOnly = (chakra) => ({ cards: [], chakra });
  function saleTime(listing, now) {
    const createdAt = Date.parse(listing.createdAt);
    const endsAt = Date.parse(listing.endsAt);
    const lastAt = listing.prices?.lastAt ? Date.parse(listing.prices.lastAt) : null;
    const lastInListing = lastAt != null && lastAt >= createdAt;
    if (lastInListing && lastAt <= endsAt && listing.prices.lastPrice === listing.finalPrice) return { at: lastAt, earliestAt: null, approximate: false };
    if (listing.type === "auction" && listing.finalPrice !== listing.buyoutPrice) return { at: Math.min(now, endsAt), earliestAt: null, approximate: false };
    // lastAt is the latest sale of this card on the whole market: when it is not ours, ours happened before it
    const soldBefore = lastInListing ? lastAt : Infinity;
    return { at: Math.min(now, endsAt, soldBefore), earliestAt: createdAt, approximate: true };
  }
  // Buy orders: purchases are not dated by the response, they are detected when `filled` grows between two reads
  var fillSnapshot = (orders = [], now) => ({ at: now, fills: Object.fromEntries(orders.map((order) => [order.id, order.filled ?? 0])) });
  function buyOrderEvents(orders = [], seen, now) {
    if (!seen) return [];
    return orders.filter((order) => (order.filled ?? 0) > (seen.fills[order.id] ?? 0)).map((order) => {
      const qty = order.filled - (seen.fills[order.id] ?? 0);
      return {
        key: `buy:${order.id}:${order.filled}`,
        at: now,
        earliestAt: Math.max(seen.at, Date.parse(order.createdAt)),
        approximate: true,
        partner: { id: null, pseudo: "Ordre d'achat" },
        gave: chakraOnly(order.price * qty),
        got: { cards: [{ characterId: order.characterId, qty }], chakra: 0 }
      };
    });
  }
  function marketEvents({ listings = [], bids = [] }, now) {
    const sold = (listing) => listing.status === "sold" && listing.finalPrice != null;
    const kindOf = (listing) => listing.type === "auction" ? "enchère" : "prix fixe";
    const sales = listings.filter((listing) => listing.isMine && sold(listing)).map((listing) => ({
      key: `sale:${listing.id}`,
      ...saleTime(listing, now),
      partner: { id: null, pseudo: `Vente (${kindOf(listing)}) · ${listing.character.name}` },
      gave: oneCard(listing.character.id),
      got: chakraOnly(listing.finalPrice)
    }));
    const purchases = bids.filter((listing) => sold(listing) && listing.leading === true).map((listing) => ({
      key: `purchase:${listing.id}`,
      ...saleTime(listing, now),
      partner: { id: listing.seller.id, pseudo: `Achat (${kindOf(listing)}) · ${listing.character.name}` },
      gave: chakraOnly(listing.finalPrice),
      got: oneCard(listing.character.id)
    }));
    return [...sales, ...purchases];
  }
  var eventCardIds = (event) => [...event.gave.cards, ...event.got.cards].map((card) => card.characterId);
  async function fairPrices(events, pauseMs = 0) {
    const ids = [...new Set(events.flatMap(eventCardIds))];
    const prices = {};
    let first = true;
    for (const batch of chunk(ids, config_default.prices.batchSize)) {
      if (!first && pauseMs) await sleep(pauseMs);
      first = false;
      Object.assign(prices, await fairPlayApi.prices(batch));
    }
    return prices;
  }
  async function readSpaced(readers, pauseMs) {
    if (!pauseMs) return Promise.all(readers.map((read) => read()));
    const results = [];
    for (const read of readers) {
      if (results.length) await sleep(pauseMs);
      results.push(await read());
    }
    return results;
  }
  var sideValue = ({ cards, chakra = 0 }, prices) => cards.reduce((sum, card) => sum + (prices[card.characterId] ?? 0) * (card.qty ?? 1), chakra);
  async function syncTradeLedger(myId, loaded = {}, { pauseMs = 0 } = {}) {
    const now = Date.now();
    const [offers, trades, notifications, market] = await readSpaced([
      () => loaded.offers ?? tradesApi.offersMine(),
      () => loaded.trades ?? tradesApi.mine(),
      () => notificationsApi.list(),
      () => loaded.market ?? marketApi.mine()
    ], pauseMs);
    const events = [
      ...boardOfferEvents(offers, myId),
      ...directTradeEvents(trades, notifications.items ?? [], myId, now),
      ...marketEvents(market, now),
      ...buyOrderEvents(market.buyOrders, readSetting("buyOrderFills", null), now)
    ];
    const eventByKey = new Map(events.map((event) => [event.key, event]));
    const refine = (entry) => {
      const event = eventByKey.get(entry.key);
      if (!entry.approximate || !event) return entry;
      return {
        ...entry,
        at: event.approximate ? Math.min(entry.at, event.at) : event.at,
        earliestAt: entry.earliestAt ?? event.earliestAt ?? null,
        approximate: event.approximate
      };
    };
    const kept = readEntries().map(refine).filter((entry) => now - entry.at < config_default.ledger.keepMs);
    const known = new Set(kept.map((entry) => entry.key));
    const fresh = events.filter((event) => !known.has(event.key) && now - event.at < config_default.ledger.keepMs);
    const prices = fresh.length ? await fairPrices(fresh, pauseMs) : {};
    const added = fresh.map(({ key, at, earliestAt, approximate, partner, gave, got }) => ({
      key,
      at,
      earliestAt: earliestAt ?? null,
      approximate,
      partner: { id: partner.id, pseudo: partner.pseudo },
      given: sideValue(gave, prices),
      received: sideValue(got, prices)
    }));
    const entries = [...kept, ...added].sort((a, b) => a.at - b.at);
    writeEntries(entries);
    writeSetting("buyOrderFills", fillSnapshot(market.buyOrders, now));
    const details = new Map(fresh.map((event) => [event.key, { gave: journalSide(event.gave, prices), got: journalSide(event.got, prices) }]));
    recordLedgerSync(entries, details, journalMarketSummary(market));
    return entries;
  }

  // src/features/market-offers/live.js
  async function fetchNewOffers(isKnown) {
    const fresh = [];
    for (let page = 1; page <= config_default.live.maxPages; page++) {
      const { items, more } = await tradesApi.searchOffers({ page, pageSize: config_default.offers.pageSize, takeable: true });
      const unseen = items.filter((offer) => !isKnown(offer.id));
      fresh.push(...unseen.filter((offer) => offer.status === "open"));
      if (unseen.length < items.length || !more) break;
    }
    return fresh;
  }
  async function waitNextRound(baseMs, failures, isStopped) {
    const start = Date.now();
    const extra = jitter(config_default.live.jitterMs);
    for (; ; ) {
      const due = start + baseMs() * rush() * 2 ** failures + extra;
      if (isStopped() || Date.now() >= due) return;
      await sleep(Math.min(due - Date.now(), config_default.live.wakeSliceMs));
    }
  }
  function startPolling(poll, baseMs, onGiveUp) {
    let stopped = false;
    let failures = 0;
    (async () => {
      while (!stopped) {
        await waitNextRound(baseMs, failures, () => stopped);
        if (stopped) return;
        try {
          await poll();
          failures = 0;
        } catch (error) {
          if (++failures < config_default.live.maxFailures) continue;
          stopped = true;
          onGiveUp(error);
        }
      }
    })();
    return () => {
      stopped = true;
    };
  }

  // src/features/market-activity/model.js
  var Category = {
    TRADES_IN: "recus",
    TRADES_OUT: "envoyes",
    BOARD: "tableau",
    SALES: "ventes",
    BIDS: "mises",
    ORDERS: "ordres",
    // the two tabs; each shows one of its sub-categories at a time (the first one when the tab is opened)
    TRADES: "echanges",
    TRANSACTIONS: "transactions"
  };
  var GROUPS = [
    { id: Category.TRADES, short: "Échanges", label: "Échanges : reçus, envoyés et offres du tableau", icon: "right-left", subs: [Category.TRADES_IN, Category.TRADES_OUT, Category.BOARD] },
    { id: Category.TRANSACTIONS, short: "Transactions", label: "Transactions : ventes, achats et ordres d’achat", icon: "coins", subs: [Category.SALES, Category.BIDS, Category.ORDERS] }
  ];
  var groupOf = (sub) => GROUPS.find((group) => group.subs.includes(sub))?.id ?? GROUPS[0].id;
  var firstSubOf = (groupId) => GROUPS.find((group) => group.id === groupId)?.subs[0] ?? GROUPS[0].subs[0];
  var CATEGORIES = [
    {
      id: Category.TRADES_IN,
      label: "Échanges reçus",
      short: "Reçus",
      icon: "inbox"
    },
    {
      id: Category.TRADES_OUT,
      label: "Échanges envoyés",
      short: "Envoyés",
      icon: "paper-plane"
    },
    {
      id: Category.BOARD,
      label: "Offres du tableau",
      short: "Tableau",
      icon: "bullhorn"
    },
    { id: Category.SALES, label: "Ventes", short: "Ventes", icon: "tag" },
    // "Achats": cards bought and auctions won; the auctions lost are left out (isLostBid)
    { id: Category.BIDS, label: "Achats : cartes achetées et enchères gagnées", short: "Achats", icon: "bag-shopping" },
    {
      id: Category.ORDERS,
      label: "Ordres d’achat",
      short: "Ordres",
      icon: "cart-shopping"
    }
  ];
  var State = { TODO: "todo", LIVE: "live", DONE: "done" };
  var Sort = {
    SOON: "soon",
    RECENT: "recent",
    OLD: "old",
    VALUE: "value",
    GAIN: "gain"
  };
  var HISTORY_KINDS = ["ventes", "mises", "echanges"];
  var DAY_MS = 864e5;
  var WEEK_DAYS = 7;
  var time = (iso) => iso ? Date.parse(iso) : null;
  var sideOf = (side) => ({
    cards: (side?.cards ?? []).map(({ characterId, qty }) => ({
      characterId,
      qty: qty ?? 1
    })),
    chakra: side?.chakra ?? 0
  });
  var cardSide = (characterId, qty = 1) => ({
    cards: [{ characterId, qty }],
    chakra: 0
  });
  var chakraSide = (chakra) => ({ cards: [], chakra });
  function searchText(item, ctx) {
    const names = [
      ...item.give.cards,
      ...item.receive.cards,
      ...(item.choice ?? []).map((characterId) => ({ characterId }))
    ].map(({ characterId }) => ctx.cardOf(characterId)?.name ?? "").join(" ");
    return searchKey(`${item.who?.pseudo ?? ""} ${names}`);
  }
  function finish(item, ctx) {
    return { ...item, search: searchText(item, ctx) };
  }
  function saleItem(listing, ctx) {
    const active = listing.status === "active";
    return finish(
      {
        key: `l:${listing.id}`,
        category: Category.SALES,
        kind: listing.type === "auction" ? "auction" : "sale",
        state: active ? State.LIVE : State.DONE,
        outcome: listing.status,
        createdAt: time(listing.createdAt),
        endsAt: time(listing.endsAt),
        at: time(listing.endsAt),
        who: null,
        give: cardSide(listing.character.id),
        receive: chakraSide(listing.finalPrice ?? listing.currentBid ?? listing.price),
        listing
      },
      ctx
    );
  }
  function bidItem(listing, ctx) {
    const active = listing.status === "active";
    const state = !active ? State.DONE : listing.leading ? State.LIVE : State.TODO;
    return finish(
      {
        key: `b:${listing.id}`,
        category: Category.BIDS,
        kind: "bid",
        state,
        outcome: listing.status,
        createdAt: time(listing.createdAt),
        endsAt: time(listing.endsAt),
        at: time(listing.endsAt),
        who: listing.seller,
        give: chakraSide(listing.myMaxBid ?? listing.currentBid ?? 0),
        receive: cardSide(listing.character.id),
        listing
      },
      ctx
    );
  }
  function orderItem(order, ctx) {
    const open = order.status === "open";
    return finish(
      {
        key: `o:${order.id}`,
        category: Category.ORDERS,
        kind: "order",
        state: open ? State.LIVE : State.DONE,
        outcome: order.status,
        createdAt: time(order.createdAt),
        endsAt: time(order.expiresAt),
        at: time(open ? order.expiresAt : order.createdAt),
        who: null,
        give: chakraSide(order.price * (open ? order.qty - order.filled : order.filled)),
        receive: cardSide(order.characterId, order.qty),
        order
      },
      ctx
    );
  }
  function tradeItem(trade, ctx) {
    const incoming = trade.to.id === ctx.myId;
    const pending3 = trade.status === "pending";
    return finish(
      {
        key: `t:${trade.id}`,
        category: incoming ? Category.TRADES_IN : Category.TRADES_OUT,
        kind: incoming ? "tradeIn" : "tradeOut",
        state: pending3 ? incoming ? State.TODO : State.LIVE : State.DONE,
        outcome: trade.status,
        createdAt: time(trade.createdAt),
        endsAt: time(trade.expiresAt),
        at: time(pending3 ? trade.expiresAt : trade.createdAt),
        who: incoming ? trade.from : trade.to,
        give: sideOf(incoming ? trade.want : trade.give),
        receive: sideOf(incoming ? trade.give : trade.want),
        message: trade.message,
        messages: trade.messages ?? 0,
        trade
      },
      ctx
    );
  }
  function boardItem(offer, ctx) {
    const posted = offer.user.id === ctx.myId;
    const open = offer.status === "open";
    const choice = posted && open ? offer.wantIds : null;
    let give = cardSide(offer.characterId);
    let receive = choice ? { cards: [], chakra: 0 } : cardSide(offer.takenWith);
    if (!posted) [give, receive] = [receive, give];
    return finish(
      {
        key: `c:${offer.id}`,
        category: Category.BOARD,
        kind: "counter",
        state: open && posted ? State.LIVE : State.DONE,
        outcome: offer.status,
        posted,
        createdAt: time(offer.createdAt),
        endsAt: time(offer.expiresAt),
        at: time(open ? offer.expiresAt : offer.closedAt ?? offer.createdAt),
        who: posted ? offer.taker ?? null : offer.user,
        give,
        receive,
        choice,
        offer
      },
      ctx
    );
  }
  function buildItems({ mine, trades, offers }, ctx) {
    return [
      ...mine.listings.map((listing) => saleItem(listing, ctx)),
      ...mine.bids.map((listing) => bidItem(listing, ctx)),
      ...mine.buyOrders.map((order) => orderItem(order, ctx)),
      ...trades.incoming.map((trade) => tradeItem(trade, ctx)),
      ...trades.outgoing.map((trade) => tradeItem(trade, ctx)),
      ...offers.map((offer) => boardItem(offer, ctx))
    ];
  }
  function historyItems(kind, page, ctx) {
    if (kind === "echanges") {
      return [...page.trades.map((trade) => tradeItem(trade, ctx)), ...page.offers.map((offer) => boardItem(offer, ctx))];
    }
    return page.items.map((listing) => kind === "ventes" ? saleItem(listing, ctx) : bidItem(listing, ctx));
  }
  var isActive = (item) => item.state !== State.DONE;
  function categoryStats(items) {
    const empty = () => ({ total: 0, open: 0, todo: 0 });
    const stats = Object.fromEntries([...GROUPS.map(({ id }) => [id, empty()]), ...CATEGORIES.map(({ id }) => [id, empty()])]);
    for (const item of items) {
      if (isLostBid(item)) continue;
      for (const entry of [stats[item.category], stats[groupOf(item.category)]].filter(Boolean)) {
        entry.total++;
        if (isActive(item)) entry.open++;
        if (item.state === State.TODO) entry.todo++;
      }
    }
    return stats;
  }
  // A bid on a finished auction that I did not win: not a purchase, hidden everywhere
  var isLostBid = (item) => item.kind === "bid" && item.state === State.DONE && !(item.listing?.status === "sold" && item.listing?.leading === true);
  // sub: the leaf category shown (recus, envoyes, tableau, ventes, mises, ordres)
  function filterItems(items, { sub, query: query2 }) {
    const needle = searchKey(query2.trim());
    return items.filter(
      (item) => !isLostBid(item) && item.category === sub && (!needle || item.search.includes(needle))
    );
  }
  function sideValue2(side, priceOf2) {
    let total = side.chakra;
    for (const { characterId, qty } of side.cards) {
      const price = priceOf2(characterId);
      if (price == null) return null;
      total += price * qty;
    }
    return total;
  }
  var BOTH_SIDES_TRADES = /* @__PURE__ */ new Set(["tradeIn", "tradeOut", "counter"]);
  function netOf(item, priceOf2) {
    if (!BOTH_SIDES_TRADES.has(item.kind) || item.choice) return null;
    const given = sideValue2(item.give, priceOf2);
    const received = sideValue2(item.receive, priceOf2);
    return given == null || received == null ? null : received - given;
  }
  function valueOf(item, priceOf2) {
    return Math.max(sideValue2(item.give, priceOf2) ?? -1, sideValue2(item.receive, priceOf2) ?? -1);
  }
  var byNumber = (pick, direction) => (a, b) => direction * ((pick(a) ?? -Infinity) - (pick(b) ?? -Infinity));
  var momentOf = (item) => item.state === State.DONE ? item.at : item.createdAt;
  function sortItems(items, sort, priceOf2) {
    const comparators = {
      [Sort.SOON]: byNumber((item) => item.endsAt, 1),
      [Sort.RECENT]: byNumber(momentOf, -1),
      [Sort.OLD]: byNumber(momentOf, 1),
      [Sort.VALUE]: byNumber((item) => valueOf(item, priceOf2), -1),
      [Sort.GAIN]: byNumber((item) => netOf(item, priceOf2), -1)
    };
    return [...items].sort(comparators[sort]);
  }
  function finishedGroups(items, sort, now) {
    if (sort !== Sort.RECENT && sort !== Sort.OLD) return items.length ? [{ id: "done", items }] : [];
    const startOfToday = new Date(now).setHours(0, 0, 0, 0);
    const bucketOf = (item) => {
      if (item.at >= startOfToday) return "today";
      if (Math.floor((startOfToday - item.at) / DAY_MS) < 1) return "yesterday";
      return Math.floor((startOfToday - item.at) / DAY_MS) < WEEK_DAYS ? "week" : "older";
    };
    return ["today", "yesterday", "week", "older"].map((id) => ({
      id: `done:${id}`,
      items: items.filter((item) => bucketOf(item) === id)
    }));
  }
  function organize(items, { sort, now, priceOf: priceOf2 }) {
    const running = sortItems(items.filter(isActive), sort, priceOf2);
    const finished = sortItems(
      items.filter((item) => !isActive(item)),
      sort === Sort.SOON ? Sort.RECENT : sort,
      priceOf2
    );
    return [
      {
        id: State.TODO,
        items: running.filter((item) => item.state === State.TODO)
      },
      {
        id: State.LIVE,
        items: running.filter((item) => item.state === State.LIVE)
      },
      ...finishedGroups(finished, sort === Sort.SOON ? Sort.RECENT : sort, now)
    ].filter((group) => group.items.length);
  }
  function cardIds(items) {
    const ids = /* @__PURE__ */ new Set();
    for (const item of items) {
      for (const { characterId } of [...item.give.cards, ...item.receive.cards]) ids.add(characterId);
      for (const characterId of item.choice ?? []) ids.add(characterId);
    }
    return [...ids];
  }
  function netSale(price) {
    const { saleTaxPct, listingFeePct, listingFeeMin } = config_default.market;
    const tax = Math.ceil(price * saleTaxPct / 100);
    const fee = Math.max(listingFeeMin, Math.ceil(price * listingFeePct / 100));
    return price - tax - fee;
  }
  var sumOf = (list, pick) => list.reduce((sum, entry) => sum + pick(entry), 0);
  function engagedSummary({ mine, trades, offers }, { myId, chakraHeld = 0 }) {
    const orders = sumOf(
      mine.buyOrders.filter((order) => order.status === "open"),
      (order) => order.price * (order.qty - order.filled)
    );
    const pendingOut = trades.outgoing.filter((trade) => trade.status === "pending");
    const tradesChakra = sumOf(pendingOut, (trade) => trade.give.chakra);
    const bids = sumOf(
      mine.bids.filter((listing) => listing.status === "active" && listing.leading),
      (listing) => listing.myMaxBid ?? listing.currentBid ?? 0
    );
    const held = Math.max(chakraHeld, orders + tradesChakra + bids);
    return {
      held,
      orders,
      tradesChakra,
      bids,
      other: Math.max(0, held - orders - tradesChakra - bids),
      cardsHeld: sumOf(mine.holds, (hold) => hold.qty),
      inbox: trades.incoming.filter((trade) => trade.status === "pending").length,
      outbid: mine.bids.filter((listing) => listing.status === "active" && !listing.leading).length,
      selling: mine.listings.filter((listing) => listing.status === "active").length,
      offersOpen: offers.filter((offer) => offer.status === "open" && offer.user.id === myId).length
    };
  }
  function salesStats(listings) {
    const sold = listings.filter((listing) => listing.status === "sold" && listing.finalPrice != null);
    if (!sold.length) return null;
    const withMedian = sold.filter((listing) => listing.prices?.median7d);
    const gaps = withMedian.map((listing) => listing.finalPrice / listing.prices.median7d - 1);
    return {
      sold: sold.length,
      net: sumOf(sold, (listing) => netSale(listing.finalPrice)),
      vsMedian: gaps.length ? Math.round(sumOf(gaps, (gap) => gap) / gaps.length * 100) : null,
      best: sold.reduce((best, listing) => listing.finalPrice > best.finalPrice ? listing : best)
    };
  }

  // src/features/market-activity/controller.js
  var HistoryPhase = {
    IDLE: "idle",
    LOADING: "loading",
    DONE: "done",
    ERROR: "error"
  };
  var BAD_REQUEST = 400;
  function reportUnexpected(error) {
    if (!(error instanceof ApiError)) console.error("[Kyara Plus] Mon activité", error);
  }
  var initialState2 = () => ({
    phase: "loading",
    error: null,
    items: [],
    summary: null,
    stats: null,
    history: { phase: HistoryPhase.IDLE, error: null, truncated: false, full: false },
    busy: /* @__PURE__ */ new Set(),
    version: 0,
    focus: null,
    withdrawArmed: false,
    view: {
      category: Category.TRADES,
      sub: Category.TRADES_IN,
      sort: readSetting("activitySort", Sort.SOON),
      query: "",
      open: /* @__PURE__ */ new Set(),
      shown: config_default.activity.renderStep,
      native: false,
      ledgerOpen: readSetting("activityLedger", false)
    }
  });
  function createActivityController({ store, api: api3, notify: notify3, clock = { now: Date.now } }) {
    let ctx = null;
    let live = null;
    let collection = /* @__PURE__ */ new Map();
    let withdrawTimer = 0;
    let ledgerWarned = false;
    const extras = /* @__PURE__ */ new Map();
    const history2 = /* @__PURE__ */ new Map();
    const state = () => store.get();
    const patch = (changes) => store.set(changes);
    const patchView = (changes) => patch({ view: { ...state().view, ...changes } });
    const patchHistory = (changes) => patch({ history: { ...state().history, ...changes } });
    const bump = () => patch({ version: state().version + 1 });
    const cardOf = (id) => ctx.catalog.get(id) ?? extras.get(id);
    function setLive(next) {
      live = next;
      ctx.chakraHeld = next.chakraHeld;
      for (const listing of [...next.mine.listings, ...next.mine.bids])
        extras.set(listing.character.id, listing.character);
    }
    function computeItems() {
      const liveItems = buildItems(live, ctx);
      const known = new Set(liveItems.map((item) => item.key));
      return [...liveItems, ...[...history2.values()].filter((item) => !known.has(item.key))];
    }
    let publishTimer = 0;
    let publishPending = null;
    let publishedAt = -Infinity;
    function publishItems(items) {
      publishedAt = performance.now();
      patch({
        items,
        summary: engagedSummary(live, ctx),
        stats: salesStats(live.mine.listings)
      });
    }
    function flushPublish() {
      clearTimeout(publishTimer);
      publishTimer = 0;
      const pending = publishPending;
      publishPending = null;
      if (pending) publishItems(pending);
    }
    // While a history kind is loading, its pages arrive every few hundred ms: their publication is coalesced
    // (at most one store update per loadingRenderMs, first page at once) so the list is not rebuilt for each page.
    // The view itself (tab, sub-category, sort, search, expand…) is never delayed: it goes through patchView directly.
    function republish({ coalesce = false } = {}) {
      const items = computeItems();
      if (!coalesce) {
        publishPending = null;
        clearTimeout(publishTimer);
        publishTimer = 0;
        publishItems(items);
        return items;
      }
      const wait = publishedAt + config_default.activity.loadingRenderMs - performance.now();
      if (wait <= 0 && !publishTimer) {
        publishItems(items);
        return items;
      }
      publishPending = items;
      if (!publishTimer) publishTimer = setTimeout(flushPublish, Math.max(wait, 0));
      return items;
    }
    async function loadPrices2(items) {
      try {
        await api3.prices(cardIds(items));
        bump();
      } catch (error) {
        notify3.error(describeError(error));
      }
    }
    function syncLedger() {
      api3.syncLedger(live).catch((error) => {
        if (ledgerWarned) return;
        ledgerWarned = true;
        notify3.error(describeError(error));
      });
    }
    async function refreshLive() {
      setLive(await api3.live());
      loadPrices2(republish({ coalesce: false }));
      syncLedger();
    }
    async function load() {
      patch({ phase: "loading", error: null });
      try {
        // Everything the first display needs goes out at once (catalogue, collection, bootstrap, market, trades, offers:
        // the queue lets a burst through), and the first history page of the open tab is requested right behind them
        // instead of after the first display.
        const [base, liveData] = await Promise.all([api3.context(), api3.live()]);
        prefetchFirstPages(state().view.sub);
        collection = base.collection;
        ctx = { myId: base.myId, catalog: base.catalog, chakraHeld: 0, cardOf };
        setLive(liveData);
        patch({ phase: "ready" });
        loadPrices2(republish({ coalesce: false }));
        syncLedger();
        loadHistory(false, state().view.sub, { priority: true });
      } catch (error) {
        reportUnexpected(error);
        patch({ phase: "error", error: describeError(error) });
      }
    }
    let historyPageSize = config_default.activity.historyPageSize;
    // first pages requested ahead of their loadHistoryKind run (kind -> { page, promise })
    const prefetched = {};
    function prefetchFirstPages(sub) {
      for (const kind of kindsFor(sub)) {
        if (exhausted[kind] || prefetched[kind] || kindState[kind].phase !== HistoryPhase.IDLE) continue;
        const page = nextPage[kind];
        const promise = fetchHistoryPage(kind, page, true);
        promise.catch(() => {
        });
        prefetched[kind] = { page, promise };
      }
    }
    async function fetchHistoryPage(kind, page, priority = false) {
      try {
        return await api3.history(kind, page, historyPageSize, { priority });
      } catch (error) {
        if (historyPageSize === void 0 || !(error instanceof ApiError) || error.status !== BAD_REQUEST) throw error;
        historyPageSize = void 0;
        return api3.history(kind, page, void 0, { priority });
      }
    }
    // Pages are read with the next one already requested (no idle time between two pages), the three kinds at once
    // (the API queue spaces the requests anyway). The first load stops at the recent history; a full load resumes from there.
    const nextPage = Object.fromEntries(HISTORY_KINDS.map((kind) => [kind, 1]));
    const exhausted = Object.fromEntries(HISTORY_KINDS.map((kind) => [kind, false]));
    const oldestOf = (items) => items.reduce((oldest, item) => Math.min(oldest, item.at ?? item.createdAt ?? Infinity), Infinity);
    async function loadHistoryKind(kind, { full, priority = false }) {
      if (exhausted[kind]) return;
      const loaded = [];
      const cutoff = Date.now() - config_default.activity.historyDays * DAY_MS;
      const start = nextPage[kind];
      const firstStop = start + config_default.activity.historyFirstPages - 1;
      const fetchPage = (page) => {
        // the first page goes ahead of the other requests waiting: it is what the user is looking at
        const promise = fetchHistoryPage(kind, page, priority && page === start);
        promise.catch(() => {
        });
        return promise;
      };
      const warm = prefetched[kind];
      delete prefetched[kind];
      let pending = warm && warm.page === start ? warm.promise : fetchPage(start);
      for (let page = start; page <= config_default.activity.historyMaxPages; page++) {
        const result = await pending;
        const items = historyItems(kind, result, ctx);
        for (const item of items) history2.set(item.key, item);
        loaded.push(...items);
        nextPage[kind] = page + 1;
        // the first page of a run is shown at once, the next ones are coalesced
        republish({ coalesce: page !== start });
        if (!result.more || page >= config_default.activity.historyMaxPages) {
          exhausted[kind] = true;
          break;
        }
        if (!full && (page >= firstStop || oldestOf(items) < cutoff)) break;
        pending = fetchPage(page + 1);
      }
      loadPrices2(loaded);
    }
    // Each history kind is loaded on its own, when a tab that needs it is opened: Ventes → ventes, Achats → mises,
    // Échanges → echanges, Tout → the three. state.history summarises the kinds of the current tab.
    const kindState = Object.fromEntries(HISTORY_KINDS.map((kind) => [kind, { phase: HistoryPhase.IDLE, error: null, truncated: false, full: false }]));
    const kindRuns = {};
    // the history kind a sub-category needs (the three trade sub-categories share "echanges"; orders have no history)
    const KIND_OF_SUB = { [Category.TRADES_IN]: "echanges", [Category.TRADES_OUT]: "echanges", [Category.BOARD]: "echanges", [Category.SALES]: "ventes", [Category.BIDS]: "mises" };
    const kindsFor = (sub) => KIND_OF_SUB[sub] ? [KIND_OF_SUB[sub]] : [];
    function publishHistory() {
      const kinds = kindsFor(state().view.sub).map((kind) => kindState[kind]);
      const phase = kinds.some((entry) => entry.phase === HistoryPhase.LOADING) ? HistoryPhase.LOADING : kinds.some((entry) => entry.phase === HistoryPhase.ERROR) ? HistoryPhase.ERROR : kinds.every((entry) => entry.phase === HistoryPhase.DONE) ? HistoryPhase.DONE : HistoryPhase.IDLE;
      patchHistory({
        phase,
        error: kinds.find((entry) => entry.error)?.error ?? null,
        truncated: kinds.some((entry) => entry.phase === HistoryPhase.DONE && entry.truncated),
        full: kinds.some((entry) => entry.phase === HistoryPhase.LOADING && entry.full)
      });
    }
    async function runKind(kind, full, priority) {
      Object.assign(kindState[kind], { phase: HistoryPhase.LOADING, error: null, full });
      publishHistory();
      try {
        await loadHistoryKind(kind, { full, priority });
        Object.assign(kindState[kind], { phase: HistoryPhase.DONE, truncated: !exhausted[kind], full: false });
      } catch (error) {
        reportUnexpected(error);
        Object.assign(kindState[kind], { phase: HistoryPhase.ERROR, error: describeError(error), full: false });
      }
      // the last pages of this kind are shown right away, with the final status
      flushPublish();
      publishHistory();
    }
    // full: load everything that is left (older than the recent window) for the kinds of the category
    // priority: the user is waiting for this tab (its first page passes before the prefetched pages of the other tabs)
    function loadHistory(full = false, sub = state().view.sub, { priority = false } = {}) {
      const runs = kindsFor(sub).map((kind) => {
        const current = kindState[kind];
        if (current.phase === HistoryPhase.DONE && (!full || !current.truncated)) return Promise.resolve();
        if (current.phase === HistoryPhase.LOADING && (!full || current.full)) return kindRuns[kind];
        kindRuns[kind] = (kindRuns[kind] ?? Promise.resolve()).then(() => runKind(kind, full, priority));
        return kindRuns[kind];
      });
      return Promise.all(runs);
    }
    // Opening a tab shows its first sub-category (Reçus, Ventes); a sub-category loads its own history when shown.
    function setSub(sub) {
      patchView({ category: groupOf(sub), sub, shown: config_default.activity.renderStep });
      publishHistory();
      // before load() has the catalog, the tab chosen from the URL is only remembered; load() starts its history itself
      if (ctx) loadHistory(false, sub, { priority: true });
    }
    const setCategory = (category) => setSub(firstSubOf(category));
    function setSort(sort) {
      writeSetting("activitySort", sort);
      patchView({ sort });
    }
    function setQuery(query2) {
      patchView({ query: query2, shown: config_default.activity.renderStep });
    }
    function toggleOpen(key) {
      const open = new Set(state().view.open);
      if (!open.delete(key)) open.add(key);
      patchView({ open });
    }
    function showMore() {
      patchView({ shown: state().view.shown + config_default.activity.renderStep });
    }
    function setNative(native) {
      patchView({ native });
    }
    function toggleLedger() {
      const ledgerOpen = !state().view.ledgerOpen;
      writeSetting("activityLedger", ledgerOpen);
      patchView({ ledgerOpen });
    }
    async function focusTrade(tradeId) {
      const key = `t:${tradeId}`;
      const find = () => state().items.find((item2) => item2.key === key);
      let item = find();
      if (!item) {
        await loadHistory(false, Category.TRADES_IN, { priority: true });
        item = find();
      }
      if (!item) {
        await loadHistory(true, Category.TRADES_IN, { priority: true });
        item = find();
      }
      if (!item) return;
      const open = new Set(state().view.open).add(key);
      patchView({
        category: groupOf(item.category),
        sub: item.category,
        query: "",
        open,
        shown: Math.max(state().view.shown, state().items.length)
      });
      patch({ focus: { key, until: clock.now() + config_default.activity.focusMs } });
    }
    function setBusy(key, busy) {
      const next = new Set(state().busy);
      if (busy) next.add(key);
      else next.delete(key);
      patch({ busy: next });
    }
    async function reloadAfterChange() {
      try {
        const [, owned] = await Promise.all([refreshLive(), api3.reloadCollection()]);
        collection = owned;
        bump();
      } catch (error) {
        notify3.error(describeError(error));
      }
    }
    async function run(key, task, success) {
      setBusy(key, true);
      try {
        const result = await task();
        notify3.success(typeof success === "function" ? success(result) : success);
      } catch (error) {
        notify3.error(describeError(error));
      }
      await reloadAfterChange();
      setBusy(key, false);
    }
    const forTrade = (action, success) => (item) => run(item.key, () => api3.tradeAction(item.trade.id, action), success);
    const actions2 = {
      accept: forTrade("accept", "Échange accepté."),
      decline: forTrade("decline", "Échange refusé."),
      cancelTrade: forTrade("cancel", "Proposition annulée."),
      cancelOffer: (item) => run(item.key, () => api3.cancelOffer(item.offer.id), "Offre retirée."),
      cancelListing: (item) => run(item.key, () => api3.cancelListing(item.listing.id), "Vente retirée, la carte t’est revenue."),
      cancelOrder: (item) => run(item.key, () => api3.cancelOrder(item.order.id), "Ordre annulé, chakra débloqué.")
    };
    function withdrawSummary(result) {
      const total = result.listings + result.orders + result.trades + result.offers;
      if (!total) return "Rien à retirer : tu n’as rien en cours sur le marché.";
      const counts = [
        `${result.listings} ventes`,
        `${result.orders} ordres`,
        `${result.trades} échanges`,
        `${result.offers} offres`
      ].join(", ");
      const bids = result.auctionsWithBids;
      const kept = bids ? ` ${bids} enchère(s) avec mises vont jusqu’au bout.` : "";
      return `Retiré : ${counts}.${kept}`;
    }
    function withdrawAll() {
      if (!state().withdrawArmed) {
        patch({ withdrawArmed: true });
        withdrawTimer = setTimeout(() => patch({ withdrawArmed: false }), config_default.activity.withdrawConfirmMs);
        return Promise.resolve();
      }
      clearTimeout(withdrawTimer);
      patch({ withdrawArmed: false });
      return run(
        "withdraw-all",
        async () => withdrawSummary(await api3.withdrawAll()),
        (message) => message
      );
    }
    return {
      load,
      refreshLive,
      loadHistory,
      setCategory,
      setSub,
      setSort,
      setQuery,
      toggleOpen,
      showMore,
      setNative,
      toggleLedger,
      focusTrade,
      withdrawAll,
      actions: actions2,
      cardOf: (id) => ctx ? cardOf(id) : void 0,
      ownedOf: (id) => collection.get(id)?.qty ?? 0,
      dispose: () => {
        clearTimeout(withdrawTimer);
        clearTimeout(publishTimer);
      }
    };
  }

  // src/features/market-activity/labels.js
  var KINDS = {
    sale: { kanji: "売", label: "Vente" },
    auction: { kanji: "競", label: "Enchère" },
    bid: { kanji: "札", label: "Ma mise" },
    order: { kanji: "注", label: "Ordre d’achat" },
    tradeIn: { kanji: "換", label: "Échange reçu" },
    tradeOut: { kanji: "換", label: "Échange envoyé" },
    counter: { kanji: "台", label: "Offre du tableau" }
  };
  var dayFormat = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short"
  });
  var clockFormat2 = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit"
  });
  var tone = (text, kind) => ({ text, tone: kind });
  var TRADE_OUTCOMES = {
    accepted: tone("Accepté", "good"),
    declined: tone("Refusé", "bad"),
    cancelled: tone("Annulé", "muted"),
    expired: tone("Expiré", "muted")
  };
  function tradeStatus(item) {
    if (item.state === State.TODO) return tone("Attend ta réponse", "warn");
    if (item.state === State.LIVE) return tone(`En attente de ${item.who.pseudo}`, "muted");
    return TRADE_OUTCOMES[item.outcome] ?? tone(item.outcome, "muted");
  }
  function boardStatus(item) {
    const names = { cancelled: "Retirée", expired: "Expirée" };
    if (item.outcome === "open") return tone("Proposée à tous", "accent");
    if (item.outcome !== "accepted") return tone(names[item.outcome] ?? item.outcome, "muted");
    return tone(item.posted ? `Prise par ${item.who?.pseudo ?? "?"}` : "Acceptée", "good");
  }
  function listingStatus(item) {
    const { listing } = item;
    if (listing.status === "active") {
      if (item.kind === "sale") return tone("En vente", "accent");
      return tone(
        listing.bidCount ? `${plural(listing.bidCount, "mise")} · ${formatChakra(listing.currentBid)}` : "Aucune mise",
        "accent"
      );
    }
    const names = {
      sold: "Vendue",
      expired: "Expirée, carte rendue",
      cancelled: "Retirée, carte rendue"
    };
    return tone(names[listing.status] ?? listing.status, listing.status === "sold" ? "good" : "muted");
  }
  function bidStatus(item) {
    if (item.state === State.TODO) return tone("Enchère dépassée", "warn");
    if (item.state === State.LIVE) return tone("Tu es en tête", "good");
    const won = item.listing.leading && item.listing.status === "sold";
    return won ? tone("Remportée", "good") : tone("Terminée", "muted");
  }
  function orderStatus(item) {
    const { order } = item;
    if (order.status === "open") return tone(`Achetées : ${order.filled} sur ${order.qty}`, "accent");
    const names = {
      filled: "Achetée",
      cancelled: "Annulé, chakra rendu",
      expired: "Expiré, chakra rendu"
    };
    return tone(names[order.status] ?? order.status, order.status === "filled" ? "good" : "muted");
  }
  function statusOf(item) {
    switch (item.kind) {
      case "tradeIn":
      case "tradeOut":
        return tradeStatus(item);
      case "counter":
        return boardStatus(item);
      case "bid":
        return bidStatus(item);
      case "order":
        return orderStatus(item);
      default:
        return listingStatus(item);
    }
  }
  function titleOf(item, cardOf) {
    const cardName = (id) => cardOf(id)?.name ?? `Carte ${id}`;
    switch (item.kind) {
      case "tradeIn":
      case "tradeOut":
        return `Avec ${item.who.pseudo}`;
      case "counter":
        return item.posted ? "Ton offre" : `Offre de ${item.who.pseudo}`;
      case "order": {
        const { qty } = item.receive.cards[0];
        return `${cardName(item.receive.cards[0].characterId)}${qty > 1 ? ` ×${qty}` : ""}`;
      }
      case "bid":
        return `${cardName(item.receive.cards[0].characterId)} · ${item.who.pseudo}`;
      default:
        return cardName(item.give.cards[0].characterId);
    }
  }
  function formatWhen(ms, now) {
    const date = new Date(ms);
    const sameDay = new Date(now).toDateString() === date.toDateString();
    const clock = clockFormat2.format(date);
    return sameDay ? `aujourd’hui ${clock}` : `${dayFormat.format(date)} ${clock}`;
  }
  function timeOf(item, now) {
    if (item.state !== State.DONE) return item.endsAt ? `expire dans ${formatRemaining(item.endsAt)}` : "";
    return item.at ? formatWhen(item.at, now) : "";
  }

  // src/features/market-activity/rows.js
  var gainTone = (net) => net > 0 ? "up" : net < 0 ? "down" : "flat";
  var missingTile = () => h("span", { class: "kp-art kp-art--md kp-art--missing", title: "Carte inconnue" }, "?");
  function ownedBadge(owned) {
    return owned > 0 ? h("span", { class: "kp-badge", title: "Exemplaires que tu as" }, `×${owned}`) : h("span", { class: "kp-badge kp-badge--new" }, "Nouveau");
  }
  function tile({ characterId, qty }, view, { name = true } = {}) {
    const card = view.cardOf(characterId);
    if (!card) return missingTile();
    const price = view.priceOf(characterId);
    return h(
      "div",
      { class: "kp-tcard", title: card.name },
      cardArt(card, "md", [ownedBadge(view.ownedOf(characterId))]),
      name ? h("strong", { class: "kp-name" }, qty > 1 ? `${card.name} ×${qty}` : card.name) : null,
      h("span", { class: "kp-price" }, price == null ? "? ◆" : formatChakra(price * qty))
    );
  }
  function sideBlock(label, side, choice, view, { all = false } = {}) {
    const entries = choice ? choice.map((characterId) => ({ characterId, qty: 1 })) : side.cards;
    const limit = all ? entries.length : config_default.activity.compactThumbLimit;
    const hidden = entries.length - limit;
    const total = choice ? null : sideValue2(side, view.priceOf);
    return h(
      "section",
      { class: "kp-act__side" },
      h("span", { class: "kp-label" }, choice ? `${label} · une au choix` : label),
      h(
        "div",
        { class: "kp-act__tiles" },
        entries.slice(0, limit).map((entry) => tile(entry, view)),
        hidden > 0 ? h("span", { class: "kp-act__more" }, `+${hidden}`) : null,
        side.chakra ? h("span", { class: "kp-act__chakra" }, formatChakra(side.chakra)) : null,
        !entries.length && !side.chakra ? h("span", { class: "kp-muted" }, "—") : null
      ),
      all && total != null ? h("span", { class: "kp-price" }, `≈ ${formatChakra(total)}`) : null
    );
  }
  function netPill(item, view) {
    const net = netOf(item, view.priceOf);
    if (net == null) return null;
    const given = sideValue2(item.give, view.priceOf);
    const received = sideValue2(item.receive, view.priceOf);
    const text = net === 0 ? "Équilibré" : `${formatGain(net)} ◆ ${net > 0 ? "gagnés" : "perdus"}`;
    return h(
      "span",
      {
        class: `kp-gain kp-gain--${gainTone(net)} kp-act__net`,
        title: `Tu reçois ≈ ${formatChakra(received)}, tu donnes ≈ ${formatChakra(given)}`
      },
      text
    );
  }
  function salePill(item) {
    if (item.kind !== "sale" && item.kind !== "auction") return null;
    const { listing } = item;
    const median = listing.prices?.median7d;
    if (!median) return null;
    const price = listing.finalPrice ?? listing.currentBid ?? listing.price;
    const gap = Math.round((price / median - 1) * 100);
    return h(
      "span",
      {
        class: `kp-gain kp-gain--${gainTone(gap)} kp-act__net`,
        title: `Prix face à la médiane des 7 derniers jours (${formatChakra(median)})`
      },
      `${gap > 0 ? "+" : ""}${gap} % face à la médiane`
    );
  }
  var link = (href, text) => h("a", { class: "kp-act__link", href }, text);
  function listingFacts(item) {
    const { listing } = item;
    const price = listing.finalPrice ?? listing.currentBid ?? listing.price;
    const facts = [[item.kind === "auction" ? "Mise de départ" : "Prix demandé", formatChakra(listing.price)]];
    if (listing.buyoutPrice) facts.push(["Achat immédiat", formatChakra(listing.buyoutPrice)]);
    if (item.kind !== "bid") {
      const label = listing.status === "sold" ? "Tu as touché" : "Tu toucheras";
      facts.push([label, `${formatChakra(netSale(price))} (taxe et frais déduits)`]);
    }
    if (listing.bidCount) {
      facts.push(["Mises", `${listing.bidCount}, la meilleure à ${formatChakra(listing.currentBid)}`]);
    }
    if (item.kind === "bid") {
      facts.push(["Ta mise maximale", formatChakra(listing.myMaxBid)]);
    }
    if (listing.prices?.median7d) {
      const sales = plural(listing.prices.sales7d, "vente");
      facts.push(["Médiane sur 7 jours", `${formatChakra(listing.prices.median7d)} · ${sales}`]);
    }
    facts.push(["Annonce", link(`/marche?annonce=${listing.id}`, "Ouvrir l’annonce")]);
    return facts;
  }
  function detailFacts(item, view) {
    const created = item.createdAt ? formatWhen(item.createdAt, view.now) : null;
    const base = [created ? ["Créé", created] : null];
    if (item.listing) return [...base, ...listingFacts(item)];
    if (item.order) {
      const { order } = item;
      return [
        ...base,
        ["Prix à l’unité", formatChakra(order.price)],
        ["Achetées", `${order.filled} sur ${order.qty}`],
        ["Chakra mis de côté", formatChakra(order.price * (order.qty - order.filled))]
      ];
    }
    const message = item.message ? ["Message", `« ${item.message} »`] : null;
    const talkHref = item.trade && `/marche?onglet=echanges&echange=${item.trade.id}&discussion=1`;
    const talk = item.trade ? ["Discussion", link(talkHref, `Ouvrir (${item.messages})`)] : null;
    return [message, talk];
  }
  function hasOverflow(item) {
    const limit = config_default.activity.compactThumbLimit;
    return [item.give.cards, item.receive.cards, item.choice ?? []].some((list) => list.length > limit);
  }
  var hasDetail = (item, view) => detailFacts(item, view).some(Boolean) || variantOf(item) === "compact" && hasOverflow(item);
  function detail(item, view) {
    const facts = detailFacts(item, view).filter(Boolean);
    return h(
      "div",
      { class: "kp-act__detail" },
      variantOf(item) === "compact" && hasOverflow(item) ? h(
        "div",
        { class: "kp-act__full" },
        sideBlock("Tu reçois", item.receive, item.choice, view, {
          all: true
        }),
        sideBlock("Tu donnes", item.give, null, view, { all: true })
      ) : null,
      h(
        "dl",
        { class: "kp-act__facts" },
        facts.flatMap(([label, value]) => [h("dt", {}, label), h("dd", {}, value ?? "—")])
      )
    );
  }
  function actionButtons(item, view) {
    const { actions: actions2 } = view.controller;
    const button = (label, onClick, { ghost = true, attrs = {} } = {}) => h(
      "button",
      {
        class: `kp-btn kp-btn--sm${ghost ? " kp-btn--ghost" : ""}`,
        type: "button",
        onClick: () => onClick(item),
        ...attrs
      },
      label
    );
    const open = (label, href) => h("a", { class: "kp-btn kp-btn--sm kp-btn--ghost", href }, label);
    switch (item.kind) {
      case "tradeIn":
        return item.state === State.TODO ? [button("Accepter", actions2.accept, { ghost: false }), button("Refuser", actions2.decline)] : [];
      case "tradeOut":
        return item.state === State.LIVE ? [button("Annuler", actions2.cancelTrade)] : [];
      case "counter":
        return item.state === State.LIVE ? [button("Retirer", actions2.cancelOffer)] : [];
      case "order":
        return item.state === State.LIVE ? [button("Annuler", actions2.cancelOrder)] : [];
      case "bid": {
        const href = `/marche?onglet=encheres&annonce=${item.listing.id}`;
        return item.state === State.DONE ? [] : [open(item.state === State.TODO ? "Surenchérir" : "Voir", href)];
      }
      default: {
        if (item.state !== State.LIVE) return [];
        const locked = item.kind === "auction" && item.listing.bidCount > 0;
        const attrs = locked ? {
          disabled: true,
          title: "Une enchère qui a des mises va jusqu’au bout."
        } : {};
        return [button("Retirer", actions2.cancelListing, { attrs })];
      }
    }
  }
  var VARIANTS = { tradeIn: "wide", tradeOut: "wide", counter: "compact" };
  function variantOf(item) {
    return VARIANTS[item.kind] ?? "mini";
  }
  function actions(item, view, open) {
    return h(
      "div",
      { class: "kp-act__acts" },
      actionButtons(item, view),
      hasDetail(item, view) ? h(
        "button",
        {
          class: "kp-hide kp-act__chev",
          type: "button",
          "aria-expanded": String(open),
          title: open ? "Replier" : "Détails",
          onClick: () => view.controller.toggleOpen(item.key)
        },
        icon(open ? "chevron-up" : "chevron-down")
      ) : null
    );
  }
  function toggleOnClick(item, view) {
    return (event) => {
      if (hasDetail(item, view) && !event.target.closest("a, button")) view.controller.toggleOpen(item.key);
    };
  }
  function header(item, view, ...extra) {
    const status = statusOf(item);
    const kind = KINDS[item.kind];
    const title = titleOf(item, view.cardOf);
    return h(
      "div",
      { class: "kp-act__head", onClick: toggleOnClick(item, view) },
      view.showKind ? h("span", { class: "kp-act__kind", "data-kind": item.kind, title: kind.label }, kind.kanji) : null,
      h(
        "div",
        { class: "kp-act__txt" },
        h("strong", { class: "kp-name", title }, title),
        view.showKind ? h("span", { class: "kp-label" }, kind.label) : null
      ),
      h(
        "div",
        { class: "kp-act__state" },
        h("span", { class: `kp-act__status kp-act__status--${status.tone}` }, status.text),
        h("span", { class: "kp-note" }, timeOf(item, view.now))
      ),
      extra
    );
  }
  function ownershipNotes(side, giving, view) {
    const owned = ({ characterId }) => view.ownedOf(characterId);
    const notes = giving ? [[side.cards.filter((entry) => owned(entry) <= entry.qty).length, "dernier exemplaire", "warn"]] : [
      [side.cards.filter((entry) => owned(entry) === 0).length, "nouvelle", "new"],
      [side.cards.filter((entry) => owned(entry) > 0).length, "déjà possédée", "muted"]
    ];
    return notes.filter(([count]) => count > 0).map(([count, word, tone2]) => h("span", { class: `kp-act__note kp-act__note--${tone2}` }, plural(count, word)));
  }
  function wideBox(label, side, view, { giving, live }) {
    const count = side.cards.reduce((sum, entry) => sum + entry.qty, 0);
    const total = sideValue2(side, view.priceOf);
    return h(
      "section",
      { class: "kp-act__box" },
      h(
        "header",
        { class: "kp-act__box-head" },
        h("span", { class: "kp-label" }, `${label} · ${count}`),
        live ? ownershipNotes(side, giving, view) : null,
        side.chakra ? h("span", { class: "kp-tag" }, `+ ${formatChakra(side.chakra)}`) : null,
        h("span", { class: "kp-price kp-act__box-total" }, `≈ ${formatChakra(total)}`)
      ),
      h(
        "div",
        { class: "kp-act__grid" },
        side.cards.map((entry) => tile(entry, view, { name: false }))
      )
    );
  }
  function wideBody(item, view, open) {
    const live = item.state !== State.DONE;
    return [
      header(item, view, netPill(item, view), actions(item, view, open)),
      h(
        "div",
        { class: "kp-act__boxes" },
        wideBox("Tu donnes", item.give, view, { giving: true, live }),
        h("span", { class: "kp-swap" }, icon("arrow-right-arrow-left")),
        wideBox("Tu reçois", item.receive, view, { giving: false, live })
      )
    ];
  }
  function compactBody(item, view, open) {
    return [
      header(item, view),
      h(
        "div",
        { class: "kp-act__cards" },
        sideBlock("Tu reçois", item.receive, item.choice, view),
        h("span", { class: "kp-swap" }, icon("arrow-right-arrow-left")),
        sideBlock("Tu donnes", item.give, null, view)
      ),
      h(
        "div",
        { class: "kp-act__foot" },
        h("div", { class: "kp-act__meta" }, netPill(item, view)),
        actions(item, view, open)
      )
    ];
  }
  function miniBody(item, view, open) {
    const entry = [...item.give.cards, ...item.receive.cards][0];
    const card = view.cardOf(entry.characterId);
    const status = statusOf(item);
    const title = titleOf(item, view.cardOf);
    const amount = item.give.chakra || item.receive.chakra;
    return [
      h(
        "div",
        { class: "kp-act__mini", onClick: toggleOnClick(item, view) },
        card ? cardArt(card, "sm", []) : missingTile(),
        h(
          "div",
          { class: "kp-act__txt" },
          h("strong", { class: "kp-name", title }, title),
          h(
            "span",
            { class: "kp-note" },
            view.showKind ? `${KINDS[item.kind].label} · ` : null,
            h("span", { class: `kp-act__status kp-act__status--${status.tone}` }, status.text),
            ` · ${timeOf(item, view.now)}`
          )
        ),
        h(
          "div",
          { class: "kp-act__money" },
          h("strong", { class: "kp-act__amount" }, formatChakra(amount)),
          salePill(item)
        ),
        actions(item, view, open)
      )
    ];
  }
  var BODIES = { wide: wideBody, compact: compactBody, mini: miniBody };
  function activityRow(item, view) {
    const { state } = view;
    const open = state.view.open.has(item.key);
    const focused = state.focus?.key === item.key && view.now < state.focus.until;
    const variant = variantOf(item);
    const classes = ["kp-act__row", `kp-act__row--${item.state}`, `kp-act__row--${variant}`];
    if (open) classes.push("is-open");
    if (focused) classes.push("is-focus");
    if (state.busy.has(item.key)) classes.push("is-busy");
    return h(
      "li",
      { class: classes.join(" "), id: `kp-act-${item.key}`, "data-kind": item.kind },
      BODIES[variant](item, view, open),
      open && hasDetail(item, view) ? detail(item, view) : null
    );
  }

  // src/features/market-activity/summary.js
  var SEGMENTS = [
    ["orders", "Ordres d’achat", "var(--cyan)"],
    ["tradesChakra", "Échanges envoyés", "color-mix(in srgb, var(--cyan) 62%, var(--panel))"],
    ["bids", "Enchères en tête", "color-mix(in srgb, var(--cyan) 34%, var(--panel))"],
    ["other", "En cours de règlement", "var(--line3)"]
  ];
  var signed = (value) => value > 0 ? `+${value}` : String(value);
  function lede(summary) {
    const todo = [];
    if (summary.inbox) {
      todo.push(`${plural(summary.inbox, "échange")} ${summary.inbox > 1 ? "attendent" : "attend"} ta réponse`);
    }
    if (summary.outbid) todo.push(`${plural(summary.outbid, "enchère")} dépassée${summary.outbid > 1 ? "s" : ""}`);
    // nothing to answer: no sentence at all (the line is hidden)
    return todo.join(" · ");
  }
  function stat(label, value, { onClick, active = false, title } = {}) {
    return h(
      onClick ? "button" : "span",
      {
        class: `kp-act__stat${active ? " is-on" : ""}`,
        type: onClick ? "button" : void 0,
        onClick,
        title
      },
      label,
      h("strong", {}, value)
    );
  }
  function ledgerBar(summary) {
    const total = SEGMENTS.reduce((sum, [key]) => sum + summary[key], 0);
    if (!total) return h("p", { class: "kp-muted" }, "Rien n’est mis de côté : tout ton chakra est disponible.");
    const used = SEGMENTS.filter(([key]) => summary[key] > 0);
    return h(
      "div",
      { class: "kp-act__ledger-bar" },
      h(
        "div",
        { class: "kp-act__bar-track" },
        used.map(
          ([key, label, color]) => h("span", {
            style: {
              width: `${summary[key] / total * 100}%`,
              background: color
            },
            title: label
          })
        )
      ),
      h(
        "ul",
        { class: "kp-act__legend" },
        used.map(
          ([key, label, color]) => h("li", {}, h("i", { style: { background: color } }), `${label} : ${formatChakra(summary[key])}`)
        )
      )
    );
  }
  function salesLine(stats) {
    if (!stats) return null;
    const parts = [
      `${plural(stats.sold, "vente")} conclues`,
      `${formatChakra(stats.net)} gagnés, taxes et frais déduits`,
      stats.vsMedian == null ? null : `prix moyen ${signed(stats.vsMedian)} % face à la médiane`,
      `meilleure vente : ${formatChakra(stats.best.finalPrice)}`
    ];
    return h("p", { class: "kp-act__sales" }, icon("chart-line"), parts.filter(Boolean).join(" · "));
  }
  function createSummary(controller) {
    // Only the one-line status stays here ("Rien n’attend ta réponse", "2 échanges attendent ta réponse…"):
    // the chakra held is shown next to the balance in the site's header (header-chakra.js), and the pills
    // "Chakra engagé" / "Cartes bloquées 48 h" and the breakdown bar they opened were retired on request.
    const heading = h("span", { class: "kp-act__lede" });
    const inline = h("div", { class: "kp-act__summary" }, heading);
    return {
      inline,
      render(state) {
        const { summary, items } = state;
        inline.hidden = !summary;
        if (!summary) return;
        const text = lede(summary);
        heading.textContent = text;
        heading.hidden = !text;
      }
    };
  }

  // src/features/market-activity/panel.js
  var SORT_LABELS = {
    [Sort.SOON]: "Échéance",
    [Sort.RECENT]: "Plus récents",
    [Sort.OLD]: "Plus anciens",
    [Sort.VALUE]: "Plus de valeur",
    [Sort.GAIN]: "Plus de gain"
  };
  var TABS = GROUPS.map(({ id, label, short, icon: icon2 }) => ({ id, label, short, icon: icon2 }));
  var SUB_INFO = Object.fromEntries(CATEGORIES.map((category) => [category.id, category]));
  var GROUP_TITLES = {
    [State.TODO]: "À traiter",
    [State.LIVE]: "En cours",
    done: "Terminés",
    "done:today": "Terminés · aujourd’hui",
    "done:yesterday": "Terminés · hier",
    "done:week": "Terminés · cette semaine",
    "done:older": "Terminés · plus ancien"
  };
  var LAYOUTS = {
    [Category.BOARD]: "board",
    [Category.SALES]: "minis",
    [Category.BIDS]: "minis",
    [Category.ORDERS]: "minis"
  };
  var WITHDRAWABLE = /* @__PURE__ */ new Set([Category.SALES, Category.ORDERS, Category.TRADES_OUT, Category.BOARD]);
  function createTab(controller, tab) {
    const count = h("span", { class: "n" });
    const button = h(
      "button",
      {
        class: "kp-act__tab",
        type: "button",
        role: "tab",
        title: tab.label,
        onClick: () => controller.setCategory(tab.id)
      },
      icon(tab.icon),
      h("span", { class: "kp-act__tab-label" }, tab.short),
      count
    );
    return { id: tab.id, button, count };
  }
  function createActivityPanel(controller, { onSell }) {
    let lastFocus = null;
    let current = null;
    // Row nodes are kept between renders, keyed by item: switching a tab, a sub-category or the sort re-attaches the rows
    // already built (images decoded, no layout from scratch) and only builds the missing ones. A row is rebuilt when what it
    // shows changed: open / focused / busy state, prices (state.version), kind label, or the minute (relative times).
    const rowCache = /* @__PURE__ */ new Map();
    let renderTick = 0;
    const rowSignature = (item, view) => {
      const { state } = view;
      const focused = state.focus?.key === item.key && view.now < state.focus.until;
      return `${state.view.open.has(item.key) ? 1 : 0}${focused ? 1 : 0}${state.busy.has(item.key) ? 1 : 0}|${state.version}|${view.showKind ? 1 : 0}|${Math.floor(view.now / 6e4)}`;
    };
    function rowFor(item, view) {
      const signature = rowSignature(item, view);
      const key = `${item.key}|${view.showKind ? 1 : 0}`;
      const cached = rowCache.get(key);
      if (cached && cached.item === item && cached.signature === signature) {
        cached.tick = renderTick;
        return cached.node;
      }
      const node = activityRow(item, view);
      rowCache.set(key, { item, signature, node, tick: renderTick });
      return node;
    }
    function pruneRowCache() {
      if (rowCache.size <= config_default.activity.rowCacheMax) return;
      for (const [key, entry] of rowCache) if (entry.tick !== renderTick) rowCache.delete(key);
    }
    const buildRowView = (state) => ({
      state,
      controller,
      cardOf: controller.cardOf,
      priceOf,
      ownedOf: controller.ownedOf,
      // a list always shows one kind of item: the kind label on each row is not needed
      showKind: false,
      now: Date.now()
    });
    // The rows of the other sub-categories of the open tab are built in idle time, so the first click on
    // a sub-category only re-attaches rows that already exist.
    let idleHandle = 0;
    function prebuildSiblings(state) {
      if (typeof requestIdleCallback !== "function") return;
      cancelIdleCallback(idleHandle);
      idleHandle = 0;
      if (state.view.native) return;
      const pending = (GROUPS.find((group) => group.id === state.view.category)?.subs ?? []).filter((sub) => sub !== state.view.sub);
      const work = (deadline) => {
        while (pending.length && deadline.timeRemaining() > 6) {
          const sibling = { ...state, view: { ...state.view, sub: pending.shift(), shown: config_default.activity.renderStep } };
          const view = buildRowView(sibling);
          for (const group of visibleGroups(sibling).shown) for (const item of group.slice) rowFor(item, view);
        }
        idleHandle = pending.length ? requestIdleCallback(work) : 0;
      };
      idleHandle = requestIdleCallback(work);
    }
    // Render timings, readable from the console with kyaraPlusPerf() (last 40 renders of this panel)
    const perfLog = [];
    function recordPerf(label, startedAt, state) {
      const builtMs = performance.now() - startedAt;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const images = [...body.querySelectorAll("img")];
        perfLog.push({ at: new Date().toLocaleTimeString("fr-FR"), label, builtMs: Math.round(builtMs), paintedMs: Math.round(performance.now() - startedAt), rows: body.querySelectorAll(".kp-act__row").length, images: images.length, imagesReady: images.filter((img) => img.complete).length, cachedRows: rowCache.size, loading: state.history.phase });
        if (perfLog.length > 40) perfLog.shift();
      }));
    }
    window.kyaraPlusPerf = () => perfLog.map((entry) => `${entry.at} ${entry.label}: construit ${entry.builtMs} ms, affiché ${entry.paintedMs} ms, ${entry.rows} lignes, images ${entry.imagesReady}/${entry.images}, cache ${entry.cachedRows}, historique ${entry.loading}`).join("\n");
    const summary = createSummary(controller);
    const tabs = TABS.map((tab) => createTab(controller, tab));
    // one row of sub-category chips per tab; the row shows the chips of the open tab
    const subChips = Object.fromEntries(GROUPS.map((group) => [group.id, group.subs.map((sub) => {
      const info = SUB_INFO[sub];
      const count = h("span", { class: "n" });
      const button = h("button", { class: "kp-chip kp-act__sub", type: "button", role: "tab", title: info.label, onClick: () => controller.setSub(sub) }, icon(info.icon), info.short, count);
      return { id: sub, button, count };
    })]));
    let subRowGroup = null;
    const subRow = h("div", { class: "kp-act__subs", role: "tablist", "aria-label": "Sous-catégories" });
    const sortSelect = h(
      "select",
      {
        class: "kp-input kp-act__sort",
        "aria-label": "Trier",
        onChange: (event) => controller.setSort(event.target.value)
      },
      Object.entries(SORT_LABELS).map(([sort, label]) => h("option", { value: sort }, label))
    );
    const search = h("input", {
      class: "kp-input kp-act__search",
      type: "search",
      placeholder: "Carte ou joueur",
      "aria-label": "Chercher dans mon activité",
      onInput: (event) => controller.setQuery(event.target.value)
    });
    const sellButton = h("button", { class: "kp-btn kp-btn--sm", type: "button", onClick: onSell }, "Vendre une carte");
    const withdrawButton = h("button", {
      class: "kp-btn kp-btn--sm kp-btn--ghost",
      type: "button",
      onClick: () => controller.withdrawAll()
    });
    const nativeButton = h("button", {
      class: "kp-btn kp-btn--sm kp-btn--ghost",
      type: "button",
      title: "Basculer entre cette vue et celle du site",
      onClick: () => controller.setNative(!current.view.native)
    });
    const tabsRow = h("div", { class: "kp-act__tabs", role: "tablist", "aria-label": "Catégories" }, tabs.map(({ button }) => button));
    const toolbar = h(
      "div",
      { class: "kp-act__toolbar" },
      h("div", { class: "kp-act__tree" }, tabsRow, subRow),
      h("div", { class: "kp-act__tools" }, sortSelect, search, sellButton, withdrawButton)
    );
    // The sub-categories sit in a small panel under the tabs, with a notch pointing at the active tab.
    // The notch position is measured after the toolbar is laid out, and again when the window is resized.
    function placeRoots() {
      if (subRow.hidden) return;
      const active = tabs.find(({ button }) => button.classList.contains("on"))?.button;
      const box = subRow.getBoundingClientRect();
      if (!active || !box.width) return;
      const tab = active.getBoundingClientRect();
      subRow.style.setProperty("--kp-notch-x", `${Math.round(tab.left + tab.width / 2 - box.left)}px`);
    }
    addEventListener("resize", placeRoots);
    const body = h("div", { class: "kp-act__body" });
    const bar = h(
      "div",
      { class: "kp-act__bar" },
      h("h2", { class: "kp-title" }, "Mon activité"),
      summary.inline,
      nativeButton
    );
    const content = h("div", { class: "kp-act__content" }, toolbar, body);
    const root = h("section", { class: "kp-act", "aria-label": "Mon activité" }, bar, content);
    function renderToolbar(state) {
      const { view, items } = state;
      const stats = categoryStats(items);
      for (const { id, button, count } of tabs) {
        const { total, todo } = stats[id];
        button.setAttribute("aria-selected", String(view.category === id));
        button.classList.toggle("on", view.category === id);
        button.classList.toggle("is-empty", total === 0);
        button.classList.toggle("has-todo", todo > 0);
        count.textContent = String(total);
      }
      if (subRowGroup !== view.category) {
        subRowGroup = view.category;
        fill(subRow, (subChips[view.category] ?? []).map(({ button }) => button));
      }
      for (const { id, button, count } of subChips[view.category] ?? []) {
        const { total } = stats[id];
        button.setAttribute("aria-pressed", String(view.sub === id));
        count.textContent = String(total);
      }
      placeRoots();
      sortSelect.value = view.sort;
      if (document.activeElement !== search && search.value !== view.query) search.value = view.query;
      const withdrawable = items.filter((item) => item.state === State.LIVE && WITHDRAWABLE.has(item.category)).length;
      withdrawButton.hidden = withdrawable === 0;
      withdrawButton.classList.toggle("kp-btn--warn", state.withdrawArmed);
      withdrawButton.disabled = state.busy.has("withdraw-all");
      withdrawButton.textContent = state.withdrawArmed ? `Confirmer : retirer ${withdrawable} éléments ?` : "Tout retirer du marché";
    }
    function historyNotice({ history: history2 }) {
      if (history2.phase === HistoryPhase.DONE) {
        if (!history2.truncated) return null;
        return h(
          "p",
          { class: "kp-act__notice" },
          `Historique des ${config_default.activity.historyDays} derniers jours. `,
          h("button", { class: "kp-btn kp-btn--sm kp-btn--ghost", type: "button", onClick: () => controller.loadHistory(true) }, "Charger tout l’historique")
        );
      }
      if (history2.phase === HistoryPhase.ERROR) {
        return h(
          "p",
          { class: "kp-act__notice kp-act__notice--error" },
          `Historique incomplet : ${history2.error} `,
          h(
            "button",
            {
              class: "kp-btn kp-btn--sm kp-btn--ghost",
              type: "button",
              onClick: () => controller.loadHistory()
            },
            "Réessayer"
          )
        );
      }
      return h("p", { class: "kp-act__notice" }, history2.full ? "Chargement de tout l’historique…" : "Chargement de l’historique récent…");
    }
    function visibleGroups(state) {
      const { view } = state;
      const filtered = filterItems(state.items, {
        sub: view.sub,
        query: view.query
      });
      const groups = organize(filtered, {
        sort: view.sort,
        now: Date.now(),
        priceOf
      });
      let room = view.shown;
      const shown = groups.map((group) => {
        const slice = group.items.slice(0, Math.max(0, room));
        room -= slice.length;
        return { ...group, slice };
      });
      return {
        shown: shown.filter((group) => group.slice.length),
        total: filtered.length
      };
    }
    function renderBody(state) {
      if (state.phase === "loading") return fill(body, h("p", { class: "kp-empty" }, "Chargement de ton activité…"));
      if (state.phase === "error") {
        return fill(
          body,
          h("p", { class: "kp-empty" }, state.error),
          h("button", { class: "kp-btn", type: "button", onClick: () => controller.load() }, "Réessayer")
        );
      }
      const startedAt = performance.now();
      const rowView = buildRowView(state);
      renderTick++;
      const { shown, total } = visibleGroups(state);
      const shownCount = shown.reduce((sum, group) => sum + group.slice.length, 0);
      const empty = !shown.length && state.history.phase === HistoryPhase.DONE;
      fill(
        body,
        empty ? h("p", { class: "kp-empty" }, state.view.query ? "Rien ne correspond à cette recherche." : "Rien ici.") : null,
        shown.map(
          (group) => h(
            "section",
            { class: "kp-act__group" },
            h(
              "h3",
              { class: "kp-act__group-title" },
              GROUP_TITLES[group.id],
              h("span", { class: "mono" }, String(group.items.length))
            ),
            h(
              "ul",
              { class: `kp-act__list kp-act__list--${LAYOUTS[state.view.sub] ?? "rows"}` },
              group.slice.map((item) => rowFor(item, rowView))
            )
          )
        ),
        total > shownCount ? h(
          "button",
          {
            class: "kp-btn kp-btn--ghost kp-more",
            type: "button",
            onClick: () => controller.showMore()
          },
          `Voir plus (${plural(total - shownCount, "élément")})`
        ) : null,
        historyNotice(state)
      );
      pruneRowCache();
      recordPerf(`${state.view.category}/${state.view.sub} (${state.view.sort}${state.view.query ? ", recherche" : ""})`, startedAt, state);
      prebuildSiblings(state);
    }
    function scrollToFocus(state) {
      if (!state.focus || state.focus.key === lastFocus) return;
      const row = document.getElementById(`kp-act-${state.focus.key}`);
      if (!row) return;
      lastFocus = state.focus.key;
      row.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    return {
      root,
      dispose: () => removeEventListener("resize", placeRoots),
      render(state) {
        current = state;
        root.classList.toggle("is-native", state.view.native);
        nativeButton.textContent = state.view.native ? "Vue Kyara Plus" : "Vue du site";
        if (state.view.native) return;
        summary.render(state);
        renderToolbar(state);
        renderBody(state);
        scrollToFocus(state);
      }
    };
  }

  // src/features/market-activity/index.js
  var ACTIVITY_PANEL = 'main [role="tabpanel"]';
  var SECTIONS_TABLIST = '[role="tablist"][aria-label="Sections du marché"] [role="tab"]';
  var URL_WATCH_MS = 1e3;
  var NATIVE_CLASS = "kp-activity--native";
  var FIRST_CATEGORY = {
    ventes: Category.SALES,
    mises: Category.BIDS,
    ordres: Category.ORDERS,
    echanges: Category.TRADES_IN
  };
  var notify2 = {
    success: (message) => toast(message, "success"),
    error: (message) => toast(message, "error")
  };
  var offersWarned = false;
  var boardOffers = () => tradesApi.offersMine().catch((error) => {
    if (!offersWarned) {
      offersWarned = true;
      notify2.error(`Offres du tableau indisponibles : ${describeError(error)}`);
    }
    return [];
  });
  // context() and live() both need /me/bootstrap: when they run at the same time, one request serves both
  var bootstrapInFlight = null;
  var sharedBootstrap = () => {
    bootstrapInFlight ??= meApi.bootstrap().finally(() => {
      bootstrapInFlight = null;
    });
    return bootstrapInFlight;
  };
  var api2 = {
    context: async () => {
      const [{ me }, catalog, collection] = await Promise.all([sharedBootstrap(), loadCatalog(), loadCollection()]);
      return { myId: me.id, catalog, collection };
    },
    live: async () => {
      const [mine, trades, offers, { me }] = await Promise.all([
        marketApi.mine(),
        tradesApi.mine(),
        boardOffers(),
        sharedBootstrap()
      ]);
      return { mine, trades, offers, chakraHeld: me.chakraHeld ?? 0 };
    },
    history: (kind, page, size, options) => marketApi.history(kind, page, size, options),
    prices: (ids) => loadPrices(ids),
    tradeAction: (tradeId, action) => tradesApi.act(tradeId, action),
    cancelOffer: (offerId) => tradesApi.cancelOffer(offerId),
    cancelListing: (listingId) => marketApi.cancelListing(listingId),
    cancelOrder: (orderId) => marketApi.cancelOrder(orderId),
    withdrawAll: () => marketApi.withdrawAll(),
    reloadCollection: () => loadCollection(),
    syncLedger: (live) => loadMyId().then((myId) => syncTradeLedger(myId, { offers: live.offers, trades: live.trades, market: live.mine }))
  };
  var openSellTab = () => [...document.querySelectorAll(SECTIONS_TABLIST)].find((tab) => tab.textContent.trim().startsWith("Vendre"))?.click();
  var market_activity_default = {
    id: "market-activity",
    matches: (url) => url.pathname === "/marche" && Object.hasOwn(FIRST_CATEGORY, url.searchParams.get("onglet")),
    mount() {
      const store = createStore(initialState2());
      const controller = createActivityController({ store, api: api2, notify: notify2 });
      const panel = createActivityPanel(controller, { onSell: openSellTab });
      let focusedTrade = null;
      document.body.classList.add("kp-activity");
      // Every store change is rendered at once: the history pages are already coalesced by the controller,
      // so a click (tab, sub-category, sort…) during a load is no longer held back.
      const unsubscribe = store.subscribe((state) => {
        document.body.classList.toggle(NATIVE_CLASS, state.view.native);
        panel.render(state);
      });
      const detach = keepAttached(panel.root, ACTIVITY_PANEL, (tabpanel, node) => tabpanel.prepend(node));
      const watchUrl = () => {
        const tradeId = new URLSearchParams(location.search).get("echange");
        if (tradeId === focusedTrade) return;
        focusedTrade = tradeId;
        if (tradeId && !store.get().view.native) controller.focusTrade(tradeId);
      };
      const urlTimer = setInterval(watchUrl, URL_WATCH_MS);
      controller.setSub(FIRST_CATEGORY[new URLSearchParams(location.search).get("onglet")]);
      panel.render(store.get());
      controller.load().then(watchUrl);
      const stopPolling = startPolling(
        () => controller.refreshLive(),
        () => config_default.activity.refreshMs,
        (error) => toast(`Mise à jour de Mon activité arrêtée : ${describeError(error)}`, "error")
      );
      return () => {
        stopPolling();
        clearInterval(urlTimer);
        controller.dispose();
        unsubscribe();
        detach();
        panel.dispose();
        panel.root.remove();
        document.body.classList.remove("kp-activity", NATIVE_CLASS);
      };
    }
  };

  // src/lib/card-order.js
  var nameCollator = new Intl.Collator("fr");
  function compareCards(a, b) {
    return rarityRank(a.card.rarity) - rarityRank(b.card.rarity) || (b.price ?? -1) - (a.price ?? -1) || nameCollator.compare(a.card.name, b.card.name);
  }
  function orderElements(items) {
    [...items].sort(compareCards).forEach((item, index) => {
      const order = String(index);
      if (item.element.style.order !== order) item.element.style.order = order;
    });
  }
  function clearOrder(elements) {
    for (const element of elements) element.style.removeProperty("order");
  }
  function createSettledSorter(recheck) {
    let signature = "";
    let changedAt = 0;
    let timer = 0;
    return {
      apply(items, pricesReady) {
        const current = items.map((item) => item.card.id).join(",");
        if (current !== signature) {
          signature = current;
          changedAt = Date.now();
          clearOrder(items.map((item) => item.element));
          clearTimeout(timer);
          timer = setTimeout(recheck, config_default.sorting.settleMs);
          return;
        }
        if (pricesReady && Date.now() - changedAt >= config_default.sorting.settleMs) orderElements(items);
      },
      stop: () => clearTimeout(timer)
    };
  }

  // src/features/shelf-tiles.js
  var tileCardId = (tile2) => Number(tile2.querySelector("img")?.getAttribute("src")?.match(/\/cards\/\w+\/(\d+)\./)?.[1]);
  function renderCount(tile2, count) {
    let badge = tile2.querySelector(":scope > .kp-count");
    if (count == null) return badge?.remove();
    if (!badge) {
      badge = h("span", { class: "kp-count" });
      tile2.classList.add("kp-count-host");
      tile2.append(badge);
    }
    const text = `×${count}`;
    if (badge.textContent !== text) badge.textContent = text;
    badge.classList.toggle("kp-count--dupe", count >= config_default.profile.duplicateMin);
  }
  function clearCounts() {
    document.querySelectorAll(".kp-count").forEach((badge) => badge.remove());
    document.querySelectorAll(".kp-count-host").forEach((tile2) => tile2.classList.remove("kp-count-host"));
  }

  // src/features/trade-dialog.js
  var SHELF = '[role="dialog"] .shelf';
  var TILE = "ul.grid button.tile";
  var DUPLICATE_MIN = config_default.profile.duplicateMin;
  var isTheirTabSelected = (shelf) => [...shelf.querySelectorAll('.tabs [role="tab"]')].findIndex((tab) => tab.getAttribute("aria-selected") === "true") === 1;
  var trade_dialog_default = {
    id: "trade-dialog",
    matches: (url) => url.pathname.startsWith("/profil/"),
    mount() {
      let collection = null;
      let catalog = null;
      let frame = 0;
      const theirCounts = /* @__PURE__ */ new Map();
      const active = /* @__PURE__ */ new Set();
      let pricesFailed = false;
      const sorter = createSettledSorter(() => schedule());
      const requestPrices = createPriceRequester(
        () => schedule(),
        (error) => {
          pricesFailed = true;
          schedule();
          toast(describeError(error), "error");
        }
      );
      function orderTiles(shelf, tiles) {
        const items = tiles.map((tile2) => ({ tile: tile2, card: catalog?.get(tileCardId(tile2)) })).filter((item) => item.card && item.tile.closest("li"));
        requestPrices(items.map((item) => item.card.id));
        const allLoaded = Boolean(catalog) && !shelf.querySelector("button.more");
        const ready = allLoaded && (pricesFailed || items.every((item) => isPriceLoaded(item.card.id)));
        const ordered = items.map(({ tile: tile2, card }) => ({ element: tile2.closest("li"), card, price: priceOf(card.id) }));
        sorter.apply(ordered, ready);
      }
      const schedule = () => {
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          decorate2();
        });
      };
      function countsOf(userId2) {
        if (!theirCounts.has(userId2)) {
          theirCounts.set(userId2, null);
          tradesApi.availableFrom(userId2).then((rows) => {
            theirCounts.set(userId2, new Map(rows.map((row) => [row.characterId, row.n])));
            schedule();
          }).catch((error) => {
            theirCounts.delete(userId2);
            toast(describeError(error), "error");
          });
        }
        return theirCounts.get(userId2);
      }
      const myQty = (id) => collection?.get(id)?.qty ?? 0;
      const mySpares = (id) => {
        const entry = collection?.get(id);
        return entry ? Math.min(entry.listable ?? 0, entry.qty - 1) : 0;
      };
      const filters = {
        mine: [
          { key: "myDuplicates", label: "Mes doubles", keep: ({ id }) => mySpares(id) > 0 },
          { key: "theyLack", label: "Il lui manque", keep: ({ tile: tile2 }) => Boolean(tile2.querySelector(".lack")) }
        ],
        theirs: [
          { key: "theirDuplicates", label: "Ses doubles", keep: ({ count }) => count >= DUPLICATE_MIN },
          { key: "iLack", label: "Il me manque", keep: ({ id }) => myQty(id) === 0 }
        ]
      };
      const chips = Object.fromEntries(
        Object.entries(filters).map(([tab, list]) => [
          tab,
          list.map((filter) => {
            const chip = h("button", { type: "button", "data-kp-filter": filter.key, "aria-pressed": "false" }, filter.label);
            chip.addEventListener("click", () => {
              if (active.has(filter.key)) active.delete(filter.key);
              else active.add(filter.key);
              chip.classList.toggle("on", active.has(filter.key));
              chip.setAttribute("aria-pressed", String(active.has(filter.key)));
              schedule();
            });
            return chip;
          })
        ])
      );
      function placeChips(shelf, tab) {
        const row = shelf.querySelector(".chips");
        if (!row) return;
        const siteChips = [...row.querySelectorAll("button.only:not([data-kp-filter])")];
        siteChips.filter((chip) => chip.classList.contains("on")).forEach((chip) => chip.click());
        siteChips.forEach((chip) => chip.classList.add("kp-site-only"));
        const baseClass = (siteChips[0]?.className ?? "only").replace(/\b(on|kp-site-only)\b/g, "").trim();
        for (const [key, list] of Object.entries(chips)) if (key !== tab) list.forEach((chip) => chip.remove());
        const tabChips = chips[tab];
        if (tabChips.every((chip) => chip.parentElement === row)) return;
        tabChips.forEach((chip) => chip.className = `${baseClass}${active.has(chip.dataset.kpFilter) ? " on" : ""}`);
        row.prepend(...tabChips);
      }
      function decorate2() {
        const shelf = document.querySelector(SHELF);
        if (!shelf) return;
        const tab = isTheirTabSelected(shelf) ? "theirs" : "mine";
        const counts = tab === "theirs" ? countsOf(profileIdFromPath()) : collection && new Map([...collection].map(([id, entry]) => [id, entry.qty]));
        const activeFilters = filters[tab].filter((filter) => active.has(filter.key));
        placeChips(shelf, tab);
        shelf.querySelector("button.more")?.click();
        const tiles = [...shelf.querySelectorAll(TILE)];
        for (const tile2 of tiles) {
          const id = tileCardId(tile2);
          const count = counts ? counts.get(id) ?? 0 : null;
          renderCount(tile2, count);
          const hidden = count != null && activeFilters.some((filter) => !filter.keep({ id, tile: tile2, count }));
          tile2.closest("li")?.classList.toggle("kp-filtered-out", hidden);
        }
        orderTiles(shelf, tiles);
      }
      const observer = new MutationObserver(schedule);
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-selected"] });
      Promise.all([loadCollection(), loadCatalog()]).then(([loadedCollection, loadedCatalog]) => {
        collection = loadedCollection;
        catalog = loadedCatalog;
        schedule();
      }).catch((error) => toast(describeError(error), "error"));
      return () => {
        observer.disconnect();
        cancelAnimationFrame(frame);
        sorter.stop();
        clearOrder(document.querySelectorAll(`${SHELF} ul.grid > li`));
        Object.values(chips).flat().forEach((chip) => chip.remove());
        document.querySelectorAll(".kp-site-only").forEach((chip) => chip.classList.remove("kp-site-only"));
        clearCounts();
      };
    }
  };

  // src/features/trade-verdict.js
  // "Proposer un échange" : what the trade would draw from each player's 48 h bars (Dons / Écart) and from the allowance
  // between the two players, before the proposal is sent. Values come from the totals the site shows on its two trays
  // (cards + chakra, fair-play prices, enregistrement du 06/11/2026) and from /fair-play/with/<joueur>, which also gives
  // the partner's bars and the gift / gap left between the two players. The site's own band only states the gift.
  config_default.tradeVerdict = { refreshMs: 30 * 1e3 };
  var TRADE_DIALOG = '[role="dialog"]';
  var TRADE_TRAYS = ".trays";
  var TRADE_TRAY = "section.tray";
  var TRADE_SITE_VERDICT = ".verdict";
  function trayTotal(tray) {
    const digits = tray.querySelector("header .total")?.textContent.replace(/\D/g, "") ?? "";
    if (digits) return Number(digits);
    return tray.querySelector(".slots li") ? null : 0;
  }
  var partnerNameOf = (dialog) => (dialog.getAttribute("aria-label") ?? dialog.querySelector("h2")?.textContent ?? "").match(/à\s+(.+?)\s*$/)?.[1] ?? null;
  // One player's side: what the trade draws from their bars and what would be missing
  function verdictSide(draw, giftsLeft, freeLeft) {
    const gift = draw?.gift ?? 0;
    const free = draw?.free ?? 0;
    return {
      gift,
      free,
      giftsLeft,
      freeLeft,
      overGift: giftsLeft == null ? 0 : Math.max(0, gift - giftsLeft),
      overFree: freeLeft == null ? 0 : Math.max(0, free - freeLeft),
      unknown: draw != null && (giftsLeft == null || freeLeft == null)
    };
  }
  function tradeVerdict({ given, received }, fair) {
    if (given == null || received == null || !fair || fair.freeRatio == null || fair.ignoreBelow == null) return null;
    const impact = tradeImpact({ given, received }, fair);
    const draw = impact ? { gift: impact.gift, free: impact.free } : null;
    const me = verdictSide(impact?.toMe ? draw : null, fair.gifts, fair.freeGaps);
    const them = verdictSide(impact && !impact.toMe ? draw : null, fair.theirGifts, fair.theirFreeGaps);
    const giftCap = impact?.toMe ? fair.pair?.giftToMe : fair.pair?.giftToThem;
    const flowCap = impact?.toMe ? fair.pair?.flowToMe : fair.pair?.flowToThem;
    const pair = {
      gift: impact?.gift ?? 0,
      gap: impact?.gap ?? 0,
      giftCap: giftCap ?? null,
      flowCap: flowCap ?? null,
      overGift: giftCap == null ? 0 : Math.max(0, (impact?.gift ?? 0) - giftCap),
      overFlow: flowCap == null ? 0 : Math.max(0, (impact?.gap ?? 0) - flowCap),
      unknown: impact != null && (giftCap == null || flowCap == null)
    };
    const over = me.overGift + me.overFree + them.overGift + them.overFree + pair.overGift + pair.overFlow;
    const unknown = me.unknown || them.unknown || pair.unknown;
    return { impact, me, them, pair, status: over > 0 ? "no" : unknown ? "unknown" : "ok" };
  }
  // "Dons 10 000 → 9 570" : what is left on the bar before the trade, then after it; "Dons manque 120" when it is short
  function verdictChip(label, amount, over, left, full, explain) {
    const tone2 = over > 0 ? CostTone.OVER : amount > 0 ? label === BAR_LABELS.gift ? CostTone.GIFT : CostTone.FREE : CostTone.NONE;
    let text;
    if (over > 0) text = `${label} manque ${formatNumber(over)}`;
    else if (left == null) text = amount > 0 ? `${label} −${formatNumber(amount)}` : `${label} 0`;
    // the arrow is an icon: in the pill's digit font "→" is tiny and reads like a minus sign
    else text = amount > 0 ? [`${label} ${formatNumber(left)}`, h("span", { class: "kp-verdict__arrow" }, icon("arrow-right-long")), formatNumber(left - amount)] : `${label} ${formatNumber(left)}`;
    const detail = left == null ? "" : amount > 0 ? ` ${label} : ${formatChakra(left)} disponibles avant cet échange, ${formatChakra(left - amount)} après${full != null ? ` (${formatChakra(full)} au maximum)` : ""}.` : ` ${label} : ${formatChakra(left)} disponibles, inchangé${full != null ? ` (${formatChakra(full)} au maximum)` : ""}.`;
    return h("span", { class: `kp-cost kp-cost--${tone2} kp-cost--compact`, title: `${explain}${detail}` }, h("span", { class: "kp-cost__dot" }), text);
  }
  function verdictRow(who, title, chips) {
    return h("div", { class: "kp-verdict__row" }, h("span", { class: "kp-verdict__who", title }, who), h("span", { class: "kp-costs" }, chips));
  }
  // Plain words first (who gains, what it costs them, whether the site should accept); the rows of pills are folded
  // under "Détails" (state kept), because a table of bars is hard to read for someone new to the fair-play
  var VERDICT_DETAILS_SETTING = "tradeVerdictDetails";
  function verdictSentence(verdict, partner) {
    const { me, them, pair, impact, status } = verdict;
    if (status === "no") {
      const short = me.overGift ? `il manque ${formatChakra(me.overGift)} sur ta barre Dons` : me.overFree ? `il manque ${formatChakra(me.overFree)} sur ta barre Écart` : them.overGift ? `il manque ${formatChakra(them.overGift)} sur la barre Dons de ${partner}` : them.overFree ? `il manque ${formatChakra(them.overFree)} sur la barre Écart de ${partner}` : pair.overGift ? `la limite de dons entre vous deux serait dépassée de ${formatChakra(pair.overGift)}` : `la limite d’écart entre vous deux serait dépassée de ${formatChakra(pair.overFlow)}`;
      return `Le site refusera : ${short}.`;
    }
    if (!impact) return "Sans effet sur les barres : échange équilibré ou écart trop petit.";
    if (status === "unknown") return `Barres de ${partner} inconnues : impossible de dire s’il pourra accepter.`;
    const side = impact.toMe ? me : them;
    const whose = impact.toMe ? "ta barre" : "sa barre";
    const bars = [
      side.gift > 0 ? `${whose} Dons passe de ${formatNumber(side.giftsLeft)} à ${formatNumber(side.giftsLeft - side.gift)}` : null,
      side.free > 0 ? `${whose} Écart passe de ${formatNumber(side.freeLeft)} à ${formatNumber(side.freeLeft - side.free)}` : null
    ].filter(Boolean).join(" et ");
    return `Devrait passer. ${impact.toMe ? "Tu y gagnes" : `${partner} y gagne`} : ${bars}.`;
  }
  function renderVerdict(verdict, partnerName) {
    const { me, them, pair, impact, status } = verdict;
    const partner = partnerName ?? "lui";
    const toMe = Boolean(impact?.toMe);
    const sideRow = (who, side, mine) => {
      const whose = mine ? "tes barres" : `les barres de ${partner}`;
      const explain = side.gift || side.free ? `Cet échange est à ${mine ? "ton" : "son"} avantage : il entame ${whose} pour 48 h.` : `Cet échange n’entame pas ${whose}${impact ? "" : " (écart trop petit ou équilibré)"}.`;
      return verdictRow(who, mine ? "Ce que l’échange retire à tes barres Dons et Écart (48 h)." : `Ce que l’échange retire aux barres Dons et Écart de ${partner} (48 h).`, [
        verdictChip(BAR_LABELS.gift, side.gift, side.overGift, side.giftsLeft, config_default.fairPlay.barFull.gifts, explain),
        verdictChip(BAR_LABELS.free, side.free, side.overFree, side.freeLeft, config_default.fairPlay.barFull.free, explain)
      ]);
    };
    const pairExplain = `Limite entre vous deux seulement, sur 48 h, dans le sens ${toMe ? `${partner} → toi` : `toi → ${partner}`} : ce que le site autorise encore avant cet échange, puis après.`;
    const mark = status === "ok" ? "✔" : status === "no" ? "✘" : "?";
    const open = readSetting(VERDICT_DETAILS_SETTING, false);
    const toggle = h("button", { class: "kp-verdict__toggle", type: "button", "aria-expanded": String(open), title: "Afficher ou cacher le détail : tes barres, celles de l’autre joueur et la limite entre vous deux, avant et après l’échange." }, "Détails");
    // only the rows that say something: the player whose bars move (both when nothing moves), then the pair limit
    const rows = [
      !impact || toMe ? sideRow("Tes barres", me, true) : null,
      !impact || !toMe ? sideRow(`Barres de ${partner}`, them, false) : null,
      verdictRow("Limite entre vous deux", pairExplain, [
        verdictChip(BAR_LABELS.gift, pair.gift, pair.overGift, pair.giftCap, config_default.fairPlay.pairGiftCap, pairExplain),
        verdictChip(BAR_LABELS.free, pair.gap, pair.overFlow, pair.flowCap, config_default.fairPlay.pairFlowCap, pairExplain)
      ])
    ];
    const node = h(
      "div",
      { class: `kp-verdict${open ? " kp-verdict--open" : ""}` },
      h(
        "div",
        { class: "kp-verdict__head" },
        h("span", { class: `kp-verdict__status kp-verdict__status--${status}`, "aria-hidden": "true" }, mark),
        h("span", { class: "kp-verdict__line", title: "Fair-play, calculé par Kyara Plus d’après les prix des deux plateaux et les compteurs du site. Ce qui est retiré d’une barre revient 48 h plus tard." }, verdictSentence(verdict, partner)),
        toggle
      ),
      h("div", { class: "kp-verdict__details" }, rows)
    );
    toggle.addEventListener("click", () => {
      const next = !node.classList.contains("kp-verdict--open");
      node.classList.toggle("kp-verdict--open", next);
      toggle.setAttribute("aria-expanded", String(next));
      writeSetting(VERDICT_DETAILS_SETTING, next);
    });
    return node;
  }
  var trade_verdict_default = {
    id: "trade-verdict",
    matches: (url) => url.pathname.startsWith("/profil/"),
    mount() {
      let frame = 0;
      let node = null;
      let key = "";
      let fair = null;
      let fairFor = null;
      let fairAt = 0;
      let loading = null;
      // read once per dialog; a dialog reopened after a while gets fresh counters (a trade may have been accepted meanwhile)
      const loadFair = (partnerId, reopen) => {
        if (fairFor === partnerId && (loading || fair && !(reopen && Date.now() - fairAt > config_default.tradeVerdict.refreshMs))) return;
        fairFor = partnerId;
        loading = loadFairPlay(partnerId).then((raw) => {
          if (fairFor !== partnerId) return;
          fair = receiveLeft(raw);
          fairAt = Date.now();
          loading = null;
          schedule();
        }).catch((error) => {
          loading = null;
          if (fairFor === partnerId) toast(`Fair-play de l’échange non lu : ${describeError(error)}`, "error");
        });
      };
      const remove = () => {
        node?.remove();
        node = null;
        key = "";
      };
      function update() {
        const dialog = document.querySelector(TRADE_DIALOG);
        const trays = dialog?.querySelector(TRADE_TRAYS);
        const sections = trays ? [...trays.querySelectorAll(TRADE_TRAY)] : [];
        if (!dialog || sections.length < 2) return remove();
        const partnerId = profileIdFromPath();
        if (!partnerId) return remove();
        loadFair(partnerId, !node);
        const mine = sections.find((section) => section.classList.contains("mine")) ?? sections[0];
        const theirs = sections.find((section) => section !== mine);
        const given = trayTotal(mine);
        const received = trayTotal(theirs);
        const verdict = tradeVerdict({ given, received }, fair);
        if (!verdict) return remove();
        const partnerName = partnerNameOf(dialog);
        const nextKey = JSON.stringify([given, received, partnerName, fair]);
        const anchor = dialog.querySelector(TRADE_SITE_VERDICT) ?? trays;
        if (nextKey !== key || !node) {
          const fresh = renderVerdict(verdict, partnerName);
          if (node?.isConnected) node.replaceWith(fresh);
          else anchor.after(fresh);
          node = fresh;
          key = nextKey;
        } else if (node.previousElementSibling !== anchor) {
          anchor.after(node);
        }
      }
      const schedule = () => {
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          update();
        });
      };
      const observer = new MutationObserver((records) => {
        if (node && records.every((record) => node.contains(record.target))) return;
        schedule();
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      schedule();
      return () => {
        observer.disconnect();
        cancelAnimationFrame(frame);
        fairFor = null;
        remove();
      };
    }
  };

  // src/features/market-offers/analysis.js
  var GIVABLE = /* @__PURE__ */ new Set([GiveStatus.AVAILABLE, GiveStatus.PINNED]);
  var OWNED = /* @__PURE__ */ new Set([GiveStatus.AVAILABLE, GiveStatus.PINNED, GiveStatus.BLOCKED]);
  var BANGER_MAX_RANK = rarityRank("L");
  var Filter = {
    TRADEABLE: "tradeable",
    DOUBLES: "doubles",
    MISSING: "missing",
    WISHED: "wished",
    // hides the cards I would give at a loss against a different rarity (and the offers where nothing else remains)
    NO_LOSS_CROSS: "noLossCross",
    // hides every card I would give at a loss, same rarity included
    NO_LOSS_ALL: "noLossAll"
  };
  var LOSS_FILTERS = [Filter.NO_LOSS_CROSS, Filter.NO_LOSS_ALL];
  var gainKey = (gain) => gain ?? Number.NEGATIVE_INFINITY;
  var descending = (a, b) => a === b ? 0 : a < b ? 1 : -1;
  var isGivable = (option) => GIVABLE.has(option.status);
  var isDouble = (option) => option.status === GiveStatus.AVAILABLE && option.entry.qty >= 2;
  function bestOption(options, predicate) {
    return options.filter(predicate).sort((a, b) => descending(gainKey(a.gain), gainKey(b.gain)))[0] ?? null;
  }
  function analyzeOffer(offer, { catalog, collection, wishlist, priceOf: priceOf2 }) {
    const received = catalog.get(offer.characterId);
    if (!received) return null;
    const receivedPrice = priceOf2(received.id);
    const options = offer.wantIds.map((id) => ({ card: catalog.get(id), entry: collection.get(id), price: priceOf2(id) })).filter((option) => option.card).map((option) => ({
      ...option,
      status: giveStatus(option.entry),
      gain: receivedPrice != null && option.price != null ? receivedPrice - option.price : null
    })).sort((a, b) => descending(gainKey(a.gain), gainKey(b.gain)));
    return {
      offer,
      received,
      receivedPrice,
      owned: collection.get(received.id)?.qty ?? 0,
      wished: wishlist.has(received.id),
      options,
      bestAvailable: bestOption(options, (option) => option.status === GiveStatus.AVAILABLE)
    };
  }
  var FILTER_TESTS = {
    [Filter.TRADEABLE]: (analysis) => analysis.bestAvailable !== null,
    [Filter.DOUBLES]: (analysis) => analysis.options.some(isDouble),
    [Filter.MISSING]: (analysis) => analysis.owned === 0,
    [Filter.WISHED]: (analysis) => analysis.wished
  };
  var hasOwnedOption = (analysis) => analysis.options.some((option) => OWNED.has(option.status));
  var byBoardPriority = (a, b) => Number(b.wished) - Number(a.wished) || rarityRank(a.received.rarity) - rarityRank(b.received.rarity) || descending(gainKey(a.bestAvailable?.gain), gainKey(b.bestAvailable?.gain));
  var cardMatches = (card, query2) => searchKey(card.name).includes(query2) || searchKey(card.series ?? "").includes(query2);
  var matchesSearch = (analysis, query2) => !query2 || cardMatches(analysis.received, query2) || analysis.options.some((option) => cardMatches(option.card, query2));
  // A loss: the known prices say I give more than I get (or exactly as much)
  var isLoss = (option) => option.gain != null && option.gain <= 0;
  var LOSS_TESTS = {
    // only when the rarities differ, in both directions (a higher one given for a lower, or a lower one for a higher)
    [Filter.NO_LOSS_CROSS]: (analysis, option) => isLoss(option) && option.card.rarity !== analysis.received.rarity,
    [Filter.NO_LOSS_ALL]: (analysis, option) => isLoss(option)
  };
  var hiddenOptionTest = (activeFilters) => LOSS_FILTERS.filter((filter) => activeFilters.has(filter)).map((filter) => LOSS_TESTS[filter]).pop() ?? null;
  function withoutLosses(analysis, isHidden) {
    const options = analysis.options.filter((option) => !isHidden(analysis, option));
    if (options.length === analysis.options.length) return analysis;
    return { ...analysis, options, bestAvailable: bestOption(options, (option) => option.status === GiveStatus.AVAILABLE) };
  }
  function boardOffers2(analyses, activeFilters, rarities, search = "") {
    const tests = [...activeFilters].map((filter) => FILTER_TESTS[filter]).filter(Boolean);
    const query2 = searchKey(search.trim());
    const hidden = hiddenOptionTest(activeFilters);
    if (hidden) analyses = analyses.map((analysis) => withoutLosses(analysis, hidden));
    return analyses.filter(
      (analysis) => rarities.has(analysis.received.rarity) && hasOwnedOption(analysis) && tests.every((test) => test(analysis)) && matchesSearch(analysis, query2)
    ).sort(byBoardPriority);
  }
  var newFirst = (a, b) => Number(b.analysis.isNew) - Number(a.analysis.isNew);
  var byDealPriority = (a, b) => newFirst(a, b) || rarityRank(a.analysis.received.rarity) - rarityRank(b.analysis.received.rarity) || descending(gainKey(a.option.gain), gainKey(b.option.gain));
  function dealsPerOffer(analyses, qualifies, compareOffers) {
    return analyses.map(
      (analysis) => analysis.options.filter((option) => qualifies(analysis, option)).sort((a, b) => descending(gainKey(a.gain), gainKey(b.gain))).map((option) => ({ analysis, option }))
    ).filter((deals) => deals.length > 0).sort((a, b) => compareOffers(a[0], b[0])).flat();
  }
  var bangerDeals = (analyses) => dealsPerOffer(
    analyses,
    (analysis, option) => {
      const rank = rarityRank(analysis.received.rarity);
      // a lower rarity can still be worth more than the Mythic or Legendary offered: a known loss is not a banger
      return rank <= BANGER_MAX_RANK && isGivable(option) && rarityRank(option.card.rarity) > rank && !(option.gain < 0);
    },
    byDealPriority
  );
  function bestDealPerOffer(deals) {
    const seen = /* @__PURE__ */ new Set();
    return deals.filter(({ analysis }) => !seen.has(analysis.offer.id) && seen.add(analysis.offer.id));
  }
  // Profitable offers: every givable option of an offer, the recommended one is the most profitable available
  var profitKey = (deal) => gainKey((deal.recommended ?? deal.best).gain);
  // The site's fair-play check as the script predicts it (bars and limits per partner).
  // While the bars are not known yet nothing is recommended: a card shown as recommended then withdrawn half a second later
  // (once the bars arrive and say "refused") is more confusing than a short wait. Unknown prices still count as passing.
  var passesFairPlay = (analysis, option, fair) => {
    if (!fair) return false;
    const cost = tradeCost({ given: option.price, received: analysis.receivedPrice }, fair, analysis.offer.user?.id ?? null);
    return !cost || !cost.overBy;
  };
  var byProfitPriority = (a, b) => newFirst(a, b) || descending(profitKey(a), profitKey(b));
  // Banger: a Mythic or Legendary offered for a lower rarity, unless the known prices say it is a loss
  var isBangerOption = (analysis, option) => {
    const rank = rarityRank(analysis.received.rarity);
    return rank <= BANGER_MAX_RANK && isGivable(option) && rarityRank(option.card.rarity) > rank && !(option.gain < 0);
  };
  // One list: the options reaching the minimum gain, plus the bangers (flagged), least to most profitable
  function profitDeals(analyses, minGain, fair = null) {
    const deals = analyses.flatMap((analysis) => {
      const options = analysis.options.filter((option) => isGivable(option) && (option.gain != null && option.gain >= minGain || isBangerOption(analysis, option))).sort((a, b) => gainKey(a.gain) - gainKey(b.gain));
      const available = options.filter((option) => option.status === GiveStatus.AVAILABLE);
      if (!available.length) return [];
      // recommended: the most profitable card the site should accept; none when every card would be refused (no red highlight)
      const recommended = available.findLast((option) => passesFairPlay(analysis, option, fair)) ?? null;
      const bangers = new Set(options.filter((option) => isBangerOption(analysis, option)).map((option) => option.card.id));
      return [{ analysis, options, recommended, best: available.at(-1), bangers }];
    });
    return deals.sort(byProfitPriority);
  }

  var ruleKey = (giveRarity, receiveRarity) => `${giveRarity}>${receiveRarity}`;
  function autoAcceptOption(analysis, { rules, doublesOnly, minGain, rowMinGain = {} }) {
    // a rarity rule also needs the row's minimum gain when one is set (an Epic can be worth more than a Legendary); unknown price = no
    // same rarity (E for E): only with a known gain reaching the row's floor, or at least 0 when the row has none
    const rowGainOk = (option) => {
      const same = option.card.rarity === analysis.received.rarity;
      const floor = rowMinGain[option.card.rarity] ?? (same ? 0 : null);
      return floor == null || option.gain != null && option.gain >= floor;
    };
    const ruleMatches = (option) => rules.has(ruleKey(option.card.rarity, analysis.received.rarity)) && rowGainOk(option) || minGain != null && option.gain != null && option.gain >= minGain;
    const matches2 = (option) => option.status === GiveStatus.AVAILABLE && !option.entry.pinned && ruleMatches(option);
    const double = bestOption(analysis.options, (option) => matches2(option) && isDouble(option));
    return double ?? (doublesOnly ? null : bestOption(analysis.options, matches2));
  }
  var hasAutoRule = ({ rules, minGain }) => rules.size > 0 || minGain != null;
  function autoAcceptCandidates(analyses, settings) {
    if (!hasAutoRule(settings)) return [];
    return analyses.flatMap((analysis) => {
      const option = autoAcceptOption(analysis, settings);
      return option ? [{ analysis, option }] : [];
    }).sort(byDealPriority);
  }

  // src/data/fair-play.js
  var loadFairPlay = (userId2) => fairPlayApi.withPlayer(userId2);
  function receiveLeft(fair) {
    if (!fair.enabled) return null;
    return {
      gifts: fair.myReceivedLeft,
      freeGaps: fair.myFreeLeft,
      hours: fair.receivedDays * 24,
      freeRatio: fair.freeRatio,
      ignoreBelow: fair.ignoreBelow,
      // cap of the two counters when the site reports it (the bars are shown "/ maxMargin")
      maxMargin: typeof fair.maxMargin === "number" ? fair.maxMargin : null,
      // the partner's own counters and what remains between the two players, as the site reports them (relevé du 06/11/2026 :
      // theirReceivedLeft / theirFreeLeft, giveLeft / getLeft = gifts I can still make / receive with this player,
      // giveBalanceLeft / getBalanceLeft = gap still allowed in each direction, all over 48 h)
      theirGifts: fair.theirReceivedLeft ?? null,
      theirFreeGaps: fair.theirFreeLeft ?? null,
      pair: {
        giftToThem: fair.giveLeft ?? null,
        giftToMe: fair.getLeft ?? null,
        flowToThem: fair.giveBalanceLeft ?? null,
        flowToMe: fair.getBalanceLeft ?? null
      }
    };
  }
  var HOUR_MS = 36e5;
  function tradeImpact({ given, received }, { freeRatio, ignoreBelow }) {
    const high = Math.max(given, received);
    const low = Math.min(given, received);
    const gap = high - low;
    if (gap < ignoreBelow) return null;
    const gift = Math.max(0, Math.round(high - freeRatio * low));
    return { toMe: received > given, gap, gift, free: gap - gift };
  }
  // Trade cost: the server checks gifts and the free gap separately; the result is informative only
  // partnerId: the other player, to apply the limits between two players (counters.pairUsed, from the ledger)
  function tradeCost({ given, received }, counters, partnerId = null) {
    if (given == null || received == null || counters?.freeRatio == null || counters.ignoreBelow == null) return null;
    const impact = tradeImpact({ given, received }, counters);
    if (!impact || !impact.toMe) return { gift: 0, free: 0, overGift: 0, overFree: 0, overPair: 0, overBy: null };
    const overGift = Math.max(0, impact.gift - counters.gifts);
    const overFree = Math.max(0, impact.free - counters.freeGaps);
    const used = partnerId && counters.pairUsed ? counters.pairUsed[partnerId] ?? { gift: 0, gap: 0 } : null;
    // a trade without gift is not blocked by the gift cap, only by the same-direction cap
    const overPair = used ? Math.max(0, impact.gift > 0 ? used.gift + impact.gift - config_default.fairPlay.pairGiftCap : 0, used.gap + impact.gap - config_default.fairPlay.pairFlowCap) : 0;
    const overBy = overGift > 0 ? "dons" : overFree > 0 ? "ecart" : overPair > 0 ? "partenaire" : null;
    return { gift: impact.gift, free: impact.free, overGift, overFree, overPair, overBy };
  }
  // Gifts and gap in my favour received from each partner over the pair window (approximate trades count from their earliest time)
  function pairUsage(entries, fair, now) {
    const windowMs = (fair.pairDays ?? fair.receivedDays ?? 2) * HOUR_MS * 24;
    const used = {};
    for (const entry of entries) {
      const impact = tradeImpact(entry, fair);
      const since = entry.earliestAt != null ? Math.min(entry.earliestAt, entry.at) : entry.at;
      if (!impact || !impact.toMe || !entry.partner?.id || now - since >= windowMs) continue;
      const slot = used[entry.partner.id] ??= { gift: 0, gap: 0 };
      slot.gift += impact.gift;
      slot.gap += impact.gap;
    }
    return used;
  }
  function upcomingReleases(entries, fair, { now, direction, partnerId = null }) {
    const windowMs = (direction === "received" ? fair.receivedDays : fair.pairDays) * HOUR_MS * 24;
    return entries.map((entry) => ({ entry, impact: tradeImpact(entry, fair) })).filter(({ entry, impact }) => impact && impact.toMe === (direction === "received")).filter(({ entry }) => !partnerId || entry.partner.id === partnerId).map(({ entry, impact }) => {
      const earliestAt = entry.earliestAt != null ? Math.min(entry.earliestAt, entry.at) + windowMs : null;
      // observed: direct trades are accepted minutes after their creation, long before the estimated end date
      const fromCreation = Boolean(entry.approximate && earliestAt != null && entry.key?.startsWith("trade:"));
      return {
        key: entry.key,
        at: fromCreation ? earliestAt : entry.at + windowMs,
        earliestAt,
        fromCreation,
        approximate: entry.approximate,
        partner: entry.partner,
        given: entry.given,
        received: entry.received,
        gift: impact.gift,
        free: impact.free
      };
    }).filter((release) => release.fromCreation ? now < release.at + config_default.fairPlay.pendingGraceMs : release.at > now).sort((a, b) => a.at - b.at);
  }

  // src/data/fair-journal.js
  // Fair-play journal: persistent record of counters, trades and actions, readable from the console with kyaraPlusFairLog
  var JOURNAL_KEY = "kyara-plus:fair-journal";
  var JOURNAL_VERSION = 1;
  var JOURNAL_RULE_FIELDS = /* @__PURE__ */ new Set(["enabled", "freeRatio", "ignoreBelow", "maxRatio", "maxMargin", "minPrice", "pairDays", "receivedDays"]);
  var JOURNAL_EVENT_KINDS = {
    offer: "offre du tableau",
    trade: "échange direct",
    sale: "vente du marché",
    purchase: "achat du marché",
    buy: "ordre d'achat"
  };
  var JOURNAL_NOTES = [
    "snapshots : compteurs bruts de /fair-play/with/<joueur> ; les règles fixes (ratios, seuils) sont dans rulesHistory.",
    "Un snapshot est écrit quand myFreeLeft ou myReceivedLeft change, quand le joueur lu change, sur action explicite (actualiser, échange fait) ou après 30 min sans trace.",
    "events : échanges vus par le registre (offres du tableau, échanges directs, ventes, achats, ordres d'achat), avec les prix équitables utilisés. at = heure estimée, approximate = heure non exacte, earliestAt = plus tôt possible.",
    "events.impact : calcul du script (gap, gift, free) avec les règles actuelles ; returnsAt = at + fenêtre de 48 h ; returnsFrom = même calcul avec earliestAt.",
    "intervals : pour deux snapshots consécutifs, variation réelle des compteurs, variation attendue (retours dus moins consommations des échanges en ma faveur) et écart inexpliqué.",
    "actions : échanges acceptés depuis le script (ou refusés par le serveur, avec le message d'erreur), avec les prix du script et les prix équitables lus après coup.",
    "matched : échanges approximatifs dont le retour a été reconnu par le montant du gain (tolérance 10 %, jamais en cas d'ambiguïté) ; ils sortent alors de la liste des prochaines hausses.",
    "market dans un snapshot : état des ventes, enchères et ordres d'achat en cours, présent seulement quand il a changé depuis le snapshot précédent."
  ];
  var pickPrimitives = (source = {}) => Object.fromEntries(Object.entries(source).filter(([, value]) => value === null || ["string", "number", "boolean"].includes(typeof value)));
  var journalSide = ({ cards, chakra = 0 }, prices) => ({
    chakra,
    cards: cards.map((card) => ({ id: card.characterId, qty: card.qty ?? 1, price: prices[card.characterId] ?? null }))
  });
  function journalMarketSummary({ listings = [], bids = [], buyOrders = [] }) {
    const slim = (listing) => ({ ...pickPrimitives(listing), characterId: listing.character?.id ?? null, sellerId: listing.seller?.id ?? null });
    return {
      listings: listings.filter((listing) => listing.isMine && listing.status !== "sold").slice(0, 30).map(slim),
      bids: bids.filter((listing) => listing.status !== "sold").slice(0, 30).map(slim),
      buyOrders: buyOrders.slice(0, 30).map(pickPrimitives)
    };
  }
  function readJournal() {
    try {
      const journal = JSON.parse(localStorage.getItem(JOURNAL_KEY));
      if (journal?.version === JOURNAL_VERSION) return journal;
    } catch {
    }
    return { version: JOURNAL_VERSION, startedAt: Date.now(), lastCheckAt: null, rules: [], snapshots: [], events: {}, actions: [], marketState: null, lastMarketJson: null };
  }
  function saveJournal(journal) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        localStorage.setItem(JOURNAL_KEY, JSON.stringify(journal));
        return;
      } catch {
        journal.snapshots = journal.snapshots.slice(Math.ceil(journal.snapshots.length / 2));
      }
    }
  }
  // the journal is read and written on each change, so several open tabs do not overwrite each other for long
  function withJournal(update) {
    try {
      const journal = readJournal();
      const result = update(journal);
      saveJournal(journal);
      return result;
    } catch {
      return null;
    }
  }
  // Detected returns: a gain the ledger cannot explain is attached to the approximate trade whose gap matches
  function matchReturns(journal, from, to, rules) {
    if (!rules.enabled || rules.freeRatio == null || rules.ignoreBelow == null) return [];
    const returnMs = (rules.receivedDays ?? 2) * 24 * HOUR_MS;
    const rated = Object.values(journal.events).map((event) => ({ event, impact: tradeImpact({ given: event.given, received: event.received }, rules) })).filter(({ impact }) => impact?.toMe);
    const within = (time) => time > from.at && time <= to.at;
    const sumFree = (items) => items.reduce((total, { impact }) => total + impact.free, 0);
    let remaining = to.counters.myFreeLeft - from.counters.myFreeLeft - sumFree(rated.filter(({ event }) => !event.approximate && within(event.at + returnMs))) + sumFree(rated.filter(({ event }) => within(event.at)));
    const candidates = rated.filter(({ event }) => event.approximate && !event.returned && event.earliestAt != null && Math.min(event.earliestAt, event.at) + returnMs <= to.at && event.at + returnMs > from.at);
    const matched = [];
    while (remaining > config_default.journal.matchMinFree) {
      const scored = candidates.filter((candidate) => !matched.includes(candidate)).map((candidate) => ({ candidate, diff: Math.abs(candidate.impact.free - remaining), age: to.at - (Math.min(candidate.event.earliestAt, candidate.event.at) + returnMs) })).filter(({ diff }) => diff <= Math.max(config_default.journal.matchMinFree, remaining * config_default.journal.matchTolerance)).sort((a, b) => a.diff - b.diff);
      // a trade becoming possible long ago would already have returned, so the recent ones are preferred
      const recent = scored.filter(({ age }) => age <= config_default.fairPlay.pendingGraceMs);
      const pool = recent.length ? recent : scored;
      const ambiguous = pool.length > 1 && (pool[1].diff === pool[0].diff || pool[0].diff !== 0 && pool[1].diff - pool[0].diff < 3);
      if (pool.length === 0 || ambiguous) break;
      const { candidate } = pool[0];
      candidate.event.returned = { from: from.at, to: to.at, free: candidate.impact.free };
      matched.push(candidate);
      remaining -= candidate.impact.free;
    }
    return matched.map(({ event }) => event.key);
  }
  function returnedFairKeys() {
    return new Set(Object.values(readJournal().events).filter((event) => event.returned).map((event) => event.key));
  }
  function recordFairSnapshot(fair, { trigger, partner }) {
    withJournal((journal) => {
      const now = Date.now();
      const rules = {};
      const counters = {};
      for (const [name, value] of Object.entries(fair ?? {})) (JOURNAL_RULE_FIELDS.has(name) ? rules : counters)[name] = value;
      if (JSON.stringify(journal.rules.at(-1)?.values) !== JSON.stringify(rules)) journal.rules.push({ at: now, values: rules });
      if (!journal.rematched) {
        // gains seen before the matching existed are attached once, so their trades leave the list
        journal.rematched = true;
        journal.snapshots.forEach((to, index) => {
          const from = journal.snapshots[index - 1];
          if (!from || to.matched || to.counters.myFreeLeft <= from.counters.myFreeLeft) return;
          const matched = matchReturns(journal, from, to, rules);
          if (matched.length) to.matched = matched;
        });
      }
      const previous = journal.snapshots.at(-1);
      const globalChanged = !previous || previous.counters.myFreeLeft !== counters.myFreeLeft || previous.counters.myReceivedLeft !== counters.myReceivedLeft;
      const partnerChanged = previous?.partner?.id !== partner?.id;
      const silent = previous && now - previous.at > config_default.journal.heartbeatMs;
      journal.lastCheckAt = now;
      if (!(globalChanged || partnerChanged || silent || trigger !== "poll")) return;
      const snapshot = { at: now, trigger, partner, counters };
      const matched = previous && counters.myFreeLeft > previous.counters.myFreeLeft ? matchReturns(journal, previous, snapshot, rules) : [];
      if (matched.length) snapshot.matched = matched;
      const marketJson = JSON.stringify(journal.marketState ?? null);
      if (marketJson !== journal.lastMarketJson) {
        snapshot.market = journal.marketState;
        journal.lastMarketJson = marketJson;
      }
      const cutoff = now - config_default.journal.keepMs;
      journal.snapshots = [...journal.snapshots, snapshot].filter((item) => item.at >= cutoff).slice(-config_default.journal.maxSnapshots);
    });
  }
  function recordLedgerSync(entries, details, market) {
    withJournal((journal) => {
      const now = Date.now();
      for (const entry of entries) {
        const known = journal.events[entry.key];
        if (!known) {
          journal.events[entry.key] = {
            key: entry.key,
            kind: JOURNAL_EVENT_KINDS[entry.key.split(":")[0]] ?? entry.key.split(":")[0],
            firstSeenAt: now,
            at: entry.at,
            earliestAt: entry.earliestAt ?? null,
            approximate: entry.approximate,
            partner: entry.partner,
            given: entry.given,
            received: entry.received,
            detail: details.get(entry.key) ?? null
          };
        } else if (known.at !== entry.at || known.approximate !== entry.approximate || known.earliestAt !== (entry.earliestAt ?? null)) {
          known.timeHistory = [...known.timeHistory ?? [], { seenAt: now, at: known.at, approximate: known.approximate }].slice(-5);
          Object.assign(known, { at: entry.at, earliestAt: entry.earliestAt ?? null, approximate: entry.approximate });
        }
      }
      const cutoff = now - config_default.journal.keepMs;
      for (const [key, event] of Object.entries(journal.events)) if (event.at < cutoff) delete journal.events[key];
      journal.marketState = market;
    });
  }
  function recordFairAction(action) {
    return withJournal((journal) => {
      const last = journal.snapshots.at(-1);
      const id = `${Date.now()}-${journal.actions.length}`;
      journal.actions = [
        ...journal.actions,
        { id, at: Date.now(), ...action, lastKnown: last ? { at: last.at, myFreeLeft: last.counters.myFreeLeft, myReceivedLeft: last.counters.myReceivedLeft } : null }
      ].slice(-config_default.journal.maxActions);
      return id;
    });
  }
  function updateFairAction(id, patch) {
    withJournal((journal) => {
      const action = journal.actions.find((item) => item.id === id);
      if (action) Object.assign(action, patch);
    });
  }
  function buildFairReport() {
    const journal = readJournal();
    const rules = journal.rules.at(-1)?.values ?? null;
    const returnMs = (rules?.receivedDays ?? 2) * 24 * HOUR_MS;
    const canRate = Boolean(rules?.enabled) && rules.freeRatio != null && rules.ignoreBelow != null;
    const text = (time) => time == null ? null : new Date(time).toLocaleString("fr-FR");
    const events = Object.values(journal.events).sort((a, b) => a.at - b.at).map((event) => {
      const impact = canRate ? tradeImpact({ given: event.given, received: event.received }, rules) : null;
      const returns = impact?.toMe;
      return {
        ...event,
        atText: text(event.at),
        impact,
        returnsAt: returns ? event.at + returnMs : null,
        returnsFrom: returns && event.earliestAt != null ? Math.min(event.earliestAt, event.at) + returnMs : null
      };
    });
    const intervals = [];
    for (let index = 1; index < journal.snapshots.length; index++) {
      const from = journal.snapshots[index - 1];
      const to = journal.snapshots[index];
      if (from.counters.myFreeLeft == null || to.counters.myFreeLeft == null) continue;
      const within = (time) => time != null && time > from.at && time <= to.at;
      const brief = (event) => ({ key: event.key, free: event.impact.free, gift: event.impact.gift, approximate: event.approximate });
      const released = events.filter((event) => within(event.returnsAt)).map(brief);
      const consumed = events.filter((event) => event.impact?.toMe && within(event.at)).map(brief);
      const maybeReleased = events.filter((event) => event.approximate && event.returnsFrom != null && !event.returned && !within(event.returnsAt) && event.returnsFrom <= to.at && event.returnsAt > from.at).map((event) => event.key);
      const actions = journal.actions.filter((action) => within(action.at)).map((action) => action.id);
      const sum = (items, field) => items.reduce((total, item) => total + item[field], 0);
      const deltaFree = to.counters.myFreeLeft - from.counters.myFreeLeft;
      const deltaReceived = to.counters.myReceivedLeft - from.counters.myReceivedLeft;
      const expectedFree = sum(released, "free") - sum(consumed, "free");
      const expectedReceived = sum(released, "gift") - sum(consumed, "gift");
      if (!deltaFree && !deltaReceived && !released.length && !consumed.length && !actions.length) continue;
      intervals.push({
        from: from.at,
        to: to.at,
        fromText: text(from.at),
        toText: text(to.at),
        trigger: to.trigger,
        deltaFree,
        expectedFree,
        unexplainedFree: deltaFree - expectedFree,
        deltaReceived,
        expectedReceived,
        unexplainedReceived: deltaReceived - expectedReceived,
        released,
        consumed,
        maybeReleased,
        matched: to.matched ?? [],
        actions
      });
    }
    return {
      generatedAt: Date.now(),
      generatedAtText: text(Date.now()),
      startedAt: journal.startedAt,
      lastCheckAt: journal.lastCheckAt,
      notes: JOURNAL_NOTES,
      rules,
      rulesHistory: journal.rules,
      latest: journal.snapshots.at(-1) ?? null,
      intervals,
      snapshots: journal.snapshots.map((snapshot) => ({ ...snapshot, atText: text(snapshot.at) })),
      events,
      actions: journal.actions.map((action) => ({ ...action, atText: text(action.at) })),
      marketState: journal.marketState
    };
  }
  function installFairLogConsole() {
    const reportText = () => JSON.stringify(buildFairReport());
    const download = () => {
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      const link = h("a", { href: URL.createObjectURL(new Blob([reportText()], { type: "application/json" })), download: `kyara-fair-log-${stamp}.json` });
      document.body.append(link);
      link.click();
      link.remove();
      return "fichier téléchargé";
    };
    window.kyaraPlusFairLog = {
      status: () => {
        const journal = readJournal();
        return { snapshots: journal.snapshots.length, events: Object.keys(journal.events).length, actions: journal.actions.length, since: new Date(journal.startedAt).toLocaleString("fr-FR"), lastCheck: journal.lastCheckAt && new Date(journal.lastCheckAt).toLocaleString("fr-FR") };
      },
      report: buildFairReport,
      text: reportText,
      download,
      copy: async () => {
        try {
          await navigator.clipboard.writeText(reportText());
          return "copié dans le presse-papiers";
        } catch {
          return `presse-papiers refusé : ${download()}`;
        }
      },
      clear: () => {
        localStorage.removeItem(JOURNAL_KEY);
        return "relevé vidé";
      }
    };
  }

  // src/features/fair-survey.js
  // Relevé des échanges effectués sur ce compte (offres du tableau, échanges directs, ventes, achats, ordres d'achat),
  // chacun avec l'état des jauges Dons / Écart relevé avant et après, pour vérifier le modèle du script.
  // Bouton « Relevé » de la jauge, ou en console : kyaraPlusReleve.download()
  var SURVEY_VERSION = "2.35.17";
  var surveyText = (time) => time == null ? null : new Date(time).toLocaleString("fr-FR");
  var surveyCounters = (snapshot) => snapshot ? { at: snapshot.at, atText: surveyText(snapshot.at), declencheur: snapshot.trigger, dons: snapshot.counters.myReceivedLeft ?? null, ecart: snapshot.counters.myFreeLeft ?? null } : null;
  // the other fields of /fair-play/with/<joueur>, unknown to the script (candidates for the limits between two players)
  var surveyOtherFields = (counters) => Object.fromEntries(Object.entries(counters ?? {}).filter(([name]) => name !== "myReceivedLeft" && name !== "myFreeLeft"));
  var SURVEY_PARTNER_READS = 5;
  var surveyCards = (side) => side ? { chakra: side.chakra, cartes: side.cards.map((card) => ({ id: card.id, qty: card.qty, prixEquitable: card.price })) } : null;
  var surveyPartnerId = (myId, entries, journal) => entries.map((entry) => entry.partner?.id).find((id) => id && id !== myId) ?? journal.snapshots.at(-1)?.partner?.id ?? null;
  function surveyTimeline(journal, rules) {
    const snapshots = [...journal.snapshots].sort((a, b) => a.at - b.at);
    const events = Object.values(journal.events).sort((a, b) => a.at - b.at);
    const canRate = Boolean(rules?.enabled) && rules.freeRatio != null && rules.ignoreBelow != null;
    const returnMs = (rules?.receivedDays ?? 2) * 24 * HOUR_MS;
    const impacts = new Map(events.map((event) => [event.key, canRate ? tradeImpact(event, rules) : null]));
    const delta = (before, after, field) => before && after && before.counters[field] != null && after.counters[field] != null ? after.counters[field] - before.counters[field] : null;
    return events.map((event) => {
      const from = event.approximate && event.earliestAt != null ? Math.min(event.earliestAt, event.at) : event.at;
      const before = snapshots.findLast((snapshot) => snapshot.at <= from);
      const after = snapshots.find((snapshot) => snapshot.at > event.at);
      const impact = impacts.get(event.key);
      const inWindow = (time) => before && after && time != null && time > before.at && time <= after.at;
      const others = events.filter((other) => other.key !== event.key && inWindow(other.at)).map((other) => other.key);
      const retours = events.filter((other) => impacts.get(other.key)?.toMe && inWindow(other.at + returnMs)).map((other) => ({ key: other.key, dons: impacts.get(other.key).gift, ecart: impacts.get(other.key).free }));
      return {
        key: event.key,
        type: event.kind,
        at: event.at,
        atText: surveyText(event.at),
        heureApproximative: Boolean(event.approximate),
        auPlusTot: event.approximate ? surveyText(event.earliestAt) : void 0,
        partenaire: event.partner?.pseudo ?? null,
        donne: surveyCards(event.detail?.gave),
        recu: surveyCards(event.detail?.got),
        valeurDonnee: event.given,
        valeurRecue: event.received,
        modele: impact ? { enMaFaveur: impact.toMe, ecartBrut: impact.gap, consommeDons: impact.toMe ? impact.gift : 0, consommeEcart: impact.toMe ? impact.free : 0, retourPrevu: impact.toMe ? surveyText(event.at + returnMs) : null } : { enMaFaveur: false, note: "sous le seuil ignoreBelow ou règles inconnues : aucun effet attendu" },
        jaugesAvant: surveyCounters(before),
        jaugesApres: surveyCounters(after),
        variationObservee: before && after ? { dons: delta(before, after, "myReceivedLeft"), ecart: delta(before, after, "myFreeLeft"), dureeMin: Math.round((after.at - before.at) / 6e4) } : null,
        autresEchangesDansLeMemeIntervalle: others,
        retoursDeMargeDansLeMemeIntervalle: retours
      };
    });
  }
  async function buildFairSurvey(onStep = () => {
  }) {
    const problems = [];
    const step = async (label, read) => {
      onStep(label);
      try {
        return await read();
      } catch (error) {
        problems.push(`${label} : ${describeError(error)}`);
        return null;
      }
    };
    const myId = await step("identité", loadMyId);
    // 1. the ledger is synced first so the newest trades of the account are in the journal
    const entries = myId ? await step("échanges du compte", () => syncTradeLedger(myId, {}, { pauseMs: 0 })) ?? readEntries() : readEntries();
    // 2. then the counters are read, so the last gauge point is as fresh as possible
    const journalBefore = readJournal();
    const partnerId = surveyPartnerId(myId, entries, journalBefore);
    const fair = partnerId ? await step("jauges Dons / Écart", () => fairPlayApi.withPlayer(partnerId)) : null;
    if (!partnerId) problems.push("jauges : aucun autre joueur connu, pas de relevé des compteurs");
    if (fair) recordFairSnapshot(fair, { trigger: "releve", partner: { id: partnerId, pseudo: entries.find((entry) => entry.partner?.id === partnerId)?.partner.pseudo ?? null } });
    // 3. the raw answer with the partners of the most recent trades in my favour, to find the limits between two players
    const recentPartners = [];
    for (const entry of [...entries].reverse()) {
      const id = entry.partner?.id;
      if (id && id !== myId && id !== partnerId && !recentPartners.some((item) => item.id === id) && entry.received > entry.given) recentPartners.push({ id, pseudo: entry.partner.pseudo });
      if (recentPartners.length >= SURVEY_PARTNER_READS) break;
    }
    const fairPlayParPartenaire = [];
    for (const partner of recentPartners) {
      const answer = await step(`fair-play avec ${partner.pseudo ?? partner.id}`, () => fairPlayApi.withPlayer(partner.id));
      if (answer) fairPlayParPartenaire.push({ partenaire: partner.pseudo, partenaireId: partner.id, reponseBrute: answer });
    }
    const journal = readJournal();
    const rules = journal.rules.at(-1)?.values ?? null;
    const now = Date.now();
    return {
      versionReleve: SURVEY_VERSION,
      genereLe: surveyText(now),
      genereA: now,
      decalageHoraireMinutes: (/* @__PURE__ */ new Date()).getTimezoneOffset(),
      monId: myId,
      problemes: problems,
      notes: [
        "echanges : tous les échanges effectués sur ce compte connus du script (14 jours), du plus ancien au plus récent.",
        "jaugesAvant / jaugesApres : dernier relevé des compteurs avant l'échange et premier relevé après (le script relève à chaque changement, au plus toutes les 30 min, et sur ce bouton).",
        "variationObservee : différence réelle entre ces deux relevés ; modele : ce que le script pense que l'échange consomme (dons / écart) et quand ça revient (48 h).",
        "Si autresEchangesDansLeMemeIntervalle ou retoursDeMargeDansLeMemeIntervalle n'est pas vide, la variation observée est partagée entre plusieurs causes.",
        "acceptationsParLeScript : échanges acceptés depuis le script, avec les compteurs connus juste avant et la réponse du serveur.",
        "relevesDesJauges : tous les points de compteurs enregistrés, pour recouper ; autresChamps = les champs de la réponse du site que le script n'utilise pas.",
        "fairPlayBrut / fairPlayParPartenaire : réponses brutes de /fair-play/with/<joueur>, pour trouver les limites entre deux joueurs (hypothèse : 3 000 de dons et 5 000 dans le même sens sur 48 h, cf. limitesParPaireSupposees et usageParPartenaire)."
      ],
      regles: rules,
      jaugesMaintenant: fair ? { dons: fair.myReceivedLeft ?? null, ecart: fair.myFreeLeft ?? null } : null,
      fairPlayBrut: fair ? { partenaire: entries.find((entry) => entry.partner?.id === partnerId)?.partner.pseudo ?? null, partenaireId: partnerId, reponseBrute: fair } : null,
      fairPlayParPartenaire,
      limitesParPaireSupposees: { dons: config_default.fairPlay.pairGiftCap, memeSens: config_default.fairPlay.pairFlowCap },
      usageParPartenaire: fair ? Object.fromEntries(Object.entries(pairUsage(entries, fair, now)).map(([id, used]) => [entries.find((entry) => entry.partner?.id === id)?.partner.pseudo ?? id, used])) : null,
      echanges: surveyTimeline(journal, rules),
      acceptationsParLeScript: journal.actions.map((action) => ({ ...action, atText: surveyText(action.at) })),
      relevesDesJauges: journal.snapshots.map((snapshot) => ({ ...surveyCounters(snapshot), partenaire: snapshot.partner?.pseudo ?? null, autresChamps: surveyOtherFields(snapshot.counters) }))
    };
  }
  function installFairSurveyConsole() {
    let running = null;
    const build = (onStep) => {
      running ??= buildFairSurvey(onStep).finally(() => {
        running = null;
      });
      return running;
    };
    const download = async (onStep) => {
      const survey = await build(onStep);
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      const link = h("a", { href: URL.createObjectURL(new Blob([JSON.stringify(survey, null, 1)], { type: "application/json" })), download: `kyara-releve-echanges-${stamp}.json` });
      document.body.append(link);
      link.click();
      link.remove();
      return `${plural(survey.echanges.length, "échange")} relevé(s) : fichier kyara-releve-echanges-${stamp}.json téléchargé${survey.problemes.length ? ` (${survey.problemes.length} lecture(s) en échec, voir problemes)` : ""}`;
    };
    window.kyaraPlusReleve = {
      build: () => build(),
      text: async () => JSON.stringify(await build()),
      download: () => download(),
      copy: async () => {
        try {
          await navigator.clipboard.writeText(JSON.stringify(await build()));
          return "relevé copié dans le presse-papiers";
        } catch {
          return `presse-papiers refusé : ${await download()}`;
        }
      }
    };
    return { download, isRunning: () => running !== null };
  }
  var fairSurvey = null;

  // src/data/wishlist.js
  async function loadWishlist() {
    const { wishlist } = await meApi.bootstrap();
    return new Set(wishlist ?? []);
  }

  // src/features/market-offers/auto-accept.js
  var MINUTE_MS = 6e4;
  var initialAutoState = () => ({
    enabled: false,
    rules: new Set(readSetting("autoRules", [])),
    doublesOnly: readSetting("autoDoublesOnly", true),
    gainEnabled: readSetting("autoGainEnabled", false),
    minGain: readSetting("autoMinGain", config_default.autoAccept.defaultMinGain),
    // per given rarity: minimum gain (received price − given price) for the rarity rules of that row; absent = no condition
    rowMinGain: readSetting("autoRowMinGain", {}),
    // what the auto-accept did since it was last switched on: the last exchanges and the running totals of their
    // estimated gains (received price − given price, as the badges of the board); kept across reloads, reset by "Activer"
    ...readAutoSession(),
    stopReason: null,
    giftLimited: 0
  });
  var AUTO_SESSION_SETTING = "autoSession";
  var emptyAutoSession = (since) => ({ since, count: 0, gain: 0, unknown: 0, byGive: {} });
  function readAutoSession() {
    const stored = readSetting(AUTO_SESSION_SETTING, null);
    const session = stored?.session?.since ? stored.session : emptyAutoSession(null);
    return { session, log: Array.isArray(stored?.log) ? stored.log : [] };
  }
  var writeAutoSession = ({ session, log }) => writeSetting(AUTO_SESSION_SETTING, { session, log: log.slice(0, config_default.autoAccept.logLimit) });
  function addToAutoSession(session, entry) {
    const given = entry.given.rarity;
    const row = session.byGive[given] ?? { count: 0, gain: 0, unknown: 0 };
    const known = entry.gain != null;
    return {
      ...session,
      count: session.count + 1,
      gain: session.gain + (known ? entry.gain : 0),
      unknown: session.unknown + (known ? 0 : 1),
      byGive: { ...session.byGive, [given]: { count: row.count + 1, gain: row.gain + (known ? entry.gain : 0), unknown: row.unknown + (known ? 0 : 1) } }
    };
  }
  var autoSettings = ({ rules, doublesOnly, gainEnabled, minGain, rowMinGain = {} }) => ({
    rules,
    doublesOnly,
    minGain: gainEnabled ? minGain : null,
    rowMinGain
  });
  function createAutoAccept(store, { take, currentAnalyses }) {
    const tried = /* @__PURE__ */ new Set();
    const acceptedAt = [];
    let running = false;
    const auto = () => store.get().auto;
    const patch = (changes) => store.set({ auto: { ...auto(), ...changes } });
    async function waitForRateLimit() {
      for (; ; ) {
        while (acceptedAt.length && Date.now() - acceptedAt[0] >= MINUTE_MS) acceptedAt.shift();
        if (acceptedAt.length < config_default.autoAccept.maxPerMinute) return;
        await sleep(acceptedAt[0] + MINUTE_MS - Date.now());
      }
    }
    const nextCandidate = () => autoAcceptCandidates(currentAnalyses(), autoSettings(auto())).find((deal) => !tried.has(deal.analysis.offer.id));
    function stop(reason) {
      patch({ enabled: false, stopReason: reason });
      toast(`Auto-accept arrêté : ${reason}`, "error");
    }
    function skipGiftLimited(error) {
      if (!auto().giftLimited) toast(`Auto-accept : offre ignorée. ${describeError(error)}`, "error");
      patch({ giftLimited: auto().giftLimited + 1 });
    }
    async function acceptDeal({ analysis, option }) {
      tried.add(analysis.offer.id);
      try {
        await take(analysis, option);
      } catch (error) {
        if (isGiftLimit(error)) skipGiftLimited(error);
        else if (!isGone(error)) stop(describeError(error));
        return;
      }
      acceptedAt.push(Date.now());
      const entry = { id: analysis.offer.id, received: analysis.received, given: option.card, at: Date.now(), gain: option.gain ?? null, receivedPrice: analysis.receivedPrice ?? null, givenPrice: option.price ?? null };
      const next = { log: [entry, ...auto().log].slice(0, config_default.autoAccept.logLimit), session: addToAutoSession(auto().session, entry) };
      writeAutoSession(next);
      patch(next);
      toast(`Auto-accept : ${analysis.received.name} reçue contre ${option.card.name}${option.gain != null ? ` (${formatGain(option.gain)} ◆)` : ""}.`, "success");
    }
    async function drain() {
      if (running) return;
      running = true;
      try {
        while (auto().enabled) {
          await waitForRateLimit();
          const deal = auto().enabled ? nextCandidate() : null;
          if (!deal) break;
          await acceptDeal(deal);
          await sleep(config_default.autoAccept.gapMs + jitter(config_default.autoAccept.gapMs));
        }
      } finally {
        running = false;
      }
    }
    function setEnabled(enabled) {
      const fresh = enabled ? { log: [], session: emptyAutoSession(Date.now()) } : {};
      if (enabled) writeAutoSession(fresh);
      patch({ enabled, stopReason: null, giftLimited: 0, ...fresh });
      if (enabled) drain();
    }
    // The rules are frozen while the auto-accept runs: a change would apply at once, and a threshold being retyped
    // ("500" → "" → "200") would let anything through for a moment. Stop, change, start again.
    function locked() {
      if (!auto().enabled) return false;
      toast("Arrête l’auto-accept avant de modifier ses règles.", "error");
      return true;
    }
    function toggleRule(key) {
      if (locked()) return;
      const rules = new Set(auto().rules);
      if (rules.has(key)) rules.delete(key);
      else rules.add(key);
      writeSetting("autoRules", [...rules]);
      patch({ rules });
      drain();
    }
    function setDoublesOnly(doublesOnly) {
      if (locked()) return;
      writeSetting("autoDoublesOnly", doublesOnly);
      patch({ doublesOnly });
      drain();
    }
    function setGainRule({ gainEnabled = auto().gainEnabled, minGain = auto().minGain }) {
      if (locked()) return;
      writeSetting("autoGainEnabled", gainEnabled);
      writeSetting("autoMinGain", minGain);
      patch({ gainEnabled, minGain });
      drain();
    }
    function setRowMinGain(give, value) {
      if (locked()) return;
      const rowMinGain = { ...auto().rowMinGain };
      if (value == null) delete rowMinGain[give];
      else rowMinGain[give] = value;
      writeSetting("autoRowMinGain", rowMinGain);
      patch({ rowMinGain });
      drain();
    }
    return {
      consider: drain,
      setEnabled,
      toggleRule,
      setDoublesOnly,
      setGainRule,
      setRowMinGain,
      stop: () => patch({ enabled: false })
    };
  }

  // src/features/market-offers/controller.js
  var SERVER_FILTERS = {
    [Filter.DOUBLES]: "doubles",
    [Filter.MISSING]: "missing",
    [Filter.WISHED]: "wished"
  };
  var Phase2 = {
    IDLE: "idle",
    LOADING: "loading",
    READY: "ready",
    ERROR: "error"
  };
  var initialState3 = () => ({
    phase: Phase2.IDLE,
    scanned: 0,
    error: null,
    analyses: [],
    hiddenCount: 0,
    busy: /* @__PURE__ */ new Set(),
    live: true,
    fair: null,
    auto: initialAutoState()
  });
  var pinBusyKey = (card) => `pin:${card.id}`;
  var cardIdsOf = (offers) => offers.flatMap((offer) => [offer.characterId, ...offer.wantIds]);
  function createOffersController(store) {
    let context = null;
    let offers = [];
    let found = /* @__PURE__ */ new Map();
    let generation = 0;
    const takenIds = /* @__PURE__ */ new Set();
    const scannedFilters = /* @__PURE__ */ new Set();
    const hiddenIds = /* @__PURE__ */ new Set();
    const arrivedAt = /* @__PURE__ */ new Map();
    let stopPolling = null;
    const isOpen = (offer, now) => !hiddenIds.has(offer.id) && Date.parse(offer.expiresAt) > now;
    const isNew = (offer, now) => now - (arrivedAt.get(offer.id) ?? -Infinity) < config_default.live.newBadgeMs;
    function publish(extra = {}) {
      const now = Date.now();
      store.set({
        ...extra,
        hiddenCount: hiddenIds.size,
        analyses: offers.filter((offer) => isOpen(offer, now)).map((offer) => {
          const analysis = analyzeOffer(offer, context);
          return analysis && { ...analysis, isNew: isNew(offer, now) };
        }).filter(Boolean)
      });
    }
    const auto = createAutoAccept(store, { take: takeOffer, currentAnalyses: () => store.get().analyses });
    let fairReadAt = 0;
    // The bars are shown as soon as the counters arrive (one request); the upcoming returns follow once the ledger is synced.
    // With ledger: false only the counters are read, and the read does not count as a full refresh.
    let acceptReadAt = 0;
    // time of the last full read (counters + ledger): the early counters-only read does not count
    let fairLedgerAt = 0;
    async function refreshFairPlay(partnerId = offers.find((offer) => offer.user?.id)?.user.id, trigger = "refresh", pseudo = null, { spread = true, ledger = true } = {}) {
      if (!partnerId) return;
      if (ledger) fairReadAt = Date.now();
      try {
        const pauseMs = spread ? config_default.fairPlay.spreadMs * rush() : 0;
        const fair = await loadFairPlay(partnerId);
        recordFairSnapshot(fair, { trigger, partner: { id: partnerId, pseudo: pseudo ?? offers.find((offer) => offer.user?.id === partnerId)?.user.pseudo ?? null } });
        const left = receiveLeft(fair);
        const current = store.get().fair;
        // Stale answer guard: a background read that contradicts the read made right after an accept is ignored for a while.
        if (trigger === "after-accept") acceptReadAt = Date.now();
        else if (current && left && Date.now() - acceptReadAt < config_default.fairPlay.acceptReadGraceMs && (left.gifts !== current.gifts || left.freeGaps !== current.freeGaps)) return;
        const publishFair = (releases, pairUsed) => {
          const next = left && { ...left, releases, pairUsed };
          if (JSON.stringify(next) !== JSON.stringify(store.get().fair)) store.set({ fair: next });
        };
        publishFair(current?.releases ?? [], current?.pairUsed ?? {});
        if (!ledger) return;
        if (pauseMs) await sleep(pauseMs);
        const entries = await loadMyId().then((myId) => syncTradeLedger(myId, {}, { pauseMs }));
        const now = Date.now();
        const returned = returnedFairKeys();
        publishFair(upcomingReleases(entries.filter((entry) => !returned.has(entry.key)), fair, { now, direction: "received" }), pairUsage(entries, fair, now));
        fairLedgerAt = now;
      } catch (error) {
        toast(describeError(error), "error");
      }
    }
    const fairPlayIsStale = () => Date.now() - fairReadAt > config_default.fairPlay.refreshMs * rush();
    // the early counters-only read has its own clock, so a failure is not retried on every page
    let fairPeekAt = 0;
    const fairPeekIsStale = () => Date.now() - fairPeekAt > config_default.fairPlay.refreshMs * rush();
    function hide(offerId) {
      hiddenIds.add(offerId);
      publish();
    }
    function showHidden() {
      hiddenIds.clear();
      publish();
    }
    function setBusy(key, busy) {
      const next = new Set(store.get().busy);
      if (busy) next.add(key);
      else next.delete(key);
      store.set({ busy: next });
    }
    async function scanPages(query2, scanGeneration = generation) {
      const isStale = () => scanGeneration !== generation;
      const fetchPage = (page) => {
        const promise = tradesApi.searchOffers({ ...query2, page, pageSize: config_default.offers.pageSize, takeable: true });
        promise.catch(() => {
        });
        return promise;
      };
      // The next page is queued before this page's prices, so the two requests overlap instead of waiting for each other.
      let nextPage = fetchPage(1);
      for (let page = 1; page <= config_default.offers.maxPages && !isStale(); page++) {
        const { items, more } = await nextPage;
        if (isStale()) return;
        const fresh = items.filter((offer) => offer.status === "open" && !found.has(offer.id));
        // Queue order: this page's prices (the board shows as soon as they arrive), the bars, then the next page.
        const pricesLoading = loadPrices(cardIdsOf(fresh));
        // The bars need the id of any player with an offer: the first page gives one.
        const seller = items.find((offer) => offer.user?.id)?.user;
        if (seller && !store.get().fair && fairPlayIsStale() && fairPeekIsStale()) {
          fairPeekAt = Date.now();
          refreshFairPlay(seller.id, "scan", seller.pseudo ?? null, { spread: false, ledger: false });
        }
        nextPage = more && page < config_default.offers.maxPages ? fetchPage(page + 1) : null;
        await pricesLoading;
        if (isStale()) return;
        for (const offer of fresh) found.set(offer.id, offer);
        offers = [...found.values()].filter((offer) => !takenIds.has(offer.id));
        publish({ scanned: found.size });
        auto.consider();
        // Full read (ledger included) in the background: the scan goes on, the requests simply interleave in the queue.
        if (found.size >= config_default.fairPlay.startAfterOffers && fairPlayIsStale()) refreshFairPlay(void 0, "scan", null, { spread: false });
        if (!more) break;
      }
    }
    function scanFilter(filter) {
      const param = SERVER_FILTERS[filter];
      if (!param || scannedFilters.has(filter)) return Promise.resolve();
      scannedFilters.add(filter);
      return scanPages({ [param]: 1 });
    }
    async function scanOffers(catalog, filters, scanGeneration) {
      for (const filter of filters) await scanFilter(filter);
      for (const rarity of config_default.offers.priorityRarities) {
        const ids = [...catalog.values()].filter((card) => card.rarity === rarity).map((card) => card.id);
        for (const batch of chunk(ids, config_default.offers.idsPerQuery)) await scanPages({ ids: batch }, scanGeneration);
      }
      await scanPages({}, scanGeneration);
    }
    function focus(filter) {
      if (!context) return;
      scanFilter(filter).catch((error) => toast(describeError(error), "error"));
    }
    async function refreshCollection() {
      try {
        context.collection = await loadCollection();
        publish();
      } catch (error) {
        toast(describeError(error), "error");
      }
    }
    function dropOffer(offerId) {
      takenIds.add(offerId);
      offers = offers.filter((offer) => offer.id !== offerId);
      publish();
    }
    async function load(filters = []) {
      const loadGeneration = ++generation;
      found = /* @__PURE__ */ new Map();
      scannedFilters.clear();
      store.set({ phase: Phase2.LOADING, scanned: 0, error: null });
      try {
        const [catalog, collection, wishlist] = await Promise.all([loadCatalog(), loadCollection(), loadWishlist()]);
        if (loadGeneration !== generation) return;
        context = { catalog, collection, wishlist, priceOf };
        startLive();
        await scanOffers(catalog, filters, loadGeneration);
        // fewer than startAfterOffers offers: the full read (ledger, upcoming returns, limits per partner) runs now
        if (Date.now() - fairLedgerAt > config_default.fairPlay.refreshMs * rush() && fairPlayIsStale()) refreshFairPlay(void 0, "initial", null, { spread: false });
        if (loadGeneration === generation) store.set({ phase: Phase2.READY });
        auto.consider();
      } catch (error) {
        if (loadGeneration === generation) store.set({ phase: Phase2.ERROR, error: describeError(error) });
      }
    }
    function announce(fresh) {
      const freshIds = new Set(fresh.map((offer) => offer.id));
      const analyses = store.get().analyses.filter((analysis) => freshIds.has(analysis.offer.id));
      const bangers = bestDealPerOffer(bangerDeals(analyses));
      const bangerIds = new Set(bangers.map((deal) => deal.analysis.offer.id));
      const minGain = readSetting("minGain", config_default.side.defaultMinGain);
      const gains = profitDeals(analyses, minGain, store.get().fair).filter((deal) => !bangerIds.has(deal.analysis.offer.id));
      const messages = [
        ...bangers.map(({ analysis, option }) => `Nouvelle offre banger : ${analysis.received.name} contre ${option.card.name}.`),
        ...gains.map(({ analysis, recommended, best }) => {
          const card = recommended ?? best;
          return `Nouvelle offre rentable : ${analysis.received.name} contre ${card.card.name} (${formatGain(card.gain)} ◆)${recommended ? "" : ", mais le fair-play la refuserait pour l’instant"}.`;
        })
      ];
      if (messages.length > config_default.live.maxToasts) {
        toast(`${messages.length} nouvelles offres intéressantes, en haut de la liste.`, "success");
      } else {
        messages.forEach((message) => toast(message, "success"));
      }
    }
    function refreshFairPlayInBackground() {
      if (store.get().phase === Phase2.LOADING || !fairPlayIsStale()) return;
      refreshFairPlay(void 0, "poll");
    }
    async function pollNewOffers() {
      const fresh = await fetchNewOffers((id) => found.has(id) || takenIds.has(id));
      refreshFairPlayInBackground();
      if (fresh.length === 0) return;
      const now = Date.now();
      for (const offer of fresh) {
        found.set(offer.id, offer);
        arrivedAt.set(offer.id, now);
      }
      offers = [...found.values()].filter((offer) => !takenIds.has(offer.id));
      publish({ scanned: found.size });
      auto.consider();
      await loadPrices(cardIdsOf(fresh));
      publish();
      auto.consider();
      announce(fresh);
    }
    const pollBaseMs = () => store.get().auto.enabled ? config_default.live.autoPollMs : config_default.live.pollMs;
    function startLive() {
      if (stopPolling) return;
      stopPolling = startPolling(pollNewOffers, pollBaseMs, (error) => {
        stopPolling = null;
        store.set({ live: false });
        toast(`Suivi en direct arrêté : ${describeError(error)} Clique sur « Actualiser » pour le relancer.`, "error");
      });
      store.set({ live: true });
    }
    async function takeOffer(analysis, option) {
      const { offer } = analysis;
      const { card } = option;
      const action = {
        kind: "offer-accept",
        offerId: offer.id,
        seller: { id: offer.user?.id ?? null, pseudo: offer.user?.pseudo ?? null },
        received: { id: analysis.received.id, name: analysis.received.name, rarity: analysis.received.rarity, price: analysis.receivedPrice },
        given: { id: card.id, name: card.name, rarity: card.rarity, price: option.price, qtyOwned: option.entry?.qty ?? null },
        scriptGain: option.gain
      };
      setBusy(offer.id, true);
      let actionId = null;
      try {
        await tradesApi.acceptOffer(offer.id, card.id);
        actionId = recordFairAction({ ...action, ok: true });
      } catch (error) {
        recordFairAction({ ...action, ok: false, error: { status: error.status ?? null, code: error.code ?? null, message: error.message ?? null } });
        if (isGone(error)) dropOffer(offer.id);
        throw error;
      } finally {
        setBusy(offer.id, false);
      }
      dropOffer(offer.id);
      await refreshCollection();
      refreshFairPlay(offer.user?.id, "after-accept", offer.user?.pseudo);
      fairPlayApi.prices([analysis.received.id, card.id]).then((fairPrices) => updateFairAction(actionId, { fairPrices })).catch(() => {
      });
    }
    async function give(analysis, option) {
      try {
        await takeOffer(analysis, option);
      } catch (error) {
        toast(describeError(error), "error");
        return;
      }
      toast(`Échange fait : ${analysis.received.name} contre ${option.card.name}.`, "success");
    }
    function dispose() {
      generation++;
      stopPolling?.();
      auto.stop();
    }
    async function unlock(card) {
      setBusy(pinBusyKey(card), true);
      try {
        await unpinCard(card.id);
      } catch (error) {
        toast(describeError(error), "error");
        return;
      } finally {
        setBusy(pinBusyKey(card), false);
      }
      toast(`${card.name} déverrouillée.`, "success");
      await refreshCollection();
    }
    return {
      load,
      focus,
      give,
      unlock,
      hide,
      showHidden,
      dispose,
      setAuto: auto.setEnabled,
      toggleAutoRule: auto.toggleRule,
      setAutoDoublesOnly: auto.setDoublesOnly,
      setAutoRowMinGain: auto.setRowMinGain,
      setAutoGainRule: auto.setGainRule
    };
  }

  // src/features/market-offers/board.js
  var FILTER_LABELS = [
    [Filter.TRADEABLE, "Échangeables"],
    [Filter.DOUBLES, "Avec mes doublons"],
    [Filter.MISSING, "Cartes que je n’ai pas"],
    [Filter.WISHED, "Ma wishlist"]
  ];
  // One control, two sides, never both lit: the right side already covers the left one
  var LOSS_LABELS = [
    [Filter.NO_LOSS_CROSS, "Symbios la tepu"],
    [Filter.NO_LOSS_ALL, "Sans aucune perte"]
  ];
  var FILTER_TITLES = {
    [Filter.NO_LOSS_CROSS]: "Cache les cartes que tu donnerais à perte contre une rareté différente (une rareté supérieure contre une inférieure, ou l’inverse), selon les prix moyens connus, et les offres où il ne reste rien d’autre à donner. Les pertes entre cartes de même rareté restent visibles.",
    [Filter.NO_LOSS_ALL]: "Cache toutes les cartes que tu donnerais à perte selon les prix moyens connus, même rareté comprise, et les offres où il ne reste rien d’autre à donner."
  };
  var WISHLIST_GROUP = "wishlist";
  function statusText2(state, count) {
    if (state.phase === Phase2.LOADING) return `Analyse des offres… ${formatNumber(state.scanned)}`;
    if (state.phase === Phase2.ERROR) return state.error;
    if (state.phase === Phase2.READY) return plural(count, "offre");
    return "";
  }
  function groupOffers(analyses) {
    const groups = /* @__PURE__ */ new Map();
    for (const analysis of analyses) {
      const key = analysis.wished ? WISHLIST_GROUP : analysis.received.rarity;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(analysis);
    }
    return [...groups];
  }
  function optionAction(analysis, option, controller) {
    switch (option.status) {
      case GiveStatus.AVAILABLE:
        return giveButton(option, () => controller.give(analysis, option));
      case GiveStatus.BLOCKED:
        return blockedTag(option.entry);
      default:
        return null;
    }
  }
  var GIVABLE_STATUSES = /* @__PURE__ */ new Set([GiveStatus.AVAILABLE, GiveStatus.PINNED]);
  function optionTile(analysis, option, controller, fair) {
    return h(
      "div",
      { class: `kp-option kp-option--${option.status}` },
      cardArt(option.card, "md", optionOverlays(option)),
      h("strong", { class: "kp-name", title: option.card.name }, option.card.name),
      h("span", { class: "kp-price" }, formatPrice(option.price)),
      ownershipNote(option.entry),
      GIVABLE_STATUSES.has(option.status) ? costChip(optionCost(analysis, option, fair), fair) : null,
      optionAction(analysis, option, controller)
    );
  }
  function receivedNote({ owned, wished }) {
    if (wished) return h("span", { class: "kp-note kp-note--wish" }, owned ? `Wishlist · tu en as ${owned}` : "Wishlist · nouvelle");
    return h("span", { class: owned ? "kp-note" : "kp-note kp-note--new" }, owned ? `Tu en as ${owned}` : "Nouvelle carte");
  }
  function offerRow(analysis, busy, controller, fair) {
    const { offer, received, receivedPrice, options } = analysis;
    return h(
      "article",
      { class: `kp-offer${busy.has(offer.id) ? " is-busy" : ""}` },
      h(
        "div",
        { class: "kp-offer__get" },
        h("span", { class: "kp-label" }, "Tu reçois"),
        cardArt(received, "lg"),
        h("strong", { class: "kp-name", title: received.name }, received.name),
        h("span", { class: "kp-price" }, formatPrice(receivedPrice)),
        receivedNote(analysis),
        h("span", { class: "kp-note" }, `${offer.user?.pseudo ?? "?"} · ${formatRemaining(offer.expiresAt)}`)
      ),
      swapIcon(),
      h(
        "div",
        { class: "kp-offer__give" },
        h("span", { class: "kp-label" }, "Tu donnes l’une de ces cartes"),
        h("div", { class: "kp-options" }, options.map((option) => optionTile(analysis, option, controller, fair)))
      ),
      hideButton(() => controller.hide(offer.id))
    );
  }
  function offerGroup(key, analyses, busy, controller, fair) {
    const isWishlist = key === WISHLIST_GROUP;
    const title = isWishlist ? "Wishlist" : RARITY_LABELS[key] ?? key;
    return h(
      "section",
      { class: "kp-group", style: { "--kp-rarity": isWishlist ? "var(--wish)" : rarityColor(key) } },
      h("h3", { class: "kp-group__title" }, `${title} · ${analyses.length}`),
      analyses.map((analysis) => offerRow(analysis, busy, controller, fair))
    );
  }
  function createBoard(controller, { onPropose }) {
    let visibleCount = config_default.offers.renderStep;
    // "noLoss" is the name the single filter had before 2.35.2: it becomes the cross-rarity side; "noDowngrade" (2.35.4 only) is dropped
    const activeFilters = new Set(readSetting("offerFilters", [Filter.TRADEABLE]).map((filter) => filter === "noLoss" ? Filter.NO_LOSS_CROSS : filter).filter((filter) => filter !== "noDowngrade"));
    const activeRarities = new Set(readSetting("offerRarities", RARITIES));
    let lastState = null;
    let search = "";
    const status = h("p", { class: "kp-muted" });
    const list = h("div", { class: "kp-board__list" });
    const showHiddenButton = h("button", { class: "kp-btn kp-btn--ghost", type: "button", onClick: () => controller.showHidden() });
    const rerender = () => lastState && render(lastState);
    function toggleFilter(filter, chip) {
      if (activeFilters.has(filter)) activeFilters.delete(filter);
      else activeFilters.add(filter);
      chip.setAttribute("aria-pressed", String(activeFilters.has(filter)));
      writeSetting("offerFilters", [...activeFilters]);
      if (activeFilters.has(filter)) controller.focus(filter);
      visibleCount = config_default.offers.renderStep;
      rerender();
    }
    const chipFor = ([filter, label]) => {
      const chip = h("button", { class: "kp-chip", type: "button", "aria-pressed": String(activeFilters.has(filter)), title: FILTER_TITLES[filter] ?? null }, label);
      chip.addEventListener("click", () => toggleFilter(filter, chip));
      return chip;
    };
    const filterChips = FILTER_LABELS.map(chipFor);
    // The two loss filters share one segmented chip: lighting one side turns the other off
    const lossSides = LOSS_LABELS.map(([filter, label]) => {
      const side = h("button", { class: "kp-chip kp-chip--side", type: "button", "aria-pressed": String(activeFilters.has(filter)), title: FILTER_TITLES[filter] ?? null }, label);
      side.addEventListener("click", () => {
        for (const other of LOSS_FILTERS) {
          if (other === filter || !activeFilters.has(other)) continue;
          activeFilters.delete(other);
          lossSides[LOSS_FILTERS.indexOf(other)].setAttribute("aria-pressed", "false");
        }
        toggleFilter(filter, side);
      });
      return side;
    });
    const lossChip = h("div", { class: "kp-chip-pair", role: "group", "aria-label": "Pertes" }, lossSides);
    const rarityChips = [...RARITIES].reverse().map((rarity) => {
      const chip = h(
        "button",
        {
          class: "kp-gem-chip",
          type: "button",
          title: RARITY_LABELS[rarity],
          style: { "--kp-rarity": rarityColor(rarity) },
          "aria-pressed": String(activeRarities.has(rarity))
        },
        rarity
      );
      chip.addEventListener("click", () => {
        if (activeRarities.has(rarity)) activeRarities.delete(rarity);
        else activeRarities.add(rarity);
        chip.setAttribute("aria-pressed", String(activeRarities.has(rarity)));
        writeSetting("offerRarities", [...activeRarities]);
        visibleCount = config_default.offers.renderStep;
        rerender();
      });
      return chip;
    });
    const searchInput = h("input", {
      class: "kp-input kp-board__search",
      type: "search",
      placeholder: "Personnage ou série…",
      "aria-label": "Rechercher un personnage ou une série",
      onInput: (event) => {
        search = event.target.value;
        visibleCount = config_default.offers.renderStep;
        rerender();
      }
    });
    const root = h(
      "section",
      { class: "kp-board", "aria-label": "Échanges" },
      h(
        "header",
        { class: "kp-board__bar" },
        h("div", { class: "kp-board__heading" }, h("h2", { class: "kp-title" }, "Échanges"), status),
        h(
          "div",
          { class: "kp-board__actions" },
          showHiddenButton,
          h("button", { class: "kp-btn", type: "button", onClick: onPropose }, "Proposer une carte"),
          h("button", { class: "kp-btn kp-btn--ghost", type: "button", onClick: () => controller.load([...activeFilters]) }, "Actualiser")
        )
      ),
      h(
        "div",
        { class: "kp-filters", role: "group", "aria-label": "Filtres" },
        searchInput,
        filterChips,
        lossChip,
        h("div", { class: "kp-field kp-filters__rarities", role: "group", "aria-label": "Raretés" }, rarityChips)
      ),
      list
    );
    const showMore = () => {
      visibleCount += config_default.offers.renderStep;
      rerender();
    };
    let listKey = "";
    function render(state) {
      lastState = state;
      const offers = boardOffers2(state.analyses, activeFilters, activeRarities, search);
      const visible = offers.slice(0, visibleCount);
      status.textContent = statusText2(state, offers.length);
      showHiddenButton.hidden = state.hiddenCount === 0;
      showHiddenButton.textContent = `Réafficher les masquées (${state.hiddenCount})`;
      const key = JSON.stringify([
        state.phase,
        offers.length,
        [...state.busy],
        state.fair,
        minuteKey(),
        visible.map((analysis) => [analysisKey(analysis), analysis.options.map(optionKey)])
      ]);
      if (key === listKey) return;
      listKey = key;
      if (state.phase === Phase2.READY && offers.length === 0) {
        list.replaceChildren(h("p", { class: "kp-empty" }, "Aucune offre avec ces filtres."));
        return;
      }
      const groups = groupOffers(visible).map(([key, group]) => offerGroup(key, group, state.busy, controller, state.fair));
      if (offers.length > visible.length) {
        groups.push(h("button", { class: "kp-btn kp-btn--ghost kp-more", type: "button", onClick: showMore }, "Voir plus d’offres"));
      }
      list.replaceChildren(...groups);
    }
    return { root, render, filters: () => [...activeFilters] };
  }

  // src/features/market-offers/auto-panel.js
  var RECEIVED = RARITIES.slice(0, -1);
  // every rarity has a row: the higher rarities to receive, plus the same rarity (gain-based)
  var GIVEN = [...RARITIES].reverse();
  var receivableFor = (give) => RARITIES.filter((receive) => rarityRank(receive) <= rarityRank(give));
  var timeFormat2 = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
  function statusText3({ auto, live }) {
    const parts = [live ? "En direct" : "Suivi en direct arrêté"];
    if (auto.enabled) parts.push(`auto-accept actif, ${plural(auto.session.count, "échange")}`);
    else if (auto.stopReason) parts.push(`auto-accept arrêté : ${auto.stopReason}`);
    else if (!hasAutoRule(autoSettings(auto))) parts.push("choisis ci-dessous ce qu’il peut accepter tout seul");
    if (auto.giftLimited) parts.push(`ignorées (limite de dons) : ${plural(auto.giftLimited, "offre")}`);
    return parts.join(" · ");
  }
  var gainTitle = (receivedPrice, givenPrice) => `Gain estimé : prix moyen de la carte reçue (${formatPrice(receivedPrice)}) moins celui de la carte donnée (${formatPrice(givenPrice)}).`;
  function logRow2({ received, given, at, gain, receivedPrice, givenPrice }) {
    const badge = gainBadge(gain);
    badge.title = gainTitle(receivedPrice, givenPrice);
    return h(
      "div",
      { class: "kp-deal kp-deal--auto" },
      cardArt(received, "sm"),
      swapIcon(),
      cardArt(given, "sm"),
      h(
        "div",
        { class: "kp-deal__info" },
        h("strong", { class: "kp-name", title: received.name }, received.name),
        h("span", { class: "kp-note", title: given.name }, `contre ${given.name} · ${timeFormat2.format(at)}`)
      ),
      badge
    );
  }
  // "8 échanges · +1 240 ◆ depuis 01:43", the detail per given rarity in the tooltip
  function sessionSummary(session) {
    if (!session.count) return { text: "", gain: null, title: "" };
    const parts = [plural(session.count, "échange")];
    if (session.since) parts.push(`depuis ${timeFormat2.format(session.since)}`);
    const lines = [`Gain estimé depuis l’activation : somme des écarts de prix moyen (carte reçue − carte donnée), pas du chakra réellement encaissé.${session.unknown ? ` ${plural(session.unknown, "échange")} sans prix connu, non compté${session.unknown > 1 ? "s" : ""}.` : ""}`, "Par rareté donnée :"];
    for (const give of GIVEN) {
      const row = session.byGive[give];
      if (row) lines.push(`${RARITY_LABELS[give]} : ${plural(row.count, "échange")}, ${formatGain(row.gain)} ◆${row.unknown ? ` (${row.unknown} sans prix)` : ""}`);
    }
    return { text: parts.join(" · "), gain: session.gain, title: lines.join("\n") };
  }
  // One sentence per rarity I give: "Je donne une Commune, contre une : [Mythique] [Légendaire] …"
  var allRuleKeys = () => GIVEN.flatMap((give) => receivableFor(give).map((receive) => ruleKey(give, receive)));
  function autoSummary(auto) {
    const byGive = GIVEN.map((give) => {
      const receives = RECEIVED.filter((receive) => auto.rules.has(ruleKey(give, receive)));
      return receives.length ? `${RARITY_LABELS[give]} → ${receives.map((receive) => RARITY_LABELS[receive]).join(" / ")}` : null;
    }).filter(Boolean);
    const parts = [];
    if (byGive.length) parts.push(`par rareté : ${byGive.join(" ; ")}`);
    if (auto.gainEnabled) parts.push(`tout échange dont le gain est d’au moins ${formatChakra(auto.minGain)}`);
    if (!parts.length) return "Rien n’est coché : l’auto-accept n’acceptera rien.";
    return `Acceptera tout seul ${parts.join(", et ")}${auto.doublesOnly ? ", seulement avec mes doublons" : ", même mon dernier exemplaire"}.`;
  }
  function createAutoPanel(controller) {
    const cells = /* @__PURE__ */ new Map();
    const ruleChip = (give, receive) => {
      const key = ruleKey(give, receive);
      const same = give === receive;
      const button = h(
        "button",
        {
          class: `kp-rule-chip${same ? " kp-rule-chip--same" : ""}`,
          type: "button",
          title: same ? `Accepter une ${RARITY_LABELS[give]} contre une autre ${RARITY_LABELS[give]}, seulement si le gain atteint le seuil de la ligne (sans seuil : gain positif ou nul, prix connus).` : `Accepter de donner une ${RARITY_LABELS[give]} pour recevoir une ${RARITY_LABELS[receive]}`,
          style: { "--kp-rarity": rarityColor(receive) },
          onClick: () => controller.toggleAutoRule(key)
        },
        h("span", { class: "kp-rule-chip__gem" }, receive),
        same ? `${RARITY_LABELS[receive]} ⇄` : RARITY_LABELS[receive]
      );
      cells.set(key, button);
      return button;
    };
    const rowInputs = /* @__PURE__ */ new Map();
    const rowGainInput = (give) => {
      const input = h("input", {
        class: "kp-input kp-input--short kp-rule-row__gain",
        type: "text",
        inputmode: "numeric",
        placeholder: "—",
        "aria-label": `Gain minimum quand je donne une ${RARITY_LABELS[give]}`,
        title: `Pour cette ligne, n’accepter que si le gain (prix moyen de la carte reçue moins celui de la carte donnée) atteint ce montant. Vide = pas de condition. Une carte au prix inconnu n’est alors jamais donnée.`,
        onInput: (event) => {
          event.target.value = event.target.value.replace(/[^\d-]/g, "").replace(/(?!^)-/g, "");
          const text = event.target.value;
          controller.setAutoRowMinGain(give, text === "" || text === "-" ? null : Number(text));
        }
      });
      rowInputs.set(give, input);
      return input;
    };
    const ruleRow = (give) => h(
      "div",
      { class: "kp-rule-row" },
      h("span", { class: "kp-rule-row__give", title: `Quand je donne une ${RARITY_LABELS[give]}` }, gem(give), RARITY_LABELS[give]),
      h("span", { class: "kp-rule-row__arrow" }, "→"),
      h("div", { class: "kp-rule-row__chips" }, receivableFor(give).map((receive) => ruleChip(give, receive))),
      h("span", { class: "kp-rule-row__floor" }, "gain ≥", rowGainInput(give))
    );
    const setAll = (checked) => {
      const { rules } = store.get().auto;
      for (const key of allRuleKeys()) if (rules.has(key) !== checked) controller.toggleAutoRule(key);
    };
    const store = { get: () => lastState };
    let lastState = null;
    const status = h("p", { class: "kp-muted" });
    const toggle = h("button", { class: "kp-btn kp-btn--sm", type: "button" });
    const log = h("div", { class: "kp-deals" });
    const logTotal = h("span", { class: "kp-auto__total kp-muted" });
    const logGain = h("span", { class: "kp-gain kp-auto__total-gain" });
    const logTitle = h("h4", { class: "kp-auto__subtitle kp-auto__subtitle--log" }, "Acceptés", logTotal, logGain);
    const gainCheck = h("input", { type: "checkbox", class: "kp-check__box" });
    const gainInput = h("input", {
      class: "kp-input kp-input--short",
      type: "text",
      inputmode: "numeric",
      "aria-label": "Gain minimum pour accepter tout seul",
      onInput: (event) => {
        event.target.value = event.target.value.replace(/\D/g, "");
        controller.setAutoGainRule({ minGain: Number(event.target.value) || 0 });
      }
    });
    const doublesCheck = h("input", { type: "checkbox", class: "kp-check__box" });
    let enabled = false;
    toggle.addEventListener("click", () => controller.setAuto(!enabled));
    gainCheck.addEventListener("change", () => controller.setAutoGainRule({ gainEnabled: gainCheck.checked }));
    doublesCheck.addEventListener("change", () => controller.setAutoDoublesOnly(doublesCheck.checked));
    const shortcuts = [];
    const shortcut = (label, checked) => {
      const button = h("button", { class: "kp-auto__shortcut", type: "button", onClick: () => setAll(checked) }, label);
      shortcuts.push(button);
      return button;
    };
    const LOCKED_TITLE = "Arrête l’auto-accept pour modifier ses règles : elles sont figées tant qu’il tourne.";
    const rulesBlock = h(
      "div",
      { class: "kp-rule-rows" },
      h(
        "div",
        { class: "kp-rule-rows__head" },
        h("span", { class: "kp-label" }, "Je donne"),
        h("span", { class: "kp-label" }, "j’accepte en retour"),
        h("span", { class: "kp-auto__shortcuts" }, shortcut("tout", true), "·", shortcut("rien", false)),
        h("span", { class: "kp-label kp-rule-rows__floor", title: "Gain minimum par ligne, optionnel : utile quand une carte de rareté inférieure vaut plus que celle reçue. Pour une même rareté (⇄), sans seuil, le gain doit être positif ou nul." }, "si gain ≥")
      ),
      GIVEN.map(ruleRow)
    );
    const root = h(
      "div",
      { class: "kp-side__block kp-auto" },
      h("div", { class: "kp-auto__head" }, h("h3", { class: "kp-title kp-title--sm" }, "Auto-accept"), toggle),
      status,
      rulesBlock,
      h(
        "label",
        { class: "kp-check", title: "Accepte aussi, quelle que soit la rareté, toute offre dont le gain (prix moyen de la carte reçue moins prix moyen de la carte donnée) atteint ce montant." },
        gainCheck,
        h("span", {}, "Ou si gain ≥"),
        gainInput,
        h("span", { class: "kp-muted" }, "chakra")
      ),
      h("label", { class: "kp-check", title: "Ne jamais donner le dernier exemplaire d’une carte. Les cartes verrouillées ne sont jamais données, quoi qu’il arrive." }, doublesCheck, h("span", {}, "Seulement mes doublons")),
      logTitle,
      log
    );
    function render(state) {
      lastState = state;
      const { auto } = state;
      enabled = auto.enabled;
      status.textContent = statusText3(state);
      toggle.textContent = enabled ? "Arrêter" : "Activer";
      toggle.classList.toggle("kp-btn--warn", enabled);
      toggle.disabled = !enabled && !hasAutoRule(autoSettings(auto));
      toggle.title = toggle.disabled ? "Coche au moins une règle pour pouvoir activer" : enabled ? "Arrêter l’acceptation automatique" : "Lancer l’acceptation automatique";
      doublesCheck.checked = auto.doublesOnly;
      gainCheck.checked = auto.gainEnabled;
      gainInput.disabled = !auto.gainEnabled || enabled;
      if (document.activeElement !== gainInput) gainInput.value = String(auto.minGain);
      // everything that defines what gets accepted is locked while it runs
      root.classList.toggle("kp-auto--locked", enabled);
      rulesBlock.title = enabled ? LOCKED_TITLE : "";
      doublesCheck.disabled = enabled;
      gainCheck.disabled = enabled;
      for (const button of shortcuts) button.disabled = enabled;
      for (const [key, button] of cells) {
        button.setAttribute("aria-pressed", String(auto.rules.has(key)));
        button.disabled = enabled;
      }
      for (const [give, input] of rowInputs) {
        const floor = auto.rowMinGain?.[give];
        input.disabled = enabled;
        if (document.activeElement !== input) input.value = floor == null ? "" : String(floor);
      }
      logTitle.hidden = auto.session.count === 0 && auto.log.length === 0;
      const summary = sessionSummary(auto.session);
      logTotal.textContent = summary.text;
      logTotal.title = summary.title;
      logGain.hidden = summary.gain == null;
      logGain.textContent = summary.gain == null ? "" : `${formatGain(summary.gain)} ◆`;
      logGain.title = summary.title;
      logGain.className = `kp-gain kp-auto__total-gain kp-gain--${!summary.gain ? "flat" : summary.gain > 0 ? "up" : "down"}`;
      log.replaceChildren(...auto.log.map(logRow2));
    }
    return { root, render };
  }

  // src/features/market-offers/side-panel.js
  var Tab = {
    OFFERS: "offers",
    AUTO: "auto"
  };
  var TABS2 = [
    [Tab.OFFERS, "Offres"],
    [Tab.AUTO, "Auto-accept"]
  ];
  // Gauge: remaining possible gain (gifts + free gap), cost per card and upcoming returns
  // Gain ceiling: gifts and free gap are two separate counters, the ceiling is only reached with the ideal card
  var gainPossible = ({ gifts, freeGaps }) => gifts + freeGaps;
  function gainSteps(fair) {
    let total = gainPossible(fair);
    return fair.releases.map((release) => {
      const delta = release.gift + release.free;
      total += delta;
      return { release, total, delta };
    });
  }
  var releaseTime = (release) => `${release.approximate ? "≈ " : ""}${formatClock(release.at)}`;
  var minutesSince = (time, now = Date.now()) => Math.max(0, Math.floor((now - time) / 6e4));
  var releaseDetail = (release) => {
    const base = `${release.partner?.pseudo ?? "?"} : reçu ${formatChakra(release.received)}, donné ${formatChakra(release.given)}`;
    if (release.fromCreation) {
      const waiting = release.at <= Date.now() ? ` · possible depuis ${minutesSince(release.at)} min` : "";
      return `${base} · estimé depuis la création de l'échange${waiting}`;
    }
    const early = release.earliestAt != null && release.earliestAt < release.at - 6e4;
    return early ? `${base} · retour possible dès ${formatClock(release.earliestAt)}` : base;
  };
  // Imminent returns: an increase expected within 10 minutes turns green
  var SOON_MS = 10 * 6e4;
  var isSoon = (release, now) => release.at - now <= SOON_MS;
  var stepRow = ({ release, total, delta }, now) => h(
    "li",
    { class: isSoon(release, now) ? "is-soon" : "" },
    h("span", { class: "kp-release__time" }, releaseTime(release)),
    h("strong", { class: "kp-release__gain" }, `+${formatChakra(delta)}`),
    h("span", { class: "kp-release__capacity" }, ` total : ${formatChakra(total)} (dons +${formatNumber(release.gift)}, écart +${formatNumber(release.free)})`),
    h("span", { class: "kp-release__detail" }, releaseDetail(release))
  );
  var releasesOpenState = { open: false };
  function releaseList(fair, now) {
    const steps = gainSteps(fair);
    if (steps.length === 0) return null;
    const soon = steps.filter((step) => isSoon(step.release, now)).length;
    const details = h(
      "details",
      { class: "kp-release-all", open: releasesOpenState.open },
      h("summary", { class: soon ? "is-soon" : "" }, `Marge qui revient (${steps.length})${soon ? ` · ${soon} dans moins de 10 min` : ""}`),
      h("ul", { class: "kp-releases kp-releases--all" }, steps.map((step) => stepRow(step, now)))
    );
    details.addEventListener("toggle", () => {
      releasesOpenState.open = details.open;
    });
    return details;
  }
  function renderFairPlay(box, fair) {
    const now = Date.now();
    const steps = fair ? gainSteps(fair) : [];
    const soonKeys = steps.filter((step) => isSoon(step.release, now)).map((step) => step.release.key);
    const waitingMinutes = steps.filter((step) => step.release.fromCreation && step.release.at <= now).map((step) => minutesSince(step.release.at, now));
    const key = JSON.stringify([fair, soonKeys, waitingMinutes]);
    if (box.dataset.key === key) return;
    box.dataset.key = key;
    const explanation = fair && [
      "Marge restante sur 48 h glissantes, avec deux compteurs.",
      `Écart : ce que tu peux encore gagner tant que tu reçois moins de ${fair.freeRatio} fois la valeur que tu donnes.`,
      `Dons : ce que tu peux encore gagner au-delà de ${fair.freeRatio} fois la valeur que tu donnes.`,
      "Chaque échange à ton avantage retire sa part, qui revient 48 h plus tard."
    ].join("\n");
    // fill() drops the nulls: replaceChildren(null) would show the word "null" when nothing is due back
    // Left column: gain, bars, upcoming returns. Right column: the colour legend of the chips.
    fill(
      box,
      h(
        "div",
        { class: "kp-fair__main" },
        h(
          "div",
          { class: "kp-fair__head" },
          fair ? h("strong", { title: explanation }, `Gain encore possible : ${formatChakra(gainPossible(fair))}`) : h("span", { class: "kp-muted" }, "Limites : chargement…")
          // The "Relevé" button is kept in the code but not shown: surveyButton() here would bring it back.
          // The survey stays available from the console: kyaraPlusReleve.download()
        ),
        fair ? fairBars(fair) : null,
        fair ? releaseList(fair, now) : null
      ),
      fair ? costLegend() : null
    );
  }
  // The two 48 h bars, in the colours of the cost chips (orange = Dons, blue = Écart)
  function fairBar(tone2, label, left, cap) {
    const ratio = cap > 0 ? Math.max(0, Math.min(1, left / cap)) : null;
    return h(
      "div",
      { class: `kp-bar kp-bar--${tone2}`, title: `${label} : ${formatChakra(left)} encore disponibles${cap ? ` sur ${formatChakra(cap)}` : ""}.` },
      h("span", { class: "kp-bar__label" }, h("span", { class: "kp-cost__dot" }), label),
      ratio != null ? h("span", { class: "kp-bar__track" }, h("span", { class: "kp-bar__fill", style: { width: `${Math.round(ratio * 100)}%` } })) : null,
      h("span", { class: "kp-bar__value" }, cap ? `${formatNumber(left)} / ${formatNumber(cap)}` : formatChakra(left))
    );
  }
  // Legend of the colour code used by the cost chip under every card that can be given
  var LEGEND = [
    [CostTone.NONE, "Sans coût", "Échange pas à ton avantage (ou écart trop petit) : aucune barre n’est entamée."],
    [CostTone.FREE, "Écart", "N’entame que la barre Écart, du montant indiqué."],
    [CostTone.GIFT, "Dons", "Entame la barre Dons (premier montant) et sa part d’écart (second montant)."],
    [CostTone.OVER, "Refusé", "Une des deux barres ne suffit plus, ou la limite avec ce joueur est dépassée : le site refusera l’échange ; le montant est ce qui manque."]
  ];
  var costLegend = () => h(
    "div",
    { class: "kp-legend", title: "Sous chaque carte que tu peux donner, une pastille de cette couleur indique quelle barre l’échange va entamer." },
    h("span", { class: "kp-legend__intro" }, "Pastilles"),
    LEGEND.map(([tone2, label, title]) => h("span", { class: `kp-legend__item kp-cost--${tone2}`, title }, h("span", { class: "kp-cost__dot" }), label))
  );
  var fairBars = (fair) => h(
    "div",
    { class: "kp-bars" },
    fairBar(CostTone.GIFT, BAR_LABELS.gift, fair.gifts, fair.maxMargin),
    fairBar(CostTone.FREE, BAR_LABELS.free, fair.freeGaps, fair.maxMargin)
  );
  // "Relevé" button: downloads the full fair-play survey (raw site data + the script's model) as a JSON file
  function surveyButton() {
    const button = h("button", { class: "kp-btn kp-btn--ghost kp-btn--sm kp-survey", type: "button", title: "Télécharge un fichier JSON : les échanges effectués sur ce compte (tableau, directs, ventes, achats) avec les jauges Dons / Écart relevées avant et après chacun." }, "Relevé");
    button.addEventListener("click", async () => {
      if (!fairSurvey || fairSurvey.isRunning()) return;
      button.disabled = true;
      const label = button.textContent;
      try {
        toast("Relevé en cours : quelques lectures, patiente un instant…", "info");
        const result = await fairSurvey.download((stepLabel) => {
          button.textContent = `Relevé… ${stepLabel}`;
        });
        toast(result, "success");
      } catch (error) {
        toast(`Relevé impossible : ${describeError(error)}`, "error");
      } finally {
        button.disabled = false;
        button.textContent = label;
      }
    });
    return button;
  }

  function dealAction(analysis, option, controller) {
    if (option.status === GiveStatus.PINNED) {
      return h(
        "button",
        { class: "kp-btn kp-btn--sm kp-btn--warn", type: "button", onClick: () => controller.unlock(option.card) },
        "Déverrouiller"
      );
    }
    return giveButton(option, () => controller.give(analysis, option), "kp-btn--sm");
  }
  function dealRow({ analysis, option }, busy, controller, fair) {
    const isBusy = busy.has(analysis.offer.id) || busy.has(pinBusyKey(option.card));
    return h(
      "div",
      { class: `kp-deal${isBusy ? " is-busy" : ""}${analysis.isNew ? " is-new" : ""}` },
      cardArt(analysis.received, "sm"),
      swapIcon(),
      cardArt(option.card, "sm", optionOverlays(option)),
      h(
        "div",
        { class: "kp-deal__info" },
        h(
          "strong",
          { class: "kp-name", title: analysis.received.name },
          analysis.isNew ? h("span", { class: "kp-new" }, "Nouveau") : null,
          analysis.received.name
        ),
        h("span", { class: "kp-note", title: option.card.name }, `contre ${option.card.name}`),
        costChip(optionCost(analysis, option, fair), fair, { compact: true }),
        h(
          "div",
          { class: "kp-deal__actions" },
          option.status === GiveStatus.PINNED ? gainBadge(option.gain) : null,
          dealAction(analysis, option, controller),
          hideButton(() => controller.hide(analysis.offer.id))
        )
      )
    );
  }
  // Profitable offers: one tile per option, the most profitable one is green, the counter cost is indicative
  var costNote = (cost, fair) => costChip(cost, fair);
  function profitAction(analysis, option, isRecommended, controller) {
    if (option.status === GiveStatus.PINNED) {
      return h("button", { class: "kp-btn kp-btn--warn", type: "button", onClick: () => controller.unlock(option.card) }, "Déverrouiller");
    }
    return giveButton(option, () => controller.give(analysis, option), isRecommended ? "kp-btn--best" : "");
  }
  function profitTile(analysis, option, recommended, busy, controller, fair, isBanger = false) {
    const isRecommended = option === recommended;
    const classes = ["kp-ptile", isRecommended && "is-best", busy.has(pinBusyKey(option.card)) && "is-busy"];
    const qty = option.entry?.qty ?? 0;
    const badges = [
      countBadge(qty),
      option.status === GiveStatus.PINNED ? h("span", { class: "kp-badge kp-badge--lock", title: "Carte verrouillée" }, icon("lock")) : null
    ];
    return h(
      "div",
      { class: classes.filter(Boolean).join(" ") },
      cardArt(option.card, "md", badges),
      h("strong", { class: "kp-name", title: option.card.name }, option.card.name),
      isBanger ? h("span", { class: "kp-banger", title: "Banger : une Mythique ou Légendaire contre une carte de rareté inférieure" }, "banger") : null,
      option.status === GiveStatus.PINNED ? gainBadge(option.gain) : null,
      costNote(optionCost(analysis, option, fair), fair),
      profitAction(analysis, option, isRecommended, controller)
    );
  }
  var sellerNote = (offer) => h("span", { class: "kp-note" }, `${offer.user?.pseudo ?? "?"} · ${formatRemaining(offer.expiresAt)}`);
  // Same reading direction as the board: the card received on the left, the cards to give on its right
  function profitRow({ analysis, options, recommended, bangers }, busy, controller, fair) {
    const { offer, received } = analysis;
    return h(
      "article",
      { class: `kp-profit${busy.has(offer.id) ? " is-busy" : ""}${analysis.isNew ? " is-new" : ""}` },
      h(
        "div",
        { class: "kp-profit__get" },
        h("span", { class: "kp-label" }, "Tu reçois"),
        cardArt(received, "md", [countBadge(analysis.owned)]),
        h("strong", { class: "kp-name", title: received.name }, received.name),
        analysis.isNew ? h("span", { class: "kp-new" }, "Nouveau") : null,
        analysis.wished ? h("span", { class: "kp-note kp-note--wish" }, "Wishlist") : null
      ),
      swapIcon(),
      h("div", { class: "kp-profit__options" }, options.map((option) => profitTile(analysis, option, recommended, busy, controller, fair, bangers?.has(option.card.id)))),
      hideButton(() => controller.hide(offer.id))
    );
  }

  function createSidePanel(controller) {
    let minGain = readSetting("minGain", config_default.side.defaultMinGain);
    let lastState = null;
    const gainList = h("div", { class: "kp-deals" });
    const autoPanel = createAutoPanel(controller);
    const onInput = (event) => {
      const digits = event.target.value.replace(/\D/g, "");
      event.target.value = digits;
      minGain = Number(digits) || 0;
      writeSetting("minGain", minGain);
      if (lastState) render(lastState);
    };
    let tab = readSetting("sideTab", Tab.OFFERS);
    const tabButtons = TABS2.map(([key, label]) => {
      const button = h("button", { class: "kp-chip", type: "button", role: "tab" }, label);
      button.addEventListener("click", () => {
        tab = key;
        writeSetting("sideTab", key);
        if (lastState) render(lastState);
      });
      return [key, button];
    });
    const fairBox = h("div", { class: "kp-fair" });
    // The minimum gain sits on the tab row (shown with the Offres tab); the list titles carry their explanation as a tooltip.
    const gainField = h(
      "label",
      { class: "kp-field kp-side__gain", title: "Les offres rentables ne gardent que les cartes à donner dont le gain (prix moyen reçu moins prix moyen donné) atteint ce montant." },
      h("span", { class: "kp-label" }, "Gain min."),
      h("input", { class: "kp-input kp-input--short", type: "text", inputmode: "numeric", value: String(minGain), onInput }),
      h("span", { class: "kp-muted" }, "chakra")
    );
    // Size of the offers list: a slider on the tab row, 60 % to 140 %, remembered
    let sideScale = readSetting("sideScale", 100);
    const scaleValue = h("span", { class: "kp-muted kp-side__scale-value" }, `${sideScale} %`);
    const scaleInput = h("input", {
      class: "kp-side__scale-input",
      type: "range",
      min: "60",
      max: "140",
      step: "5",
      value: String(sideScale),
      "aria-label": "Taille des offres",
      onInput: (event) => {
        sideScale = Number(event.target.value) || 100;
        writeSetting("sideScale", sideScale);
        applyScale();
      }
    });
    const scaleField = h("label", { class: "kp-field kp-side__scale", title: "Glisse pour agrandir ou réduire les offres de ce panneau." }, h("span", { class: "kp-label" }, "Taille"), scaleInput, scaleValue);
    const gainTitle = h("h3", { class: "kp-title kp-title--sm", title: "Pour chaque offre, les cartes que tu peux donner en gagnant au moins le gain minimum, de la moins à la plus rentable (en vert), plus les bangers : une Mythique ou Légendaire contre une rareté inférieure, sauf à perte. Les nouvelles arrivent en haut." }, "Offres rentables");
    const offersView = h(
      "div",
      { class: "kp-side__view", role: "tabpanel" },
      fairBox,
      h(
        "div",
        { class: "kp-side__block" },
        gainTitle
      ),
      gainList
    );
    const autoView = h("div", { class: "kp-side__view", role: "tabpanel" }, autoPanel.root);
    const root = h(
      "section",
      { class: "kp-side", "aria-label": "Offres intéressantes" },
      h(
        "div",
        { class: "kp-side__controls kp-side__tabs", role: "tablist" },
        tabButtons.map(([, button]) => button),
        scaleField,
        gainField
      ),
      offersView,
      autoView
    );
    function applyScale() {
      gainList.style.setProperty("--kp-side-scale", String(sideScale / 100));
      scaleValue.textContent = `${sideScale} %`;
    }
    applyScale();
    function renderTabs(state) {
      for (const [key, button] of tabButtons) button.setAttribute("aria-pressed", String(key === tab));
      tabButtons.find(([key]) => key === Tab.AUTO)[1].classList.toggle("is-live", state.auto.enabled);
      offersView.hidden = tab !== Tab.OFFERS;
      gainField.hidden = tab !== Tab.OFFERS;
      scaleField.hidden = tab !== Tab.OFFERS;
      autoView.hidden = tab !== Tab.AUTO;
    }
    const dealKey = (deal) => [analysisKey(deal.analysis), (deal.options ?? [deal.option]).map(optionKey), deal.recommended?.card.id ?? null];
    function fill2(list, deals, emptyText, state, buildRow) {
      const shown = deals.slice(0, config_default.side.listLimit);
      const key = JSON.stringify([state.phase, [...state.busy], state.fair, minGain, minuteKey(), shown.map(dealKey)]);
      if (list.dataset.key === key) return;
      list.dataset.key = key;
      if (state.phase !== Phase2.READY && deals.length === 0) {
        list.replaceChildren(h("p", { class: "kp-muted" }, "Chargement…"));
        return;
      }
      const rows = shown.map((deal) => buildRow(deal, state.busy, controller));
      list.replaceChildren(...rows.length ? rows : [h("p", { class: "kp-muted" }, emptyText)]);
    }
    function render(state) {
      lastState = state;
      renderTabs(state);
      renderFairPlay(fairBox, state.fair);
      autoPanel.render(state);
      const deals = profitDeals(state.analyses, minGain, state.fair);
      gainTitle.textContent = deals.length ? `Offres rentables · ${deals.length}` : "Offres rentables";
      fill2(gainList, deals, "Aucune offre rentable ni banger pour le moment.", state, (deal, busy, panelController) => profitRow(deal, busy, panelController, state.fair));
    }
    const gaugeTimer = setInterval(() => lastState && renderFairPlay(fairBox, lastState.fair), 3e4);
    return { root, render, dispose: () => clearInterval(gaugeTimer) };
  }

  // src/features/market-offers/index.js
  var NATIVE_BOARD = "main section.board";
  var NATIVE_PROPOSE = `${NATIVE_BOARD} .bh button.btn-acc`;
  var SIDE_COLUMN = "main aside.chat-side";
  // Redraws are grouped: one per animation frame, and at most one every renderThrottleMs while the offers are being scanned.
  // The state itself is always current (auto-accept reads the store, not the screen).
  function createRenderScheduler(render) {
    let pending = null;
    let frame = 0;
    let timer = 0;
    let lastAt = -Infinity;
    const flush = () => {
      frame = 0;
      lastAt = Date.now();
      const state = pending;
      pending = null;
      if (state) render(state);
    };
    const requestFrame = () => {
      if (!frame) frame = requestAnimationFrame(flush);
    };
    return {
      schedule(state) {
        pending = state;
        if (frame) return;
        const wait = state.phase === Phase2.LOADING ? lastAt + config_default.offers.renderThrottleMs - Date.now() : 0;
        if (wait <= 0) {
          clearTimeout(timer);
          timer = 0;
          requestFrame();
        } else if (!timer) {
          timer = setTimeout(() => {
            timer = 0;
            requestFrame();
          }, wait);
        }
      },
      cancel() {
        cancelAnimationFrame(frame);
        clearTimeout(timer);
        frame = 0;
        timer = 0;
        pending = null;
      }
    };
  }
  var market_offers_default = {
    id: "market-offers",
    matches: (url) => url.pathname === "/marche" && url.searchParams.get("onglet") === "offres",
    mount() {
      const store = createStore(initialState3());
      const controller = createOffersController(store);
      const board = createBoard(controller, { onPropose: () => document.querySelector(NATIVE_PROPOSE)?.click() });
      const side = createSidePanel(controller);
      document.body.classList.add("kp-offers");
      const scheduler = createRenderScheduler((state) => {
        board.render(state);
        side.render(state);
      });
      const unsubscribe = store.subscribe((state) => scheduler.schedule(state));
      const detachers = [
        keepAttached(board.root, NATIVE_BOARD, (anchor, node) => anchor.after(node)),
        keepAttached(side.root, SIDE_COLUMN, (column, node) => column.append(node))
      ];
      controller.load(board.filters());
      return () => {
        controller.dispose();
        unsubscribe();
        scheduler.cancel();
        detachers.forEach((detach) => detach());
        board.root.remove();
        side.dispose();
        side.root.remove();
        document.body.classList.remove("kp-offers");
      };
    }
  };

  // src/features/offer-dialog.js
  var OFFER_TILES = '[role="dialog"] .od .shelf ul.grid button.tile';
  var offer_dialog_default = {
    id: "offer-dialog",
    matches: (url) => url.pathname === "/marche" && url.searchParams.get("onglet") === "offres",
    mount() {
      let collection = null;
      let frame = 0;
      function decorate2() {
        for (const tile2 of document.querySelectorAll(OFFER_TILES)) {
          renderCount(tile2, collection.get(tileCardId(tile2))?.qty ?? 0);
        }
      }
      const schedule = () => {
        if (!collection || frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          decorate2();
        });
      };
      const observer = new MutationObserver(schedule);
      observer.observe(document.body, { childList: true, subtree: true });
      loadCollection().then((loaded) => {
        collection = loaded;
        schedule();
      }).catch((error) => toast(describeError(error), "error"));
      return () => {
        observer.disconnect();
        cancelAnimationFrame(frame);
        clearCounts();
      };
    }
  };

  // src/features/missions-series.js
  var SERIES_SECTION = 'main section[aria-labelledby="albums-t"]';
  var SERIES_ITEM = "ul.quests > li.q";
  var CLAIM_BUTTON = "button.claim";
  var finishedLabel = (count) => `${formatNumber(count)} ${count > 1 ? "séries finies" : "série finie"}`;
  var missions_series_default = {
    id: "missions-series",
    matches: (url) => url.pathname === "/missions",
    mount() {
      let expanded = false;
      let frame = 0;
      const summary = h("span", { class: "kp-series-summary" });
      const chevron = h("span", { class: "kp-series-chevron" }, icon("chevron-down"));
      const toggle = h("button", { class: "kp-series-toggle", type: "button" }, summary, chevron);
      toggle.addEventListener("click", () => {
        expanded = !expanded;
        schedule();
      });
      function render(section) {
        const items = section.querySelectorAll(SERIES_ITEM);
        const claimable = section.querySelectorAll(`${SERIES_ITEM} ${CLAIM_BUTTON}`).length;
        const text = `${finishedLabel(items.length)}${claimable ? ` · ${claimable} à réclamer` : ""}`;
        if (summary.textContent !== text) summary.textContent = text;
        summary.classList.toggle("has-claim", claimable > 0);
        toggle.setAttribute("aria-expanded", String(expanded));
        section.classList.toggle("kp-series-collapsed", !expanded);
      }
      function decorate2() {
        const section = document.querySelector(SERIES_SECTION);
        if (!section) return;
        const header2 = section.querySelector(":scope > header");
        if (header2 && toggle.parentElement !== header2) header2.append(toggle);
        render(section);
      }
      function schedule() {
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          decorate2();
        });
      }
      const observer = new MutationObserver(schedule);
      observer.observe(document.body, { childList: true, subtree: true });
      schedule();
      return () => {
        observer.disconnect();
        cancelAnimationFrame(frame);
        toggle.remove();
        document.querySelectorAll(".kp-series-collapsed").forEach((section) => section.classList.remove("kp-series-collapsed"));
      };
    }
  };

  // src/features/series-survey.js
  // Relevé « séries » : capture, sur les pages Missions et Collection, ce que le site renvoie (réponses /api) et affiche
  // (section des séries finies, liste des albums), pour construire ensuite une mémoire des récompenses déjà réclamées.
  // Console : kyaraPlusSeries.download()
  var SERIES_SURVEY_PAGES = /* @__PURE__ */ new Set(["/missions", "/collection"]);
  var SERIES_SURVEY_MAX_ENTRIES = 60;
  var SERIES_SURVEY_MAX_BODY = 6e4;
  var SERIES_SURVEY_MAX_HTML = 12e4;
  var seriesSurveyLog = [];
  var seriesSurveyWatching = () => SERIES_SURVEY_PAGES.has(location.pathname);
  // e-mails, jetons et mots de passe n'ont rien à faire dans un relevé : masqués, clé par clé et dans les textes
  var SERIES_SURVEY_SECRET_KEY = /e-?mail|token|password|secret|session/i;
  var SERIES_SURVEY_EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
  function seriesSurveyMask(value) {
    if (typeof value === "string") return value.replace(SERIES_SURVEY_EMAIL, "[e-mail masqué]");
    if (Array.isArray(value)) return value.map(seriesSurveyMask);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, SERIES_SURVEY_SECRET_KEY.test(key) ? "[masqué]" : seriesSurveyMask(inner)]));
    return value;
  }
  function seriesSurveyRecord(kind, url, status, text) {
    if (!seriesSurveyWatching()) return;
    let path;
    try {
      const parsed = new URL(url, location.origin);
      if (parsed.origin !== location.origin || !parsed.pathname.startsWith("/api/")) return;
      path = parsed.pathname + parsed.search;
    } catch {
      return;
    }
    let body = text ?? "";
    try {
      body = seriesSurveyMask(JSON.parse(body));
    } catch {
      body = seriesSurveyMask(body);
    }
    const json = JSON.stringify(body);
    seriesSurveyLog.push({ at: Date.now(), page: location.pathname + location.search, kind, path, status, truncated: json.length > SERIES_SURVEY_MAX_BODY, body: json.length > SERIES_SURVEY_MAX_BODY ? json.slice(0, SERIES_SURVEY_MAX_BODY) : body });
    if (seriesSurveyLog.length > SERIES_SURVEY_MAX_ENTRIES) seriesSurveyLog.splice(0, seriesSurveyLog.length - SERIES_SURVEY_MAX_ENTRIES);
  }
  var isBootstrapUrl = (url) => {
    try {
      return new URL(url, location.origin).pathname === "/api/me/bootstrap";
    } catch {
      return false;
    }
  };
  function tapResponse(kind, url, status, text) {
    if (seriesSurveyWatching()) seriesSurveyRecord(kind, url, status, text);
    if (status === 200 && isBootstrapUrl(url)) {
      try {
        notifyBootstrap(JSON.parse(text));
      } catch {
      }
    }
  }
  function installSeriesSurveyTaps() {
    const originalFetch = window.fetch;
    window.fetch = function(input, init) {
      const result = originalFetch.apply(this, arguments);
      result.then((response) => {
        try {
          const url = typeof input === "string" ? input : input?.url ?? String(input);
          if (!seriesSurveyWatching() && !isBootstrapUrl(url)) return;
          response.clone().text().then((text) => tapResponse("fetch", url, response.status, text)).catch(() => {
          });
        } catch {
        }
      }).catch(() => {
      });
      return result;
    };
    const { open, send } = XMLHttpRequest.prototype;
    XMLHttpRequest.prototype.open = function(method, url) {
      this.__kpUrl = url;
      return open.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function() {
      this.addEventListener("load", () => {
        try {
          tapResponse("xhr", this.__kpUrl, this.status, this.responseText);
        } catch {
        }
      });
      return send.apply(this, arguments);
    };
  }
  var seriesSurveyHtml = (element) => {
    if (!element) return null;
    const copy = element.cloneNode(true);
    copy.querySelectorAll("img").forEach((img) => img.removeAttribute("src"));
    copy.querySelectorAll("[data-kyara-plus], .kp-series-toggle").forEach((node) => node.remove());
    const html = copy.outerHTML;
    return html.length > SERIES_SURVEY_MAX_HTML ? `${html.slice(0, SERIES_SURVEY_MAX_HTML)}\u2026 [tronqué]` : html;
  };
  async function buildSeriesSurvey() {
    const page = location.pathname;
    const section = document.querySelector(SERIES_SECTION);
    const items = section ? [...section.querySelectorAll(SERIES_ITEM)] : [];
    const albums = [...document.querySelectorAll(ALBUM_ITEM)];
    let catalogSummary = null;
    let completion2 = null;
    try {
      const [catalog, collection] = await Promise.all([loadCatalog(), loadCollection()]);
      const stats = buildAlbumStats(catalog, collection);
      const sample = catalog.values().next().value;
      catalogSummary = { cards: catalog.size, cardFields: sample ? Object.keys(sample) : [], sample: sample ?? null, series: stats.size };
      completion2 = [...stats].map(([series, album]) => ({ serie: series, cartes: album.total, manquantes: album.missingRarities.size ? "oui" : "non", complete: album.missingRarities.size === 0 })).sort((a, b) => a.serie.localeCompare(b.serie, "fr"));
    } catch (error) {
      catalogSummary = { erreur: describeError(error) };
    }
    let bootstrapShape = null;
    try {
      const bootstrap = await meApi.bootstrap();
      bootstrapShape = { champs: Object.keys(bootstrap), me: Object.keys(bootstrap.me ?? {}), autres: Object.fromEntries(Object.entries(bootstrap).filter(([key]) => key !== "me").map(([key, value]) => [key, Array.isArray(value) ? `tableau de ${value.length}` : typeof value === "object" && value ? `objet (${Object.keys(value).join(", ")})` : value])) };
    } catch (error) {
      bootstrapShape = { erreur: describeError(error) };
    }
    return {
      versionReleve: "series-1",
      genereLe: new Date().toLocaleString("fr-FR"),
      page: page + location.search,
      notes: [
        "requetes : réponses de l'API du site vues sur les pages Missions et Collection depuis le chargement du script (corps JSON, tronqué au-delà de 60 ko).",
        "missions : la section des séries finies telle que le site l'affiche (HTML sans images), le nombre d'items et de boutons « réclamer ».",
        "collection : les premiers albums de la liste (HTML sans images).",
        "catalogue / completude : ce que le script calcule lui-même à partir des cartes (séries complètes ou non en ce moment).",
        "bootstrap : les noms des champs de /me/bootstrap, sans leurs valeurs (sauf tailles)."
      ],
      requetes: seriesSurveyLog,
      missions: section ? { items: items.length, boutonsReclamer: section.querySelectorAll(`${SERIES_ITEM} ${CLAIM_BUTTON}`).length, html: seriesSurveyHtml(section), premiersItems: items.slice(0, 4).map(seriesSurveyHtml) } : null,
      collection: albums.length ? { albums: albums.length, outils: seriesSurveyHtml(document.querySelector(ALBUM_TOOLS)), premiersAlbums: albums.slice(0, 5).map(seriesSurveyHtml), bloc: seriesSurveyHtml(document.querySelector("main .albums-h, main section:has(> ul.albums) > header")) } : null,
      catalogue: catalogSummary,
      completude: completion2,
      bootstrap: bootstrapShape
    };
  }
  function installSeriesSurveyConsole() {
    installSeriesSurveyTaps();
    const download = async () => {
      const survey = await buildSeriesSurvey();
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      const link = h("a", { href: URL.createObjectURL(new Blob([JSON.stringify(survey, null, 1)], { type: "application/json" })), download: `kyara-releve-series-${stamp}.json` });
      document.body.append(link);
      link.click();
      link.remove();
      return `fichier kyara-releve-series-${stamp}.json téléchargé (${survey.requetes.length} réponses API capturées sur cette page)`;
    };
    window.kyaraPlusSeries = {
      build: buildSeriesSurvey,
      download,
      requests: () => seriesSurveyLog.map((entry) => `${entry.kind} ${entry.status} ${entry.path}`)
    };
  }

  // src/features/header-chakra.js
  // Next to the chakra balance of the site's header: "+N" = chakra held in my open buy orders, leading bids and pending
  // trades (me.chakraHeld from /me/bootstrap), with the total in the tooltip. Replaces the "Chakra engagé" pill of Mon activité.
  var HEADER = "header.hdr";
  var digitsOf = (text) => text.replace(/\D/g, "");
  // the element of the header that shows exactly the balance (the deepest one), found by its digits
  function findBalanceElement(chakra) {
    const header2 = document.querySelector(HEADER);
    if (!header2 || chakra == null) return null;
    const wanted = String(chakra);
    let best = null;
    for (const element of header2.querySelectorAll("*")) {
      if (element.closest(".kp-held") || element.children.length > 3) continue;
      const text = element.textContent.trim();
      if (text.length > 16 || digitsOf(text) !== wanted) continue;
      if (!best || best.contains(element)) best = element;
    }
    return best;
  }
  var header_chakra_default = {
    id: "header-chakra",
    matches: () => true,
    mount() {
      const badge = h("span", { class: "kp-held" });
      let me = null;
      let anchor = null;
      let frame = 0;
      function place() {
        frame = 0;
        if (!me) return;
        const held = me.chakraHeld ?? 0;
        if (!anchor?.isConnected) anchor = findBalanceElement(me.chakra);
        if (!anchor) return;
        badge.hidden = !(held > 0);
        badge.textContent = `+${formatNumber(held)}`;
        badge.title = `${formatChakra(held)} bloqués dans tes ordres d’achat, enchères en tête et échanges en cours.\nTotal si tout revient : ${formatChakra((me.chakra ?? 0) + held)}.`;
        if (badge.previousElementSibling !== anchor || badge.parentElement !== anchor.parentElement) anchor.after(badge);
      }
      const schedule = () => {
        if (!frame) frame = requestAnimationFrame(place);
      };
      const stopBootstrap = onBootstrap((data) => {
        me = data.me;
        anchor = null;
        schedule();
      });
      const observer = new MutationObserver((records) => {
        if (records.every((record) => badge.contains(record.target))) return;
        schedule();
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      schedule();
      return () => {
        stopBootstrap();
        observer.disconnect();
        cancelAnimationFrame(frame);
        badge.remove();
      };
    }
  };

  // src/features/profile-background.js
  var { userId, video: videoSrc, volume } = config_default.profileBackground;
  var UNMUTE_EVENTS = ["pointerdown", "keydown"];
  var profile_background_default = {
    id: "profile-background",
    matches: (url) => url.pathname === `/profil/${userId}`,
    mount() {
      const video = h("video", { class: "kp-bg-video", src: videoSrc, autoplay: true, loop: true, muted: true, playsinline: true });
      video.muted = true;
      video.volume = volume;
      const unmute = () => {
        UNMUTE_EVENTS.forEach((type) => removeEventListener(type, unmute, true));
        video.muted = false;
        video.play().catch(() => {
        });
      };
      UNMUTE_EVENTS.forEach((type) => addEventListener(type, unmute, true));
      document.body.classList.add("kp-video-bg");
      document.body.prepend(video);
      video.play().catch(() => {
      });
      return () => {
        UNMUTE_EVENTS.forEach((type) => removeEventListener(type, unmute, true));
        video.pause();
        video.remove();
        document.body.classList.remove("kp-video-bg");
      };
    }
  };

  // src/features/profile-collection/filters.js
  var sortEntries = (entries) => entries.sort(compareCards);
  function buildEntries({ catalog, ownedIds, tradeable, myCollection }) {
    return ownedIds.map((id) => catalog.get(id)).filter(Boolean).map((card) => ({
      card,
      tradeable: tradeable.get(card.id) ?? 0,
      mine: myCollection.get(card.id)?.qty ?? 0,
      nameKey: searchKey(card.name),
      seriesKey: searchKey(card.series ?? "")
    })).sort(compareCards);
  }
  var indexCatalog = (catalog) => [...catalog.values()].map((card) => ({ id: card.id, rarity: card.rarity, seriesKey: searchKey(card.series ?? "") }));
  function completion(catalogIndex, ownedIds, { series, rarities }) {
    const seriesKey = searchKey(series.trim());
    let owned = 0;
    let total = 0;
    for (const card of catalogIndex) {
      if (rarities.size > 0 && !rarities.has(card.rarity)) continue;
      if (seriesKey && !card.seriesKey.includes(seriesKey)) continue;
      total++;
      if (ownedIds.has(card.id)) owned++;
    }
    return { owned, total };
  }
  var seriesOf = (entries) => [...new Set(entries.map((entry) => entry.card.series).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
  var totalPrice = (entries) => entries.reduce((sum, entry) => sum + (entry.price ?? 0), 0);
  var isDuplicate = (entry) => entry.tradeable >= config_default.profile.duplicateMin;
  function filterEntries(entries, { name, series, rarities, duplicates, iLack }) {
    const nameKey = searchKey(name.trim());
    const seriesKey = searchKey(series.trim());
    return entries.filter(
      (entry) => (!nameKey || entry.nameKey.includes(nameKey)) && (!seriesKey || entry.seriesKey.includes(seriesKey)) && (rarities.size === 0 || rarities.has(entry.card.rarity)) && (!duplicates || isDuplicate(entry)) && (!iLack || entry.mine === 0)
    );
  }

  // src/features/profile-collection/view.js
  var SERIES_LIST_ID = "kp-pc-series";
  function cardBadges(entry) {
    const count = entry.tradeable > 0 ? h(
      "span",
      { class: `kp-badge${isDuplicate(entry) ? " kp-badge--dupe" : ""}`, title: "Exemplaires échangeables" },
      `×${entry.tradeable}`
    ) : h("span", { class: "kp-badge kp-badge--lock", title: "Aucun exemplaire échangeable" }, icon("lock"));
    const fresh = entry.mine === 0 ? h("span", { class: "kp-badge kp-badge--new kp-badge--corner" }, "Nouveau") : null;
    return [count, fresh];
  }
  function cardTile(entry, pricesReady) {
    return h(
      "div",
      { class: "kp-pcard", "data-card-id": String(entry.card.id) },
      cardArt(entry.card, "md", cardBadges(entry)),
      h("strong", { class: "kp-name", title: entry.card.name }, entry.card.name),
      h("span", { class: "kp-note", title: entry.card.series ?? "" }, entry.card.series ?? ""),
      h("span", { class: "kp-price" }, pricesReady ? formatPrice(entry.price) : "…")
    );
  }
  function toggleChip(label, pressed, onToggle, extra = {}) {
    const chip = h("button", { type: "button", "aria-pressed": String(pressed), ...extra }, label);
    chip.addEventListener("click", () => {
      const next = chip.getAttribute("aria-pressed") !== "true";
      chip.setAttribute("aria-pressed", String(next));
      onToggle(next);
    });
    return chip;
  }
  function createCollectionModal({ title, onClose }) {
    const filters = { name: "", series: "", rarities: /* @__PURE__ */ new Set(), duplicates: false, iLack: false };
    let entries = null;
    let shown = [];
    let rendered = 0;
    let pricesReady = false;
    let ownership = null;
    const status = h("span", { class: "kp-muted" }, "Chargement…");
    const completionPill = h("span", { class: "kp-pc__total kp-pc__completion" });
    const total = h("span", { class: "kp-pc__total" });
    const grid = h("div", { class: "kp-pc__grid" });
    const sentinel = h("div", { class: "kp-pc__sentinel" });
    const seriesList = h("datalist", { id: SERIES_LIST_ID });
    const body = h("div", { class: "kp-pc__body" }, grid, sentinel);
    function appendNextStep() {
      const next = shown.slice(rendered, rendered + config_default.profile.renderStep);
      rendered += next.length;
      grid.append(...next.map((entry) => cardTile(entry, pricesReady)));
    }
    function renderTotal() {
      if (!pricesReady) {
        total.textContent = "Valeur : calcul…";
        return;
      }
      const selection = shown.length === entries.length ? "" : ` · sélection ${formatChakra(totalPrice(shown))}`;
      total.textContent = `Valeur ${formatChakra(totalPrice(entries))}${selection}`;
    }
    function renderCompletion() {
      const { owned, total: inGame } = completion(ownership.catalogIndex, ownership.ownedIds, filters);
      const scope = [...filters.rarities].map((rarity) => RARITY_LABELS[rarity]).join(" + ") || "Toutes raretés";
      const percent = inGame ? Math.floor(owned / inGame * 100) : 0;
      completionPill.textContent = `${scope} : ${formatNumber(owned)} / ${formatNumber(inGame)} (${percent} %)`;
      completionPill.title = "Cartes différentes possédées sur le nombre de cartes du jeu (filtres rareté et série)";
    }
    function render() {
      if (!entries) return;
      shown = filterEntries(entries, filters);
      renderTotal();
      rendered = 0;
      grid.replaceChildren();
      body.scrollTop = 0;
      status.textContent = `${formatNumber(shown.length)} / ${plural(entries.length, "carte")}`;
      renderCompletion();
      if (shown.length === 0) grid.append(h("p", { class: "kp-empty" }, "Aucune carte avec ces filtres."));
      else appendNextStep();
    }
    const loadMore = new IntersectionObserver(
      ([sentinelEntry]) => {
        if (sentinelEntry.isIntersecting && rendered < shown.length) appendNextStep();
      },
      { root: body, rootMargin: "400px" }
    );
    loadMore.observe(sentinel);
    const textInput = (key, placeholder, extra = {}) => h("input", {
      class: "kp-input",
      type: "search",
      placeholder,
      ...extra,
      onInput: (event) => {
        filters[key] = event.target.value;
        render();
      }
    });
    const rarityChips = [...RARITIES].reverse().map(
      (rarity) => toggleChip(
        rarity,
        false,
        (pressed) => {
          if (pressed) filters.rarities.add(rarity);
          else filters.rarities.delete(rarity);
          render();
        },
        { class: "kp-gem-chip", title: RARITY_LABELS[rarity], style: { "--kp-rarity": rarityColor(rarity) } }
      )
    );
    const flagChip = (key, label) => toggleChip(
      label,
      false,
      (pressed) => {
        filters[key] = pressed;
        render();
      },
      { class: "kp-chip" }
    );
    const root = h(
      "div",
      {
        class: "kp-modal",
        onClick: (event) => event.target === event.currentTarget && onClose()
      },
      h(
        "section",
        { class: "kp-pc", role: "dialog", "aria-modal": "true", "aria-label": title },
        h(
          "header",
          { class: "kp-pc__head" },
          h("h2", { class: "kp-title" }, title),
          status,
          completionPill,
          total,
          h("button", { class: "kp-hide kp-pc__close", type: "button", title: "Fermer", onClick: onClose }, icon("xmark"))
        ),
        h(
          "div",
          { class: "kp-pc__filters" },
          textInput("name", "Nom du perso"),
          textInput("series", "Série", { list: SERIES_LIST_ID }),
          seriesList,
          h("div", { class: "kp-field" }, rarityChips),
          flagChip("duplicates", "Ses doubles"),
          flagChip("iLack", "Il me manque")
        ),
        body
      )
    );
    return {
      root,
      setEntries(loaded, game) {
        entries = loaded;
        ownership = game;
        seriesList.replaceChildren(...seriesOf(entries).map((series) => h("option", { value: series })));
        render();
      },
      // Prices change the order inside each rarity, so the grid is rebuilt rather than patched.
      showPrices() {
        pricesReady = true;
        sortEntries(entries);
        render();
      },
      setError(message) {
        status.textContent = message;
      },
      destroy() {
        loadMore.disconnect();
        root.remove();
      }
    };
  }

  // src/features/profile-collection/index.js
  var PROFILE_ACTIONS = "main .acts";
  var PLAYER_NAME = "main h1";
  var COPY_LINK_LABEL = "Copier le lien";
  function placeButton(actions2, button) {
    const copyLink = [...actions2.querySelectorAll("button")].find((node) => node.textContent.trim() === COPY_LINK_LABEL);
    if (!copyLink) return actions2.append(button);
    copyLink.classList.add("kp-native-hidden");
    button.className = copyLink.className.replace(/\bkp-native-hidden\b/, "").trim();
    copyLink.before(button);
  }
  async function loadEntries(userId2) {
    const [catalog, myCollection, ownedIds, available] = await Promise.all([
      loadCatalog(),
      loadCollection(),
      tradesApi.ownedBy(userId2),
      tradesApi.availableFrom(userId2)
    ]);
    const tradeable = new Map(available.map((row) => [row.characterId, row.n]));
    return {
      entries: buildEntries({ catalog, ownedIds, tradeable, myCollection }),
      catalogIndex: indexCatalog(catalog),
      ownedIds: new Set(ownedIds)
    };
  }
  async function attachPrices(entries) {
    await loadPrices(entries.map((entry) => entry.card.id));
    for (const entry of entries) entry.price = priceOf(entry.card.id);
  }
  var profile_collection_default = {
    id: "profile-collection",
    matches: (url) => url.pathname.startsWith("/profil/"),
    mount() {
      const cache2 = /* @__PURE__ */ new Map();
      let modal = null;
      const close = () => {
        modal?.destroy();
        modal = null;
        document.body.classList.remove("kp-modal-open");
      };
      const onKeydown = (event) => event.key === "Escape" && modal && close();
      function open() {
        const userId2 = profileIdFromPath();
        if (!userId2 || modal) return;
        const name = document.querySelector(PLAYER_NAME)?.textContent.trim();
        const current = createCollectionModal({ title: name ? `Collection de ${name}` : "Collection", onClose: close });
        modal = current;
        document.body.classList.add("kp-modal-open");
        document.body.append(current.root);
        if (!cache2.has(userId2)) cache2.set(userId2, loadEntries(userId2));
        cache2.get(userId2).then(async ({ entries, catalogIndex, ownedIds }) => {
          current.setEntries(entries, { catalogIndex, ownedIds });
          try {
            await attachPrices(entries);
            current.showPrices();
          } catch (error) {
            toast(describeError(error), "error");
          }
        }).catch((error) => {
          cache2.delete(userId2);
          current.setError(describeError(error));
        });
      }
      const button = h("button", { type: "button", onClick: open }, icon("layer-group"), " Voir sa collection");
      const detach = keepAttached(button, PROFILE_ACTIONS, placeButton);
      document.addEventListener("keydown", onKeydown);
      return () => {
        detach();
        close();
        button.remove();
        document.removeEventListener("keydown", onKeydown);
        document.querySelectorAll(".kp-native-hidden").forEach((node) => node.classList.remove("kp-native-hidden"));
      };
    }
  };

  // src/lib/router.js
  // The site's router may hold its own reference to the native pushState (taken before this script ran), in which case
  // the patched methods below never see its navigations. The URL is therefore also compared on every DOM change and on
  // the Navigation API, so a page reached through the site's own links mounts its features like a page loaded directly.
  function onNavigate(callback) {
    let seen = location.href;
    const run = () => {
      seen = location.href;
      callback();
    };
    const checkUrl = () => {
      if (location.href !== seen) run();
    };
    for (const method of ["pushState", "replaceState"]) {
      const original = history[method];
      history[method] = function(...args) {
        const result = original.apply(this, args);
        queueMicrotask(run);
        return result;
      };
    }
    addEventListener("popstate", run);
    addEventListener("hashchange", checkUrl);
    window.navigation?.addEventListener?.("currententrychange", () => queueMicrotask(checkUrl));
    new MutationObserver(checkUrl).observe(document.documentElement, { childList: true, subtree: true });
    setInterval(checkUrl, 1e3);
    run();
  }

  // src/styles.css
  var styles_default = `body.kp-market main aside.chat-side > :not(.kp-side) {\r
  display: none !important;\r
}\r
\r
body.kp-market:not(.kp-offers) main aside.chat-side {\r
  display: none !important;\r
}\r
\r
body.kp-market:not(.kp-offers) main .layout {\r
  grid-template-columns: minmax(0, 1fr) !important;\r
}\r
\r
body.kp-offers main .wrap {\r
  --wrap: 1720px;\r
}\r
\r
body.kp-offers main .layout {\r
  grid-template-columns: minmax(0, 1fr) 700px !important;\r
}\r
\r
/* The site may render its offer dialogs inside the board, so only the board's own content is hidden. */\r
body.kp-offers main section.board {\r
  display: contents !important;\r
}\r
\r
body.kp-offers main section.board > :not([role='dialog']):not(:has([role='dialog'])) {\r
  display: none !important;\r
}\r
\r
.kp-tab-link {\r
  display: inline-flex;\r
  align-items: center;\r
  color: inherit;\r
  text-decoration: none;\r
}\r
\r
.kp-filters {\r
  display: flex;\r
  flex-wrap: wrap;\r
  gap: var(--s-2);\r
}\r
\r
.kp-chip {\r
  padding: 5px 12px;\r
  border: 1px solid var(--line2);\r
  border-radius: var(--r-pill);\r
  background: transparent;\r
  color: var(--fg2);\r
  font: 500 var(--t-sm) var(--body);\r
  cursor: pointer;\r
}\r
\r
.kp-chip:hover {\r
  background: var(--raise);\r
}\r
\r
.kp-chip[aria-pressed='true'] {\r
  border-color: var(--acc);\r
  background: var(--acc-soft);\r
  color: var(--fg);\r
}\r
\r
/* Two filters in one pill: each side keeps its own border and rounds only its outer end, so the\r
   pressed side's accent outline follows the pill shape; it is raised above its neighbour's border. */\r
.kp-chip-pair {\r
  display: inline-flex;\r
}\r
\r
.kp-chip-pair .kp-chip--side {\r
  border-radius: 0;\r
}\r
\r
.kp-chip-pair .kp-chip--side:first-child {\r
  border-radius: var(--r-pill) 0 0 var(--r-pill);\r
}\r
\r
.kp-chip-pair .kp-chip--side:last-child {\r
  margin-left: -1px;\r
  border-radius: 0 var(--r-pill) var(--r-pill) 0;\r
}\r
\r
.kp-chip-pair .kp-chip--side[aria-pressed='true'] {\r
  position: relative;\r
  z-index: 1;\r
}\r
\r
.kp-title {\r
  margin: 0;\r
  font-family: var(--disp);\r
  font-size: var(--t-h3);\r
}\r
\r
.kp-title--sm {\r
  font-size: var(--t-base);\r
}\r
\r
.kp-muted,\r
.kp-empty {\r
  margin: 0;\r
  color: var(--mut);\r
  font-size: var(--t-sm);\r
}\r
\r
.kp-empty {\r
  padding: var(--s-6) 0;\r
  text-align: center;\r
}\r
\r
.kp-label {\r
  color: var(--mut);\r
  font-size: var(--t-meta);\r
  letter-spacing: 0.06em;\r
  text-transform: uppercase;\r
}\r
\r
.kp-name {\r
  overflow: hidden;\r
  font-size: var(--t-sm);\r
  text-overflow: ellipsis;\r
  white-space: nowrap;\r
}\r
\r
.kp-price {\r
  color: var(--fg2);\r
  font-family: var(--mono);\r
  font-size: var(--t-meta);\r
}\r
\r
.kp-note {\r
  overflow: hidden;\r
  color: var(--mut);\r
  font-size: var(--t-meta);\r
  text-overflow: ellipsis;\r
  white-space: nowrap;\r
}\r
\r
.kp-note--warn {\r
  color: var(--warn);\r
}\r
\r
.kp-note--new {\r
  color: var(--ok);\r
}\r
\r
.kp-note--wish {\r
  color: var(--wish);\r
}\r
\r
.kp-tag {\r
  align-self: flex-start;\r
  padding: 2px 8px;\r
  border: 1px solid var(--line2);\r
  border-radius: var(--r-pill);\r
  color: var(--fg2);\r
  font-size: var(--t-meta);\r
}\r
\r
.kp-art {\r
  position: relative;\r
  display: block;\r
  overflow: hidden;\r
  aspect-ratio: 2 / 3;\r
  border: 3px solid var(--kp-rarity);\r
  border-radius: var(--r-md);\r
  background: var(--bg2);\r
  box-shadow: 0 0 14px color-mix(in srgb, var(--kp-rarity) 30%, transparent);\r
}\r
\r
.kp-art img {\r
  display: block;\r
  width: 100%;\r
  height: 100%;\r
  object-fit: cover;\r
}\r
\r
.kp-art--md {\r
  width: 100%;\r
}\r
\r
.kp-art--lg {\r
  width: 120px;\r
}\r
\r
.kp-art--sm {\r
  width: 44px;\r
  border-width: 2px;\r
  border-radius: var(--r-sm);\r
}\r
\r
.kp-badge {\r
  position: absolute;\r
  right: 4px;\r
  bottom: 4px;\r
  padding: 1px 6px;\r
  border-radius: var(--r-pill);\r
  background: color-mix(in srgb, var(--bg) 85%, transparent);\r
  color: var(--fg);\r
  font-family: var(--mono);\r
  font-size: var(--t-meta);\r
  line-height: 1.4;\r
}\r
\r
.kp-badge--lock {\r
  top: 4px;\r
  bottom: auto;\r
  color: var(--warn);\r
}\r
\r
.kp-art--sm .kp-badge {\r
  right: 1px;\r
  bottom: 1px;\r
  padding: 0 3px;\r
  font-size: 9px;\r
}\r
\r
.kp-art--sm .kp-badge--lock {\r
  top: 1px;\r
  bottom: auto;\r
}\r
\r
.kp-swap {\r
  align-self: center;\r
  color: var(--mut);\r
  font-size: 18px;\r
  text-align: center;\r
}\r
\r
.kp-btn {\r
  display: inline-flex;\r
  align-items: center;\r
  justify-content: center;\r
  gap: 6px;\r
  padding: 6px 10px;\r
  border: 1px solid transparent;\r
  border-radius: var(--r-md);\r
  background: var(--acc);\r
  color: #fff;\r
  font: 600 var(--t-sm) var(--body);\r
  cursor: pointer;\r
  transition: background 0.15s, opacity 0.15s;\r
}\r
\r
.kp-btn[hidden] {\r
  display: none;\r
}\r
\r
.kp-btn:hover {\r
  background: var(--acc2);\r
}\r
\r
.kp-btn--ghost {\r
  border-color: var(--line2);\r
  background: transparent;\r
  color: var(--fg);\r
}\r
\r
.kp-btn--ghost:hover {\r
  background: var(--raise);\r
}\r
\r
.kp-btn--warn {\r
  background: var(--warn);\r
  color: var(--bg);\r
}\r
\r
.kp-btn--double {\r
  background: #ff5f1f;\r
  color: var(--bg);\r
}\r
\r
.kp-btn--double:hover {\r
  background: #ff7a45;\r
}\r
\r
.kp-btn--single {\r
  background: var(--gold);\r
  color: var(--bg);\r
}\r
\r
.kp-btn--single:hover {\r
  background: #ffd84d;\r
}\r
\r
.kp-btn--sm {\r
  padding: 4px 8px;\r
  font-size: var(--t-meta);\r
}\r
\r
.kp-gain {\r
  padding: 1px 6px;\r
  border-radius: var(--r-pill);\r
  font-family: var(--mono);\r
  font-size: var(--t-meta);\r
  white-space: nowrap;\r
}\r
\r
.kp-gain--up {\r
  background: color-mix(in srgb, var(--ok) 18%, transparent);\r
  color: var(--ok);\r
}\r
\r
.kp-gain--down {\r
  background: color-mix(in srgb, var(--danger) 18%, transparent);\r
  color: var(--danger);\r
}\r
\r
.kp-gain--flat {\r
  background: var(--raise);\r
  color: var(--mut);\r
}\r
\r
.kp-btn .kp-gain {\r
  background: var(--bg);\r
}\r
\r
.kp-board {\r
  display: flex;\r
  flex-direction: column;\r
  gap: var(--s-4);\r
}\r
\r
.kp-board__bar {\r
  display: flex;\r
  flex-wrap: wrap;\r
  align-items: flex-end;\r
  justify-content: space-between;\r
  gap: var(--s-3);\r
}\r
\r
.kp-board__actions {\r
  display: flex;\r
  gap: var(--s-2);\r
}\r
\r
.kp-board__list {\r
  display: flex;\r
  flex-direction: column;\r
  gap: var(--s-5);\r
}\r
\r
.kp-group {\r
  display: flex;\r
  flex-direction: column;\r
  gap: var(--s-3);\r
}\r
\r
.kp-group__title {\r
  margin: 0;\r
  padding-bottom: var(--s-2);\r
  border-bottom: 1px solid color-mix(in srgb, var(--kp-rarity) 40%, transparent);\r
  color: var(--kp-rarity);\r
  font-family: var(--disp);\r
  font-size: var(--t-base);\r
}\r
\r
.kp-offer {\r
  position: relative;\r
  display: grid;\r
  grid-template-columns: 132px 24px minmax(0, 1fr);\r
  gap: var(--s-4);\r
  padding: var(--s-3);\r
  border: 1px solid var(--line);\r
  border-radius: var(--r-lg);\r
  background: var(--panel);\r
  transition: opacity 0.15s;\r
}\r
\r
.kp-offer__get,\r
.kp-option {\r
  display: flex;\r
  flex-direction: column;\r
  gap: 4px;\r
  min-width: 0;\r
}\r
\r
.kp-offer__give {\r
  display: flex;\r
  flex-direction: column;\r
  gap: var(--s-2);\r
  min-width: 0;\r
}\r
\r
.kp-options {\r
  display: grid;\r
  grid-template-columns: repeat(5, 112px);\r
  justify-content: start;\r
  gap: var(--s-3);\r
}\r
\r
.kp-option--missing {\r
  opacity: 0.35;\r
}\r
\r
.kp-option .kp-btn {\r
  width: 100%;\r
  margin-top: auto;\r
  padding: 4px 6px;\r
  font-size: var(--t-meta);\r
}\r
\r
.kp-hide {\r
  display: inline-flex;\r
  align-items: center;\r
  justify-content: center;\r
  width: 26px;\r
  height: 26px;\r
  padding: 0;\r
  border: 1px solid var(--line2);\r
  border-radius: var(--r-pill);\r
  background: var(--panel2);\r
  color: var(--mut);\r
  cursor: pointer;\r
}\r
\r
.kp-hide:hover {\r
  background: var(--raise);\r
  color: var(--fg);\r
}\r
\r
.kp-offer > .kp-hide {\r
  position: absolute;\r
  top: var(--s-2);\r
  right: var(--s-2);\r
}\r
\r
.kp-deal .kp-hide {\r
  width: 22px;\r
  height: 22px;\r
  margin-left: auto;\r
  font-size: 11px;\r
}\r
\r
.kp-more {\r
  align-self: center;\r
}\r
\r
.is-busy {\r
  opacity: 0.45;\r
  pointer-events: none;\r
}\r
\r
.kp-side {\r
  display: flex;\r
  flex-direction: column;\r
  gap: var(--s-5);\r
  height: 100%;\r
  overflow-y: auto;\r
  padding: var(--s-4);\r
  border: 1px solid var(--line);\r
  border-radius: var(--r-lg);\r
  background: var(--panel);\r
}\r
\r
.kp-side__controls {\r
  position: sticky;\r
  top: calc(-1 * var(--s-4));\r
  z-index: 1;\r
  margin: calc(-1 * var(--s-4)) calc(-1 * var(--s-4)) 0;\r
  padding: var(--s-3) var(--s-4);\r
  border-bottom: 1px solid var(--line);\r
  background: var(--panel);\r
}\r
\r
.kp-side__block {\r
  display: flex;\r
  flex-direction: column;\r
  gap: var(--s-3);\r
}\r
\r
.kp-field {\r
  display: flex;\r
  align-items: center;\r
  gap: var(--s-2);\r
}\r
\r
.kp-input {\r
  flex: 1;\r
  min-width: 0;\r
  padding: 6px 10px;\r
  border: 1px solid var(--line2);\r
  border-radius: var(--r-md);\r
  background: var(--bg2);\r
  color: var(--fg);\r
  font-family: var(--mono);\r
}\r
\r
.kp-input:focus {\r
  border-color: var(--acc);\r
  outline: none;\r
}\r
\r
.kp-board__search {\r
  flex-basis: 100%;\r
  max-width: 420px;\r
}\r
\r
.kp-deals {\r
  display: flex;\r
  flex-direction: column;\r
  gap: var(--s-2);\r
}\r
\r
.kp-deal {\r
  display: grid;\r
  grid-template-columns: 44px auto 44px minmax(0, 1fr);\r
  align-items: center;\r
  gap: var(--s-2);\r
  padding: var(--s-2);\r
  border: 1px solid var(--line);\r
  border-radius: var(--r-md);\r
  background: var(--panel2);\r
}\r
\r
.kp-deal .kp-swap {\r
  font-size: 12px;\r
}\r
\r
.kp-deal__info {\r
  display: flex;\r
  flex-direction: column;\r
  gap: 2px;\r
  min-width: 0;\r
}\r
\r
.kp-deal__actions {\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: var(--s-2);\r
  margin-top: 2px;\r
}\r
\r
.kp-deal.is-new {\r
  border-color: var(--acc);\r
  box-shadow: 0 0 0 1px var(--acc-soft);\r
}\r
\r
.kp-new {\r
  margin-right: 6px;\r
  padding: 1px 6px;\r
  border-radius: var(--r-pill);\r
  background: var(--acc);\r
  color: #fff;\r
  font-size: var(--t-meta);\r
  font-weight: 700;\r
}\r
\r
.kp-auto {\r
  padding: var(--s-3);\r
  border: 1px solid var(--line2);\r
  border-radius: var(--r-md);\r
  background: var(--panel2);\r
}\r
\r
.kp-auto__head {\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: var(--s-2);\r
}\r
\r
.kp-rules {\r
  border-spacing: 4px;\r
  margin: 0 -4px;\r
}\r
\r
.kp-rules th {\r
  font-weight: 400;\r
  text-align: center;\r
}\r
\r
.kp-rules thead th:first-child {\r
  max-width: 90px;\r
  text-align: left;\r
}\r
\r
.kp-gem {\r
  display: inline-grid;\r
  place-items: center;\r
  width: 22px;\r
  height: 22px;\r
  border: 2px solid var(--kp-rarity);\r
  border-radius: 50%;\r
  color: var(--kp-rarity);\r
  font: 900 10px var(--body);\r
}\r
\r
.kp-rule {\r
  display: block;\r
  width: 28px;\r
  height: 28px;\r
  margin: auto;\r
  border: 1px solid var(--line2);\r
  border-radius: var(--r-sm, 6px);\r
  background: transparent;\r
  cursor: pointer;\r
}\r
\r
.kp-rule:hover {\r
  border-color: var(--kp-rarity);\r
}\r
\r
.kp-rule[aria-pressed='true'] {\r
  border-color: var(--kp-rarity);\r
  background: var(--kp-rarity);\r
  box-shadow: 0 0 10px color-mix(in srgb, var(--kp-rarity) 50%, transparent);\r
}\r
\r
.kp-side__tabs {\r
  display: flex;\r
  gap: var(--s-2);\r
}\r
\r
.kp-side__view {\r
  display: flex;\r
  flex-direction: column;\r
  gap: var(--s-5);\r
}\r
\r
.kp-side__view[hidden] {\r
  display: none;\r
}\r
\r
/* A dot on the Auto-accept tab while it runs, so it stays visible from the Offres tab. */\r
.kp-side__tabs .kp-chip.is-live::after {\r
  content: '';\r
  display: inline-block;\r
  width: 7px;\r
  height: 7px;\r
  margin-left: 6px;\r
  border-radius: 50%;\r
  background: var(--ok);\r
  box-shadow: 0 0 6px var(--ok);\r
  vertical-align: middle;\r
}\r
\r
.kp-auto__head .kp-btn:disabled {\r
  cursor: not-allowed;\r
}\r
\r
.kp-auto > .kp-chip {\r
  align-self: flex-start;\r
}\r
\r
.kp-toasts {\r
  position: fixed;\r
  right: 16px;\r
  bottom: 16px;\r
  z-index: 2147483647;\r
  display: flex;\r
  flex-direction: column;\r
  gap: var(--s-2);\r
}\r
\r
.kp-toast {\r
  max-width: 360px;\r
  padding: 10px 14px;\r
  border: 1px solid var(--line2);\r
  border-radius: var(--r-md);\r
  background: var(--raise);\r
  box-shadow: var(--sh-1);\r
  color: var(--fg);\r
  font-size: var(--t-sm);\r
}\r
\r
.kp-toast--success {\r
  border-color: var(--ok);\r
}\r
\r
.kp-toast--error {\r
  border-color: var(--danger);\r
}\r
\r
.kp-replaced {\r
  display: none !important;\r
}\r
\r
.tcg.kp-ghost {\r
  filter: saturate(0.45) brightness(0.8);\r
}\r
\r
.tcg.kp-ghost .art img {\r
  filter: grayscale(1) brightness(0.7);\r
}\r
\r
.kp-filtered-out {\r
  display: none !important;\r
}\r
\r
.kp-album-filters {\r
  display: flex;\r
  flex-wrap: wrap;\r
  align-items: center;\r
  gap: var(--s-3);\r
  margin: var(--s-3) 0;\r
}\r
\r
.kp-input--short {\r
  flex: 0 0 72px;\r
  width: 72px;\r
}\r
\r
.kp-gem-chip {\r
  display: inline-grid;\r
  place-items: center;\r
  width: 26px;\r
  height: 26px;\r
  padding: 0;\r
  border: 2px solid var(--kp-rarity);\r
  border-radius: 50%;\r
  background: transparent;\r
  color: var(--kp-rarity);\r
  font: 900 11px var(--body);\r
  cursor: pointer;\r
}\r
\r
.kp-gem-chip[aria-pressed='true'] {\r
  background: var(--kp-rarity);\r
  box-shadow: 0 0 12px color-mix(in srgb, var(--kp-rarity) 60%, transparent);\r
  color: var(--bg);\r
}\r
\r
.kp-btn:disabled {\r
  opacity: 0.5;\r
  cursor: progress;\r
}\r
\r
.kp-lock-host {\r
  position: relative;\r
}\r
\r
.kp-lock-host .pin {\r
  display: none !important;\r
}\r
\r
.kp-lock {\r
  position: absolute;\r
  top: 2px;\r
  left: 0;\r
  z-index: 6;\r
  display: grid;\r
  place-items: center;\r
  width: 30px;\r
  height: 30px;\r
  padding: 0;\r
  border: 1px solid var(--line2);\r
  border-radius: 50%;\r
  background: var(--panel2);\r
  color: var(--dim);\r
  font-size: 13px;\r
  cursor: pointer;\r
  opacity: 0;\r
  transition: opacity 0.15s, color 0.15s;\r
}\r
\r
.kp-lock-host:hover .kp-lock,\r
.kp-lock.is-locked,\r
.kp-lock:focus-visible {\r
  opacity: 1;\r
}\r
\r
.kp-lock.is-locked {\r
  color: var(--warn);\r
}\r
\r
.kp-lock:hover {\r
  color: var(--fg);\r
}\r
\r
.kp-pick-host {\r
  position: relative;\r
}\r
\r
.kp-pick {\r
  position: absolute;\r
  top: 2px;\r
  left: 34px;\r
  z-index: 6;\r
  display: grid;\r
  place-items: center;\r
  min-width: 30px;\r
  height: 30px;\r
  padding: 0 6px;\r
  border: 1px solid var(--line2);\r
  border-radius: var(--r-pill);\r
  background: var(--panel2);\r
  color: var(--dim);\r
  font: 700 12px var(--mono);\r
  cursor: pointer;\r
  opacity: 0;\r
  transition: opacity 0.15s, color 0.15s;\r
}\r
\r
.kp-pick-host:hover .kp-pick,\r
.kp-pick.is-picked,\r
.kp-pick:focus-visible {\r
  opacity: 1;\r
}\r
\r
.kp-pick:hover {\r
  color: var(--fg);\r
}\r
\r
.kp-pick.is-picked {\r
  border-color: var(--acc);\r
  background: var(--acc);\r
  color: #fff;\r
}\r
\r
.kp-picked .slot {\r
  outline: 2px solid var(--acc);\r
  outline-offset: 2px;\r
  border-radius: var(--r-md);\r
}\r
\r
.kp-pick-bar {\r
  position: fixed;\r
  bottom: 16px;\r
  left: 50%;\r
  z-index: 1000;\r
  display: flex;\r
  align-items: center;\r
  gap: var(--s-3);\r
  padding: 8px 8px 8px 16px;\r
  border: 1px solid var(--acc);\r
  border-radius: var(--r-pill);\r
  background: var(--raise);\r
  box-shadow: var(--sh-1);\r
  color: var(--fg);\r
  font-size: var(--t-sm);\r
  transform: translateX(-50%);\r
}\r
\r
.kp-pick-bar[hidden] {\r
  display: none;\r
}\r
\r
.kp-fair {\r
  display: flex;\r
  flex-direction: column;\r
  gap: 2px;\r
  padding: var(--s-2) var(--s-3);\r
  border: 1px solid var(--line2);\r
  border-radius: var(--r-md);\r
  background: var(--panel2);\r
  font-size: var(--t-sm);\r
}\r
\r
.kp-releases {\r
  display: flex;\r
  flex-direction: column;\r
  gap: 2px;\r
  margin: 0;\r
  padding: 0;\r
  list-style: none;\r
  font-size: var(--t-meta);\r
}\r
\r
.kp-release__time {\r
  display: inline-block;\r
  min-width: 82px;\r
  color: var(--fg2);\r
  font-family: var(--mono);\r
}\r
\r
\r
.kp-pc__completion {\r
  font-weight: 600;\r
}\r
\r
.kp-lock:disabled {\r
  cursor: progress;\r
}\r
\r
.kp-badge--new {\r
  color: var(--ok);\r
}\r
\r
.kp-tcard {\r
  display: flex;\r
  flex-direction: column;\r
  align-items: center;\r
  gap: 2px;\r
  width: 92px;\r
  min-width: 0;\r
}\r
\r
.kp-tcard .kp-name {\r
  max-width: 100%;\r
}\r
\r
.kp-count-host {\r
  container-type: inline-size;\r
}\r
\r
/* The tile image spans the tile width with a 5:7 ratio, so its bottom edge sits at 140% of that width. */\r
.kp-count {\r
  position: absolute;\r
  top: calc(140cqw - 22px);\r
  right: 5px;\r
  padding: 0 6px;\r
  border-radius: var(--r-pill);\r
  background: #0a090ed9;\r
  color: var(--fg2);\r
  font: 700 11px var(--mono);\r
  line-height: 18px;\r
  pointer-events: none;\r
}\r
\r
.kp-count--dupe {\r
  color: var(--ok);\r
}\r
\r
.kp-site-only {\r
  display: none !important;\r
}\r
\r
.kp-native-hidden {\r
  display: none !important;\r
}\r
\r
body.kp-modal-open {\r
  overflow: hidden;\r
}\r
\r
.kp-modal {\r
  position: fixed;\r
  inset: 0;\r
  z-index: 1000;\r
  display: grid;\r
  place-items: center;\r
  padding: var(--s-4);\r
  background: color-mix(in srgb, var(--bg) 70%, transparent);\r
  backdrop-filter: blur(4px);\r
}\r
\r
.kp-pc {\r
  display: flex;\r
  flex-direction: column;\r
  width: min(1200px, 100%);\r
  height: min(900px, 100%);\r
  overflow: hidden;\r
  border: 1px solid var(--line2);\r
  border-radius: var(--r-lg);\r
  background: var(--panel);\r
  box-shadow: var(--sh-1);\r
}\r
\r
.kp-pc__head {\r
  display: flex;\r
  align-items: center;\r
  gap: var(--s-3);\r
  padding: var(--s-3) var(--s-4);\r
  border-bottom: 1px solid var(--line);\r
}\r
\r
.kp-pc__close {\r
  margin-left: auto;\r
}\r
\r
.kp-pc__filters {\r
  display: flex;\r
  flex-wrap: wrap;\r
  align-items: center;\r
  gap: var(--s-2) var(--s-3);\r
  padding: var(--s-3) var(--s-4);\r
  border-bottom: 1px solid var(--line);\r
}\r
\r
.kp-pc__filters .kp-input {\r
  flex: 0 1 200px;\r
}\r
\r
.kp-pc__body {\r
  flex: 1;\r
  overflow-y: auto;\r
  padding: var(--s-4);\r
}\r
\r
.kp-pc__grid {\r
  display: grid;\r
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));\r
  gap: var(--s-3);\r
}\r
\r
.kp-pc__grid .kp-empty {\r
  grid-column: 1 / -1;\r
}\r
\r
.kp-pc__sentinel {\r
  height: 1px;\r
}\r
\r
.kp-pcard {\r
  display: flex;\r
  flex-direction: column;\r
  gap: 2px;\r
  min-width: 0;\r
}\r
\r
.kp-badge--dupe {\r
  color: var(--ok);\r
}\r
\r
.kp-badge--corner {\r
  top: 4px;\r
  right: auto;\r
  bottom: auto;\r
  left: 4px;\r
}\r
\r
.kp-pc__total {\r
  padding: 2px 10px;\r
  border: 1px solid var(--line2);\r
  border-radius: var(--r-pill);\r
  color: var(--fg);\r
  font: 700 var(--t-sm) var(--mono);\r
}\r
\r
.kp-friend-search {\r
  display: block;\r
  width: 100%;\r
  max-width: 880px;\r
  margin-bottom: var(--s-3);\r
}\r
\r
body.kp-friends main ul.people {\r
  display: flex;\r
  flex-direction: column;\r
}\r
\r
body.kp-friends main ul.people > li.kp-pinned {\r
  order: -1;\r
  box-shadow: inset 3px 0 0 var(--gold);\r
}\r
\r
.kp-pin,\r
.kp-friend-act {\r
  display: inline-flex !important;\r
  flex: none;\r
  align-items: center;\r
  justify-content: center;\r
  gap: 0 !important;\r
  box-sizing: border-box;\r
  width: 32px;\r
  height: 32px;\r
  min-width: 0 !important;\r
  min-height: 0 !important;\r
  margin: 0 !important;\r
  padding: 0 !important;\r
  line-height: 0 !important;\r
  vertical-align: middle;\r
  border: 1px solid var(--line2) !important;\r
  border-radius: 50% !important;\r
  background: var(--panel2) !important;\r
  color: var(--mut) !important;\r
  font-size: 0 !important;\r
  text-decoration: none !important;\r
  cursor: pointer;\r
  transition: color 0.15s, background 0.15s;\r
}\r
\r
.kp-pin i,\r
.kp-friend-act i {\r
  width: 1.25em;\r
  font-size: 13px;\r
  line-height: 1;\r
  text-align: center;\r
}\r
\r
.kp-pin:hover,\r
.kp-friend-act:hover {\r
  background: var(--raise) !important;\r
  color: var(--fg) !important;\r
}\r
\r
.kp-friend-act[data-kp-icon='Retirer']:hover,\r
.kp-friend-act[data-kp-icon='Bloquer']:hover {\r
  color: var(--danger) !important;\r
}\r
\r
.kp-pin.is-pinned {\r
  border-color: var(--gold) !important;\r
  color: var(--gold) !important;\r
}\r
\r
.kp-pin.is-pinned i {\r
  transform: rotate(-45deg);\r
}\r
\r
.kp-friend-act--confirm {\r
  gap: 6px !important;\r
  width: auto;\r
  padding: 0 12px !important;\r
  border-color: var(--danger) !important;\r
  border-radius: var(--r-pill) !important;\r
  color: var(--danger) !important;\r
  font-size: var(--t-sm) !important;\r
  line-height: 1 !important;\r
}\r
\r
.kp-series-collapsed > ul.quests {\r
  display: none !important;\r
}\r
\r
.kp-series-toggle {\r
  display: inline-flex;\r
  align-items: center;\r
  gap: var(--s-2);\r
  margin-left: auto;\r
  padding: 4px 12px;\r
  border: 1px solid var(--line2);\r
  border-radius: var(--r-pill);\r
  background: var(--panel2);\r
  color: var(--fg2);\r
  font: 600 var(--t-sm) var(--body);\r
  cursor: pointer;\r
}\r
\r
.kp-series-toggle:hover {\r
  background: var(--raise);\r
  color: var(--fg);\r
}\r
\r
.kp-series-summary.has-claim {\r
  color: var(--ok);\r
}\r
\r
.kp-series-chevron {\r
  display: inline-flex;\r
  font-size: 11px;\r
  transition: transform 0.15s;\r
}\r
\r
.kp-series-toggle[aria-expanded='true'] .kp-series-chevron {\r
  transform: rotate(180deg);\r
}\r
\r
html:has(body.kp-video-bg),\r
body.kp-video-bg,\r
body.kp-video-bg main section.band,\r
body.kp-video-bg main .box.coll {\r
  background: transparent !important;\r
}\r
\r
.kp-bg-video {\r
  position: fixed;\r
  inset: 0;\r
  z-index: -1;\r
  width: 100vw;\r
  height: 100vh;\r
  object-fit: cover;\r
  filter: brightness(0.45);\r
  pointer-events: none;\r
}\r
\r
.kp-filters__rarities {\r
  margin-left: auto;\r
}\r
\r
.kp-free-count[hidden] {\r
  display: none !important;\r
}\r
\r
/* The site's own label still describes its largest batch, so it is swapped for the free count while selected. */\r
body.kp-free-mode main .under .btn-open[data-kp-label] {\r
  font-size: 0 !important;\r
}\r
\r
body.kp-free-mode main .under .btn-open[data-kp-label] > * {\r
  display: none !important;\r
}\r
\r
body.kp-free-mode main .under .btn-open[data-kp-label]::after {\r
  content: attr(data-kp-label);\r
  font-size: var(--t-base, 1rem);\r
}\r
\r
.kp-auto-open__trigger {\r
  position: relative;\r
  display: inline-grid;\r
  place-items: center;\r
  font-size: 18px;\r
}\r
\r
.kp-auto-open__trigger.is-live::after {\r
  content: '';\r
  position: absolute;\r
  top: 6px;\r
  right: 6px;\r
  width: 8px;\r
  height: 8px;\r
  border-radius: 50%;\r
  background: var(--ok);\r
  box-shadow: 0 0 6px var(--ok);\r
}\r
\r
.kp-auto-open {\r
  position: fixed;\r
  top: 72px;\r
  right: 16px;\r
  z-index: 900;\r
  display: flex;\r
  flex-direction: column;\r
  gap: var(--s-3);\r
  width: min(380px, calc(100vw - 32px));\r
  padding: var(--s-4);\r
  border: 1px solid var(--line2);\r
  border-radius: var(--r-lg);\r
  background: var(--panel);\r
  box-shadow: var(--sh-1);\r
  color: var(--fg);\r
}\r
\r
.kp-auto-open[hidden] {\r
  display: none;\r
}\r
\r
.kp-auto-open__head {\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
}\r
\r
.kp-auto-open__status {\r
  margin: 0;\r
  font-size: var(--t-sm);\r
  font-weight: 600;\r
}\r
\r
.kp-auto-open .kp-field {\r
  flex-wrap: wrap;\r
}\r
\r
.kp-auto-open .kp-field .kp-label {\r
  flex: 1 0 100%;\r
}\r
\r
.kp-auto-open__log {\r
  display: flex;\r
  flex-direction: column;\r
  gap: var(--s-1);\r
}\r
\r
.kp-auto-open__log-row {\r
  display: flex;\r
  align-items: center;\r
  gap: var(--s-2);\r
  font-size: var(--t-sm);\r
}\r
\r
.kp-auto-open__gems {\r
  display: inline-flex;\r
  align-items: center;\r
  gap: 4px;\r
  margin-left: auto;\r
  font-family: var(--mono);\r
}\r
\r
/* The site's "Tu es toujours là ?" prompt is a browser-only idle pause (nothing is sent to the server); the\r
   auto-open runs on its own requests, so the prompt would only cover the page while it works. */\r
body.kp-auto-open-on [role='dialog'][aria-labelledby='idle-t'] {\r
  display: none !important;\r
}\r
\r
body.kp-header .hdr a.navlink.support {\r
  display: none !important;\r
}\r
\r
body.kp-activity:not(.kp-activity--native) main [role='tabpanel'] > :not(.kp-act):not([role='dialog']):not(:has([role='dialog'])) {\r
  display: none !important;\r
}\r
\r
/* The market hero (kicker, title, intro, Cartes / Éveil) used half a screen: one slim line is enough. */\r
body.kp-market main > section.head {\r
  display: flex;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: var(--s-4);\r
  min-height: 0 !important;\r
  margin-block: 0 !important;\r
  padding-block: var(--s-3) !important;\r
}\r
\r
body.kp-market main > section.head .eyebrow,\r
body.kp-market main > section.head .lead {\r
  display: none !important;\r
}\r
\r
body.kp-market main > section.head .h1 {\r
  margin: 0 !important;\r
  font-size: 24px !important;\r
  line-height: 1.15 !important;\r
}\r
\r
body.kp-market main > section.head .mode {\r
  margin: 0 !important;\r
}\r
\r
.kp-act,\r
.kp-act__content {\r
  display: flex;\r
  flex-direction: column;\r
  gap: var(--s-3);\r
}\r
\r
.kp-act__bar {\r
  display: flex;\r
  flex-wrap: wrap;\r
  align-items: center;\r
  gap: var(--s-2) var(--s-4);\r
}\r
\r
.kp-act__bar .kp-title {\r
  flex: none;\r
}\r
\r
.kp-act.is-native .kp-act__content,\r
.kp-act.is-native .kp-act__bar .kp-title,\r
.kp-act.is-native .kp-act__summary {\r
  display: none;\r
}\r
\r
.kp-act.is-native .kp-act__bar {\r
  justify-content: flex-end;\r
}\r
\r
.kp-act__summary {\r
  display: flex;\r
  flex: 1 1 280px;\r
  flex-wrap: wrap;\r
  align-items: center;\r
  gap: var(--s-2) var(--s-3);\r
  min-width: 0;\r
}\r
\r
.kp-act__summary[hidden] {\r
  display: none;\r
}\r
\r
.kp-act__lede {\r
  color: var(--warn);\r
  font-size: var(--t-sm);\r
  font-weight: 600;\r
}\r
\r
.kp-act__lede.is-calm {\r
  color: var(--mut);\r
  font-weight: 500;\r
}\r
\r
.kp-act__stats {\r
  display: flex;\r
  flex-wrap: wrap;\r
  gap: var(--s-2);\r
  margin-left: auto;\r
}\r
\r
.kp-act__stat {\r
  display: inline-flex;\r
  align-items: center;\r
  gap: 8px;\r
  padding: 4px 12px;\r
  border: 1px solid var(--line);\r
  border-radius: var(--r-pill);\r
  background: var(--panel);\r
  color: var(--fg2);\r
  font: 500 var(--t-sm) var(--body);\r
}\r
\r
.kp-act__stat strong {\r
  color: var(--fg);\r
  font-family: var(--mono);\r
}\r
\r
button.kp-act__stat {\r
  cursor: pointer;\r
}\r
\r
button.kp-act__stat:hover,\r
.kp-act__stat.is-on {\r
  border-color: var(--acc);\r
  background: var(--acc-soft);\r
}\r
\r
.kp-act__ledger {\r
  display: flex;\r
  flex-direction: column;\r
  gap: var(--s-2);\r
  padding: var(--s-3) var(--s-4);\r
  border: 1px solid var(--line);\r
  border-radius: var(--r-lg);\r
  background: var(--panel);\r
}\r
\r
.kp-act__ledger[hidden] {\r
  display: none;\r
}\r
\r
.kp-act__bar-track {\r
  display: flex;\r
  height: 10px;\r
  overflow: hidden;\r
  border-radius: var(--r-pill);\r
  background: var(--bg2);\r
}\r
\r
.kp-act__legend {\r
  display: flex;\r
  flex-wrap: wrap;\r
  gap: var(--s-1) var(--s-4);\r
  margin: var(--s-2) 0 0;\r
  padding: 0;\r
  color: var(--fg2);\r
  font-size: var(--t-sm);\r
  list-style: none;\r
}\r
\r
.kp-act__legend i {\r
  display: inline-block;\r
  width: 10px;\r
  height: 10px;\r
  margin-right: 6px;\r
  border-radius: 2px;\r
}\r
\r
.kp-act__sales {\r
  display: flex;\r
  align-items: center;\r
  gap: var(--s-2);\r
  margin: 0;\r
  color: var(--fg2);\r
  font-size: var(--t-sm);\r
}\r
\r
.kp-act__toolbar {\r
  display: flex;\r
  flex-wrap: wrap;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: var(--s-3);\r
}\r
\r
.kp-act__tabs {\r
  display: flex;\r
  flex-wrap: wrap;\r
  gap: 4px;\r
  padding: 4px;\r
  border: 1px solid var(--line);\r
  border-radius: var(--r-lg);\r
  background: var(--panel);\r
}\r
\r
.kp-act__tab {\r
  display: inline-flex;\r
  align-items: center;\r
  gap: 8px;\r
  padding: 7px 12px;\r
  border: 0;\r
  border-radius: var(--r-md);\r
  background: transparent;\r
  color: var(--fg2);\r
  font: 600 var(--t-sm) var(--body);\r
  cursor: pointer;\r
  transition: background 0.15s, color 0.15s;\r
}\r
\r
.kp-act__tab:hover {\r
  background: var(--raise);\r
  color: var(--fg);\r
}\r
\r
.kp-act__tab.on {\r
  background: var(--acc);\r
  color: #fff;\r
  box-shadow: 0 2px 10px color-mix(in srgb, var(--acc) 40%, transparent);\r
}\r
\r
.kp-act__tab.is-empty:not(.on) {\r
  opacity: 0.55;\r
}\r
\r
.kp-act__tab .n {\r
  min-width: 20px;\r
  padding: 1px 6px;\r
  border-radius: var(--r-pill);\r
  background: var(--bg2);\r
  color: var(--fg2);\r
  font: 700 11px var(--mono);\r
  text-align: center;\r
}\r
\r
.kp-act__tab.on .n {\r
  background: rgb(255 255 255 / 0.22);\r
  color: #fff;\r
}\r
\r
.kp-act__tab.has-todo:not(.on) .n {\r
  background: var(--warn);\r
  color: var(--bg);\r
}\r
\r
.kp-act__tools {\r
  display: flex;\r
  flex-wrap: wrap;\r
  align-items: center;\r
  gap: var(--s-2);\r
}\r
\r
.kp-act__search {\r
  flex: 1 1 160px;\r
  min-width: 140px;\r
  max-width: 260px;\r
}\r
\r
.kp-act__sort {\r
  flex: 0 0 auto;\r
  width: auto;\r
}\r
\r
.kp-act__tools .kp-btn[hidden] {\r
  display: none;\r
}\r
\r
.kp-act__body {\r
  display: flex;\r
  flex-direction: column;\r
  gap: var(--s-4);\r
}\r
\r
.kp-act__notice {\r
  margin: 0;\r
  color: var(--mut);\r
  font-size: var(--t-sm);\r
}\r
\r
.kp-act__notice--error {\r
  color: var(--danger);\r
}\r
\r
.kp-act__group {\r
  display: flex;\r
  flex-direction: column;\r
  gap: var(--s-2);\r
}\r
\r
.kp-act__group-title {\r
  display: flex;\r
  align-items: center;\r
  gap: var(--s-2);\r
  margin: 0;\r
  color: var(--fg2);\r
  font: 700 var(--t-sm) var(--disp);\r
  letter-spacing: 0.06em;\r
  text-transform: uppercase;\r
}\r
\r
.kp-act__group-title .mono {\r
  color: var(--mut);\r
  font-weight: 500;\r
}\r
\r
.kp-act__list {\r
  display: grid;\r
  grid-template-columns: minmax(0, 1fr);\r
  gap: var(--s-3);\r
  align-items: start;\r
  margin: 0;\r
  padding: 0;\r
  list-style: none;\r
}\r
\r
.kp-act__row {\r
  display: flex;\r
  flex-direction: column;\r
  gap: var(--s-3);\r
  min-width: 0;\r
  content-visibility: auto;\r
  contain-intrinsic-size: auto 120px;\r
  padding: var(--s-3);\r
  border: 1px solid var(--line);\r
  border-radius: var(--r-lg);\r
  background: var(--panel);\r
  transition: opacity 0.15s, border-color 0.15s;\r
}\r
\r
.kp-act__row:hover {\r
  border-color: var(--line2);\r
}\r
\r
.kp-act__row--todo {\r
  border-color: var(--warn);\r
  box-shadow: inset 3px 0 0 var(--warn);\r
}\r
\r
.kp-act__row--done {\r
  background: color-mix(in srgb, var(--panel) 70%, var(--bg));\r
}\r
\r
.kp-act__row.is-focus {\r
  animation: kp-act-focus 2.6s ease-out;\r
}\r
\r
@keyframes kp-act-focus {\r
  0%,\r
  60% {\r
    box-shadow: 0 0 0 2px var(--acc);\r
  }\r
\r
  100% {\r
    box-shadow: 0 0 0 0 transparent;\r
  }\r
}\r
\r
.kp-act__head {\r
  display: flex;\r
  align-items: center;\r
  gap: var(--s-3);\r
  min-width: 0;\r
  cursor: pointer;\r
}\r
\r
.kp-act__kind {\r
  --kc: var(--acc);\r
  display: grid;\r
  flex: none;\r
  place-items: center;\r
  width: 34px;\r
  height: 34px;\r
  border: 1px solid color-mix(in srgb, var(--kc) 55%, transparent);\r
  border-radius: 50%;\r
  background: color-mix(in srgb, var(--kc) 14%, transparent);\r
  color: var(--kc);\r
  font: 700 16px var(--disp);\r
}\r
\r
.kp-act__kind[data-kind='bid'] {\r
  --kc: var(--gold);\r
}\r
\r
.kp-act__kind[data-kind='order'] {\r
  --kc: var(--cyan);\r
}\r
\r
.kp-act__kind[data-kind='tradeIn'],\r
.kp-act__kind[data-kind='tradeOut'] {\r
  --kc: var(--E);\r
}\r
\r
.kp-act__kind[data-kind='counter'] {\r
  --kc: var(--ok);\r
}\r
\r
.kp-act__txt {\r
  display: flex;\r
  flex: 1;\r
  flex-direction: column;\r
  gap: 2px;\r
  min-width: 0;\r
}\r
\r
.kp-act__state {\r
  display: flex;\r
  flex: none;\r
  flex-direction: column;\r
  align-items: flex-end;\r
  gap: 2px;\r
  max-width: 55%;\r
  text-align: right;\r
}\r
\r
.kp-act__status {\r
  font-size: var(--t-meta);\r
  font-weight: 700;\r
}\r
\r
.kp-act__status--good {\r
  color: var(--ok);\r
}\r
\r
.kp-act__status--bad {\r
  color: var(--danger);\r
}\r
\r
.kp-act__status--warn {\r
  color: var(--warn);\r
}\r
\r
.kp-act__status--accent {\r
  color: var(--acc);\r
}\r
\r
.kp-act__status--muted {\r
  color: var(--mut);\r
}\r
\r
.kp-act__cards,\r
.kp-act__full {\r
  display: grid;\r
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);\r
  gap: var(--s-2);\r
  align-items: center;\r
}\r
\r
.kp-act__full {\r
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);\r
  align-items: start;\r
}\r
\r
.kp-act__side {\r
  display: flex;\r
  flex-direction: column;\r
  align-items: center;\r
  gap: var(--s-2);\r
  min-width: 0;\r
  text-align: center;\r
}\r
\r
.kp-act__tiles {\r
  display: flex;\r
  flex-wrap: wrap;\r
  align-items: flex-start;\r
  justify-content: center;\r
  gap: var(--s-2);\r
}\r
\r
.kp-act__tiles .kp-tcard {\r
  width: 72px;\r
}\r
\r
.kp-act__more,\r
.kp-act__chakra {\r
  align-self: center;\r
  color: var(--fg2);\r
  font: 700 var(--t-base) var(--mono);\r
}\r
\r
.kp-act__chakra {\r
  color: var(--cyan);\r
}\r
\r
.kp-art--missing {\r
  display: grid;\r
  place-items: center;\r
  width: 72px;\r
  color: var(--mut);\r
}\r
\r
.kp-act__foot {\r
  display: flex;\r
  flex-wrap: wrap;\r
  align-items: center;\r
  justify-content: space-between;\r
  gap: var(--s-2);\r
}\r
\r
.kp-act__net {\r
  padding: 3px 10px;\r
  font-size: var(--t-sm);\r
  font-weight: 700;\r
  white-space: nowrap;\r
}\r
\r
.kp-act__acts {\r
  display: flex;\r
  align-items: center;\r
  gap: var(--s-2);\r
  margin-left: auto;\r
}\r
\r
.kp-act__acts .kp-btn {\r
  text-decoration: none;\r
}\r
\r
.kp-act__detail {\r
  display: flex;\r
  flex-direction: column;\r
  gap: var(--s-3);\r
  padding-top: var(--s-3);\r
  border-top: 1px solid var(--line);\r
}\r
\r
.kp-act__facts {\r
  display: grid;\r
  grid-template-columns: max-content minmax(0, 1fr);\r
  gap: 4px var(--s-4);\r
  margin: 0;\r
  font-size: var(--t-sm);\r
}\r
\r
.kp-act__facts dt {\r
  color: var(--mut);\r
}\r
\r
.kp-act__facts dd {\r
  margin: 0;\r
}\r
\r
.kp-act__link {\r
  color: var(--acc);\r
  text-decoration: underline;\r
}\r
\r
.kp-act__list--board {\r
  grid-template-columns: repeat(5, minmax(0, 1fr));\r
  gap: var(--s-2);\r
}\r
\r
.kp-act__list--minis {\r
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));\r
  gap: var(--s-2);\r
}\r
\r
.kp-act__row--compact {\r
  gap: var(--s-2);\r
  padding: var(--s-2);\r
}\r
\r
.kp-act__row--compact .kp-act__head {\r
  gap: var(--s-2);\r
}\r
\r
.kp-act__row--compact .kp-act__kind {\r
  width: 24px;\r
  height: 24px;\r
  font-size: 12px;\r
}\r
\r
.kp-act__row--compact .kp-act__state {\r
  max-width: 50%;\r
}\r
\r
.kp-act__row--compact .kp-act__tiles .kp-tcard {\r
  width: 56px;\r
}\r
\r
.kp-act__row--compact .kp-act__side .kp-label {\r
  font-size: 10px;\r
}\r
\r
.kp-act__row--compact .kp-act__acts .kp-btn {\r
  padding: 3px 6px;\r
}\r
\r
.kp-act__row--wide .kp-act__head {\r
  flex-wrap: wrap;\r
}\r
\r
.kp-act__row--wide .kp-act__txt {\r
  flex: 1 1 140px;\r
}\r
\r
.kp-act__row--wide .kp-act__state {\r
  flex-direction: row;\r
  align-items: center;\r
  gap: var(--s-3);\r
  max-width: none;\r
}\r
\r
.kp-act__row--wide .kp-act__acts {\r
  margin-left: 0;\r
}\r
\r
.kp-act__boxes {\r
  display: grid;\r
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);\r
  align-items: stretch;\r
  gap: var(--s-3);\r
}\r
\r
.kp-act__boxes > .kp-swap {\r
  color: var(--acc);\r
}\r
\r
.kp-act__box {\r
  container-type: inline-size;\r
  display: flex;\r
  flex-direction: column;\r
  gap: var(--s-2);\r
  padding: var(--s-2) var(--s-3) var(--s-3);\r
  border: 1px solid var(--line);\r
  border-radius: var(--r-lg);\r
  background: var(--panel2);\r
}\r
\r
.kp-act__box-head {\r
  display: flex;\r
  flex-wrap: wrap;\r
  align-items: center;\r
  gap: var(--s-1) var(--s-3);\r
}\r
\r
.kp-act__box-total {\r
  margin-left: auto;\r
}\r
\r
.kp-act__grid {\r
  display: grid;\r
  grid-template-columns: repeat(10, minmax(0, 1fr));\r
  gap: 6px;\r
}\r
\r
@container (max-width: 480px) {\r
  .kp-act__grid {\r
    grid-template-columns: repeat(5, minmax(0, 1fr));\r
  }\r
}\r
\r
.kp-act__grid .kp-tcard {\r
  width: auto;\r
}\r
\r
.kp-act__box .kp-badge {\r
  right: 2px;\r
  bottom: 2px;\r
  padding: 0 4px;\r
  font-size: 9px;\r
}\r
\r
.kp-act__note {\r
  font-size: var(--t-meta);\r
  font-weight: 600;\r
}\r
\r
.kp-act__note--warn {\r
  color: var(--warn);\r
}\r
\r
.kp-act__note--new {\r
  color: var(--ok);\r
}\r
\r
.kp-act__note--muted {\r
  color: var(--fg2);\r
}\r
\r
.kp-act__row--mini {\r
  gap: var(--s-2);\r
  padding: var(--s-2) var(--s-3);\r
}\r
\r
.kp-act__mini {\r
  display: grid;\r
  grid-template-columns: 44px minmax(0, 1fr) auto auto;\r
  align-items: center;\r
  gap: var(--s-3);\r
  cursor: pointer;\r
}\r
\r
.kp-act__mini .kp-act__txt {\r
  gap: 1px;\r
}\r
\r
.kp-act__mini .kp-note {\r
  white-space: normal;\r
}\r
\r
.kp-act__money {\r
  display: flex;\r
  flex-direction: column;\r
  align-items: flex-end;\r
  gap: 2px;\r
}\r
\r
.kp-act__amount {\r
  color: var(--cyan);\r
  font: 700 var(--t-base) var(--mono);\r
  white-space: nowrap;\r
}\r
\r
.kp-act__money .kp-act__net {\r
  padding: 1px 6px;\r
  font-size: var(--t-meta);\r
}\r
\r
.kp-act__mini .kp-art--missing {\r
  width: 44px;\r
}\r
\r
@media (max-width: 1100px) {\r
  .kp-act__list--board {\r
    grid-template-columns: repeat(3, minmax(0, 1fr));\r
  }\r
}\r
\r
@media (max-width: 760px) {\r
  .kp-act__boxes {\r
    grid-template-columns: minmax(0, 1fr);\r
  }\r
\r
  .kp-act__list--board {\r
    grid-template-columns: repeat(2, minmax(0, 1fr));\r
  }\r
\r
  .kp-act__list--minis {\r
    grid-template-columns: minmax(0, 1fr);\r
  }\r
\r
  .kp-act__tab-label {\r
    display: none;\r
  }\r
\r
  .kp-act__tab.on .kp-act__tab-label {\r
    display: inline;\r
  }\r
}\r
`;

  // src/main.js
  // src/features/diag.js
  // Console helpers for the owner when something of the site misbehaves with the script on:
  //   kyaraPlusDiag.off("collection")  → disables every feature whose id starts with "collection" (kept across reloads)
  //   kyaraPlusDiag.on("collection")   → enables them again ; kyaraPlusDiag.features() lists ids and states
  //   kyaraPlusDiag.menu()             → records for 15 s every pointer/focus/scroll event and header mutation,
  //                                      then kyaraPlusDiag.download() saves the recording (e-mails masked)
  //   kyaraPlusDiag.dialog()           → saves the open dialog of the site (HTML, e-mails masked) with the fair-play
  //                                      answer for the profile shown, to build features on the trade proposal window
  var DISABLED_SETTING = "disabledFeatures";
  // The switches serve one investigation: they are kept across reloads but dropped by the next version of the script,
  // so a feature switched off while looking into a problem never stays off once the fix is installed.
  function readDisabledFeatures() {
    const stored = readSetting(DISABLED_SETTING, null);
    if (!stored) return [];
    if (Array.isArray(stored) || stored.version !== SURVEY_VERSION) {
      writeSetting(DISABLED_SETTING, null);
      return [];
    }
    return stored.ids ?? [];
  }
  var disabledFeatures = new Set(readDisabledFeatures());
  var isFeatureDisabled = (id) => disabledFeatures.has(id);
  var announcedDisabled = "";
  // On a page where switched-off features would run, say so once: a page missing its tools is otherwise a mystery
  function announceDisabledFeatures(url) {
    const ids = features.filter((feature) => isFeatureDisabled(feature.id) && feature.matches(url)).map((feature) => feature.id);
    const key = ids.length ? `${url.pathname} ${ids.join(",")}` : "";
    if (key === announcedDisabled) return;
    announcedDisabled = key;
    if (!ids.length) return;
    const prefix = ids[0].split("-")[0];
    const target = ids.every((id) => id.split("-")[0] === prefix) ? prefix : ids[0];
    toast(`Kyara Plus : fonctions désactivées par kyaraPlusDiag.off : ${ids.join(", ")}. Dans la console, kyaraPlusDiag.on("${target}") pour les réactiver.`);
  }
  var maskText = (text) => text.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "<email>").replace(/\s+/g, " ").trim().slice(0, 32);
  function describeNode(node) {
    if (!node || node === window) return node === window ? "window" : String(node);
    if (node === document) return "document";
    if (node.nodeType === Node.TEXT_NODE) return `#text "${maskText(node.textContent)}"`;
    if (node.nodeType !== Node.ELEMENT_NODE) return node.nodeName;
    const classes = [...node.classList].slice(0, 6).join(".");
    const inHeader = node.closest("header.hdr") ? " (header)" : "";
    return `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ""}${classes ? `.${classes}` : ""}${inHeader} "${maskText(node.textContent ?? "")}"`;
  }
  function installDiagConsole() {
    let recording = null;
    const EVENTS = ["pointerdown", "mousedown", "pointerup", "mouseup", "click", "auxclick", "focusin", "focusout", "keydown", "scroll", "resize", "blur", "visibilitychange"];
    const stamp = () => Math.round(performance.now() - recording.start);
    const log = (kind, detail) => recording && recording.lines.push({ t: stamp(), kind, ...detail });
    const onEvent = (event) => log("event", {
      type: event.type,
      target: describeNode(event.target),
      related: "relatedTarget" in event ? describeNode(event.relatedTarget) : void 0,
      active: describeNode(document.activeElement),
      defaultPrevented: event.defaultPrevented || void 0,
      trusted: event.isTrusted
    });
    const onMutation = (records) => {
      for (const record of records) {
        if (!record.target.closest?.("header.hdr") && ![...record.addedNodes, ...record.removedNodes].some((node) => node.closest?.("header.hdr"))) continue;
        log("mutation", {
          what: record.type === "attributes" ? `attribute ${record.attributeName}` : "children",
          target: describeNode(record.target),
          added: [...record.addedNodes].map(describeNode),
          removed: [...record.removedNodes].map(describeNode),
          value: record.type === "attributes" ? maskText(record.target.getAttribute(record.attributeName) ?? "") : void 0
        });
      }
    };
    function stop() {
      if (!recording) return "aucun enregistrement en cours";
      for (const type of EVENTS) window.removeEventListener(type, onEvent, true);
      recording.observer.disconnect();
      clearTimeout(recording.timer);
      const done = recording;
      recording = null;
      window.kyaraPlusDiag.last = { version: SURVEY_VERSION, page: location.pathname, features: [...mounted.keys()], disabled: [...disabledFeatures], lines: done.lines };
      return `${done.lines.length} ligne(s) enregistrée(s) : kyaraPlusDiag.download() pour les sauvegarder`;
    }
    function menu(seconds = 15) {
      if (recording) stop();
      recording = { start: performance.now(), lines: [], observer: new MutationObserver(onMutation), timer: setTimeout(stop, seconds * 1e3) };
      for (const type of EVENTS) window.addEventListener(type, onEvent, true);
      recording.observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeOldValue: false });
      return `enregistrement pendant ${seconds} s : clique sur ton avatar maintenant, puis kyaraPlusDiag.download()`;
    }
    function saveJson(prefix, data) {
      const when = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      const name = `${prefix}-${when}.json`;
      const link = h("a", { href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" })), download: name });
      document.body.append(link);
      link.click();
      link.remove();
      return name;
    }
    function download() {
      if (recording) stop();
      const data = window.kyaraPlusDiag.last;
      if (!data) return "rien à sauvegarder : lance d’abord kyaraPlusDiag.menu()";
      return `fichier ${saveJson("kyara-diag", data)} téléchargé (${data.lines.length} lignes)`;
    }
    async function dialog() {
      const node = document.querySelector('[role="dialog"]');
      if (!node) return "aucune fenêtre ouverte : ouvre d’abord la proposition d’échange, puis relance kyaraPlusDiag.dialog()";
      const partnerId = profileIdFromPath() ?? null;
      const fairPlay = partnerId ? await fairPlayApi.withPlayer(partnerId).catch((error) => ({ erreur: describeError(error) })) : null;
      const html = node.outerHTML.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "<email>");
      const data = { version: SURVEY_VERSION, page: location.pathname, partnerId, fairPlay, html };
      return `fichier ${saveJson("kyara-dialog", data)} téléchargé (${formatNumber(html.length)} caractères)`;
    }
    const matching = (prefix) => features.filter((feature) => feature.id === prefix || feature.id.startsWith(`${prefix}-`)).map((feature) => feature.id);
    function setDisabled(prefix, disabled) {
      const ids = matching(prefix);
      if (ids.length === 0) return `aucune fonction ne s’appelle « ${prefix} » : ${features.map((feature) => feature.id).join(", ")}`;
      for (const id of ids) disabled ? disabledFeatures.add(id) : disabledFeatures.delete(id);
      writeSetting(DISABLED_SETTING, disabledFeatures.size ? { version: SURVEY_VERSION, ids: [...disabledFeatures] } : null);
      syncFeatures();
      return `${disabled ? "désactivé" : "réactivé"} : ${ids.join(", ")}`;
    }
    window.kyaraPlusDiag = {
      menu,
      stop,
      download,
      dialog,
      last: null,
      off: (prefix) => setDisabled(prefix, true),
      on: (prefix) => setDisabled(prefix, false),
      features: () => features.map((feature) => `${feature.id}: ${disabledFeatures.has(feature.id) ? "désactivée" : mounted.has(feature.id) ? "active ici" : "inactive ici"}`).join("\n")
    };
  }

  var features = [
    market_counter_default,
    market_offers_default,
    market_activity_default,
    collection_ghosts_default,
    collection_albums_default,
    collection_locks_default,
    collection_select_default,
    trade_dialog_default,
    trade_verdict_default,
    profile_collection_default,
    friends_list_default,
    // missions_series_default: retired on 05/11/2026, the site folds its claimed series list itself now (button "Voir les N séries réclamées")
    profile_background_default,
    offer_dialog_default,
    free_packs_default,
    auto_open_default,
    header_nav_default,
    header_chakra_default
  ];
  var mounted = /* @__PURE__ */ new Map();
  function syncFeatures() {
    const url = new URL(location.href);
    announceDisabledFeatures(url);
    for (const feature of features) {
      const active = feature.matches(url) && !isFeatureDisabled(feature.id);
      if (active && !mounted.has(feature.id)) {
        mounted.set(feature.id, feature.mount());
      } else if (!active && mounted.has(feature.id)) {
        mounted.get(feature.id)();
        mounted.delete(feature.id);
      }
    }
  }
  installDiagConsole();
  injectStylesheet(config_default.ui.iconsCss);
  injectStyles(styles_default);
  // Styles for the fair-play gauge and the multi-card profitable offers
  injectStyles(`
.kp-release-all summary { color: var(--fg2); font-size: var(--t-meta); cursor: pointer; }
.kp-releases--all { max-height: 220px; margin-top: 4px; overflow-y: auto; }
.kp-release__detail { display: block; color: var(--mut); }
.kp-releases li.is-soon, .kp-releases li.is-soon .kp-release__time, .kp-release-all summary.is-soon { color: var(--ok); }
.kp-release__gain { color: var(--fg); font-family: var(--mono); font-size: 15px; font-weight: 800; }
.kp-release__capacity { color: var(--mut); }
.kp-release__gain--idle { color: var(--mut); font-size: 12px; font-weight: 600; }
.kp-releases li.is-soon .kp-release__gain, .kp-releases li.is-soon .kp-release__capacity { color: var(--ok); }
/* Compact cards: about a third smaller than the first layout, so more offers fit on screen */
.kp-profit { position: relative; display: grid; grid-template-columns: 56px auto minmax(0, 1fr); align-items: center; gap: 2px var(--s-2); padding: 5px 8px; border: 1px solid var(--line); border-radius: var(--r-md); background: var(--panel2); }
.kp-profit > .kp-swap { align-self: center; font-size: 12px; color: var(--mut); }
.kp-side .kp-deals { gap: 6px; }
.kp-profit.is-new { border-color: var(--acc); box-shadow: 0 0 0 1px var(--acc-soft); }
.kp-profit__get { display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 0; text-align: center; }
.kp-profit__get .kp-label { display: none; }
.kp-profit__get .kp-art { width: 42px; border-width: 2px; }
.kp-profit__get .kp-badge { right: 1px; bottom: 1px; padding: 0 3px; background: color-mix(in srgb, var(--bg) 92%, transparent); font-size: 10px; font-weight: 800; line-height: 1.3; }
.kp-profit__get .kp-name { max-width: 100%; font-size: 10px; }
.kp-profit__get .kp-new { padding: 0 5px; font-size: 9px; }
.kp-profit__get .kp-note { max-width: 100%; overflow: hidden; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.kp-profit .kp-hide { position: absolute; top: 4px; right: 4px; width: 20px; height: 20px; font-size: 10px; }
.kp-profit__options { display: flex; flex-wrap: wrap; align-content: flex-start; gap: 4px 8px; padding-right: 22px; }
/* fixed width: every tile the same, names are cut with an ellipsis, the button keeps its gain and clips its word if ever needed */
.kp-ptile { display: flex; flex-direction: column; align-items: center; gap: 2px; width: 112px; min-width: 0; padding: 3px 3px; border: 1px solid transparent; border-radius: var(--r-md); text-align: center; }
.kp-banger { padding: 0 6px; border-radius: var(--r-pill); background: color-mix(in srgb, var(--acc) 18%, transparent); color: var(--acc); font: 800 9px var(--body); letter-spacing: 0.04em; text-transform: uppercase; }
/* The side panel stays on screen while the board scrolls (header height assumed 84px, adjustable with --kp-side-top) */
body.kp-offers main aside.chat-side { position: sticky; top: var(--kp-side-top, 84px); align-self: start; height: calc(100vh - var(--kp-side-top, 84px) - 8px); }
.kp-ptile .kp-art { width: 42px; border-width: 2px; }
.kp-ptile .kp-badge { right: 1px; bottom: 1px; padding: 0 3px; background: color-mix(in srgb, var(--bg) 92%, transparent); font-size: 10px; font-weight: 800; line-height: 1.3; }
.kp-ptile .kp-badge--last { color: var(--warn); }
.kp-ptile .kp-badge--lock { top: 2px; right: 2px; bottom: auto; }
.kp-ptile .kp-name { max-width: 100%; font-size: 10px; }
.kp-ptile > .kp-gain { align-self: center; padding: 0 6px; font-size: 11px; font-weight: 800; }
.kp-ptile .kp-btn { width: 100%; min-width: 0; margin-top: auto; padding: 1px 5px; gap: 3px; overflow: hidden; font-size: 10px; white-space: nowrap; }
.kp-ptile .kp-btn .kp-gain { flex: none; }
/* In the panel, only the recommended button is coloured; the others are neutral (the orange ×1 badge already warns about a last copy) */
.kp-ptile .kp-btn:not(.kp-btn--best) { border-color: #3a4660; background: #2a3346; color: #e8e8ea; }
.kp-ptile .kp-btn:not(.kp-btn--best):hover { background: #343f57; }
.kp-ptile .kp-btn .kp-gain { padding: 0 5px; font-size: 11px; font-weight: 800; }
.kp-ptile .kp-cost { padding: 0 5px 0 4px; font-size: 9px; }
.kp-ptile .kp-cost__dot { width: 6px; height: 6px; }
.kp-ptile .kp-banger { font-size: 8px; }
.kp-ptile .kp-btn--best { border-color: transparent; background: var(--gold, #f5c518); color: var(--bg); font-weight: 800; }
.kp-ptile .kp-btn--best:hover { background: #ffd84d; }
.kp-cost { display: inline-flex; align-items: center; justify-content: center; gap: 4px; align-self: center; max-width: 100%; padding: 1px 7px 1px 5px; border: 1px solid color-mix(in srgb, var(--kp-cost-color) 45%, transparent); border-radius: var(--r-pill); background: color-mix(in srgb, var(--kp-cost-color) 14%, transparent); color: var(--kp-cost-color); font: 700 10px var(--mono); line-height: 1.35; text-align: center; white-space: pre-line; --kp-cost-color: var(--mut); }
.kp-cost--compact { white-space: nowrap; }
.kp-costs { display: inline-flex; flex-wrap: wrap; justify-content: center; gap: 4px; }
.kp-cost--none { --kp-cost-color: var(--mut); }
.kp-cost--free { --kp-cost-color: #4f9cf7; }
.kp-cost--gift { --kp-cost-color: #f6a623; }
.kp-cost--over { --kp-cost-color: #ff5252; }
.kp-cost__dot { flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--kp-cost-color); }
.kp-option .kp-cost { margin-top: 2px; }
.kp-deal .kp-cost { align-self: flex-start; margin-top: 2px; }
.kp-bars { display: flex; flex-direction: column; gap: 3px; margin: 2px 0; }
.kp-bar { display: grid; grid-template-columns: 58px minmax(0, 1fr) auto; align-items: center; gap: var(--s-2); font-size: var(--t-meta); --kp-cost-color: var(--mut); }
.kp-bar--gift { --kp-cost-color: #f6a623; }
.kp-bar--free { --kp-cost-color: #4f9cf7; }
.kp-bar__label { display: inline-flex; align-items: center; gap: 5px; color: var(--fg2); font-weight: 600; }
.kp-bar__track { display: block; height: 6px; border-radius: var(--r-pill); background: color-mix(in srgb, var(--kp-cost-color) 16%, transparent); overflow: hidden; }
.kp-bar__fill { display: block; height: 100%; border-radius: inherit; background: var(--kp-cost-color); transition: width 300ms ease; }
.kp-bar__value { color: var(--fg); font-family: var(--mono); font-weight: 700; white-space: nowrap; }
.kp-fair { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: var(--s-2) var(--s-4); }
.kp-fair__main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.kp-legend { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; padding-left: var(--s-3); border-left: 1px solid var(--line2); color: var(--mut); font-size: 11px; cursor: help; --kp-cost-color: var(--mut); }
.kp-legend__intro { margin-bottom: 1px; color: var(--fg2); font-weight: 600; }
.kp-side__tabs { align-items: center; flex-wrap: wrap; }
.kp-side__gain { margin-left: auto; gap: 6px; font-size: var(--t-sm); }
.kp-side__gain .kp-input--short { width: 74px; padding: 4px 8px; text-align: right; }
.kp-side__gain[hidden] { display: none; }
.kp-side__scale { margin-left: auto; gap: 6px; font-size: var(--t-sm); }
.kp-side__scale + .kp-side__gain { margin-left: 0; }
.kp-side__scale[hidden] { display: none; }
.kp-side__scale-input { width: 90px; margin: 0; accent-color: var(--acc); cursor: pointer; }
.kp-side__scale-value { min-width: 38px; font-family: var(--mono); font-size: 11px; text-align: right; }
.kp-side .kp-deals { zoom: var(--kp-side-scale, 1); }
.kp-count--none { color: #f2f2f2; }
.kp-count--last { color: #f6a623; }
.kp-count--many { color: #f2f2f2; }
/* Offers panel polish: each offer is a clearly bounded card, the received card is set apart from the cards to give */
.kp-side .kp-deals { gap: 8px; }
/* Opaque cards in a cool dark blue, distinct from the panel's grey, with a slightly lighter border */
.kp-profit { border: 1px solid #2a3140; background: #161b26; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35); transition: border-color 120ms ease, background-color 120ms ease; }
.kp-profit:hover { border-color: #3a4558; background: #1a2030; }
.kp-profit.is-new { border-color: #2a3140; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35); }
.kp-profit.is-new::before { content: ""; position: absolute; top: 8px; bottom: 8px; left: 0; width: 3px; border-radius: 0 2px 2px 0; background: var(--acc); }
.kp-profit__get { padding: 2px 6px 2px 0; border-right: 1px solid #2a3140; }
.kp-profit > .kp-swap { opacity: 0.7; }
/* Tiles: an opaque dark bronze, a colour no card rarity uses on the site (grey, green, blue, purple, yellow, red are taken),
   clearly distinct from the navy of the offer card; the recommended one gets a cyan border (its Donner button stays green) */
/* Tiles one step lighter than the offer card, same hue: the hierarchy reads by light, the colour is kept for information */
.kp-ptile { border-color: #323c50; background: #1e2534; }
.kp-ptile:hover { border-color: #46526c; background: #242d3f; }
/* Same border for every tile: the recommended one is told only by its green Donner button */
.kp-ptile.is-best { border-color: #323c50; background: #1e2534; }
.kp-ptile.is-best:hover { border-color: #46526c; background: #242d3f; }
.kp-profit .kp-hide { opacity: 0.55; transition: opacity 120ms ease; }
.kp-profit:hover .kp-hide { opacity: 1; }
.kp-side .kp-side__block > .kp-title { padding-bottom: 4px; border-bottom: 1px solid var(--line2); }
/* With filters on, an album not yet looked at by the filters is not shown (no flash when a batch loads);
   while the batches load, "Afficher plus" is dimmed and a status shows in the filter bar */
body.kp-albums-filtering main ul.albums > li:not(.kp-checked) { display: none !important; }
body.kp-albums-loading-state main .more { opacity: 0.35; pointer-events: none; transition: opacity 150ms ease; }
.kp-albums-loading { font-size: var(--t-sm); }
/* Mon activité: sub-categories of the Échanges tab */
/* Toolbar of Mon activité: tabs centered, sub-categories hanging under the active tab like roots, tools below */
.kp-act__toolbar { flex-direction: column; align-items: stretch; }
.kp-act__tree { display: flex; flex-direction: column; align-items: center; }
.kp-act__tabs { justify-content: center; }
.kp-act__tools { justify-content: center; }
.kp-act__subs { position: relative; display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 8px; margin-top: 10px; padding: 8px 12px; border: 1px solid var(--line); border-radius: var(--r-lg); background: var(--panel); }
.kp-act__subs[hidden] { display: none; }
/* the notch: a small square rotated 45°, showing only its top-left corner above the panel, under the active tab */
.kp-act__subs::before { content: ""; position: absolute; top: -6px; left: var(--kp-notch-x, 50%); width: 10px; height: 10px; border-top: 1px solid var(--line); border-left: 1px solid var(--line); background: var(--panel); transform: translateX(-50%) rotate(45deg); }
.kp-act__sub { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; font-size: var(--t-meta); }
.kp-act__sub .n { opacity: 0.7; font-family: var(--mono); font-size: 10px; }
/* Header: chakra held, next to the balance */
.kp-held { display: inline-block; margin-left: 5px; padding: 0 6px; border-radius: var(--r-pill, 999px); background: color-mix(in srgb, var(--acc, #e8503a) 18%, transparent); color: var(--acc, #e8503a); font: 700 11px var(--mono, monospace); line-height: 1.6; vertical-align: middle; white-space: nowrap; cursor: help; }
.kp-held[hidden] { display: none; }
/* Album badges: reward already claimed (muted green) or still to claim (accent) */
.kp-claim { display: inline-flex; align-items: center; margin-left: 6px; padding: 0 7px; border-radius: var(--r-pill); font: 700 10px var(--body); line-height: 1.6; white-space: nowrap; vertical-align: middle; }
.kp-claim--done { background: rgba(73, 201, 122, 0.16); color: #49c97a; }
.kp-claim--todo { background: color-mix(in srgb, var(--acc) 20%, transparent); color: var(--acc); }
.kp-legend__item { display: inline-flex; align-items: center; gap: 4px; color: var(--kp-cost-color); font-weight: 600; }
.kp-fair__head { display: flex; align-items: center; justify-content: space-between; gap: var(--s-2); }
.kp-auto { display: flex; flex-direction: column; gap: var(--s-3); }
.kp-verdict { display: flex; flex-direction: column; gap: 6px; margin-top: var(--s-2); padding: var(--s-2) var(--s-3); border: 1px solid var(--line); border-radius: var(--r-md); background: var(--panel2); font-size: 13px; }
.kp-verdict__head { display: flex; align-items: center; gap: var(--s-2); color: var(--fg); }
.kp-verdict__status { flex: none; font-weight: 800; }
.kp-verdict__status--ok { color: var(--ok); }
.kp-verdict__status--no { color: var(--danger); }
.kp-verdict__status--unknown { color: var(--mut); }
.kp-verdict__line { flex: 1; min-width: 0; cursor: help; }
.kp-verdict__toggle { flex: none; margin-left: auto; padding: 2px 8px; border: 1px solid var(--line2); border-radius: var(--r-pill); background: transparent; color: var(--fg2); font-family: inherit; font-size: 11px; font-weight: 600; cursor: pointer; }
.kp-verdict__toggle:hover { background: var(--raise); }
.kp-verdict__toggle::after { content: " ▾"; }
.kp-verdict--open .kp-verdict__toggle::after { content: " ▴"; }
.kp-verdict__details { display: none; flex-direction: column; gap: 6px; padding-top: 6px; border-top: 1px solid var(--line2); }
.kp-verdict--open .kp-verdict__details { display: flex; }
.kp-verdict__row { display: grid; grid-template-columns: 150px minmax(0, 1fr); align-items: center; gap: var(--s-2); }
.kp-verdict__who { overflow: hidden; color: var(--fg2); font-weight: 600; text-overflow: ellipsis; white-space: nowrap; cursor: help; }
.kp-verdict .kp-costs { justify-content: flex-start; }
.kp-verdict .kp-cost { padding: 3px 10px 3px 8px; font-size: 13px; cursor: help; }
.kp-verdict .kp-costs { gap: 6px; }
.kp-verdict .kp-cost__dot { width: 8px; height: 8px; }
.kp-verdict__arrow { display: inline-flex; align-items: center; margin: 0 6px; font-size: 14px; line-height: 1; }
.kp-auto__section { display: flex; flex-direction: column; gap: var(--s-2); padding-top: var(--s-2); border-top: 1px solid var(--line2); }
.kp-auto__subtitle { margin: 0; color: var(--fg); font-size: var(--t-sm); font-weight: 700; }
.kp-auto__subtitle--log { display: flex; align-items: center; gap: var(--s-2); flex-wrap: wrap; }
.kp-auto__total { font-size: 11px; font-weight: 600; cursor: help; }
.kp-auto__total:empty { display: none; }
.kp-auto__total-gain { margin-left: auto; padding: 2px 10px; font-size: 13px; font-weight: 800; cursor: help; }
.kp-auto__total-gain[hidden] { display: none; }
.kp-deal--auto { grid-template-columns: 44px auto 44px minmax(0, 1fr) auto; }
.kp-deal--auto > .kp-gain { align-self: center; padding: 0 6px; font-size: 11px; font-weight: 800; white-space: nowrap; }
.kp-rule-rows { display: flex; flex-direction: column; gap: 4px; }
.kp-rule-rows__head { display: grid; grid-template-columns: 118px 1fr auto 86px; align-items: center; gap: var(--s-2); padding: 0 2px 2px; }
.kp-rule-rows__floor { text-align: right; }
.kp-rule-row { display: grid; grid-template-columns: 104px 10px 1fr 86px; align-items: center; gap: var(--s-2); padding: 4px 2px; border-top: 1px solid var(--line2); }
.kp-rule-row__floor { display: inline-flex; align-items: center; justify-content: flex-end; gap: 4px; color: var(--mut); font-size: 11px; white-space: nowrap; }
.kp-rule-row__gain { width: 56px; padding: 2px 6px; font-size: 12px; text-align: right; }
.kp-rule-row__give { display: inline-flex; align-items: center; gap: 6px; color: var(--fg); font-size: var(--t-sm); font-weight: 600; }
.kp-rule-row__arrow { color: var(--mut); font-size: var(--t-sm); }
.kp-rule-row__chips { display: flex; flex-wrap: wrap; gap: 6px; }
.kp-rule-chip { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px 3px 4px; border: 1px solid var(--kp-rarity); border-radius: var(--r-pill); background: transparent; color: var(--kp-rarity); font: 600 11px var(--body); cursor: pointer; opacity: 0.75; }
.kp-rule-chip:hover { opacity: 1; background: color-mix(in srgb, var(--kp-rarity) 15%, transparent); }
.kp-rule-chip__gem { display: inline-grid; place-items: center; width: 16px; height: 16px; border: 1.5px solid currentColor; border-radius: 50%; font: 900 9px var(--body); }
.kp-rule-chip[aria-pressed='true'] { opacity: 1; background: var(--kp-rarity); color: var(--bg); box-shadow: 0 0 8px color-mix(in srgb, var(--kp-rarity) 50%, transparent); }
.kp-rule-chip[aria-pressed='true']::before { content: "✓"; font-weight: 900; }
.kp-rule-chip--same { border-style: dashed; }
.kp-auto__shortcuts { display: inline-flex; align-items: center; gap: 4px; color: var(--mut); font-size: 11px; }
.kp-auto__shortcut { padding: 0; border: 0; background: none; color: var(--fg2); font: inherit; text-decoration: underline dotted; cursor: pointer; }
.kp-auto__shortcut:hover { color: var(--fg); }
.kp-auto--locked .kp-rule-rows, .kp-auto--locked .kp-check { opacity: 0.55; cursor: not-allowed; }
.kp-auto--locked .kp-rule-chip, .kp-auto--locked .kp-auto__shortcut, .kp-auto--locked .kp-rule-row__gain, .kp-auto--locked .kp-check__box, .kp-auto--locked .kp-check .kp-input { cursor: not-allowed; }
.kp-check { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; color: var(--fg); font-size: var(--t-sm); cursor: pointer; }
.kp-check__box { width: 16px; height: 16px; margin: 0; accent-color: var(--acc); cursor: pointer; }
.kp-check .kp-input--short { width: 76px; }
.kp-check .kp-input--short:disabled { opacity: 0.5; }
.kp-auto__summary { margin: 0; padding: var(--s-2) var(--s-3); border-left: 3px solid var(--acc); border-radius: var(--r-sm, 6px); background: color-mix(in srgb, var(--acc) 10%, transparent); color: var(--fg); font-size: var(--t-sm); line-height: 1.45; }
.kp-auto__summary.is-empty { border-left-color: var(--mut); background: color-mix(in srgb, var(--mut) 10%, transparent); color: var(--fg2); }
.kp-survey { flex: none; padding: 2px 8px; font-size: 11px; }
.kp-survey:disabled { opacity: 0.6; cursor: progress; }
`);
  installFairLogConsole();
  fairSurvey = installFairSurveyConsole();
  installSeriesSurveyConsole();
  onNavigate(syncFeatures);
})();

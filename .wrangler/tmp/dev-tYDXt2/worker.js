var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// server/worker.ts
import { DurableObject } from "cloudflare:workers";

// packages/engine-api/src/net/Protocol.ts
var TURN_MS = 100;
var ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
var ROOM_CODE_LENGTH = 5;
var ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{5}$/;
var HASH_EVERY_TURNS = 50;

// packages/engine-lib/src/configuration/Config.ts
var CONFIG = {
  ticksPerDay: 10,
  matchDays: 900,
  // ~2.5 years, 15 minutes at 1x
  // The synthetic grid city used by tests and as a fallback; real cities come
  // from OpenStreetMap (scripts/build-city.ts).
  gridCity: {
    width: 161,
    // multiples of streetEvery + 1, so the city is framed by streets
    height: 101,
    streetEvery: 5,
    // blocks are 4×4 tiles with a street all around
    downtowns: 5,
    parkShare: 0.08,
    // share of blocks that are parks
    bridgeEveryAvenues: 4,
    customersPerStreet: 2.5
    // customers on an average suburban street
  },
  // Richer streets have fewer customers, but each spends more. Serving a
  // customer costs the same everywhere, so rich streets have fat margins.
  // pushCost: sales push per customer to win them (rich customers are harder to win).
  // priceSensitivity: how much price matters to them, both for how much they buy
  // (price elasticity) and for how easily a cheaper rival can steal them.
  // prestige: how much a high price helps (and a low price hurts) loyalty.
  wealth: [
    { label: "Budget", spend: 0.7, pushCost: 0.63, density: 1.2, priceSensitivity: 1.3, prestige: 0.9 },
    { label: "Middle", spend: 1, pushCost: 1, density: 1, priceSensitivity: 1, prestige: 1 },
    { label: "Upscale", spend: 1.5, pushCost: 1.69, density: 0.8, priceSensitivity: 0.6, prestige: 1.25 },
    { label: "Luxury", spend: 2.2, pushCost: 2.79, density: 0.6, priceSensitivity: 0.3, prestige: 1.6 }
  ],
  start: { cash: 6e4, employees: 10, customers: 90, salesShare: 0.5, push: 60 },
  // starting territory: about this many customers
  staff: {
    salaryPerDay: 100,
    hireCost: 500,
    // recruiting + onboarding, paid once
    fireCost: 300,
    // severance
    trainingDays: 8,
    // new hires are paid but not productive yet
    customersPerOps: 20
    // customers one operations employee can serve
  },
  // Revenue per customer per day, before the street's wealth multiplier.
  prices: {
    // volume: price elasticity of demand. Cheaper prices make customers buy more.
    low: { revenue: 28, volume: 1.4, push: 1.2, loyalty: 1.25, label: "Low" },
    medium: { revenue: 40, volume: 1, push: 1, loyalty: 1, label: "Medium" },
    high: { revenue: 55, volume: 0.8, push: 0.9, loyalty: 0.9, label: "High" }
  },
  variableCostPerCustomer: 5,
  // per customer per day
  sales: {
    pushPerRepPerDay: 0.38,
    // Diminishing returns: a sales force of this size works at half efficiency
    // (coordination overhead, the easy customers are already won).
    salesScale: 200,
    maxPushDaysStored: 30,
    // push pool caps at sales reps × this
    neutralTileCost: 2,
    // × customers × wealth push factor
    rivalTileCost: 5,
    // × customers × wealth push factor × defense multiplier
    campaignShare: 0.5,
    // default share of the push pool committed per click (each company sets its own)
    minCampaignShare: 0.1,
    // Defence: stockpiled push protects customers (account managers). Each
    // point of push per street adds this much to the cost of stealing it,
    // and the defender loses this share of the attacker's cost from its pool.
    retentionPerPush: 0.15,
    maxRetention: 2,
    // a push reserve can at most double the cost of stealing a street
    retentionDrain: 0.3,
    // Advertising: buy sales push with cash. Each purchase makes the next one
    // pricier (the cheapest ad slots go first); the extra cost fades over time.
    // Ad campaigns are a fixed pack at a rising price: the first costs adBaseCost,
    // each recent one adds adStepCost; the extra cost fades over time.
    adPush: 400,
    adBaseCost: 2e5,
    adStepCost: 2e5,
    adHeatDecayPerDay: 0.01,
    adCooldownDays: 30,
    // your agency runs one big campaign a month
    maxAdPushMult: 2,
    // ads can fill the push pool up to twice its normal cap
    maxServiceLevel: 1.5
    // spare operations capacity makes customers loyal, up to this
  },
  churn: { ratePerDay: 0.05 },
  // share of over-capacity areas lost per day
  bankruptcyGraceDays: 10,
  bank: { loanChunk: 25e3, maxDebtRevenueDays: 60, interestPerYear: 0.24 },
  // The unfair-competition lawsuit: an expensive strike that hits a rival's
  // customers all over its territory, unless the court dismisses the case.
  lawsuit: {
    // Legal fees scale with the plaintiff's size: lawyers charge a small company
    // little up front and take a share of the damages instead (a contingency fee).
    minFee: 25e3,
    feeRevenueDays: 10,
    // fee = this many days of the plaintiff's revenue, at least minFee
    lawyerShare: 0.3,
    // share of the damages the lawyers keep
    courtDays: 10,
    // time until the ruling
    customerLoss: 0.15,
    // share of the defendant's customers driven away by bad press
    clusters: 12,
    // the loss is spread over this many places
    // Evidence decides the case: streets the defendant took from the plaintiff
    // recently (poaching), plus a predatory-pricing claim if it prices low.
    baseWinChance: 0.1,
    // with no evidence at all
    winChancePerStolenStreet: 0.04,
    predatoryPricingBonus: 0.1,
    // defendant charges Low prices
    maxWinChance: 0.85,
    evidenceHalfLifeDays: 70,
    // older grievances count less
    // Damages = the plaintiff's lost profits: daily revenue of the stolen streets at a medium price, for this many days.
    damagesDays: 45,
    dismissedCostShare: 0.6
    // if dismissed, the plaintiff also pays the defendant's costs: this share of its own fee
  },
  // Buying a block of a rival's streets: instant, so dearer than winning them with an
  // ad. Price = the push they'd cost × dollarsPerPush, +stepShare per recent deal
  // (fading over time). You buy out the local shops' contracts, so the money leaves
  // the game, and the streets can't be bought back with cash for lockDays.
  streetDeal: {
    blockSize: 6,
    lockDays: 60,
    dollarsPerPush: 1500,
    stepShare: 0.25,
    heatDecayPerDay: 0.03
  },
  // Guard: a dedicated account team for one neighbourhood. Your streets around
  // the chosen one cost rivals more push to steal, for a while.
  guard: {
    radius: 250,
    // metres
    days: 60,
    defenceMult: 1.6,
    costPerCustomer: 250,
    // per customer you own in the area
    minCost: 5e3
  },
  // Big companies are slower: a price change takes a day per this many employees to roll out.
  agility: { employeesPerDelayDay: 40, maxDelayDays: 15 },
  // Opportunity cards, Mario Kart style: companies further behind get offers
  // more often, and bigger ones. luck goes from leaderLuck (1st) to lastLuck (last).
  cards: {
    firstDay: 30,
    minGap: 70,
    maxGap: 110,
    offerDays: 30,
    // time to pick before the offer expires
    leaderLuck: 0.6,
    lastLuck: 1.6,
    viralPushShare: 0.35,
    // × push cap × luck
    starTeamShare: 0.05,
    // × staff × luck, trained and ready (at least 3)
    supplierDealDays: 30,
    // × luck; variable costs × supplierDealMult
    supplierDealMult: 0.6,
    investorValuationShare: 0.1,
    // cash = valuation × this × luck, between investorMin and investorMax
    investorMin: 1e5,
    investorMax: 5e5,
    investorStake: 0.15,
    grantRevenueDays: 5,
    // × daily revenue × luck (at least grantMin); only for small companies
    grantMin: 3e4,
    grantMax: 1e5,
    defectorStreets: 4
    // × luck: a rival's customers next to you switch to you
  },
  // The press, unions and hackers go after the biggest company.
  scrutiny: {
    firstDay: 120,
    minGap: 70,
    maxGap: 110,
    minLead: 1.4,
    // only when the leader is worth this many times the runner-up
    strikeWarningDays: 7,
    strikeDays: 8,
    strikeCapacity: 0.6,
    // operations capacity during a strike
    pressStreetShare: 0.05,
    // streets lost to an exposé
    breachRevenueDays: 5
    // fine for a data breach
  },
  // Things happening in one part of the city, announced in advance.
  localEvents: {
    firstDay: 60,
    minGap: 50,
    maxGap: 90,
    warningDays: 15,
    radiusShare: 0.09,
    // of the city's width
    metro: { demand: 1.4, spend: 1.4, days: null },
    // a new metro station: permanent
    roadworks: { demand: 1, spend: 0.6, days: 40 },
    festival: { demand: 1, spend: 1.5, days: 20 }
  },
  // Competition authority: stops one company from swallowing the market.
  antitrust: {
    warnShare: 0.35,
    // share of the city's customers that triggers a warning
    actShare: 0.4,
    // above this for `graceDays`, the company is fined and must sell streets
    graceDays: 30,
    fineRevenueDays: 20,
    divestShare: 0.1,
    // share of its streets it must give up
    cooldownDays: 120
  },
  // How bots invest at each difficulty. reserveMult: cash kept back (× their usual
  // reserve) before hiring; repDays: days of salary they want in hand per new sales
  // rep; growth: max new hires per day as a share of staff; leaderFocus: gang up on
  // a runaway leader.
  // expandEveryDays: days between two sales campaigns; salesMult: size of the sales team
  // they aim for; serviceBonus: extra operations staff kept (costly); streetJudgement:
  // 1 = picks streets by value per push like a pro, 0 = picks any street nearby;
  // aggressionMult: appetite for taking rivals' streets; advanced: uses ads, cards,
  // lawsuits, guards and street deals (easy bots only expand, hire and price);
  // dealAppetite: daily chance of buying a block of rival streets when cash allows;
  // hireBase: hires per day on top of growth; humanCostMult: how much costlier a human
  // player's streets look to the bot (easy bots rarely take yours).
  difficulty: {
    easy: { reserveMult: 4, repDays: 120, growth: 0.05, extraPushReserve: 0.2, leaderFocus: false, expandEveryDays: 3, salesMult: 0.4, serviceBonus: 0.5, streetJudgement: 1, aggressionMult: 1, advanced: false, dealAppetite: 0, hireBase: 1, humanCostMult: 2 },
    normal: { reserveMult: 2, repDays: 45, growth: 0.35, extraPushReserve: 0.1, leaderFocus: true, expandEveryDays: 1, salesMult: 1, serviceBonus: 0, streetJudgement: 1, aggressionMult: 1, advanced: true, dealAppetite: 0.05, hireBase: 3, humanCostMult: 1 },
    hard: { reserveMult: 1, repDays: 20, growth: 0.5, extraPushReserve: 0, leaderFocus: true, expandEveryDays: 1, salesMult: 1, serviceBonus: 0.1, streetJudgement: 1, aggressionMult: 1, advanced: true, dealAppetite: 0.05, hireBase: 3, humanCostMult: 1 }
  },
  events: { firstDay: 150, minGap: 120, maxGap: 180, warningDays: 10 },
  valuation: {
    earningsMultiple: 18,
    // investors pay 18x annual profit
    profitWindowDays: 30,
    // trailing average used for the multiple
    unicorn: 1e9
  }
};

// packages/engine-lib/src/configuration/Companies.ts
var RIVALS = [
  { name: "BudgetMart", color: [239, 68, 68], isBot: true, personality: "discounter" },
  { name: "Steady & Co", color: [34, 197, 94], isBot: true, personality: "balanced" },
  { name: "Luxe Ltd", color: [168, 85, 247], isBot: true, personality: "premium" }
];
var MORE_RIVALS = [
  ["QuickShop", "discounter"],
  ["Atlas Trading", "balanced"],
  ["Velvet & Sons", "premium"],
  ["MegaMart", "discounter"],
  ["Harbor Goods", "balanced"],
  ["Maison Rivi\xE8re", "premium"],
  ["Thrift Hub", "discounter"],
  ["Summit Supply", "balanced"],
  ["Orchid Boutique", "premium"],
  ["Bolt Express", "discounter"],
  ["Hearth & Home", "balanced"],
  ["Golden Cart", "premium"],
  ["Pixel Market", "discounter"],
  ["Nova Retail", "balanced"],
  ["Ember Outfitters", "premium"],
  ["Corner Store", "discounter"],
  ["Cobalt & Co", "balanced"],
  ["Grand Bazaar", "premium"],
  ["Penny Lane", "discounter"],
  ["Union Provisions", "balanced"]
];
var MAX_RIVALS = RIVALS.length + MORE_RIVALS.length;
var PLAYER_COLOR = [59, 130, 246];
function hsl(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = /* @__PURE__ */ __name((n) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  }, "f");
  return [f(0), f(8), f(4)];
}
__name(hsl, "hsl");
function extraColor(i) {
  let hue = (20 + i * 137.508) % 360;
  if (hue > 195 && hue < 240) hue = (hue + 50) % 360;
  const light = i % 2 === 0 ? 0.6 : 0.5;
  return hsl(hue, 0.72, light);
}
__name(extraColor, "extraColor");
function defaultCompanies(playerName = "You", playerIsBot = false, difficulty = "normal", rivals = 3) {
  const n = Math.max(1, Math.min(MAX_RIVALS, Math.floor(rivals)));
  const all = [
    ...RIVALS,
    ...MORE_RIVALS.map(([name, personality], i) => ({ name, color: extraColor(i), isBot: true, personality }))
  ];
  return [
    { name: playerName, color: PLAYER_COLOR, isBot: playerIsBot, personality: "balanced", difficulty },
    ...all.slice(0, n).map((r) => ({ ...r, difficulty }))
  ];
}
__name(defaultCompanies, "defaultCompanies");
var HUMAN_COLORS = [
  [59, 130, 246],
  // blue
  [249, 115, 22],
  // orange
  [6, 182, 212],
  // cyan
  [236, 72, 153],
  // pink
  [234, 179, 8],
  // yellow
  [20, 184, 166],
  // teal
  [99, 102, 241],
  // indigo
  [132, 204, 22]
  // lime
];
var MAX_HUMANS = HUMAN_COLORS.length;
function multiplayerCompanies(names, difficulty = "normal", bots = 0) {
  const humans = names.slice(0, MAX_HUMANS).map((name, i) => ({
    name,
    color: HUMAN_COLORS[i],
    isBot: false,
    personality: "balanced",
    difficulty
  }));
  const rivals = Math.max(0, Math.min(MAX_RIVALS, Math.floor(bots)));
  return [...humans, ...rivals > 0 ? defaultCompanies("", true, difficulty, rivals).slice(1) : []];
}
__name(multiplayerCompanies, "multiplayerCompanies");

// server/RoomCore.ts
var MAX_COMPANIES = 20;
var MAX_INTENTS_PER_TURN = 20;
var MAX_MESSAGE_BYTES = 4096;
var CATCH_UP_CHUNK = 2e3;
var MAX_TURNS = (CONFIG.matchDays + 30) * CONFIG.ticksPerDay;
var CITY_ID = /^[a-z0-9-]{1,40}$/;
var DIFFICULTIES = /* @__PURE__ */ new Set(["easy", "normal", "hard"]);
var RoomCore = class {
  constructor(code, startTimer, random = () => crypto.getRandomValues(new Uint32Array(1))[0]) {
    this.code = code;
    this.startTimer = startTimer;
    this.random = random;
  }
  code;
  startTimer;
  random;
  static {
    __name(this, "RoomCore");
  }
  players = [];
  conns = /* @__PURE__ */ new Map();
  settings = { cityId: "paris-opera", difficulty: "normal", bots: 3 };
  info = null;
  turns = [];
  pending = [];
  hashes = /* @__PURE__ */ new Map();
  desynced = false;
  stopTimer = null;
  get started() {
    return this.info !== null;
  }
  get turnCount() {
    return this.turns.length;
  }
  connect(conn) {
    this.conns.set(conn, null);
  }
  disconnect(conn) {
    const p = this.conns.get(conn);
    this.conns.delete(conn);
    if (!p || p.conn !== conn) return;
    p.conn = null;
    if (!this.started) {
      this.players = this.players.filter((x) => x !== p);
      this.players.forEach((x, i) => x.seat = i);
      this.broadcastLobby();
    } else if (!this.players.some((x) => x.conn)) {
      this.pause();
    }
  }
  message(conn, raw) {
    if (raw.length > MAX_MESSAGE_BYTES) return conn.close(1009, "Message too big");
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const p = this.conns.get(conn);
    if (msg.t === "join") return this.join(conn, msg.name, msg.key);
    if (!p) return conn.send({ t: "error", text: "Join the room first." });
    switch (msg.t) {
      case "settings":
        return this.updateSettings(p, msg.settings);
      case "start":
        return this.start(p);
      case "intent":
        return this.intent(p, msg.intent);
      case "hash":
        return this.hash(p, msg.turn, msg.hash);
    }
  }
  /** One turn: send everyone what was gathered since the last one. */
  tick() {
    if (!this.started) return;
    const turn = this.pending;
    this.pending = [];
    for (const p of this.players) p.sentThisTurn = 0;
    this.turns.push(turn);
    this.broadcast({ t: "turns", from: this.turns.length - 1, turns: [turn] });
    if (this.turns.length >= MAX_TURNS) this.pause();
  }
  // ---------- lobby ----------
  join(conn, rawName, rawKey) {
    const name = typeof rawName === "string" ? rawName.trim().slice(0, 16) || "Player" : "Player";
    const key = typeof rawKey === "string" ? rawKey.slice(0, 64) : "";
    if (!key) return conn.send({ t: "error", text: "Missing player key." });
    let p = this.players.find((x) => x.key === key);
    if (!p) {
      if (this.started) return this.reject(conn, "This match has already started.");
      if (this.players.length >= MAX_HUMANS) return this.reject(conn, `This room is full (${MAX_HUMANS} players).`);
      p = { key, name, seat: this.players.length, conn: null, sentThisTurn: 0 };
      this.players.push(p);
    }
    if (p.conn && p.conn !== conn) p.conn.close(4e3, "Opened elsewhere");
    p.conn = conn;
    if (!this.started) p.name = name;
    this.conns.set(conn, p);
    if (this.started) {
      this.sendMatch(p);
      if (!this.stopTimer && this.turns.length < MAX_TURNS) this.stopTimer = this.startTimer(() => this.tick());
    } else {
      this.broadcastLobby();
    }
  }
  reject(conn, text) {
    conn.send({ t: "error", text });
    conn.close(4001, text);
  }
  host() {
    return this.players[0];
  }
  updateSettings(p, s) {
    if (this.started || p !== this.host() || !s) return;
    if (typeof s.cityId === "string" && CITY_ID.test(s.cityId)) this.settings.cityId = s.cityId;
    if (DIFFICULTIES.has(s.difficulty)) this.settings.difficulty = s.difficulty;
    if (Number.isFinite(s.bots)) this.settings.bots = Math.max(0, Math.min(MAX_RIVALS, Math.floor(s.bots)));
    this.broadcastLobby();
  }
  broadcastLobby() {
    const players = this.players.map((x) => ({ seat: x.seat, name: x.name, connected: !!x.conn }));
    for (const x of this.players) {
      x.conn?.send({ t: "lobby", code: this.code, you: x.seat, host: 0, players, settings: this.settings });
    }
  }
  // ---------- match ----------
  start(p) {
    if (this.started || p !== this.host()) return;
    const humans = this.players.map((x) => x.name);
    const bots = Math.min(this.settings.bots, MAX_COMPANIES - humans.length);
    this.info = {
      seed: this.random() >>> 0,
      cityId: this.settings.cityId,
      companies: multiplayerCompanies(humans, this.settings.difficulty, bots)
    };
    for (const x of this.players) this.sendMatch(x);
    this.stopTimer = this.startTimer(() => this.tick());
  }
  /** The match so far: its setup, then every turn played (a reconnecting client replays them). */
  sendMatch(p) {
    if (!this.info || !p.conn) return;
    p.conn.send({ t: "start", info: this.info, you: p.seat });
    for (let from = 0; from < this.turns.length; from += CATCH_UP_CHUNK) {
      p.conn.send({ t: "turns", from, turns: this.turns.slice(from, from + CATCH_UP_CHUNK) });
    }
  }
  intent(p, intent) {
    if (!this.started || !intent || typeof intent.type !== "string") return;
    if (++p.sentThisTurn > MAX_INTENTS_PER_TURN) return;
    this.pending.push({ ...intent, companyId: p.seat });
  }
  hash(p, turn, hash) {
    if (this.desynced || !Number.isInteger(turn) || turn % HASH_EVERY_TURNS !== 0 || turn > this.turns.length) return;
    let seen = this.hashes.get(turn);
    if (!seen) this.hashes.set(turn, seen = /* @__PURE__ */ new Map());
    seen.set(p.seat, hash);
    if (new Set(seen.values()).size > 1) {
      this.desynced = true;
      this.broadcast({ t: "desync", turn });
    }
    for (const t of this.hashes.keys()) if (t < turn - HASH_EVERY_TURNS * 10) this.hashes.delete(t);
  }
  pause() {
    this.stopTimer?.();
    this.stopTimer = null;
  }
  broadcast(msg) {
    for (const p of this.players) p.conn?.send(msg);
  }
};

// server/worker.ts
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/rooms" && request.method === "POST") {
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = newRoomCode();
        const info = await env.ROOMS.get(env.ROOMS.idFromName(code)).info();
        if (info.players === 0) return Response.json({ code });
      }
      return Response.json({ error: "No free room code, try again." }, { status: 503 });
    }
    const match = url.pathname.match(/^\/api\/rooms\/([A-Za-z0-9]+)$/);
    if (match) {
      const code = match[1].toUpperCase();
      if (!ROOM_CODE_PATTERN.test(code)) return new Response("Unknown room", { status: 404 });
      if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
      const headers = new Headers(request.headers);
      headers.set("X-Room-Code", code);
      return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(new Request(request, { headers }));
    }
    if (url.pathname.startsWith("/api/")) return new Response("Not found", { status: 404 });
    return env.ASSETS.fetch(request);
  }
};
function newRoomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH));
  return [...bytes].map((b) => ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]).join("");
}
__name(newRoomCode, "newRoomCode");
var GameRoom = class extends DurableObject {
  static {
    __name(this, "GameRoom");
  }
  core = null;
  players = 0;
  /** How many players are connected (0 for a fresh or abandoned room). */
  async info() {
    return { players: this.players };
  }
  async fetch(request) {
    const code = request.headers.get("X-Room-Code") ?? "";
    this.core ??= new RoomCore(code, (tick) => {
      const id = setInterval(tick, TURN_MS);
      return () => clearInterval(id);
    });
    const core = this.core;
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    const conn = {
      send: /* @__PURE__ */ __name((msg) => {
        try {
          server.send(JSON.stringify(msg));
        } catch {
        }
      }, "send"),
      close: /* @__PURE__ */ __name((closeCode, reason) => {
        try {
          server.close(closeCode ?? 1e3, reason);
        } catch {
        }
      }, "close")
    };
    this.players++;
    core.connect(conn);
    server.addEventListener("message", (e) => core.message(conn, typeof e.data === "string" ? e.data : ""));
    let closed = false;
    const onClose = /* @__PURE__ */ __name(() => {
      if (closed) return;
      closed = true;
      this.players--;
      core.disconnect(conn);
    }, "onClose");
    server.addEventListener("close", onClose);
    server.addEventListener("error", onClose);
    return new Response(null, { status: 101, webSocket: client });
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-WfX64q/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-WfX64q/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  GameRoom,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map

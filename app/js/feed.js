// Data source: websocket client (reconnects every second) and the built-in simulated demo feed.

/* ---- Websocket: reconnect every second (§9.4) ---- */
let ws = null;
function connect() {
  if (demo) return;
  try {
    ws = new WebSocket(WS_URL);
  } catch (e) {
    setConn(false);
    setTimeout(connect, 1000);
    return;
  }
  ws.onopen = () => setConn(true);
  ws.onmessage = (e) => {
    if (demo) return;
    try {
      onMsg(JSON.parse(e.data));
    } catch (_) {}
  };
  ws.onclose = () => {
    setConn(false);
    ws = null;
    if (!demo) setTimeout(connect, 1000);
  };
  ws.onerror = () => {
    try {
      ws.close();
    } catch (_) {}
  };
}
function setConn(ok) {
  connected = ok;
  renderConn();
}
function renderConn() {
  const c = $("conn");
  c.className = "chip " + (demo ? "demo" : connected ? "ok" : "wait");
  $("connText").textContent = demo
    ? "Demo feed (simulated)"
    : connected
      ? "Live"
      : "Not connected · retrying";
  $("demoBtn").textContent = "Demo feed: " + (demo ? "on" : "off");
}
function onMsg(m) {
  msg = m;
  msgAt = performance.now();
}

/* ---- Built-in demo feed: schema-correct §6.4 messages, scripted 40 s loop ---- */
const gauss = () => {
  let u = 0,
    v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
function truth(t) {
  if (t < 4) return { b: null, L: -64, p: 0.05, ap: false, c: 0.06 };
  if (t < 13)
    return {
      b: wrap360(300 + 3 * (t - 4)),
      L: -38 + 1.5 * Math.sin(t * 3),
      p: 0.08,
      ap: false,
      c: 0.72,
    };
  if (t < 19)
    return {
      b: wrap360(90 + deg(Math.atan((1.4 * (t - 16)) / 2))),
      L: -33 - 2.2 * Math.abs(t - 16),
      p: 0.12,
      ap: false,
      c: 0.66,
    };
  if (t < 22) return { b: null, L: -63, p: 0.1, ap: false, c: 0.07 };
  if (t < 33)
    return {
      b: 212 + 0.4 * (t - 22),
      L: -50 + 3.5 * (t - 22),
      p: t < 26 ? 0.32 : 0.78,
      ap: t >= 22.5,
      c: t < 26 ? 0.78 : 0.85,
    };
  return {
    b: 212 + 4.4 + 9 * (t - 33),
    L: -11.5 - 4 * (t - 33),
    p: t < 35 ? 0.55 : 0.2,
    ap: t < 34.5,
    c: 0.7,
  };
}
const sim = {
  t: 0,
  s: 0,
  hist: [],
  last: null,
  veh: -99,
  since: 0,
};
function simTick() {
  const dt = 0.05;
  sim.t = (sim.t + dt) % 40;
  sim.s += dt;
  sim.since += dt;
  const T = truth(sim.t);
  let raw = null,
    conf;
  if (T.b != null && Math.random() > 0.03) {
    raw = wrap360(T.b + gauss() * 4);
    conf = clamp(T.c + gauss() * 0.05, 0.31, 0.98);
  } else conf = 0.06 + Math.random() * 0.08;
  if (raw != null) {
    sim.hist.push({ t: sim.s, b: raw });
    sim.last = raw;
  }
  sim.hist = sim.hist.filter((h) => sim.s - h.t <= 1);
  const rec = sim.hist.filter((h) => sim.s - h.t <= 0.25);
  let sm = null;
  if (rec.length) {
    let x = 0,
      y = 0;
    for (const h of rec) {
      x += Math.sin(rad(h.b));
      y += Math.cos(rad(h.b));
    }
    sm = wrap360(deg(Math.atan2(x, y)));
  }
  const a = truth((sim.t + 0.05) % 40),
    z = truth((sim.t + 39.95) % 40);
  const rate =
    sim.hist.length >= 8 && T.b != null && a.b != null && z.b != null
      ? angDiff(a.b, z.b) / 0.1 + gauss() * 1.5
      : null;
  const trend = sim.since < 1 ? null : (a.L - z.L) / 0.1 + gauss() * 0.4;
  const p = clamp(T.p + gauss() * 0.03, 0, 1);
  if (p >= CLASS_THRESH) sim.veh = sim.s;
  const veh = sim.s - sim.veh <= 3;
  const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
  onMsg({
    t_s: +sim.s.toFixed(3),
    bearing_deg: r1(sim.last),
    bearing_smooth_deg: r1(sm),
    confidence: +conf.toFixed(2),
    level_dbfs: r1(T.L + gauss() * 0.6),
    trend_dbps: r1(trend),
    rate_dps: r1(rate),
    approach: T.ap,
    class_label: veh ? "vehicle" : "other",
    class_prob: +p.toFixed(2),
    alert: T.ap && veh,
    mode: "L0",
  });
}
let simTimer = null;
function setDemo(on) {
  demo = on;
  clearInterval(simTimer);
  simTimer = null;
  if (on) {
    if (ws) {
      try {
        ws.close();
      } catch (_) {}
    }
    sim.t = 0;
    sim.since = 0;
    sim.hist = [];
    simTimer = setInterval(simTick, 50);
  } else {
    msg = null;
    connect();
  }
  renderConn();
}

// Aurora direction ring, corner readouts (HUD), and the animation frame loop.
//
// What is drawn, and from which message field:
//   - Glow all the way round   = the whole direction energy map (msg.srp) times loudness, smoothed.
//                                It moves only as much as the real sound and echoes move.
//   - Faint slow breathing     = DECORATIVE floor so the ring never looks dead in silence. Same in
//                                every direction, so it never points anywhere.
//   - Big glow + waves         = peaks of the smoothed map at >= PEAK_MIN of the loudest.
//                                Loudest peak = biggest glow, strongest and fastest waves.
//   - Pulse reach              = loudness. Pulse and wave speed = trend_dbps (getting louder).
//   - Colour                   = navy tracking, purple approach (not a vehicle), red alert.
// If msg.srp is missing (older server), the map falls back to one lobe at bearing_smooth_deg.

/* ---- Canvases: two blurred glow layers under one crisp layer. §6.5: x = cx + R sinθ, y = cy − R cosθ ---- */
const cv = $("cv"),
  c = cv.getContext("2d"),
  gcv = $("glow"),
  g = gcv.getContext("2d"),
  g2cv = $("glow2"),
  g2 = g2cv.getContext("2d");
let W = 0,
  H = 0;
function resize() {
  const r = cv.getBoundingClientRect(),
    dpr = Math.min(2, devicePixelRatio || 1);
  W = r.width;
  H = r.height;
  for (const [el, ctx] of [
    [cv, c],
    [gcv, g],
    [g2cv, g2],
  ]) {
    el.width = Math.round(W * dpr);
    el.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const R = ringR();
  gcv.style.filter = `blur(${Math.max(8, R * 0.11).toFixed(1)}px)`;
  g2cv.style.filter = `blur(${Math.max(2, R * 0.026).toFixed(1)}px)`;
}
new ResizeObserver(resize).observe(cv);
const pol = (cx, cy, r, b) => [cx + r * Math.sin(rad(b)), cy - r * Math.cos(rad(b))];
const F = {
  d: (w, s) => `${w} ${s}px Archivo, "Arial Narrow", Arial, sans-serif`,
  m: (w, s) => `${w} ${s}px "IBM Plex Mono", ui-monospace, monospace`,
  b: (w, s) => `${w} ${s}px "IBM Plex Sans", system-ui, sans-serif`,
};
function fit(text, maxW, size, f) {
  let s = size;
  c.font = f(s);
  while (c.measureText(text).width > maxW && s > 10) {
    s *= 0.93;
    c.font = f(s);
  }
  return s;
}
const ringR = () => Math.max(40, Math.min(W * 0.27, H * 0.27));
const uiScale = () => clamp(Math.min(W, H) / 425, 1, 2.2);

/* ---- Direction energy map state ---- */
const NB = 180; // 2° bins, same grid as ANGLE_GRID_DEG
const PEAK_MIN = 0.55; // single-source side lobes measured at ~0.35 median, ~0.5 p90 (V3 recordings)
const map = new Float32Array(NB); // fast-smoothed raw map, for the lobes
const slow = new Float32Array(NB); // slow-smoothed raw map, for picking real peaks
const bg = new Float32Array(NB); // background glow: map x loudness, smoothed
const target = new Float32Array(NB);
let ripples = [],
  phase = 0;
const ripT = {};
const PAL = {
  track: ["36,72,210", "90,140,255", "120,165,255"], // navy
  appr: ["78,28,150", "118,62,200", "170,125,240"], // dark purple
  alert: ["230,40,40", "255,110,80", "255,95,75"], // red
};
/* Sound gate (display only). Loudness is measured relative to the room's own noise floor, so steady
   background (fans, hum, distant chatter) stays dark and only real sounds light the ring.
   floor   = tracks the quiet level of the room: drops quickly when the room gets quieter, but only
             creeps up GATE_FLOOR_RISE dB per second, so a real sound lasting several seconds does
             not get absorbed into "background" and vanish
   above   = smoothed level minus floor, in dB
   gate    opens at floor + GATE_ON_DB, closes below floor + GATE_OFF_DB, and fades in/out
   returns loud 0..1 for the ring: 0 when closed, grows with how far above the floor the sound is */
let lvlSm = null,
  floorDb = null,
  gateOn = false,
  gateVal = 0;
function soundGate(m, dt) {
  if (!m) {
    lvlSm = null;
    gateOn = false;
    gateVal = 0;
    return 0;
  }
  const L = Math.max(-100, m.level_dbfs);
  lvlSm = lvlSm == null ? L : lvlSm + (L - lvlSm) * (1 - Math.exp(-dt / GATE_LEVEL_TAU));
  if (floorDb == null) floorDb = lvlSm;
  else if (lvlSm < floorDb) floorDb += (lvlSm - floorDb) * (1 - Math.exp(-dt / 0.3));
  else floorDb = Math.min(lvlSm, floorDb + GATE_FLOOR_RISE * dt);
  const above = lvlSm - floorDb;
  if (above >= GATE_ON_DB) gateOn = true;
  else if (above < GATE_OFF_DB) gateOn = false;
  if (m.alert || m.approach) gateOn = true; // never hide a sound the tracker is acting on
  const tgt = gateOn ? 1 : 0;
  gateVal += (tgt - gateVal) * (1 - Math.exp(-dt / (tgt > gateVal ? 0.1 : 0.4)));
  return gateVal * clamp(0.2 + (above - GATE_ON_DB) / 22, 0.2, 1);
}

function fillTarget(m) {
  target.fill(0);
  if (!m) return;
  if (Array.isArray(m.srp) && m.srp.length === NB) {
    for (let k = 0; k < NB; k++) target[k] = clamp(+m.srp[k] || 0, 0, 1);
    return;
  }
  if (m.bearing_smooth_deg == null) return; // fallback: one lobe, width from confidence
  const k0 = Math.round(wrap360(m.bearing_smooth_deg) / 2),
    sig = 2 + (1 - m.confidence) * 8;
  for (let d = -30; d <= 30; d++) target[(k0 + d + NB) % NB] = Math.exp(-(d * d) / (2 * sig * sig));
}

function findPeaks(loud) {
  const out = [];
  if (loud < 0.08) return out;
  let mx = 0;
  for (let k = 0; k < NB; k++) mx = Math.max(mx, slow[k]);
  if (mx < 0.2) return out;
  for (let k = 0; k < NB; k++) {
    const v = slow[k];
    if (
      v >= PEAK_MIN * mx &&
      v >= slow[(k + 1) % NB] &&
      v >= slow[(k + NB - 1) % NB] &&
      v >= slow[(k + 2) % NB] &&
      v >= slow[(k + NB - 2) % NB]
    )
      out.push({ k, s: v / mx });
  }
  return out;
}

/* 8-way word with hysteresis: only change once 6° past a sector boundary */
function updateSector(b) {
  if (b == null) {
    disp.sector = null;
    return;
  }
  if (disp.sector == null) {
    disp.sector = Math.round(wrap360(b) / 45) % 8;
    return;
  }
  if (Math.abs(angDiff(b, disp.sector * 45)) > 22.5 + 6) disp.sector = Math.round(wrap360(b) / 45) % 8;
}

let lastT = performance.now(),
  lastRO = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  const m = current();
  const tb = m ? m.bearing_smooth_deg : null;
  if (tb == null) disp.b = null;
  else if (disp.b == null || RM.matches) disp.b = tb;
  else disp.b = wrap360(disp.b + angDiff(tb, disp.b) * (1 - Math.exp(-dt / EASE_TAU_S)));
  const tc = m ? m.confidence : 0;
  disp.conf += (tc - disp.conf) * (1 - Math.exp(-dt / 0.2));
  updateSector(disp.b);

  const loud = soundGate(m, dt),
    alert = !!(m && m.alert),
    approach = !!(m && m.approach);
  fillTarget(m);
  const kf = 1 - Math.exp(-dt / 0.12),
    ks = 1 - Math.exp(-dt / 0.35),
    kb = 1 - Math.exp(-dt / 0.25);
  for (let k = 0; k < NB; k++) {
    map[k] += (target[k] - map[k]) * kf;
    slow[k] += (target[k] - slow[k]) * ks;
    bg[k] += (target[k] * loud - bg[k]) * kb;
  }
  const peaks = findPeaks(loud);
  const trend = m && m.trend_dbps != null ? Math.max(0, m.trend_dbps) : 0;
  phase += 2 * Math.PI * (0.7 + 0.3 * trend) * (alert ? 1.3 : 1) * dt;
  const base = clamp(1.1 - 0.17 * trend, 0.3, 1.1) * (alert ? 0.7 : 1);
  for (const p of peaks) {
    const id = Math.round(p.k / 8),
      s = p.s * loud;
    ripT[id] = (ripT[id] || 0) + dt;
    if (!RM.matches && s > 0.12 && ripT[id] > base / (0.5 + 0.5 * s)) {
      ripT[id] = 0;
      ripples.push({ k: p.k, s, r: 1, life: 1, half: Math.round(4 + 8 * s) });
    }
  }
  for (const r of ripples) {
    r.r += (0.25 + 0.35 * r.s) * dt;
    r.life -= dt * (0.9 - 0.35 * r.s);
  }
  ripples = ripples.filter((r) => r.life > 0);

  if (now - lastRO > 1000 / READOUT_HZ) {
    readouts();
    lastRO = now;
  }
  draw(m, now, loud, peaks, alert, approach);
  requestAnimationFrame(frame);
}

function seg(ctx, cx, cy, r, k) {
  // one 2° bin; bin k is centred on bearing 2k, clockwise from FRONT (top)
  ctx.beginPath();
  ctx.arc(cx, cy, r, rad(k * 2 - 1.3 - 90), rad(k * 2 + 1.3 - 90));
  ctx.stroke();
}
function roundTri(ctx, x, y, s, rr) {
  const p = [
    [x, y - s * 0.55],
    [x + s * 0.6, y + s * 0.48],
    [x - s * 0.6, y + s * 0.48],
  ];
  ctx.beginPath();
  ctx.moveTo((p[2][0] + p[0][0]) / 2, (p[2][1] + p[0][1]) / 2);
  for (let i = 0; i < 3; i++) ctx.arcTo(p[i][0], p[i][1], p[(i + 1) % 3][0], p[(i + 1) % 3][1], rr);
  ctx.closePath();
}
function spaced(ctx, px) {
  if ("letterSpacing" in ctx) ctx.letterSpacing = px + "px";
}

function draw(m, now, loud, peaks, alert, approach) {
  if (!W || !H) return;
  const t = now / 1000,
    b = disp.b,
    u = uiScale();
  const mode = alert ? "alert" : approach ? "appr" : "track";
  const C = PAL[mode];
  const P = RM.matches ? 0.8 : 0.5 + 0.5 * Math.cos(t * 2 * Math.PI * 2); // ~2 Hz alert pulse
  for (const ctx of [c, g, g2]) ctx.clearRect(0, 0, W, H);

  const R = ringR(),
    cx = W / 2,
    cy = H / 2 + (alert ? 0.04 : 0.015) * H;

  if (alert) {
    const v = c.createRadialGradient(cx, cy, R * 0.6, cx, cy, Math.max(W, H) * 0.6);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, `rgba(170,15,10,${0.14 + 0.18 * P})`);
    c.fillStyle = v;
    c.fillRect(0, 0, W, H);
  }

  const near = new Uint8Array(NB); // bins within ±14° of a real peak
  for (const p of peaks) for (let d = -7; d <= 7; d++) near[(p.k + d + NB) % NB] = 1;
  const gain = alert ? 0.8 + 0.2 * P : 1,
    pulse = RM.matches ? 0.5 : 0.5 + 0.5 * Math.sin(phase),
    breath = RM.matches ? 0.26 : 0.26 + 0.1 * Math.sin((t * 2 * Math.PI) / 4.5);

  for (let k = 0; k < NB; k++) {
    // background: real energy all the way round, with the faint decorative breath as a floor
    const j = Math.max(bg[k] * 1.5, breath),
      h = 0.1 * j;
    g.strokeStyle = `rgba(${C[0]},${Math.min(1, 0.9 * j) * gain})`;
    g.lineWidth = R * 0.12 * j + 2;
    seg(g, cx, cy, R + R * (0.02 + h), k);
    g2.strokeStyle = `rgba(${C[1]},${Math.min(1, 0.55 * j) * gain})`;
    g2.lineWidth = R * 0.03 * j + 1;
    seg(g2, cx, cy, R + R * h * 0.5, k);
    if (!near[k]) continue;
    // real sound: pulsing bloom
    const a = Math.min(1, map[k] * loud);
    if (a < 0.03) continue;
    const reach = a * (0.28 + 0.3 * pulse * a);
    g.strokeStyle = `rgba(${C[0]},${a * gain * (0.8 + 0.2 * pulse)})`;
    g.lineWidth = R * (0.45 + 0.25 * pulse) * a + 1;
    seg(g, cx, cy, R + R * reach, k);
    g.strokeStyle = `rgba(${C[1]},${0.8 * a * gain})`;
    g.lineWidth = R * (0.22 + 0.12 * pulse) * a + 1;
    seg(g, cx, cy, R + R * reach * 0.75, k);
    g2.strokeStyle = `rgba(${C[1]},${0.95 * a * gain})`;
    g2.lineWidth = R * 0.09 * a + 1;
    seg(g2, cx, cy, R + R * 0.03 * a, k);
  }
  for (const rp of ripples) {
    for (let d = -rp.half; d <= rp.half; d++) {
      const w = Math.exp(-(d * d) / (2 * (rp.half * 0.55) ** 2)),
        k = (rp.k + d + NB) % NB;
      g2.strokeStyle = `rgba(${C[1]},${0.9 * rp.life * rp.s * w})`;
      g2.lineWidth = 2 + 2 * rp.s;
      seg(g2, cx, cy, R * rp.r, k);
      g.strokeStyle = `rgba(${C[0]},${0.7 * rp.life * rp.s * w})`;
      g.lineWidth = R * 0.18 * rp.s + 1;
      seg(g, cx, cy, R * rp.r, k);
    }
  }

  // white ring
  c.strokeStyle = "rgba(255,255,255,.92)";
  c.lineWidth = Math.max(2, R * 0.015);
  c.beginPath();
  c.arc(cx, cy, R, 0, 7);
  c.stroke();

  // direction labels
  const lab = (txt, x, y, rot, a) => {
    c.save();
    c.translate(x, y);
    c.rotate(rot);
    c.fillStyle = `rgba(255,255,255,${a})`;
    c.font = F.b(600, Math.max(10, R * 0.075));
    spaced(c, Math.max(3, R * 0.025));
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(txt, 0, 0);
    c.restore();
  };
  if (!alert) lab("FRONT", cx, cy - R * 1.36, 0, 0.9);
  lab("BACK", cx, cy + R * 1.38, 0, 0.5);
  lab("RIGHT", cx + R * 1.4, cy, Math.PI / 2, 0.6);
  lab("LEFT", cx - R * 1.4, cy, -Math.PI / 2, 0.6);
  spaced(c, 0);
  c.textBaseline = "alphabetic";
  c.textAlign = "center";

  drawHud(C, u);

  // centre and alert
  if (alert && b != null) {
    const as = Math.max(22, H * 0.06),
      pul = RM.matches ? 0.9 : 0.6 + 0.4 * P,
      fs = Math.max(17, as * 0.68);
    c.font = F.d(800, fs);
    spaced(c, 1);
    const tw = c.measureText("VEHICLE APPROACHING").width,
      gap = as * 0.45;
    const ax = W / 2 - (as * 1.2 + gap + tw) / 2 + as * 0.6,
      ay = Math.max(84 * u, H * 0.15),
      tx = ax + as * 0.6 + gap;
    g.fillStyle = `rgba(255,40,30,${0.9 * pul})`;
    roundTri(g, ax, ay, as * 1.3, as * 0.09);
    g.fill();
    g2.fillStyle = `rgba(255,70,55,${0.75 * pul})`;
    roundTri(g2, ax, ay, as, as * 0.07);
    g2.fill();
    c.strokeStyle = `rgba(255,200,190,${0.35 + 0.25 * P})`;
    c.lineWidth = 1.4;
    roundTri(c, ax, ay, as, as * 0.07);
    c.stroke();
    spaced(c, 0);
    c.fillStyle = "#fff";
    c.font = F.d(800, Math.round(as * 0.6));
    c.fillText("!", ax, ay + as * 0.3);
    c.textAlign = "left";
    c.font = F.d(800, fs);
    spaced(c, 1);
    c.fillText("VEHICLE APPROACHING", tx, ay + fs * 0.35);
    spaced(c, 0);
    c.textAlign = "center";
    // arrow toward the vehicle
    c.save();
    c.translate(cx, cy);
    c.rotate(rad(b));
    c.fillStyle = "#fff";
    const L = R * 0.58,
      w = R * 0.08;
    c.beginPath();
    c.moveTo(0, -L);
    c.lineTo(w * 1.7, -L + w * 3.2);
    c.lineTo(w * 0.5, -L + w * 3.2);
    c.lineTo(w * 0.5, L * 0.25);
    c.lineTo(-w * 0.5, L * 0.25);
    c.lineTo(-w * 0.5, -L + w * 3.2);
    c.lineTo(-w * 1.7, -L + w * 3.2);
    c.closePath();
    c.fill();
    c.restore();
  } else if (b != null && disp.sector != null && (gateVal > 0.5 || approach)) {
    const word = DIRS[disp.sector],
      s = fit(word, R * 1.4, R * 0.24, (z) => F.d(800, z));
    c.fillStyle = "#fff";
    c.fillText(word, cx, cy + s * 0.34);
    if (approach) {
      c.fillStyle = `rgb(${C[2]})`;
      c.font = F.b(600, Math.max(11, R * 0.09));
      c.fillText("Getting closer · not a vehicle", cx, cy + s * 0.34 + R * 0.18);
    }
  } else {
    c.fillStyle = "#8a93a3";
    c.font = F.d(800, Math.max(16, R * 0.16));
    const label = m ? "Listening" : demo ? "Starting demo…" : connected ? "Waiting for data" : "Not connected";
    c.fillText(label, cx, cy + R * 0.05);
    if (!m && !demo && !connected) {
      c.font = F.b(500, Math.max(11, R * 0.065));
      c.fillText("Start the server: python -m dac.server --source live", cx, cy + R * 0.22);
    }
    if (!m) {
      c.fillStyle = "#5f6874";
      c.font = F.b(500, Math.max(11, R * 0.06));
      c.fillText("Point the array's front toward the top of the screen", cx, cy + R * 0.36);
    }
  }
}

function drawHud(C, u) {
  const pad = 22 * u,
    lblF = F.b(600, 9 * u),
    valF = F.m(700, 21 * u),
    topY = Math.max(88, 78 * u),
    botY = H - 54 * u;
  const corner = (lbl, val, x, y, align) => {
    c.textAlign = align;
    c.fillStyle = "#5f6874";
    c.font = lblF;
    spaced(c, 2 * u);
    c.fillText(lbl, x, y);
    spaced(c, 0);
    c.fillStyle = "#fff";
    c.font = valF;
    c.fillText(val, x, y + 25 * u);
  };
  corner("BEARING", hud.bearing == null ? "—" : hud.bearing + "°", pad, topY, "left");
  corner("CONFIDENCE", hud.conf == null ? "—" : hud.conf + "%", W - pad, topY, "right");
  corner("SOUND", hud.sound == null ? "—" : hud.sound, pad, botY, "left");
  if (hud.sound != null) {
    c.font = valF;
    const vw = c.measureText(hud.sound).width;
    c.textAlign = "left";
    c.fillStyle = "#7d8692";
    c.font = F.m(500, 12 * u);
    c.fillText(hud.prob + "%", pad + vw + 7 * u, botY + 25 * u);
  }
  // approach rule, bottom right
  c.textAlign = "right";
  c.fillStyle = "#5f6874";
  c.font = lblF;
  spaced(c, 2 * u);
  c.fillText("APPROACH", W - pad, botY);
  spaced(c, 0);
  const items = [
    ["Steady", hud.steady],
    ["Louder", hud.louder],
    ["Vehicle", hud.vehicle],
  ];
  let x = W - pad;
  c.font = F.b(600, 12 * u);
  for (let i = items.length - 1; i >= 0; i--) {
    const [n, on] = items[i];
    c.textAlign = "right";
    c.fillStyle = on ? "#eef1f4" : "#505862";
    c.fillText(n, x, botY + 23 * u);
    const tw = c.measureText(n).width;
    c.save();
    c.fillStyle = on ? `rgb(${C[2]})` : "#2d323a";
    if (on) {
      c.shadowColor = `rgb(${C[2]})`;
      c.shadowBlur = 8 * u;
    }
    c.beginPath();
    c.arc(x - tw - 8 * u, botY + 19 * u, 3.6 * u, 0, 7);
    c.fill();
    c.restore();
    x -= tw + 24 * u;
  }
  c.textAlign = "center";
}

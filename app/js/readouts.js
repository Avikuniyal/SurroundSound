// Smoothed values for the corner readouts (drawn on canvas in compass.js), the Details panel,
// and the screen-reader announcement. Refreshed at READOUT_HZ so numbers can be read.

const ema = { level: null, rate: null, trend: null };
function smooth(key, v, a = 0.35) {
  if (v == null) {
    ema[key] = null;
    return null;
  }
  ema[key] = ema[key] == null ? v : ema[key] + a * (v - ema[key]);
  return ema[key];
}
const sgn = (x, d = 1) =>
  (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x).toFixed(d);

// What the corner HUD shows; compass.js reads this every frame.
const hud = {
  bearing: null,
  conf: null,
  sound: null,
  prob: null,
  steady: false,
  louder: false,
  vehicle: false,
};

let lastSpoken = "";
function readouts() {
  const m = current();
  if (!m) {
    Object.assign(hud, { bearing: null, conf: null, sound: null, prob: null, steady: false, louder: false, vehicle: false });
    for (const id of ["d-level", "d-rate", "d-trend", "d-prob", "d-mode"]) $(id).textContent = "—";
    return;
  }
  const L = smooth("level", m.level_dbfs, 0.3),
    R = smooth("rate", m.rate_dps),
    T = smooth("trend", m.trend_dbps);
  hud.bearing = m.bearing_smooth_deg == null ? null : Math.round(m.bearing_smooth_deg) % 360;
  hud.conf = m.bearing_smooth_deg == null ? null : Math.round(m.confidence * 100);
  hud.sound = m.class_label === "vehicle" ? "Vehicle" : "Other";
  hud.prob = Math.round(m.class_prob * 100);
  hud.steady = m.rate_dps != null && Math.abs(m.rate_dps) <= RATE_MAX_DPS;
  hud.louder = m.trend_dbps != null && m.trend_dbps >= TREND_MIN_DBPS;
  hud.vehicle = m.class_label === "vehicle";

  $("d-level").textContent = `${(L < 0 ? "−" : "") + Math.abs(L).toFixed(0)} dBFS`;
  $("d-rate").textContent = R == null ? "—" : `${sgn(R, 0)} °/s`;
  $("d-trend").textContent = T == null ? "—" : `${sgn(T)} dB/s`;
  $("d-prob").textContent = m.class_prob.toFixed(2);
  $("d-mode").textContent = m.mode + (m.mode !== "L0" ? " (alert off)" : "");

  const say = m.alert ? `Vehicle approaching from ${sectorName()}` : "";
  if (say !== lastSpoken) {
    $("live").textContent = say;
    lastSpoken = say;
  }
}
function current() {
  return msg && (performance.now() - msgAt) / 1000 < STALE_S ? msg : null;
}
function sectorName() {
  return disp.sector == null ? "" : DIRS[disp.sector].toLowerCase();
}

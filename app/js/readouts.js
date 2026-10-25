// Right-hand readouts column and the approach-rule checklist, refreshed at READOUT_HZ.

/* ---- Readouts (HTML), refreshed at READOUT_HZ with light smoothing ---- */
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
let lastSpoken = "";
function readouts() {
  const m = current();
  if (!m) {
    for (const id of [
      "r-conf",
      "r-level",
      "r-rate",
      "r-trend",
      "r-class",
      "r-bear",
    ])
      $(id).textContent = "—";
    $("m-conf").style.width = "0";
    $("m-level").style.width = "0";
    ["c-steady", "c-louder", "c-vehicle", "c-flag"].forEach(
      (id) => ($(id).className = "check" + (id === "c-flag" ? " flag" : "")),
    );
    $("flagText").textContent = "No data";
    $("modeChip").textContent = "Mode —";
    return;
  }
  const L = smooth("level", m.level_dbfs, 0.3),
    R = smooth("rate", m.rate_dps),
    T = smooth("trend", m.trend_dbps);
  $("r-conf").textContent = Math.round(m.confidence * 100) + "%";
  $("m-conf").style.width = m.confidence * 100 + "%";
  $("r-level").innerHTML =
    `${(L < 0 ? "−" : "") + Math.abs(L).toFixed(0)}<small>dBFS</small>`;
  $("m-level").style.width = clamp(((L + 70) / 70) * 100, 0, 100) + "%";
  $("r-rate").innerHTML = R == null ? "—" : `${sgn(R, 0)}<small>°/s</small>`;
  $("r-trend").innerHTML = T == null ? "—" : `${sgn(T)}<small>dB/s</small>`;
  $("r-class").innerHTML =
    `${m.class_label === "vehicle" ? "Vehicle" : "Other"}<small>${Math.round(m.class_prob * 100)}%</small>`;
  $("r-bear").innerHTML =
    m.bearing_smooth_deg == null
      ? "—"
      : `${String(Math.round(m.bearing_smooth_deg) % 360).padStart(3, "0")}<small>°</small>`;
  $("modeChip").textContent = "Mode " + m.mode;
  const steady = m.rate_dps != null && Math.abs(m.rate_dps) <= RATE_MAX_DPS;
  const louder = m.trend_dbps != null && m.trend_dbps >= TREND_MIN_DBPS;
  $("c-steady").className = "check" + (steady ? " on" : "");
  $("c-louder").className = "check" + (louder ? " on" : "");
  $("c-vehicle").className =
    "check" + (m.class_label === "vehicle" ? " on" : "");
  $("c-flag").className =
    "check flag" + (m.alert ? " on alarm" : m.approach ? " on" : "");
  $("flagText").textContent = m.alert
    ? "Vehicle approaching"
    : m.approach
      ? "Approaching, not a vehicle"
      : m.mode !== "L0"
        ? "Alert off in " + m.mode
        : "Not approaching";
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

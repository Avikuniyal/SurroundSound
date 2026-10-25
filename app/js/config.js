// Constants mirrored from dac/config.py (keep in sync), shared helpers and shared state. Loaded first.
// Plain scripts, not modules, so the page still works when opened straight from disk (file://).

/* ---- Constants mirrored from dac/config.py for display only (keep in sync) ---- */
const WS_URL = "ws://localhost:8765";
const RATE_MAX_DPS = 15,
  TREND_MIN_DBPS = 3.0,
  CLASS_THRESH = 0.5;
const STALE_S = 2.0; // no message for this long = treat as no data
const EASE_TAU_S = 0.12; // display easing of the arrow/arc (visual only; bearings are not re-estimated)
const READOUT_HZ = 5; // numbers refresh at 5 Hz so they can be read
const RM = matchMedia("(prefers-reduced-motion: reduce)");
const $ = (id) => document.getElementById(id);
const rad = (d) => (d * Math.PI) / 180,
  deg = (r) => (r * 180) / Math.PI;
const wrap360 = (d) => ((d % 360) + 360) % 360;
const angDiff = (a, b) => ((a - b + 540) % 360) - 180; // signed a-b in (-180,180]
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const DIRS = [
  "Front",
  "Front-right",
  "Right",
  "Behind-right",
  "Behind",
  "Behind-left",
  "Left",
  "Front-left",
];

/* ---- State ---- */
let msg = null,
  msgAt = 0,
  connected = false,
  demo = false;
const disp = { b: null, conf: 0, sector: null };

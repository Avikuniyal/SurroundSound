// Constants mirrored from dac/config.py (keep in sync), shared helpers and shared state. Loaded first.
// Plain scripts, not modules, so the page still works when opened straight from disk (file://).

/* ---- Constants mirrored from dac/config.py for display only (keep in sync) ---- */
const WS_URL = "ws://localhost:8765";
const RATE_MAX_DPS = 15,
  TREND_MIN_DBPS = 1.5,
  CLASS_THRESH = 0.2;
const STALE_S = 2.0; // no message for this long = treat as no data
const EASE_TAU_S = 0.12; // display easing of the arrow/arc (visual only; bearings are not re-estimated)
const READOUT_HZ = 5; // numbers refresh at 5 Hz so they can be read
/* Ring sound gate, DISPLAY ONLY (the tracker and alert do not use these). A sound has to be this many dB
   above the room's own noise floor before the ring lights up and pulses. Raise GATE_ON_DB if small
   sounds still flicker; lower it if real sounds don't show. */
const GATE_ON_DB = 8, // turn on at floor + 8 dB
  GATE_OFF_DB = 4, // turn off below floor + 4 dB (gap stops it flickering at the edge)
  GATE_FLOOR_RISE = 0.25, // dB/s the room floor may creep up (it drops fast when the room goes quiet)
  GATE_LEVEL_TAU = 0.15; // level smoothing (s): a single click can't open the gate
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
  "Back-right",
  "Back",
  "Back-left",
  "Left",
  "Front-left",
];

/* ---- State ---- */
let msg = null,
  msgAt = 0,
  connected = false,
  demo = false;
const disp = { b: null, conf: 0, sector: null };

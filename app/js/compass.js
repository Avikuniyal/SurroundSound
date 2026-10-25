// Canvas compass and the animation frame loop.

/* ---- Canvas compass. §6.5: x = cx + R sinθ, y = cy − R cosθ; FRONT at top ---- */
const cv = $("cv"),
  c = cv.getContext("2d");
let W = 0,
  H = 0;
function resize() {
  const r = cv.getBoundingClientRect(),
    dpr = Math.min(2, devicePixelRatio || 1);
  W = r.width;
  H = r.height;
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
}
new ResizeObserver(resize).observe(cv);
const pol = (cx, cy, r, b) => [
  cx + r * Math.sin(rad(b)),
  cy - r * Math.cos(rad(b)),
];
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

/* 8-way word with hysteresis: only change once 6° past a sector boundary (A/B note: "shifts a bit") */
function updateSector(b) {
  if (b == null) {
    disp.sector = null;
    return;
  }
  if (disp.sector == null) {
    disp.sector = Math.round(wrap360(b) / 45) % 8;
    return;
  }
  if (Math.abs(angDiff(b, disp.sector * 45)) > 22.5 + 6)
    disp.sector = Math.round(wrap360(b) / 45) % 8;
}

let lastT = performance.now(),
  lastRO = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  const m = current();
  const target = m ? m.bearing_smooth_deg : null;
  // display easing (shortest arc); snaps when a bearing first appears
  if (target == null) {
    disp.b = null;
  } else if (disp.b == null || RM.matches) {
    disp.b = target;
  } else {
    disp.b = wrap360(
      disp.b + angDiff(target, disp.b) * (1 - Math.exp(-dt / EASE_TAU_S)),
    );
  }
  const tc = m ? m.confidence : 0;
  disp.conf += (tc - disp.conf) * (1 - Math.exp(-dt / 0.2));
  updateSector(disp.b);
  draw(m, now);
  const alertOn = !!(m && m.alert);
  $("alert").hidden = !alertOn;
  if (alertOn)
    $("alertDir").textContent = disp.sector == null ? "" : DIRS[disp.sector];
  if (now - lastRO > 1000 / READOUT_HZ) {
    readouts();
    lastRO = now;
  }
  requestAnimationFrame(frame);
}

function draw(m, now) {
  if (!W || !H) return;
  const alert = !!(m && m.alert),
    approach = !!(m && m.approach),
    b = disp.b;
  const P = RM.matches
    ? 0.8
    : 0.5 + 0.5 * Math.cos((now / 1000) * 2 * Math.PI * 2); // ~2 Hz pulse
  c.clearRect(0, 0, W, H);
  c.fillStyle = "#050607";
  c.fillRect(0, 0, W, H);
  if (alert) {
    const g = c.createRadialGradient(
      W / 2,
      H / 2,
      0,
      W / 2,
      H / 2,
      Math.max(W, H) * 0.7,
    );
    g.addColorStop(0, `rgba(224,38,27,${0.25 + 0.45 * P})`);
    g.addColorStop(1, `rgba(150,10,5,${0.55 + 0.35 * P})`);
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  }
  const top = alert ? Math.min(H * 0.2, 120) : 0; // leave room for the banner
  const cx = W / 2,
    cy = top + (H - top) / 2 + Math.min(W, H) * 0.01;
  const R = Math.max(40, Math.min(W * 0.4, (H - top) * 0.39));

  // degree ring (Repeater detail, kept quiet)
  c.lineWidth = Math.max(1.5, R * 0.012);
  c.strokeStyle = "rgba(255,255,255,.28)";
  c.beginPath();
  c.arc(cx, cy, R, 0, 7);
  c.stroke();
  for (let d = 0; d < 360; d += 10) {
    const major = d % 30 === 0,
      len = major ? R * 0.07 : R * 0.035;
    const [x1, y1] = pol(cx, cy, R, d),
      [x2, y2] = pol(cx, cy, R - len, d);
    c.strokeStyle = major ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.22)";
    c.lineWidth = major ? Math.max(1.5, R * 0.01) : 1;
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
    if (major && d % 90 !== 0) {
      const [tx, ty] = pol(cx, cy, R * 0.82, d);
      c.fillStyle = "rgba(255,255,255,.38)";
      c.font = F.m(400, Math.max(10, R * 0.055));
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(d, tx, ty);
    }
  }
  c.textBaseline = "alphabetic";
  c.textAlign = "center";
  c.fillStyle = "#fff";
  c.font = F.d(800, Math.max(13, R * 0.11));
  c.fillText("FRONT", cx, cy - R - R * 0.09);
  c.fillStyle = "rgba(255,255,255,.62)";
  c.font = F.d(800, Math.max(11, R * 0.08));
  c.fillText("BEHIND", cx, cy + R + R * 0.16);
  for (const [lab, s] of [
    ["RIGHT", 1],
    ["LEFT", -1],
  ]) {
    c.save();
    c.translate(cx + s * (R + R * 0.11), cy);
    c.rotate((s * Math.PI) / 2);
    c.fillText(lab, 0, R * 0.03);
    c.restore();
  }

  if (b != null) {
    // confidence arc (Beacon): narrower and brighter = more confident; opacity tracks confidence (§9.4)
    const conf = clamp(disp.conf, 0, 1),
      half = alert ? 14 : 7 + (1 - conf) * 40;
    const col = alert ? "255,255,255" : approach ? "255,176,32" : "255,255,255";
    c.lineCap = "butt";
    c.lineWidth = R * (alert ? 0.22 : 0.16);
    c.strokeStyle = `rgba(${col},${alert ? 1 : Math.max(0.15, conf)})`;
    c.beginPath();
    c.arc(cx, cy, R * 0.9, rad(b - half - 90), rad(b + half - 90));
    c.stroke();
    // precise pointer inside the arc
    const [px, py] = pol(cx, cy, R * 0.78, b);
    c.save();
    c.translate(px, py);
    c.rotate(rad(b));
    c.fillStyle = `rgba(${col},${Math.max(0.25, conf)})`;
    c.beginPath();
    c.moveTo(0, -R * 0.07);
    c.lineTo(R * 0.055, R * 0.03);
    c.lineTo(-R * 0.055, R * 0.03);
    c.closePath();
    c.fill();
    c.restore();
  }

  // centre
  if (alert && b != null) {
    c.save();
    c.translate(cx, cy);
    c.rotate(rad(b));
    c.fillStyle = "#fff";
    const L = R * 0.58,
      w = R * 0.085;
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
  } else if (b != null && disp.sector != null) {
    const word = DIRS[disp.sector],
      s = fit(word, R * 1.4, R * 0.25, (z) => F.d(800, z));
    c.fillStyle = approach ? "#ffb020" : "#fff";
    c.fillText(word, cx, cy + s * 0.32);
    c.fillStyle = "#9aa2ad";
    c.font = F.m(400, Math.max(11, R * 0.075));
    c.fillText(
      `${String(Math.round(b) % 360).padStart(3, "0")}° · ${Math.round(disp.conf * 100)}% confident`,
      cx,
      cy + s * 0.32 + R * 0.16,
    );
    if (approach) {
      c.fillStyle = "#ffb020";
      c.font = F.b(600, Math.max(11, R * 0.065));
      c.fillText("Getting closer · not a vehicle", cx, cy - s * 0.62);
    }
  } else {
    c.fillStyle = "#7d8591";
    c.font = F.d(800, R * 0.15);
    const label = m
      ? "Listening"
      : demo
        ? "Starting demo…"
        : connected
          ? "Waiting for data"
          : "Not connected";
    c.fillText(label, cx, cy + R * 0.05);
    if (!m && !demo && !connected) {
      c.font = F.b(500, Math.max(11, R * 0.06));
      c.fillText(
        "Start the server: python -m dac.server --source live",
        cx,
        cy + R * 0.2,
      );
    }
  }
}

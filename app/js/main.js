// Keyboard shortcuts, the Details toggle and startup. Loaded last.
// No on-screen buttons for full screen or the demo feed: F and D still work for testing.

/* ---- Details panel ---- */
$("detBtn").onclick = () => {
  const d = $("details"),
    open = d.hidden;
  d.hidden = !open;
  $("detBtn").setAttribute("aria-expanded", String(open));
  $("detBtn").textContent = open ? "Hide details" : "Details";
};

/* ---- Hidden shortcuts ---- */
function toggleFullscreen() {
  const d = document;
  (d.fullscreenElement
    ? d.exitFullscreen()
    : d.documentElement.requestFullscreen?.()
  )?.catch?.(() => {});
}
addEventListener("keydown", (e) => {
  if (e.target.closest && e.target.closest("input,textarea")) return;
  if (e.key === "d" || e.key === "D") setDemo(!demo);
  if (e.key === "f" || e.key === "F") toggleFullscreen();
});

/* ?demo=1 starts on the simulated feed; so does a hosted https preview, which can't reach localhost */
const wantDemo =
  /[?&]demo=1/.test(location.search) || location.protocol === "https:";
renderConn();
if (wantDemo) setDemo(true);
else connect();
requestAnimationFrame(frame);

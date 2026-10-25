// Buttons, keyboard shortcuts and startup. Loaded last.

/* ---- Controls ---- */
$("demoBtn").onclick = () => setDemo(!demo);
$("fsBtn").onclick = () => {
  const d = document;
  (d.fullscreenElement
    ? d.exitFullscreen()
    : d.documentElement.requestFullscreen?.()
  )?.catch?.(() => {});
};
addEventListener("keydown", (e) => {
  if (e.target.closest && e.target.closest("input,textarea")) return;
  if (e.key === "d" || e.key === "D") setDemo(!demo);
  if (e.key === "f" || e.key === "F") $("fsBtn").click();
});

/* ?demo=1 starts on the simulated feed; so does a hosted https preview, which can't reach localhost */
const wantDemo =
  /[?&]demo=1/.test(location.search) || location.protocol === "https:";
renderConn();
if (wantDemo) setDemo(true);
else connect();
requestAnimationFrame(frame);

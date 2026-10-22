import numpy as np
from dac.capture import LiveSource
from dac.bearing import estimate_bearing
from dac.tracker import loudness_dbfs

src = LiveSource()
print("opened device index", src.device)

count = 0
for t_s, block in src:
    r = estimate_bearing(block)
    peak = np.max(np.abs(block))
    print(round(t_s, 2), "level", round(loudness_dbfs(block), 1), "peak", round(float(peak), 3),
          "bearing", r.bearing_deg, "conf", round(r.confidence, 2))
    count += 1
    if count >= 150:
        break

src.close()
print("overflows:", src.overflows)
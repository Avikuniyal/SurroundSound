import csv
import os
import sys

import numpy as np
import soundfile as sf

from dac import config
from dac.capture import LiveSource
from dac.bearing import estimate_bearing
from dac.tracker import loudness_dbfs

SECONDS = 15
OUT_DIR = os.path.join('experiments', 'static_angle', 'data')

true_deg = float(sys.argv[1])
sound = sys.argv[2]
os.makedirs(OUT_DIR, exist_ok=True)
csv_path = os.path.join(OUT_DIR, 'results.csv')
wav_path = os.path.join(OUT_DIR, 'v3_' + str(int(true_deg)).zfill(3) + '_' + sound + '.wav')

n_blocks = int(SECONDS * config.FS_HZ / config.HOP_N)
new_file = not os.path.exists(csv_path)
rows = []
audio = []

src = LiveSource()
print('recording', SECONDS, 's at true bearing', true_deg, 'sound', sound)
count = 0
for t_s, block in src:
    r = estimate_bearing(block)
    rows.append([true_deg, sound, round(t_s, 3), r.bearing_deg, round(r.confidence, 3),
                 round(loudness_dbfs(block), 1), round(float(np.max(np.abs(block))), 4)])
    if count == 0:
        audio.append(block)
    else:
        audio.append(block[config.BLOCK_N - config.HOP_N:])
    count += 1
    if count >= n_blocks:
        break
src.close()

with open(csv_path, 'a', newline='') as f:
    w = csv.writer(f)
    if new_file:
        w.writerow(['true_deg', 'sound', 't_s', 'bearing_deg', 'conf', 'level_dbfs', 'peak'])
    w.writerows(rows)
sf.write(wav_path, np.concatenate(audio), config.FS_HZ)

good = [r for r in rows if r[3] is not None and r[4] >= config.CONF_MIN]
errs = [((r[3] - true_deg + 180) % 360) - 180 for r in good]
print('blocks', len(rows), 'confident', len(good), 'overflows', src.overflows)
if errs:
    print('mean error', round(float(np.mean(errs)), 1), 'deg, jitter', round(float(np.std(errs)), 1),
          'deg, max peak', max(r[6] for r in rows))
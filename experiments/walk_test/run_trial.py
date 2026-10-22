import csv
import os
import sys
import time

import numpy as np
import soundfile as sf

from dac import config
from dac.bearing import estimate_bearing
from dac.tracker import Tracker

OUT_DIR = os.path.join('experiments', 'walk_test', 'data')

name = sys.argv[1]
expected = sys.argv[2]
seconds = float(sys.argv[3])
wav_in = None
if len(sys.argv) > 5 and sys.argv[4] == '--wav':
    wav_in = sys.argv[5]

if expected not in ('approach', 'cross'):
    print('expected must be approach or cross')
    sys.exit(1)

os.makedirs(OUT_DIR, exist_ok=True)

if wav_in is None:
    from dac.capture import LiveSource
    src = LiveSource()
    n_blocks = int(seconds * config.FS_HZ / config.HOP_N)
    input('Enter to start ' + name + ' (' + expected + ')')
    for k in range(3, 0, -1):
        print(k)
        time.sleep(1)
    print('GO, start walking')
else:
    from dac.sources import WavSource
    src = WavSource(wav_in)
    n_blocks = 10 ** 9

tracker = Tracker()
rows = []
audio = []
count = 0
for t_s, block in src:
    r = estimate_bearing(block)
    s = tracker.update(t_s, r, block)
    rows.append([name, expected, round(t_s, 3), r.bearing_deg, round(r.confidence, 3),
                 s.bearing_smooth_deg, round(s.level_dbfs, 1), s.trend_dbps, s.rate_dps,
                 round(s.noise_floor_dbfs, 1), int(s.approach)])
    if wav_in is None:
        if count == 0:
            audio.append(block)
        else:
            audio.append(block[config.BLOCK_N - config.HOP_N:])
    count += 1
    if count >= n_blocks:
        break

if wav_in is None:
    src.close()
    sf.write(os.path.join(OUT_DIR, name + '.wav'), np.concatenate(audio), config.FS_HZ)

csv_path = os.path.join(OUT_DIR, name + '.csv')
with open(csv_path, 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['trial', 'expected', 't_s', 'bearing_deg', 'conf', 'bearing_smooth_deg',
                'level_dbfs', 'trend_dbps', 'rate_dps', 'noise_floor_dbfs', 'approach'])
    w.writerows(rows)

on_times = [row[2] for row in rows if row[10] == 1]
flagged = len(on_times) > 0
confident = len([row for row in rows if row[3] is not None and row[4] >= config.CONF_MIN])
levels = [row[6] for row in rows]

print('blocks', len(rows), 'confident', confident, 'level range', min(levels), 'to', max(levels), 'dBFS')
if flagged:
    print('APPROACH FLAG ON, first at', on_times[0], 's, on for', round(len(on_times) * config.HOP_N / config.FS_HZ, 1), 's')
else:
    print('approach flag never turned on')
if (expected == 'approach') == flagged:
    print('RESULT: PASS')
else:
    print('RESULT: FAIL')

summary_path = os.path.join(OUT_DIR, 'summary.csv')
new_file = not os.path.exists(summary_path)
with open(summary_path, 'a', newline='') as f:
    w = csv.writer(f)
    if new_file:
        w.writerow(['trial', 'expected', 'flagged', 'first_on_s', 'confident_blocks', 'blocks'])
    first = on_times[0] if flagged else ''
    w.writerow([name, expected, int(flagged), first, confident, len(rows)])
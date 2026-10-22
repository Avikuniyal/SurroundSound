import csv
import math
import os

from dac import config

CSV_PATH = os.path.join('experiments', 'static_angle', 'data', 'results.csv')


def wrap(e):
    return ((e + 180.0) % 360.0) - 180.0


rows = list(csv.DictReader(open(CSV_PATH)))
sounds = sorted(set(r['sound'] for r in rows))

for sound in sounds:
    print('sound:', sound)
    print('true_deg  blocks  confident  mean_err  rms_err  jitter  front_back')
    angles = sorted(set(float(r['true_deg']) for r in rows if r['sound'] == sound))
    rms_list = []
    total_fb = 0
    for a in angles:
        these = [r for r in rows if r['sound'] == sound and float(r['true_deg']) == a]
        errs = []
        for r in these:
            if r['bearing_deg'] != '' and float(r['conf']) >= config.CONF_MIN:
                errs.append(wrap(float(r['bearing_deg']) - a))
        if not errs:
            print(a, len(these), 0, 'no confident blocks')
            continue
        mean = sum(errs) / len(errs)
        rms = math.sqrt(sum(e * e for e in errs) / len(errs))
        jitter = math.sqrt(sum((e - mean) ** 2 for e in errs) / len(errs))
        fb = len([e for e in errs if abs(e) > 90])
        total_fb += fb
        rms_list.append(rms)
        print(a, len(these), len(errs), round(mean, 2), round(rms, 2), round(jitter, 2), fb)
    if rms_list:
        rms_all = math.sqrt(sum(r * r for r in rms_list) / len(rms_list))
        print('overall RMS error', round(rms_all, 2), 'deg, each of', len(rms_list), 'bearings weighted equally')
        print('front/back confusions', total_fb)
        if rms_all <= 15 and total_fb == 0:
            print('V3 PASS (RMS <= 15 deg, 0 front/back)')
        else:
            print('V3 FAIL')
    print()
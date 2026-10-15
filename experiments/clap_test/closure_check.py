import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))

# Closure check: are the 6 GCC-PHAT pair delays consistent with each other?
# Run from the repo root:  python -m experiments.clap_test.closure_check
import numpy as np
import soundfile as sf
from itertools import combinations
from dac import config
from dac.bearing import pair_delay_s

FILES = [
    "experiments/clap_test/clap_test3.wav",
    "experiments/channel_map/tap_045.wav",
    "experiments/channel_map/tap_135.wav",
    "experiments/channel_map/tap_225.wav",
    "experiments/channel_map/tap_315.wav",
]
N_EVENTS = 4          # loudest claps/snaps to check per file
MIN_GAP_S = 0.3       # two peaks closer than this count as the same clap
PRE_SAMPLES = 128     # start the block a little before the peak
PASS = 0.2            # |residual| under this = pass (samples)
FAIL = 0.5            # |residual| over this = a wrong peak

for path in FILES:
    data, fs = sf.read(path)
    mics = data[:, config.CHANNEL_ORDER]      # columns 0-3 in repo mic order
    print("")
    print("=====", path, "fs", fs)

    # find the N loudest events on mic 0, at least MIN_GAP_S apart
    env = np.abs(mics[:, 0])
    picks = []
    for i in np.argsort(env)[::-1]:
        far = True
        for p in picks:
            if abs(i - p) < MIN_GAP_S * fs:
                far = False
        if far:
            picks.append(i)
        if len(picks) == N_EVENTS:
            break

    for peak in sorted(picks):
        start = max(0, peak - PRE_SAMPLES)
        block = mics[start:start + config.BLOCK_N, :]

        # 6 pair delays, seconds -> samples
        tau = {}
        for i, j in config.PAIRS:
            tau[(i, j)] = pair_delay_s(block[:, i], block[:, j]) * config.FS_HZ

        print("")
        print("event at", round(peak / fs, 2), "s")
        for i, j in config.PAIRS:
            print("  tau", i, j, "=", round(tau[(i, j)], 3), "samples")

        # 4 triples: R = tau_ab + tau_bc - tau_ac
        bad = []
        for a, b, c in combinations(range(4), 3):
            r = tau[(a, b)] + tau[(b, c)] - tau[(a, c)]
            if abs(r) < PASS:
                verdict = "pass"
            elif abs(r) < FAIL:
                verdict = "loose"
            else:
                verdict = "FAIL"
                bad.append((a, b, c))
            print("  R", a, b, c, "=", round(r, 3), verdict)

        # a pair sitting in every failing triple is the suspect
        if len(bad) > 0:
            for i, j in config.PAIRS:
                count = 0
                for t in bad:
                    if i in t and j in t:
                        count = count + 1
                if count == len(bad):
                    print("  suspect pair:", i, j)
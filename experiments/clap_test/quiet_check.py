import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))

import numpy as np
import soundfile as sf
from dac import config
from dac.bearing import gcc_phat

SECONDS = 10
OUT_PATH = "experiments/clap_test/quiet_room.wav"


def find_device():
    import sounddevice as sd
    for idx, dev in enumerate(sd.query_devices()):
        api = sd.query_hostapis(dev["hostapi"])["name"]
        if config.DEVICE_NAME_SUBSTRING in dev["name"] and "WDM-KS" in api and dev["max_input_channels"] >= config.N_RAW_CHANNELS:
            return idx
    return None


def record():
    import sounddevice as sd
    dev = find_device()
    if dev is None:
        print("Could not find the XVF3800 on WDM-KS. Device list:")
        print(sd.query_devices())
        sys.exit(1)
    print("Recording", SECONDS, "s on device", dev, "- stay silent, nothing playing, fans off if you can")
    data = sd.rec(int(SECONDS * config.FS_HZ), samplerate=config.FS_HZ,
                  channels=config.N_RAW_CHANNELS, device=dev)
    sd.wait()
    sf.write(OUT_PATH, data, config.FS_HZ)
    print("Saved", OUT_PATH)
    return data, config.FS_HZ


if len(sys.argv) > 1:
    data, fs = sf.read(sys.argv[1])
    print("Analyzing", sys.argv[1])
else:
    data, fs = record()

mics = data[:, config.CHANNEL_ORDER]

print("")
print("Channel levels (RMS, dBFS). A quiet room should be well under -50.")
for c in range(4):
    rms = np.sqrt(np.mean(mics[:, c] ** 2)) + 1e-12
    print("  mic", c, "=", round(20 * np.log10(rms), 1), "dBFS")


n_blocks = len(mics) // config.BLOCK_N
lags_by_pair = {}
heights_by_pair = {}
for i, j in config.PAIRS:
    lags_by_pair[(i, j)] = []
    heights_by_pair[(i, j)] = []

for b in range(n_blocks):
    block = mics[b * config.BLOCK_N:(b + 1) * config.BLOCK_N, :]
    for i, j in config.PAIRS:
        cc, lags = gcc_phat(block[:, i], block[:, j])
        k = np.argmax(cc)
        lags_by_pair[(i, j)].append(lags[k])
        heights_by_pair[(i, j)].append(cc[k] / (np.mean(np.abs(cc)) + 1e-12))

print("")
print("Per pair over", n_blocks, "blocks (lags in samples):")
print("  pair   median lag   spread (IQR)   peak/mean   verdict")
for i, j in config.PAIRS:
    L = np.array(lags_by_pair[(i, j)])
    H = np.array(heights_by_pair[(i, j)])
    med = np.median(L)
    iqr = np.percentile(L, 75) - np.percentile(L, 25)
    sharp = np.median(H)
    if iqr < 0.3:
        verdict = "FIXED PEAK - artifact"
    elif iqr < 1.0:
        verdict = "leaning - suspicious"
    else:
        verdict = "random - fine"
    print("  ", i, j, "   ", round(med, 2), "        ", round(iqr, 2), "         ", round(sharp, 1), "     ", verdict)

print("")
print("Read it like this: with no source, every pair should say 'random'.")
print("If (1, 2) says FIXED near +2.8, the clap-test failure is hardware, not your math.")
print("If every pair says FIXED near 0, it's crosstalk/common electrical noise on all mics.")
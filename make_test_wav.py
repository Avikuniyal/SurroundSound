import sys
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

if len(sys.argv) < 3:
    print("Usage: python make_test_wav.py <input.wav> <output_4ch.wav>")
    sys.exit(1)

x, fs = sf.read(sys.argv[1], dtype="float32", always_2d=True)
x = x.mean(axis=1)                       # to mono
if fs != 16000:
    x = resample_poly(x, 16000, fs).astype("float32")
x = x / max(1e-9, np.max(np.abs(x))) * 0.3   # normalize, no clipping
sf.write(sys.argv[2], np.tile(x[:, None], (1, 4)), 16000)
print("wrote", sys.argv[2], round(len(x) / 16000, 1), "s")
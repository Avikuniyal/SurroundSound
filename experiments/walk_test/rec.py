import sys
import time
import numpy as np
import sounddevice as sd
import soundfile as sf

DEVICE = 6   
FS = 16000
CH = 6

# Speaker Front Facing Window Wall

name = sys.argv[1]
secs = float(sys.argv[2])

input("Enter to start " + name)
print("6 seconds, get to your mark")
time.sleep(6)
print("RECORDING")
x = sd.rec(int(secs * FS), samplerate=FS, channels=CH, device=DEVICE, dtype="float32")
sd.wait()
sf.write("experiments/walk_test/" + name + ".wav", x, FS)

peaks = np.max(np.abs(x[:, 2:6]), axis=0)
print("peaks ch2-5:", peaks)
if np.max(peaks) > 0.5:
    print("TOO HOT, turn the phone down and redo")
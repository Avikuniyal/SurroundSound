# SurroundSound

Real-time directional sound alerts for deaf and hard-of-hearing users. A 4-microphone
array finds where a sound is coming from using our own time-difference-of-arrival
processing (GCC-PHAT and SRP-PHAT), tracks whether it is approaching, and uses
Google's YAMNet sound classifier to only alert on vehicle sounds.

## Team
- Avik: GCC-PHAT and bearing estimation (dac/bearing.py), hardware testing (channel map, static-angle and walk tests)
- Srihaas: SRP-PHAT and confidence (dac/srp.py), approach tracker tuning and review, video editing
- Anirudh: vehicle classifier and integration (dac/classifier.py, dac/pipeline.py, dac/server.py)
- Karthik: outreach and user research

## Hardware
ReSpeaker XVF3800 USB 4-Mic Array, 6-channel raw firmware v2.0.8, 16 kHz.
See docs/CHANNEL_MAP.md for geometry and channel order.

## Run it
pip install -r requirements.txt
python -m dac.server --source live
Then open app/index.html in a browser.

## Test it
pytest

## How it works
A sound reaches each of the four microphones at a slightly different time. For every
pair of mics, we measure that delay, then test every possible direction and pick the
one that fits all six delays best. If a sound keeps the same direction while getting
louder, it is heading toward the user (the collision-course rule ships use). YAMNet
checks whether the sound is a vehicle, and the compass flashes red only when both are true.

Test results: about 4 degrees average direction error across 8 angles
(experiments/static_angle), and 6/6 approaches caught with 0/12 false alarms in the
walk test (experiments/walk_test/LOG.md).

## Credits
YAMNet (Google, TensorFlow Hub). NumPy, SciPy, TensorFlow, websockets.

## AI use
We used Claude for parts of this project. It wrote the repo skeleton, the test
harness and synthetic-audio tools, the approach tracker from our spec, live audio
capture, the recording and analysis scripts, and the frontend. Every AI-written
file is listed in docs/AI_USE.md with who reviewed it.
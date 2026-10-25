import csv
import sys
import numpy as np
from dac import config
from dac.types import ClassState


class ThreatClassifier:
    def __init__(self, model_dir="models/"):
        """
        Threat Classifier using YAMNet scores and vehicle class mapping.
        """
        import csv
        import tensorflow as tf
        import tensorflow_hub as hub

        self.tf = tf
        self.hub = hub

        # Load frozen YAMNet model from TF Hub
        self.yamnet = hub.load("https://tfhub.dev/google/yamnet/1")

        # Find the indices of YAMNet's vehicle/engine classes by name
        class_map_path = self.yamnet.class_map_path().numpy().decode("utf-8")
        names = []
        with tf.io.gfile.GFile(class_map_path) as f:
            for row in csv.DictReader(f):
                names.append(row["display_name"])

        VEHICLE_CLASSES = [
            "Vehicle", "Motor vehicle (road)", "Car", "Car passing by", "Truck", "Bus",
            "Motorcycle", "Traffic noise, roadway noise", "Engine",
            "Light engine (high frequency)", "Medium engine (mid frequency)",
            "Heavy engine (low frequency)", "Engine starting", "Idling",
            "Accelerating, revving, vroom", "Air brake", "Reversing beeps",
        ]
        self.vehicle_idx = [i for i, n in enumerate(names) if n in VEHICLE_CLASSES]
        missing = [n for n in VEHICLE_CLASSES if n not in names]
        print("vehicle classes found:", len(self.vehicle_idx), "missing:", missing)

        # Buffer setup: 0.96 seconds @ 16000 Hz = 15360 samples
        self.window_size = int(config.CLASS_WINDOW_S * config.FS)
        self.buffer = np.zeros(self.window_size, dtype=np.float32)
        self.samples_since_last_eval = 0

        # State tracking
        self.last_t_s = 0.0
        self.current_prob = 0.0
        self.last_above_thresh_t_s = -float("inf")
        self.has_evaluated = False
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

    def push(self, t_s, samples):
        """
        Pushes newest HOP_N (512) samples from CLASS_CHANNEL (0) into the rolling buffer.
        Evaluates model once a full NEW 0.96 s (15360 samples) has accumulated.
        """
        self.last_t_s = t_s
        n_samples = len(samples)

        # Roll buffer left and insert new samples at the end
        self.buffer = np.roll(self.buffer, -n_samples)
        self.buffer[-n_samples:] = samples

        self.samples_since_last_eval += n_samples

        # Evaluate when a full window of NEW samples (15360) has accumulated
        if self.samples_since_last_eval >= self.window_size:
            self._evaluate()
            self.samples_since_last_eval = 0

    def _evaluate(self):
        """Runs YAMNet inference and computes vehicle probability from class scores."""
        waveform = self.tf.convert_to_tensor(self.buffer, dtype=self.tf.float32)

        # scores: (frames, 521), one score per YAMNet class per ~0.48 s frame
        scores, _, _ = self.yamnet(waveform)
        mean_scores = self.tf.reduce_mean(scores, axis=0).numpy()   # (521,)

        # P(vehicle) = the strongest vehicle/engine class
        prob = float(mean_scores[self.vehicle_idx].max())
        
        # Temporary print for threshold tuning
        print("Evaluated prob:", round(prob, 3))

        self.current_prob = prob
        self.has_evaluated = True

        if prob >= config.CLASS_THRESH:
            self.last_above_thresh_t_s = self.last_t_s

    def state(self):
        """Returns the current ClassState snapshot."""
        if not self.has_evaluated:
            return ClassState(
                t_s=self.last_t_s,
                label="other",
                prob_vehicle=0.0,
                present=False
            )

        # Stay present for CLASS_HOLD_S (3.0s) after last window that crossed threshold
        is_present = (self.last_t_s - self.last_above_thresh_t_s) <= config.CLASS_HOLD_S
        label = "vehicle" if self.current_prob >= config.CLASS_THRESH else "other"

        return ClassState(
            t_s=self.last_t_s,
            label=label,
            prob_vehicle=float(self.current_prob),
            present=is_present
        )
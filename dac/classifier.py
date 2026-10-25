import numpy as np
from dac import config
from dac.types import ClassState


class ThreatClassifier:
    def __init__(self, model_dir="models/"):
        """
        Threat Classifier using YAMNet feature extraction and custom MLP head.
        Imports tensorflow lazily inside __init__ to prevent collection crashes on non-TF CI.
        """
        import os
        import tensorflow as tf
        import tensorflow_hub as hub

        self.tf = tf
        self.hub = hub

        # Load frozen YAMNet model from TF Hub
        self.yamnet = hub.load("https://tfhub.dev/google/yamnet/1")

        # Load custom classifier head if exists, else build placeholder head
        head_path = os.path.join(model_dir, "classifier_head.h5")
        if os.path.exists(head_path):
            self.head = tf.keras.models.load_model(head_path)
        else:
            # Simple fallback head structure matching spec
            self.head = tf.keras.Sequential([
                tf.keras.layers.Input(shape=(1024,), dtype=tf.float32),
                tf.keras.layers.Dense(512, activation="relu"),
                tf.keras.layers.Dense(1, activation="sigmoid")
            ])

        # Buffer setup: 0.96 seconds @ 16000 Hz = 15360 samples
        self.window_size = int(config.CLASS_WINDOW_S * config.FS_HZ)  # 15360
        self.buffer = np.zeros(self.window_size, dtype=np.float32)
        self.samples_since_last_eval = 0

        # State tracking
        self.last_t_s = 0.0
        self.current_prob = 0.0
        self.last_above_thresh_t_s = -float("inf")
        self.has_evaluated = False

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

        # Temporary print for threshold tuning (Step 3)
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
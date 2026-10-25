import numpy as np
from dac import config
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
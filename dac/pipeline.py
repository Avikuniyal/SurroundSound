"""Connect per-block bearing, tracking, classification, and alert fusion."""

import numpy as np

from dac import config
from dac.bearing import estimate_bearing
from dac.classifier import ThreatClassifier
from dac.fusion import fuse
from dac.tracker import Tracker
from dac.types import ClassState


class Pipeline:
	"""Process one overlapping audio block and produce a websocket message."""

	_MODES = {"L0", "L1", "L2", "L3"}

	def __init__(self, bearing_fn=None, mode="L0", classifier=None, tracker=None):
		if mode not in self._MODES:
			raise ValueError(f"mode must be one of {sorted(self._MODES)}, got {mode!r}")

		self.mode = mode
		self.bearing_fn = bearing_fn or estimate_bearing
		self.tracker = tracker or Tracker()

		# L2 deliberately omits classification. Allow injection for tests and
		# deployments that provide a preconfigured classifier.
		if mode == "L2":
			self.classifier = None
		else:
			self.classifier = classifier if classifier is not None else ThreatClassifier()

	def process_block(self, t_s, block):
		"""Return the fused message for a (BLOCK_N, N_MICS) audio block."""
		block = np.asarray(block, dtype=np.float32)
		expected_shape = (config.BLOCK_N, config.N_MICS)
		if block.shape != expected_shape:
			raise ValueError(f"block must have shape {expected_shape}, got {block.shape}")

		bearing = self.bearing_fn(block, t_s)
		track = self.tracker.update(t_s, bearing, block)

		if self.classifier is None:
			classification = ClassState(
				t_s=float(t_s), label="other", prob_vehicle=0.0, present=False
			)
		else:
			newest_samples = block[-config.HOP_N:, config.CLASS_CHANNEL]
			self.classifier.push(t_s, newest_samples)
			classification = self.classifier.state()

		return fuse(track, classification, self.mode)

"""Combine tracking and classifier state into the websocket message schema."""

from dac import config


_VALID_MODES = {"L0", "L1", "L2", "L3"}


def fuse(track, cls, mode):
	"""Build a JSON-serializable status message from TrackState and ClassState."""
	if mode not in _VALID_MODES:
		raise ValueError(f"mode must be one of {sorted(_VALID_MODES)}, got {mode!r}")

	alert = (
		mode == "L0"
		and config.ALERT_ENABLED
		and track.approach
		and cls.present
	)

	return {
		"t_s": float(track.t_s),
		"bearing_deg": None if track.bearing_deg is None else float(track.bearing_deg),
		"bearing_smooth_deg": (
			None if track.bearing_smooth_deg is None else float(track.bearing_smooth_deg)
		),
		"confidence": float(track.confidence),
		"level_dbfs": float(track.level_dbfs),
		"trend_dbps": None if track.trend_dbps is None else float(track.trend_dbps),
		"rate_dps": None if track.rate_dps is None else float(track.rate_dps),
		"approach": bool(track.approach),
		"class_label": str(cls.label),
		"class_prob": float(cls.prob_vehicle),
		"alert": bool(alert),
		"mode": mode,
	}

# tests/test_capture.py  (owner: Avik)
# Runs without the array: a fake sounddevice stands in for the driver.
import itertools
import sys
import types

import numpy as np
import pytest

try:
    import sounddevice  # noqa: F401
except Exception:       # no PortAudio on this machine (CI): give dac.capture something to import
    sys.modules['sounddevice'] = types.ModuleType('sounddevice')

from dac import capture, config


class FakeStream:
    """Each read returns HOP_N rows where raw channel c, overall sample k holds c * 100000 + k."""

    def __init__(self, overflow_reads=()):
        self.overflow_reads = set(overflow_reads)   # 1-based read numbers that report overflow
        self.n_reads = 0
        self.k = 0
        self.started = False
        self.closed = False

    def start(self):
        self.started = True

    def stop(self):
        self.started = False

    def close(self):
        self.closed = True

    def read(self, n):
        self.n_reads += 1
        k = np.arange(self.k, self.k + n)
        self.k += n
        data = np.stack([c * 100000 + k for c in range(config.N_RAW_CHANNELS)], axis=1)
        return data.astype(np.float32), self.n_reads in self.overflow_reads


def fake_sd(devices, hostapis, bad=(), stream=None):
    sd = types.SimpleNamespace()
    sd.query_devices = lambda: devices
    sd.query_hostapis = lambda: hostapis

    def check_input_settings(device, channels, samplerate, dtype):
        if device in bad:
            raise ValueError('cannot open')
    sd.check_input_settings = check_input_settings
    sd.InputStream = lambda **kw: stream
    return sd


HOSTAPIS = [{'name': 'MME'}, {'name': 'Windows WASAPI'}, {'name': 'Windows WDM-KS'}, {'name': 'Core Audio'}]
NAME = 'Echo Cancelling Speakerphone (reSpeaker XVF3800 4-Mic Array)'
DEVICES = [
    {'name': NAME, 'max_input_channels': 2, 'hostapi': 0},                # MME: processed only
    {'name': NAME, 'max_input_channels': 6, 'hostapi': 1},                # WASAPI
    {'name': NAME, 'max_input_channels': 6, 'hostapi': 2},                # WDM-KS
    {'name': 'MacBook Pro Microphone', 'max_input_channels': 1, 'hostapi': 3},
]


def test_prefers_wdm_ks(monkeypatch):
    monkeypatch.setattr(capture, 'sd', fake_sd(DEVICES, HOSTAPIS))
    assert capture._find_device('XVF3800') == 2


def test_skips_device_that_will_not_open(monkeypatch):
    monkeypatch.setattr(capture, 'sd', fake_sd(DEVICES, HOSTAPIS, bad={2}))
    assert capture._find_device('XVF3800') == 1


def test_no_device_raises(monkeypatch):
    monkeypatch.setattr(capture, 'sd', fake_sd(DEVICES[:1] + DEVICES[3:], HOSTAPIS))
    with pytest.raises(RuntimeError):
        capture._find_device('XVF3800')


def _source(monkeypatch, stream):
    monkeypatch.setattr(capture, 'sd', fake_sd(DEVICES, HOSTAPIS, stream=stream))
    return capture.LiveSource()


def test_blocks_shape_order_overlap_and_time(monkeypatch):
    src = _source(monkeypatch, FakeStream())
    out = list(itertools.islice(iter(src), 3))
    for t_s, block in out:
        assert block.shape == (config.BLOCK_N, config.N_MICS)
        assert block.dtype == np.float32
    # Column col comes from raw channel CHANNEL_ORDER[col].
    for col, ch in enumerate(config.CHANNEL_ORDER):
        assert out[0][1][0, col] == ch * 100000
    # Same t_s as WavSource: block b starts at b * HOP_N samples.
    assert [t for t, _ in out] == [b * config.HOP_N / config.FS_HZ for b in range(3)]
    # Half overlap: the second half of one block is the first half of the next.
    keep = config.BLOCK_N - config.HOP_N
    assert np.array_equal(out[0][1][-keep:], out[1][1][:keep])


def test_overflow_drops_old_half(monkeypatch):
    stream = FakeStream(overflow_reads={4})
    src = _source(monkeypatch, stream)
    out = list(itertools.islice(iter(src), 3))
    assert src.overflows == 1
    # Reads 1+2 -> block 0, reads 2+3 -> block 1, read 4 overflows so read 3 is dropped,
    # reads 4+5 -> block 2. Block 2 must start at read 4's first sample, not read 3's.
    assert stream.n_reads == 5
    assert out[2][1][0, 0] == config.CHANNEL_ORDER[0] * 100000 + 3 * config.HOP_N
    assert out[2][0] == (5 * config.HOP_N - config.BLOCK_N) / config.FS_HZ


def test_stream_stops_when_loop_ends_and_close_is_safe_twice(monkeypatch):
    stream = FakeStream()
    src = _source(monkeypatch, stream)
    it = iter(src)
    next(it)
    assert stream.started
    it.close()                      # what a for loop does when you break out of it
    assert not stream.started
    src.close()
    src.close()
    assert stream.closed
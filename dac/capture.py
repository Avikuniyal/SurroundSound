import numpy as np
import sounddevice as sd

from dac import config

def _find_device(substring):
    devices = sd.query_devices()
    hostapis = sd.query_hostapis()

    candidates = []
    for i in range(len(devices)):
        dev = devices[i]
        if substring in dev['name'] and dev['max_input_channels'] >= config.N_RAW_CHANNELS:
            candidates.append(i)

    wdm_ks = []
    others = []
    for i in candidates:
        api_name = hostapis[devices[i]['hostapi']]['name']
        if 'WDM-KS' in api_name:
            wdm_ks.append(i)
        else:
            others.append(i)

    for i in wdm_ks + others:
        try:
            sd.check_input_settings(device=i, channels=config.N_RAW_CHANNELS,
                                    samplerate=config.FS_HZ, dtype='float32')
            return i
        except Exception:
            pass

    raise RuntimeError('No input device with ' + repr(substring) + ' in its name opens with '
                       + str(config.N_RAW_CHANNELS) + ' channels at ' + str(config.FS_HZ)
                       + ' Hz. Is the array plugged in and on the raw firmware?')


class LiveSource:

    def __init__(self, device_substring=config.DEVICE_NAME_SUBSTRING):
        self.device = _find_device(device_substring)
        self.overflows = 0
        self._stream = sd.InputStream(device=self.device, channels=config.N_RAW_CHANNELS,
                                      samplerate=config.FS_HZ, dtype='float32',
                                      blocksize=config.HOP_N)

    def __iter__(self):
        hop = config.HOP_N
        keep = config.BLOCK_N - hop    
        buf = np.zeros((0, config.N_MICS), dtype=np.float32)
        n_read = 0 
        self._stream.start()
        try:
            while True:
                data, overflowed = self._stream.read(hop)
                if overflowed:
                    self.overflows += 1
                    buf = buf[:0]
                buf = np.concatenate([buf, data[:, config.CHANNEL_ORDER]])
                n_read += hop
                if len(buf) >= config.BLOCK_N:
                    block = np.ascontiguousarray(buf[-config.BLOCK_N:], dtype=np.float32)
                    t_s = (n_read - config.BLOCK_N) / config.FS_HZ
                    yield t_s, block
                    buf = buf[-keep:]
        finally:
            if not self._stream.closed:
                self._stream.stop()

    def close(self):
        if not self._stream.closed:
            self._stream.close()
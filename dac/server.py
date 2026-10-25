import argparse
import asyncio
import json
import logging
import threading
import time
import websockets

from dac import config
from dac.pipeline import Pipeline

logger = logging.getLogger("dac.server")


class ServerThread(threading.Thread):
    def __init__(self, source, pipeline, send_rate_hz=20.0):
        super().__init__(daemon=True)
        self.source = source
        self.pipeline = pipeline
        self.interval = 1.0 / send_rate_hz
        self.latest_msg = None
        self.msg_lock = threading.Lock()
        self.running = True

    def run(self):
        for t_s, block in self.source:
            if not self.running:
                break
            msg = self.pipeline.process_block(t_s, block)
            with self.msg_lock:
                self.latest_msg = msg

    def get_latest_message(self):
        with self.msg_lock:
            return self.latest_msg

    def stop(self):
        self.running = False


async def broadcast_loop(server_thread, host="0.0.0.0", port=8765):
    connected_clients = set()

    async def handler(websocket):
        connected_clients.add(websocket)
        try:
            await websocket.wait_closed()
        finally:
            connected_clients.remove(websocket)

    async with websockets.serve(handler, host, port):
        logger.info(f"WebSocket server started on ws://{host}:{port}")
        interval = 1.0 / config.SEND_RATE_HZ
        while True:
            msg = server_thread.get_latest_message()
            if msg is not None and connected_clients:
                payload = json.dumps(msg)
                # Broadcast to all active clients
                websockets.broadcast(connected_clients, payload)
            await asyncio.sleep(interval)


def parse_args():
    parser = argparse.ArgumentParser(description="Directional Audio Compass WebSocket Server")
    parser.add_argument(
        "--source",
        type=str,
        default="live",
        help="Source specification: 'live', 'wav:PATH [--realtime]', or 'synth:NAME'",
    )
    parser.add_argument("--realtime", action="store_true", help="Run WAV source in real-time mode")
    parser.add_argument(
        "--bearing",
        type=str,
        default="default",
        help="Bearing estimation mode: 'default' or 'stub'",
    )
    parser.add_argument(
        "--mode",
        type=str,
        default="L0",
        choices=["L0", "L1", "L2", "L3"],
        help="Pipeline operating mode (L0, L1, L2, L3)",
    )
    return parser.parse_args()


def main():
    logging.basicConfig(level=logging.INFO)
    args = parse_args()

    # 1. Resolve source
    truth_fn = None
    if args.source == "live":
        from dac.capture import LiveSource
        source = LiveSource()
    elif args.source.startswith("wav:"):
        path = args.source.split(":", 1)[1]
        from dac.sources import WavSource
        source = WavSource(path, realtime=args.realtime)
    elif args.source.startswith("synth:"):
        scenario_name = args.source.split(":", 1)[1]
        from dac.synth import make_scenario
        from dac.sources import SyntheticSource
        scenario = make_scenario(scenario_name)
        source = SyntheticSource(scenario)
        truth_fn = lambda t: scenario.truth(t)["bearing_deg"]
    else:
        raise ValueError(f"Unknown source format: {args.source}")

    # 2. Resolve bearing estimation function
    if args.bearing == "stub":
        if truth_fn is None:
            raise ValueError("--bearing stub requires a synthetic source with ground truth")
        from dac.stub_bearing import StubBearing
        bearing_fn = StubBearing(truth_fn).estimate
    else:
        from dac import bearing
        bearing_fn = bearing.estimate_bearing

    # 3. Instantiate pipeline
    pipeline = Pipeline(bearing_fn=bearing_fn, mode=args.mode)

    # 4. Start background processing thread
    server_thread = ServerThread(source, pipeline, send_rate_hz=config.SEND_RATE_HZ)
    server_thread.start()

    # 5. Run WebSocket server loop
    try:
        asyncio.run(broadcast_loop(server_thread))
    except KeyboardInterrupt:
        logger.info("Shutting down server...")
        server_thread.stop()


if __name__ == "__main__":
    main()

import asyncio
import json
import math
import os
import pickle
import random
import time
from collections import deque
from datetime import datetime, timezone
import numpy as np
import pandas as pd
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

# Add project root and backend directories to path to resolve model pickling classes
import sys
sys.path.insert(0, os.path.join(os.path.abspath(os.path.dirname(__file__)), "backend"))

app = FastAPI(title="Chakravyuham CAN IDS WebSocket Server")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all clients (e.g., local Vite servers on 3000/5173)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global Constants
NORMAL_IDS = [0x7E0, 0x7E8, 0x18DAF110, 0x7E4, 0x7E1, 0x7E9, 0x7DF, 0x7E2]
TX_IDS = {0x7E8, 0x7E9}
ID_INFO = {
    0x7E0: ("PT", "Engine Speed"),
    0x7E8: ("PT", "Engine Data Resp"),
    0x18DAF110: ("CH", "Wheel Speed FL"),
    0x7E4: ("BCM", "Door Status"),
    0x7E1: ("PT", "Fuel Level"),
    0x7E9: ("PT", "Fuel Level Resp"),
    0x7DF: ("DIAG", "Diagnostic Req"),
    0x7E2: ("CH", "Wheel Speed FR"),
}
BUS_SEGMENTS = ["PT", "CH", "BCM", "DIAG"]

# Load trained XGBoost Model
MODEL_PATH = os.path.join(os.path.dirname(__file__), "backend", "results", "xgboost", "teammate_1", "advanced_features", "xgboost", "model.pkl")
if not os.path.exists(MODEL_PATH):
    raise FileNotFoundError(f"Trained model not found at {MODEL_PATH}")

with open(MODEL_PATH, "rb") as f:
    model = pickle.load(f)

# Helper function to compute Shannon Entropy
def compute_entropy(payload):
    if not payload:
        return 0.0
    freq = {}
    for b in payload:
        freq[b] = freq.get(b, 0) + 1
    n = len(payload)
    ent = 0.0
    for c in freq.values():
        p = c / n
        ent -= p * math.log2(p)
    return ent

# Helper function to compute Popcount/Hamming Distance
def popcount(x):
    return bin(x).count("1")

def hamming_distance(p1, p2):
    return sum(popcount(b1 ^ b2) for b1, b2 in zip(p1, p2))

# Generator for CAN frames based on attack presets
def generate_frame(mode: str):
    ts = time.time()
    
    if mode == "DOS":
        can_id = 0x000
        dlc = 8
        payload = [0x00] * 8
        bus, info = "PT", "Replay Flood (DoS)"
    elif mode == "FUZZ":
        can_id = random.randint(0, 0x7FF)
        dlc = random.randint(1, 8)
        payload = [random.randint(0, 255) for _ in range(dlc)]
        bus = random.choice(BUS_SEGMENTS)
        info = "Randomized Fuzz Frame"
    elif mode == "SPOOF":
        # Impersonating target ID 0x1F2 (or similar) with malicious payload values
        can_id = 0x1F2
        dlc = 8
        payload = [0x08, 0xF0] + [random.randint(0, 255) for _ in range(6)]
        bus, info = "PT", "Spoofed ID Impersonation"
    else:
        # Normal nominal traffic
        can_id = random.choice(NORMAL_IDS)
        dlc = 8
        base = random.randint(0, 255)
        payload = [(base + random.randint(-2, 2)) % 256 for _ in range(dlc)]
        bus, info = ID_INFO.get(can_id, ("PT", "Telemetry Frame"))

    # Pad payload to 8 elements for feature processing
    full_payload = list(payload)
    while len(full_payload) < 8:
        full_payload.append(0)

    return {
        "timestamp": ts,
        "can_id": can_id,
        "dlc": dlc,
        "payload": full_payload[:8],
        "bus": bus,
        "info": info
    }

@app.websocket("/ws/can")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("UI Client connected to websocket stream.")

    # Stateful variables per socket connection for feature calculations
    last_ts = {}
    last_iat = {}
    last_payload = {}
    global_ts_history = deque(maxlen=51)
    
    # Track overall packet indexing
    pkt_index = 0
    active_preset = "NORMAL"

    # Background task to listen to client requests
    async def listen_client():
        nonlocal active_preset
        try:
            while True:
                data = await websocket.receive_json()
                if "command" in data:
                    cmd = data["command"]
                    if cmd == "SET_ATTACK":
                        active_preset = data.get("preset", "NORMAL").upper()
                        print(f"Server changed attack simulation mode to: {active_preset}")
        except Exception:
            pass

    # Start listener thread in the background
    listener = asyncio.create_task(listen_client())

    try:
        while True:
            # 1. Generate one simulated frame based on the active mode
            frame = generate_frame(active_preset)
            can_id = frame["can_id"]
            ts = frame["timestamp"]
            payload = frame["payload"]
            dlc = frame["dlc"]

            # 2. Compute stateful sequential features
            # A. Inter-Arrival Time (IAT)
            if can_id in last_ts:
                iat = ts - last_ts[can_id]
            else:
                iat = 0.0
            last_ts[can_id] = ts

            # B. Jitter (IAT variation)
            if can_id in last_iat:
                jitter = abs(iat - last_iat[can_id])
            else:
                jitter = 0.0
            last_iat[can_id] = iat

            # C. Message Frequency (rolling global count)
            global_ts_history.append(ts)
            if len(global_ts_history) >= 51:
                elapsed = ts - global_ts_history[0]
                message_frequency = 50.0 / elapsed if elapsed > 0 else 0.0
            else:
                message_frequency = 0.0

            # D. Shannon Entropy
            payload_entropy = compute_entropy(payload)

            # E. Hamming Distance
            if can_id in last_payload:
                payload_hamming_dist = hamming_distance(payload, last_payload[can_id])
            else:
                payload_hamming_dist = 0
            last_payload[can_id] = payload

            # 3. Create prediction input DataFrame
            # Features sequence: can_id, dlc, data_0..7, iat, jitter, message_frequency, payload_entropy, payload_hamming_dist
            feature_dict = {
                "can_id": [can_id],
                "dlc": [dlc],
                "data_0": [payload[0]],
                "data_1": [payload[1]],
                "data_2": [payload[2]],
                "data_3": [payload[3]],
                "data_4": [payload[4]],
                "data_5": [payload[5]],
                "data_6": [payload[6]],
                "data_7": [payload[7]],
                "iat": [iat],
                "jitter": [jitter],
                "message_frequency": [message_frequency],
                "payload_entropy": [payload_entropy],
                "payload_hamming_dist": [payload_hamming_dist]
            }
            features_df = pd.DataFrame(feature_dict)

            # 4. Invoke XGBoost model to get prediction
            t0 = time.perf_counter()
            prediction_list = model.predict(features_df)
            latency_ms = (time.perf_counter() - t0) * 1000.0
            verdict = prediction_list[0] # 'normal', 'dos', 'fuzzy', 'impersonation'

            # Format fields for the UI
            hex_id = f"0x{can_id:03X}"
            direction = "TX" if can_id in TX_IDS else "RX"
            payload_hex = [f"{b:02X}" for b in payload]

            # 5. Broadcast frame to UI
            ui_frame = {
                "id": hex_id,
                "dlc": dlc,
                "data": payload_hex,
                "entropy": round(payload_entropy, 3),
                "isAnomalous": verdict != "normal",
                "anomalyType": verdict.upper(),
                "source": "Engine ECU" if can_id in TX_IDS else "Brake ECU",
                "destination": "Broadcast" if verdict == "dos" else "Gateway",
                "timestamp": int(ts * 1000) % 100000000,  # relative ms format
                "bus": frame["bus"],
                "iat": round(iat * 1000.0, 2),  # ms
                "jitter": round(jitter * 1000.0, 2), # ms
                "messageFrequency": round(message_frequency, 1),
                "payloadEntropy": round(payload_entropy, 2),
                "payloadHammingDist": payload_hamming_dist,
                "latencyMs": round(latency_ms, 3)
            }

            await websocket.send_json(ui_frame)
            pkt_index += 1
            
            # Simulated transmission rate: sleep 40ms to 200ms depending on the mode
            delay = 0.05 if active_preset == "DOS" else (0.12 if active_preset == "FUZZ" else 0.4)
            await asyncio.sleep(delay)

    except WebSocketDisconnect:
        print("UI Client disconnected.")
    except Exception as e:
        print("Websocket error:", e)
    finally:
        listener.cancel()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)

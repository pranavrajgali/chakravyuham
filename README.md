# Chakravyuham: Protocol-Agnostic Automotive CAN IDS

Chakravyuham is a highly optimized, edge-friendly, real-time Intrusion Detection System (IDS) designed to secure vehicular Controller Area Network (CAN) communications against cyber physical intrusions.

The system is built on **Gradient Boosted Decision Trees (GBDTs)**—specifically targeting **LightGBM** (1.34 MB) and **XGBoost** (0.95 MB)—achieving sub-millisecond inference latencies suitable for execution on resource-constrained Electronic Control Units (ECUs).

---

## 1. Feature Engineering Architecture

To make the detection system resilient against payload obfuscation and timing hacks, the raw CAN packet inputs are transformed into a **Unified Standard Feature Vector ($V_W$)** computed over sliding message-count windows ($N=100$, step $S=50$):

$$V_W = [ \mu_{IAT}, \sigma^2_{IAT}, F_{window}, \mu_{Entropy}, \sigma^2_{Entropy}, \mu_{Hamming}, U_{ID\_Ratio} ]$$

### Timing & Frequency Features
*   **Inter-Arrival Time (IAT)**: $\Delta t_{k}^{(id)} = T_{k}^{(id)} - T_{k-1}^{(id)}$ (Grouped by ID). Identifies volumetric flooding/DoS attacks.
*   **Jitter (Variance in IAT)**: $J_{k}^{(id)} = | \Delta t_{k}^{(id)} - \Delta t_{k-1}^{(id)} |$ (Grouped by ID). Identifies clock drift induced by spoofing.
*   **Message Frequency**: $F_W = \frac{N_W}{W}$ (Bus-wide). Detects overall transmission density anomalies.
*   **Unique ID Ratio**: $U_{ID\_Ratio} = \frac{\text{Unique IDs}}{N_W}$. Drops to $\approx 0$ during DoS flooding and rises to $\approx 1$ during random Fuzzing.

### Payload & Content Features
*   **Payload Shannon Entropy**: $H(X) = - \sum p_i \log_2 p_i$. Quantifies data byte randomness. Normal traffic has low entropy; Fuzzing injections exhibit high entropy.
*   **Payload Hamming Distance**: $H_d(x, y) = \sum |x_j - y_j|$ (Grouped by ID). Measures bitwise difference between consecutive payloads to flag physical sensor anomalies.

---

## 2. Directory Structure

```text
├── frontend/               # Vite + React + TS dashboard app
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
│
├── backend/                # Python ML Models & Pipelines
│   ├── app.py              # Legacy Streamlit app
│   ├── configs/            # GBDT training configurations
│   ├── data/               # Raw/processed datasets
│   ├── features/           # Feature extractors (XGBoost, GCN)
│   ├── models/             # Model wrapper classes
│   ├── results/            # Central results repository (Models and Metrics)
│   └── requirements.txt    # Python dependencies
│
├── server.py               # Main entry point (FastAPI server at root)
├── .venv/                  # Python virtual environment (at root)
└── README.md               # Master README detailing full-stack execution
```

---

## 3. Getting Started

### Installation
Activate your virtual environment and install backend dependencies from the root:
```bash
.venv\Scripts\activate      # Windows
pip install -r backend/requirements.txt
```

### Running the Evaluation Suite
Ensure you are inside the `backend/` directory before running any Python scripts:
```bash
cd backend
```

#### 1. Comprehensive Multiclass Evaluation Suite:
Trains and evaluates all 5 models (XGBoost, LightGBM, Random Forest, GCNIDS, and MosaicCNN) on multiclass data across both datasets (OTIDS, HCRL) and both feature variations (Basic, Advanced).
```bash
# Run the entire suite on full datasets (takes time)
python run_comprehensive_suite.py

# Run with downsampling for fast diagnostic testing (recommended for quick runs)
python run_comprehensive_suite.py --downsample 100000
```

#### 2. In-Domain Sliding Window Comparison:
Runs the comparative leaderboard using sliding window features with local Z-score scaling.
```bash
python run_cross_evaluation.py
```

#### 3. Explainable AI Analysis:
Generates individual Beeswarm and Bar charts under `results/shap/` to show feature contribution.
```bash
python run_shap_analysis.py
```

#### 4. Decoupled React Dashboard + FastAPI Backend (Recommended):
Launches the high-performance Vite + React 19 interface backed by the real-time GBDT Python classifiers.

Start the FastAPI backend server (port 8000) from the root directory using the virtual environment:
```bash
# Windows Power-shell/CMD:
.venv\Scripts\python -m uvicorn server:app --host 127.0.0.1 --port 8000
```

Start the Vite dev server (port 3000):
```bash
cd frontend
npm install
npm run dev
```

# Feature Engineering Documentation

> Detailed explanation of every feature used in `run_comprehensive_suite.py` for the Kerintha Automotive Intrusion Detection System.

---

## 1. Raw CAN Bus Columns

All features are derived from the raw CAN bus frame structure parsed by the dataset loaders (`OTIDSLoader`, `CarHackingLoader`). Every loaded frame has the following schema:

| Column | Type | Description |
|--------|------|-------------|
| `timestamp` | float | Absolute or normalized timestamp of the frame arrival (seconds) |
| `can_id` | int | CAN arbitration ID (hex-parsed to integer). Identifies the ECU sender/message type |
| `dlc` | int | Data Length Code — number of valid payload bytes (0–8) |
| `data_0` … `data_7` | int (0–255) | The 8 payload bytes of the CAN frame |
| `label` | str | Ground-truth class: `"normal"`, `"dos"`, `"fuzzy"`, `"impersonation"`, `"rpm"`, `"gear"` |
| `source_file` | str | Which attack capture file the frame came from (used for block-wise splitting) |

---

## 2. Basic Feature Set

**Source:** [`features/basic.py`](features/basic.py)

The Basic feature set is a direct pass-through of the raw per-message fields with no temporal engineering. It is the minimal feature representation.

### Features (10 columns)

| # | Feature | Type | Description |
|---|---------|------|-------------|
| 1 | `can_id` | categorical int | CAN arbitration ID. Acts as a strong discriminator since many attacks inject on specific IDs (e.g., OTIDS DoS uses `0x000`) |
| 2 | `dlc` | int | Data Length Code. Anomalous DLC values can indicate fuzzing attacks |
| 3 | `data_0` | int (0–255) | 1st payload byte |
| 4 | `data_1` | int (0–255) | 2nd payload byte |
| 5 | `data_2` | int (0–255) | 3rd payload byte |
| 6 | `data_3` | int (0–255) | 4th payload byte |
| 7 | `data_4` | int (0–255) | 5th payload byte |
| 8 | `data_5` | int (0–255) | 6th payload byte |
| 9 | `data_6` | int (0–255) | 7th payload byte |
| 10 | `data_7` | int (0–255) | 8th payload byte |

### Why it works
Tree-based models (XGBoost, LightGBM, Random Forest) can learn split rules on `can_id` and payload byte patterns to detect attacks. For HCRL, `can_id` alone achieves ~99.99% accuracy because attack injection targets are trivially distinguishable.

---

## 3. Advanced Feature Set

**Source:** [`features/advanced.py`](features/advanced.py)

The Advanced feature set contains 5 engineered temporal and statistical features on top of raw message properties. These capture the **timing behavior** and **payload dynamics** of the CAN bus without relying on the raw `can_id` (which is excluded to eliminate data leakage and shortcut-learning risks, making this feature set spoof-resistant).

> **Note:** During the comprehensive suite run, if Advanced features are used, the raw `can_id` column is explicitly dropped from the tabular training matrix for XGBoost, LightGBM, and Random Forest models to guarantee spoofing protection.

### Features (5 columns)

| # | Feature | Type | Formula | Description |
|---|---------|------|---------|-------------|
| 1 | `iat` | float | `IAT_k = t_k - t_{k-1}` (per CAN ID) | **Inter-Arrival Time**: time gap between consecutive messages from the same CAN ID. DoS attacks compress IAT toward zero; impersonation attacks introduce abnormal periodicity |
| 2 | `jitter` | float | `J_k = \|IAT_k - IAT_{k-1}\|` (per CAN ID) | **Jitter**: absolute difference between consecutive IATs for the same CAN ID. Legitimate ECUs have near-constant IAT (low jitter); attacks create irregular timing spikes |
| 3 | `message_frequency` | float | `freq = 50 / (t_k - t_{k-50})` | **Bus-wide Message Frequency**: rolling rate of messages across the entire bus using a 50-message stride. DoS floods spike this metric dramatically |
| 4 | `payload_entropy` | float | `H = -Σ p_i · log₂(p_i)` over sorted byte groups | **Shannon Payload Entropy**: measures information content of the 8-byte payload. Computed via a precomputed 128-entry lookup table over sorted-byte equivalence classes. Fuzzy attacks produce high-entropy random payloads; legitimate signals are structured and low-entropy |
| 5 | `payload_hamming_dist` | int | `Σ popcount(byte_k ⊕ byte_{k-1})` over 8 bytes per CAN ID | **Payload Hamming Distance**: total number of bit flips between consecutive payloads from the same CAN ID. Uses a precomputed 256-entry popcount table. Impersonation/replay attacks have abnormally low or high Hamming distance |

### Entropy Computation Detail

The payload entropy uses an optimized vectorized approach:
1. Sort the 8 payload bytes
2. Compute binary diff mask (7 transition points → 128 possible patterns)
3. Look up precomputed entropy value from `ENTROPY_LOOKUP_TABLE[mask]`

This avoids per-row frequency counting and runs in O(1) per frame after the initial table build.

### Hamming Distance Computation Detail

For each CAN ID group:
1. XOR current payload bytes with the previous message's payload bytes
2. Sum the popcount (number of set bits) across all 8 bytes
3. Uses `POPCOUNT_TABLE[0..255]` for O(1) per-byte bit counting

---

## 4. GCN Graph-Based Features

**Source:** [`features/gcn/`](features/gcn/) — `graph_builder.py`, `feature_extractor.py`, `normalization.py`, `rolling_baseline.py`

The GCN-IDS model does **not** use the Basic or Advanced tabular features directly. Instead, it constructs **directed temporal graphs** from sliding windows of raw CAN frames, then extracts graph-structural features per node and per window.

### 4.1 Graph Construction

**Source:** [`features/gcn/graph_builder.py`](features/gcn/graph_builder.py)

Each window of 200 consecutive CAN frames is converted to a directed weighted graph:

- **Nodes**: One node per unique CAN arbitration ID in the window
- **Edges**: Directed transition from message `k`'s CAN ID → message `k+1`'s CAN ID
- **Self-loops**: Retained when consecutive messages share the same CAN ID
- **Edge weights**: Count of times each `(src_id → dst_id)` transition occurs

```
Example: CAN ID sequence [0x123, 0x456, 0x123, 0x123]
  Nodes: {0x123: node0, 0x456: node1}
  Edges: (0→1, weight=1), (1→0, weight=1), (0→0, weight=1)  ← self-loop
```

### 4.2 Node Features (11 per node)

**Source:** [`features/gcn/feature_extractor.py`](features/gcn/feature_extractor.py) — `extract_node_features()`

For each node (unique CAN ID) in a window graph:

| # | Feature | Description |
|---|---------|-------------|
| 1 | `indegree` | Number of unique CAN IDs that transition INTO this node |
| 2 | `outdegree` | Number of unique CAN IDs this node transitions TO |
| 3 | `self_loop_count` | Number of consecutive same-ID repetitions |
| 4 | `occurrence_frequency` | Total count of this CAN ID in the window |
| 5 | `freq_zscore` | Z-score of occurrence frequency vs. rolling baseline (Welford's algorithm) |
| 6 | `iat_mean_zscore` | Z-score of mean inter-arrival time vs. baseline |
| 7 | `iat_var_zscore` | Z-score of IAT variance vs. baseline |
| 8 | `entropy_zscore` | Z-score of payload byte entropy vs. baseline |
| 9 | `hamming_zscore` | Z-score of mean payload Hamming distance vs. baseline |
| 10 | `out_transition_entropy` | Shannon entropy of outgoing edge weight distribution — measures how uniformly this node transitions to others |
| 11 | `burstiness` | Coefficient of variation of IAT: `std(IAT) / mean(IAT)`. High burstiness = irregular timing |

#### Rolling Baseline (Welford's Online Algorithm)

**Source:** [`features/gcn/rolling_baseline.py`](features/gcn/rolling_baseline.py)

Z-score features (5–9) are computed against a **per-CAN-ID rolling baseline** that persists across windows. This uses Welford's numerically stable online algorithm:

```
On update with value x:
  n += 1
  δ₁ = x - mean
  mean += δ₁ / n
  δ₂ = x - mean
  M₂ += δ₁ · δ₂

Z-score = (x - mean) / √(M₂ / (n-1))
```

This allows the model to detect **deviations from learned normal behavior** without requiring a fixed training set for normalization.

### 4.3 Global Features (3 per window)

**Source:** [`features/gcn/feature_extractor.py`](features/gcn/feature_extractor.py) — `extract_global_features()`

| # | Feature | Description |
|---|---------|-------------|
| 1 | `unique_id_count` | Number of distinct CAN IDs in the window. DoS floods reduce diversity |
| 2 | `transition_entropy` | Shannon entropy of the full edge weight distribution across the graph |
| 3 | `graph_density` | `observed_edges / (N² )` where N = number of nodes. Measures how connected the traffic pattern is |

### 4.4 Normalization

**Source:** [`features/gcn/normalization.py`](features/gcn/normalization.py)

After feature extraction, all node and global features are Z-score normalized using training-set statistics:

```
node_features = (node_features - μ_train) / σ_train
global_features = (global_features - μ_train) / σ_train
```

### 4.5 GCN Model Architecture

**Source:** [`models/gcn.py`](models/gcn.py)

```
Input: Node features (N×11) + Edge index + Edge weights + Global features (1×3)
  │
  ├─ GCNConv(11 → 8) + ReLU
  ├─ GCNConv(8 → 8) + ReLU
  ├─ global_mean_pool → (1×8)
  ├─ concat(pooled, global_features) → (1×11)
  ├─ Dropout(0.5)
  └─ Linear(11 → num_classes)
```

### 4.6 Window Labeling

Each window of 200 frames is assigned a single label:
- If **all frames are normal** → label = 0 (normal)
- If **any frames are attack** → label = max attack class index (most severe attack present)

Predictions are then **expanded back** to packet-level by repeating each window prediction 200 times.

---

## 5. Feature Set Comparison Summary

| Property | Basic | Advanced | GCN |
|----------|-------|----------|-----|
| **Input granularity** | Per-frame | Per-frame | Per-window (200 frames) |
| **Feature count** | 10 | 13 unique (excludes raw `can_id` and `dlc`) | 11 node + 3 global |
| **Temporal awareness** | ✗ | ✓ (IAT, jitter, frequency) | ✓ (graph transitions, baselines) |
| **Payload analysis** | Raw bytes | Entropy + Hamming distance | Entropy + Hamming (z-scored) |
| **Structural modeling** | ✗ | ✗ | ✓ (directed graph topology) |
| **Anomaly detection** | Pattern matching | Statistical deviation | Baseline z-score deviation |
| **Best suited for** | Tree models | Tree models | GNN models |

---

## 6. How Models Consume Features

| Model | Feature Input | Encoding / Handling |
|-------|---------------|---------------------|
| **XGBoost** | Basic or Advanced | `can_id` and `dlc` as categories (both dropped in Advanced) |
| **LightGBM** | Basic or Advanced | `can_id` and `dlc` as categories (both dropped in Advanced) |
| **Random Forest** | Basic or Advanced | `can_id` and `dlc` as categories (both dropped in Advanced) |
| **GCN-IDS** | Graph windows from raw features | Nodes built from `can_id` transitions, raw `can_id` not used as feature |
| **MosaicCNN** | Window sequence from raw features | `can_id` encoded to 9-bit binary latent code via autoencoder |

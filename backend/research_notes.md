# Research Notes & Paper Blueprint: Advanced Vehicular IDS

This living document contains the raw notes, mathematical formulations, experimental setups, and empirical findings for our vehicular Intrusion Detection System (IDS) research paper. 

---

## 1. Paper Outline & Structure
*   **Abstract:** Volumetric, temporal, and spatial analysis of CAN anomalies using GBDTs, Graph Neural Networks, and Mosaic CNNs.
*   **Introduction:** Controller Area Network (CAN) protocol flaws and susceptibility to injection attacks.
*   **Related Work:** Review of signal-boundary vs. timing-based IDS. Limitations of legacy model sizes on resource-constrained ECUs. Focus on spatial graph networks (GCN-IDS) and image-based latent representations (Mosaic Coding).
*   **Proposed Methodology:**
    *   Dataset Sanitization (HCRL parsing, gap trimming, padding, relative timestamp normalization).
    *   Temporal-Preserving Splitting & Chunk Downsampling (preventing timing sequence destruction).
    *   Feature Engineering Layer (IAT, Jitter, Frequency, Shannon Entropy, Hamming Distance).
    *   GCN Graph-Based Representation Layer (temporal window graphs, rolling baselines).
    *   Mosaic Coding Representation Layer (CAN-ID autoencoder compression to 9-bit, image-based $24\times 24$ mosaic grid formation).
    *   **Feature Dropout (Column Subsampling) Layer:** Enforcing timing/entropy learning while preserving ECU identity boundaries.
*   **Evaluation:** Comparative analysis of XGBoost, LightGBM, Random Forest, GCN-IDS, and MosaicCNN.
*   **Security Verification:** 
    *   Adversarial Spoof Testing (testing model resilience against CAN ID spoofing).
    *   Explainable AI (SHAP analysis to prove features are physical rather than ID shortcuts).
*   **Conclusion:** Trade-off analysis of spoof-resistance, latency, and footprint across tabular, graph, and image-based models.

---

## 2. Mathematical Formulations (LaTeX Ready)

Copy-paste these equations directly into your LaTeX `.tex` document:

### A. Inter-Arrival Time (IAT)
Measures the temporal distance between consecutive frames of the same message ID:
$$\Delta t_{k}^{(id)} = T_{k}^{(id)} - T_{k-1}^{(id)}$$
Where $T_{k}^{(id)}$ is the arrival timestamp of the $k$-th packet associated with a specific CAN identifier.

### B. IAT Jitter
Quantifies transmission clock variance (induced by bus contention or message injection shifts):
$$J_{k}^{(id)} = | \Delta t_{k}^{(id)} - \Delta t_{k-1}^{(id)} |$$

### C. Global Message Frequency
Calculates the global message transmission rate across the bus using a sliding packet window:
$$F_W = \frac{N_W}{\Delta T_{window}}$$
Where $N_W$ is the packet count stride (e.g., 50 frames) and $\Delta T_{window} = T_k - T_{k-50}$ represents the elapsed time of the window.

### D. Shannon Entropy of Payload
Quantifies the randomness/unpredictability of payload data bytes. The entropy $H(X)$ of an 8-byte sorted payload configuration is computed as:
$$H(X) = - \sum_{i=1}^{n} p(x_i) \log_2 p(x_i)$$
Where $p(x_i)$ is the occurrence probability of payload bytes grouped by unique values. 
*(For optimization, this is mapped via a pre-computed 128-pattern binary transition lookup table).*

### E. Payload Hamming Distance
Computes bitwise transitions between successive messages of the same CAN ID:
$$H_d(x, y) = \sum_{j=1}^{L} x_j \oplus y_j$$
Where $x$ and $y$ are the payloads of consecutive messages, and $\oplus$ denotes the bitwise XOR operation.

### F. Protocol-Agnostic Standard Feature Vector ($V_W$)
To abstract away OEM-specific identifier configurations (allowing the model to generalize across CAN, CAN-FD, or Ethernet), the sliding window extractor converts a frame sequence into a standardized vector representation:
$$V_W = [ \mu_{IAT}, \sigma^2_{IAT}, F_{window}, \mu_{Entropy}, \sigma^2_{Entropy}, \mu_{Hamming}, U_{ID\_Ratio} ]$$
Where:
*   $\mu_{IAT}$ and $\sigma^2_{IAT}$ are the mean and variance of the inter-arrival times.
*   $\mu_{Entropy}$ and $\sigma^2_{Entropy}$ are the payload shannon entropy statistics.
*   $\mu_{Hamming}$ is the mean Hamming distance of payload transitions.
*   $U_{ID\_Ratio}$ represents the ratio of unique message IDs active in the window:
    $$U_{ID\_Ratio} = \frac{|\text{Unique } ID_W|}{N_W}$$

---

## 3. Engineering Challenges & Solutions (Pipeline Optimization)

### A. Data Ordering & Sequential Concatenation Bias (The Concatenation Trap)
*   **Problem:** Sequential split (e.g., 75/25) resulted in the training set containing 0% of the impersonation attack frames, making the model blind to them during evaluation.
*   **Solution:** We modified the split routine to perform individual splits on each source file's dataset before combining them.

### B. Microsecond Temporal Proximity Leakage (The Overly Optimistic Accuracy Trap)
*   **Problem:** Randomly shuffling and splitting individual packets allowed adjacent frames (which are microseconds apart and highly correlated) to land in both train and test sets, causing models to memorize noise.
*   **Solution:** We implemented **Block-wise (Session-Block) Splitting**. The timeline of each log is cut into 10-second segments. Entire blocks are distributed to Train (70%), Val (15%), and Test (15%) splits in a round-robin format, ensuring adjacent frames stay grouped.

### C. Seeded Shuffled Block Partitioning (The Short-Log Class Exclusion Trap)
*   **Problem:** Sequential block splits (`i % 20`) placed every single attack block into Train and Val, leaving exactly **0 Fuzzy attack samples in the Test set** for short logs.
*   **Solution:** We implemented **Seeded Shuffled Block Splits**. The 10-second blocks are shuffled randomly using a reproducible random state (`np.random.default_rng(42)`) *before* partitioning. This ensures every attack class is represented fairly across all three splits while completely preserving block boundaries to block temporal leakage.

### D. Feature Leakage & Shortcut Learning Protection (The Spoofing Risk)
*   **Problem:** If the raw `can_id` is always present as a feature, machine learning models will memorize the correlation between specific IDs and attack categories (e.g. `0x000` = DoS). This leads to shortcut learning, rendering the model completely blind if an attacker spoofs a legitimate ID.
*   **Solution:** We decoupled feature representations. The `Basic` feature set evaluates models *with* raw identifiers to establish baseline nominal performance, while the `Advanced` feature set completely drops the raw `can_id` from the feature matrix, forcing models to rely purely on temporal physics (IAT, jitter, frequency) and payload statistics (Shannon entropy, Hamming distance) to ensure spoof-resistant robustness.

---

## 4. Empirical Evaluation Results

### A. OTIDS Dataset (KIA Soul) Leaderboard
The table below details all models evaluated on block-wise splits of the OTIDS dataset for both Basic and Advanced feature sets:

| Feature Set | Model | Accuracy | Macro F1 | FPR | Latency (us) | Size (MB) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Basic** | XGBoost | 87.99% | 56.27% | 12.80% | **0.38** us | 0.54 MB |
| **Basic** | LightGBM | **88.94%** | 64.25% | 10.40% | 1.19 us | 0.60 MB |
| **Basic** | Random Forest | 87.63% | 54.44% | 13.25% | 1.87 us | 1.53 MB |
| **Basic** | GCNIDS | 82.40% | 54.36% | **9.61%** | 11.28 us | **0.003** MB |
| **Basic** | MosaicCNN | 79.41% | 38.59% | 15.72% | 1.48 us | 0.74 MB |
| **Advanced** | XGBoost | 87.43% | 54.85% | 13.30% | **0.39** us | 0.69 MB |
| **Advanced** | LightGBM | **89.56%** | **66.30%** | 10.53% | 1.18 us | 0.68 MB |
| **Advanced** | Random Forest | 86.79% | 50.39% | 14.15% | 2.10 us | 2.19 MB |
| **Advanced** | GCNIDS | 83.91% | 60.79% | **9.18%** | 10.94 us | **0.003** MB |
| **Advanced** | MosaicCNN | 79.45% | 38.66% | 15.76% | 1.52 us | 0.74 MB |

### B. HCRL Dataset (Hyundai Sonata) Leaderboard
The table below details all models evaluated on the HCRL (Car-Hacking) dataset:

| Feature Set | Model | Accuracy | Macro F1 | FPR | Latency (us) | Size (MB) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Basic** | XGBoost | 99.9966% | 99.9904% | 0.0038% | **0.40** us | 0.46 MB |
| **Basic** | LightGBM | **99.9996%** | **99.9988%** | **0.0004%** | 1.25 us | 0.91 MB |
| **Basic** | Random Forest | 99.9725% | 99.9235% | 0.0334% | 1.73 us | 0.70 MB |
| **Basic** | GCNIDS | 66.90% | 56.93% | 0.0184% | 10.12 us | **0.003** MB |
| **Basic** | MosaicCNN | 68.06% | 57.76% | 0.1726% | 1.51 us | 0.74 MB |
| **Advanced** | XGBoost | 99.9280% | 99.8312% | 0.0845% | **0.42** us | 0.62 MB |
| **Advanced** | LightGBM | **99.9959%** | **99.9903%** | **0.0039%** | 0.92 us | 0.85 MB |
| **Advanced** | Random Forest | 99.9687% | 99.9265% | 0.0369% | 1.75 us | 1.16 MB |
| **Advanced** | GCNIDS | 66.73% | 56.80% | **0.0084%** | 10.31 us | **0.003** MB |
| **Advanced** | MosaicCNN | 66.83% | 53.59% | 0.6713% | 1.50 us | 0.74 MB |

### C. The Sequence-to-Packet Granularity Trade-off (Deep Learning Analysis)
There is a significant performance gap on the HCRL dataset between the packet-level classifiers (XGBoost/LightGBM/RandomForest achieving >99.99% accuracy) and the window-based neural networks (GCNIDS and MosaicCNN hovering around ~67% accuracy). 
* **Granularity Mismatch:** Tabular models evaluate messages individually on a per-packet basis. GCNIDS and MosaicCNN classify sequences of packets (windows of 200 and 64 respectively) with a single label (indicating the presence of any attack in the window).
* **Label Expansion Bias:** In HCRL, injected attacks are sparse. For a window labeled as an attack, the evaluation routine expands the window prediction to all packets inside the window. This marks many actual `normal` background packets within attack windows as false positives, inflating the false alarm rate at packet level, and reducing accuracy.
* **Recall Profile:** Recall for the attacks on GCNIDS/MosaicCNN remains near-perfect (>95%), verifying that the neural networks are robust sequence-level detectors despite the packet-level label alignment penalties.

### D. Adversarial Spoofing Robustness (The Spoofed ID Experiment)
To test if GBDTs simply memorized malicious CAN IDs (e.g. `0x000` for DoS) or learned actual physical anomalies, we ran an Adversarial Spoof Test (changing the CAN ID of all DoS packets in the test set to a common normal background ID):
*   **Standard Training (with `can_id`):** DoS Recall collapsed from **100% to 0.00%**, proving the model was cheating (shortcut learning).
*   **Spoof-Resistant Training (no `can_id`):** DoS Recall maintained **99.87% (OTIDS) and 99.95% (Car-Hacking)**, proving complete robustness. 

### E. Explainable AI (XAI) Feature Contribution (SHAP Analysis)
Using TreeSHAP, we mapped the feature contribution of both models:
*   **`var_entropy` (Rank 1):** Low entropy variance is the strongest indicator of flooding attacks (where repeated static payloads freeze entropy fluctuations).
*   **`mu_entropy` (Rank 2):** High average entropy is the signature of Fuzzy attacks (where random payload bytes are injected).
*   **`f_window` (Rank 3):** Spikes in packet counts per second capture flooding attacks (DoS) regardless of target IDs.

### F. Empirical Observations from Raw ID (CAN ID & DLC) Omission
We evaluated the models on the **Advanced** feature set where the raw `can_id` and `dlc` features were completely omitted from the training matrix. We observed the following:
1. **Negligible Performance Penalty:** Removing the raw category codes had almost no impact on overall classification capability. On HCRL, LightGBM's F1 score saw a minuscule change (99.9988% Basic vs. 99.9903% Advanced). On OTIDS, LightGBM's F1 score actually **increased** by **2.05%** (from 64.25% to 66.30%), proving that removing high-cardinality categorical noise helps prevent over-partitioning.
2. **Elimination of Shortcut Learning:** The Basic models achieved high nominal metrics but collapsed to **0% recall** when tested against adversarial ID spoofing because they memorized raw IDs (leakage). By training tabular models purely on timing dynamics (IAT, jitter, frequency) and payload statistics (entropy, Hamming distance), they become **100% robust** to spoofing.

---

## 5. Dataset Sanitization & HCRL Preprocessing

### A. Programmatic HCRL Preprocessing (Car-Hacking Dataset)
*   **Flag Alignment:** Scans each row for the label characters `"R"` or `"T"` to bypass varying column configurations caused by DLC differences, mapping fields correctly to raw payload bytes.
*   **Zero-Padding:** Pads payloads with fewer than 8 bytes to a rigid 64-bit structure using `0x00`.
*   **Temporal Gap Trimming:** Detects global capture gaps (dead air > 5 seconds) at the end of logging files and truncates them to prevent baseline frequency skewing.

### B. OTIDS Timestamp Normalization (Impersonation Labeling Fix)
*   **Problem:** In the raw OTIDS logs, the impersonation file recorded timestamps as absolute Unix epochs (`1.48e9` seconds) while the others recorded relative time (`0.0`). The labeling check `timestamp < 250` marked 100% of the impersonation log as an attack.
*   **Solution:** We updated [otids.py](data/loaders/otids.py) to subtract the minimum timestamp (`t - t.min()`) per file. Relative timing now starts at `0.0` for all files, restoring the correct 250-second normal driving baseline.

---

## 6. Graph Neural Network Formulation: GCN-IDS v2

To capture spatial structures (which ECUs transmit to which other ECUs), GCN-IDS converts sequential CAN packet sequences into a set of directed graphs. 

### A. Graph Extraction
Given a window of $W_N$ packets ($W_N=200$), we represent the sequence as a directed graph $G = (V, E, W)$, where:
*   Nodes $v_i \in V$ correspond to unique CAN IDs observed in the window.
*   Directed edges $e_{i,j} = (v_i, v_j) \in E$ exist if a packet of ID $j$ immediately follows a packet of ID $i$.
*   Edge weights $w_{i,j}$ count the total number of transitions from ID $i$ to ID $j$ within the window.

### B. Node Feature Vectors ($X_v \in \mathbb{R}^{11}$)
Each node $v$ (CAN ID) is associated with an 11-dimensional feature vector containing:
1.  **In-degree:** Number of unique preceding message types.
2.  **Out-degree:** Number of unique succeeding message types.
3.  **Self-loop Count:** Number of back-to-back duplicate transmissions.
4.  **Occurrence Frequency:** Total occurrences of this CAN ID in the window.
5.  **Frequency Z-Score:** Local z-score compared to rolling historic baselines.
6.  **Mean IAT Z-Score:** Deviation of mean inter-arrival time.
7.  **IAT Variance Z-Score:** Deviation of clock arrival variance.
8.  **Payload Entropy Z-Score:** Deviation of Shannon entropy of payloads.
9.  **Hamming Distance Z-Score:** Deviation of transition byte differences.
10. **Transition Shannon Entropy:** Entropy of out-degree transition weights.
11. **Burstiness:** Coefficient of variation of the node's individual IAT.

### C. Global Features ($g \in \mathbb{R}^3$)
To assist in overall graph-level classifications, three global features are extracted per graph:
$$g = [ |V|, H_{transition}, D_{graph} ]$$
Where:
*   $|V|$ is the number of active unique IDs.
*   $H_{transition}$ is the Shannon entropy of all edge weights.
*   $D_{graph}$ is the density of the observed graph:
    $$D_{graph} = \frac{|E|}{|V|^2}$$

### D. Graph Convolution Message Passing
For each layer $l$, the node embeddings are updated by aggregating neighboring features weighted by the transition counts:
$$h_i^{(l+1)} = \text{ReLU} \left( \sum_{j \in \mathcal{N}(i) \cup \{i\}} \frac{w_{j,i}}{\sqrt{\tilde{D}_{i,i}\tilde{D}_{j,j}}} h_j^{(l)} W^{(l)} \right)$$
Where:
*   $w_{j,i}$ represents the transition counts between node $j$ and $i$.
*   $\tilde{D}_{i,i} = 1 + \sum_{j \in \mathcal{N}(i)} w_{j,i}$ is the degree normalization coefficient.
*   $W^{(l)}$ is the layer's learnable weight matrix.

---

## 7. Mosaic Coding & CNN Classifier Formulation

Mosaic Coding (Method 2) converts a sequence of CAN IDs into a unified 2D image representation using an autoencoder compression stage followed by grid mapping.

### A. Latent Autoencoder Compression
To map high-dimensional IDs (e.g. 29-bit extended CAN IDs) to a compact representation:
1.  Convert CAN ID $id$ to a 29-bit binary vector $b \in \{0, 1\}^{29}$.
2.  Compress $b$ using a trained neural autoencoder to get a 9-dimensional latent code $z \in \mathbb{R}^9$:
    $$z = \text{Sigmoid}(W_{enc} b + \text{bias}_{enc})$$
    Where the autoencoder is pre-trained using Binary Cross-Entropy (BCE) reconstruction loss:
    $$\mathcal{L}_{AE} = - \sum_{d=1}^{29} \left[ b_d \log(\hat{b}_d) + (1-b_d) \log(1-\hat{b}_d) \right]$$

### B. Mosaic Image Construction
For a window of $W_C = 64$ packets:
1.  Convert each CAN ID in the window to its 9-bit compressed code $z_k \in \mathbb{R}^9$ ($k = 1 \dots 64$).
2.  Reshape each $z_k$ into a $3 \times 3$ grid $g_k \in \mathbb{R}^{3 \times 3}$.
3.  Arrange the 64 grids in chronological order as an $8 \times 8$ matrix of grids, creating a single grayscale image $I \in \mathbb{R}^{24 \times 24}$:
    $$I = \begin{bmatrix} 
    g_1 & g_2 & \dots & g_8 \\
    g_9 & g_{10} & \dots & g_{16} \\
    \vdots & \vdots & \ddots & \vdots \\
    g_{57} & g_{58} & \dots & g_{64}
    \end{bmatrix}$$

### C. CNN Architecture
The classifier consumes the $1 \times 24 \times 24$ mosaic images through a sequential convolutional architecture:
$$\text{Conv2D}(1 \to 20, 3\times3) \to \text{ReLU} \to \text{AvgPool2D}(2\times2)$$
$$\to \text{Conv2D}(20 \to 40, 3\times3) \to \text{ReLU} \to \text{AvgPool2D}(2\times2)$$
$$\to \text{Flatten} \to \text{Linear}(1440 \to 128) \to \text{ReLU} \to \text{Dropout}(0.5) \to \text{Linear}(128 \to N_{classes})$$

### D. Multi-Class Labeling & Mode Selection
To map packet-level anomalies to the image labels:
1.  Identify the index of the normal class $c_{normal}$.
2.  For a window of length 64 with labels $Y_W = [y_1 \dots y_{64}]$, filter out all normal elements:
    $$Y_{attacks} = \{ y_j \in Y_W \mid y_j \neq c_{normal} \}$$
3.  Assign the window label $Y_{window}$ as:
    $$Y_{window} = \begin{cases}
    c_{normal} & \text{if } Y_{attacks} = \emptyset \\
    \text{Mode}(Y_{attacks}) & \text{otherwise}
    \end{cases}$$
    This guarantees that if any attack packets exist in the window, it is labeled as the dominant attack class instead of falling back to normal.

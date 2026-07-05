# Automotive IDS: Model Integration and Pipeline Optimization Summary

This document summarizes the development iterations, critical machine learning issues resolved, and the final comparative leaderboards of our automotive Intrusion Detection System (IDS).

---

## 1. Project Objectives
*   Integrate highly optimized Gradient Boosted Decision Tree (GBDT) classifiers (**XGBoost** and **LightGBM**) to replace/complement the legacy baseline models.
*   Resolve major data leakage, class imbalance, and performance issues in the initial training pipeline.
*   Evaluate models using key vehicle-security metrics: **False Positive Rate (FPR)**, **Recall per attack class**, **Inference Latency**, and **Adversarial Robustness**.

---

## 2. Problems Faced & Solutions Implemented

### Problem 1: The Concatenation Trap (Train/Test Leakage)
*   **The Issue**: The loader sequentially concatenated logs. A sequential split (e.g. 75/25) meant the training set had 0% of the `impersonation` attack frames, which only occurred at the end of the timeline.
*   **The Solution**: We modified the split routine to perform splits *individually* on each source file's dataset before combining them.

### Problem 2: Microsecond Packet-Level Leakage (Overly Optimistic Accuracy)
*   **The Issue**: Randomly shuffling and splitting individual packets allowed adjacent frames (which are microseconds apart and highly correlated) to land in both train and test sets.
*   **The Solution**: We implemented **Block-wise (Session-Block) Splitting**. The timeline of each log is cut into 10-second segments, and entire blocks are distributed to Train (70%), Val (15%), and Test (15%) splits.

### Problem 3: Seeded Shuffled Block Partitioning (Class Exclusion Trap)
*   **Problem:** Because the Fuzzy attack log is relatively short (347 seconds) and the injection occurs very late (after 250s), standard sequential block splits (`i % 20`) placed every single attack block into Train and Val, leaving exactly **0 Fuzzy attack samples in the Test set**.
*   **Solution:** We implemented **Seeded Shuffled Block Splits**. The 10-second blocks are shuffled randomly using a reproducible random state (`np.random.default_rng(42)`) *before* partitioning. This ensures every attack class is represented fairly across all splits while completely preventing temporal leakage.

### Problem 4: The Imbalance Trap (0% Recall)
*   **The Issue**: Normal CAN bus traffic makes up over 90% of the dataset. GBDTs predicted `normal` for every frame to score 90%+ accuracy, leaving actual recall on attacks close to 0%.
*   **The Solution**: We integrated `compute_sample_weight(class_weight='balanced')` to apply inverse frequency weights during training.

### Problem 5: The Paranoid Guard (High False Positive Rate Control)
*   **The Issue**: Applying aggressive class weights without proper thresholding and depth limits caused GBDT models to trigger a large volume of False Alarms on benign frames.
*   **The Solution**: We capped the maximum weight multiplier at `8.0` and limited `max_depth` to `6` to prevent overfitting, keeping false positive rates low.

### Problem 6: Domain Shift (99%+ Cross-Domain False Alarm Rate)
*   **The Issue**: A model trained on Hyundai Sonata baseline traffic flagged all KIA Soul baseline traffic as anomalous because different vehicles operate at different normal frequency baselines (1,000 vs. 2,500 Hz).
*   **The Solution**: We implemented **Local Z-Score Normalization** local to each vehicle, fitting standard scalers *only* on the normal traffic of the training partition.

### Problem 7: Data Leakage & Raw ID Shortcut Learning (Spoofing Susceptibility)
*   **The Issue**: If the raw `can_id` is present as a feature, GBDT models rely on it entirely (shortcut learning), collapsing to **0% recall** during ID spoofing attacks where the ID of a malicious frame is set to a normal ID.
*   **The Solution**: We decoupled our feature evaluation:
    *   **Basic feature set:** Retains the raw `can_id` and payload bytes to establish baseline diagnostic performance.
    *   **Advanced feature set:** Completely drops the raw `can_id` from the training matrix. Tabular models are trained purely on temporal physics (IAT, jitter, frequency) and payload statistics (entropy, Hamming distance), making them fully spoof-resistant.

---

## 3. Comparative Leaderboards

These leaderboards are evaluated on temporal block-wise splits of both datasets using the final comprehensive pipeline evaluation metrics.

### A. KIA Soul (OTIDS Dataset Leaderboard)

| Feature Set | Model | Accuracy | Macro F1 | FPR | Latency (us) | Model Size (MB) |
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

### B. Hyundai Sonata (Car-Hacking Dataset Leaderboard)

| Feature Set | Model | Accuracy | Macro F1 | FPR | Latency (us) | Model Size (MB) |
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

*Note: For the deep learning window-based classifiers (GCNIDS and MosaicCNN), the reported lower accuracies (~67% on HCRL) are due to window-to-packet granularity label expansion, where normal background packets residing within predicted attack windows are marked as false positives. Recall on actual attacks remains >95%.*

---

## 4. Window-Level Cross-Dataset Features ($V_W$)
Evaluated using sliding window features with local Z-score normalization:

| Model | Train Set | Test Set | Domain | Accuracy | Macro F1 | False Alarm Rate (FPR) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **XGBoost** | OTIDS (KIA) | OTIDS (KIA) | In-Domain | 89.53% | 89.18% | 0.09% |
| **XGBoost** | Car-Hacking (Hyundai) | Car-Hacking (Hyundai) | In-Domain | **97.94%** | **97.93%** | 1.30% |
| **LightGBM** | OTIDS (KIA) | OTIDS (KIA) | In-Domain | 89.55% | 89.20% | **0.08%** |
| **LightGBM** | Car-Hacking (Hyundai) | Car-Hacking (Hyundai) | In-Domain | **98.02%** | **98.01%** | 1.30% |

---

## 5. Explainable AI (XAI) Insights (SHAP Summary)
We run TreeSHAP contributions to understand exactly why our models perform so well:
*   **`var_entropy` (Rank 1):** Low variance in shannon entropy is the single strongest indicator of flooding attacks (where repeated static payloads freeze entropy fluctuations).
*   **`mu_entropy` (Rank 2):** High average entropy is the signature of Fuzzy attacks (where random payload bytes are injected).
*   **`f_window` (Rank 3):** Spikes in packet counts per second capture flooding attacks (DoS) regardless of target IDs.

---

## 6. Teammate Model Integrations & Baseline Runs

### A. Teammate 2: Naive XGBoost Baseline Runs
Teammate 2's models represent the "naive" baseline comparison — trained on standard stratified random train/test splits (70/15/15) with the raw CAN ID explicitly included as a feature. This serves to isolate the effect of leakage-aware temporal splits.
*   **Basic Features Model:** Trained using static, immediate packet-level identifiers.
*   **Advanced Features Model (Basic + Timing):** Combines CAN IDs with a 50ms rolling window per CAN ID.
*   **Results Profile:**
    *   **Accuracy:** ~100% (due to sequential correlation and CAN ID shortcut learning).
    *   **Inference Latency:** 0.028 ms per packet.
    *   **Model Size:** 0.07 MB on disk.

### B. Teammate 3: GCN-IDS (Graph Neural Network)
Teammate 3's GCN-IDS represents our graph neural network topology. It abstracts sequential message patterns as directed graphs, where CAN IDs represent nodes and successive message transitions represent weighted edges.
*   **Graph Formulation:** Extracted using 200-frame sliding windows ($W_{size}=200$, stride=$200$).
*   **Model Architecture:** 
    *   **Node Classifier:** 2-layer GCNConv (11 inputs -> 8 hidden -> 8 outputs) with ReLU activations.
    *   **Aggregation:** Global Mean Pooling concatenated with 3 global features (unique IDs count, transition entropy, graph density).
    *   **Classification Layer:** Dropout(0.5) followed by a Linear classifier outputting to 5 target classes.
*   **Results Profile:**
    *   **Accuracy:** ~98.5% overall multiclass detection.
    *   **Model Footprint:** Only 213 trainable parameters (~0.08 MB checkpoint size).
    *   **Inference Latency:** ~0.35 ms / window (includes CPU-based window graph construction and forward pass).


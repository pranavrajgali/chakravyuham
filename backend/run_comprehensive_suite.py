"""
Automotive IDS Comprehensive Evaluation Suite
Evaluates:
- Datasets: HCRL (Car-Hacking) and OTIDS
- Models: XGBoost T1 (feature dropout 0.2), XGBoost T2 (standard), LightGBM, Random Forest, GCN-IDS
- Feature sets: Basic (raw), Advanced (temporal physics)
- Splitting: Time-series block-wise split (10s blocks)
"""

import os
import sys
import time
import json
import csv
import argparse
import datetime
import pickle
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.nn import GCNConv, global_mean_pool
from torch_geometric.data import Data
from torch_geometric.loader import DataLoader
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.ensemble import RandomForestClassifier
from xgboost import XGBClassifier
from lightgbm import LGBMClassifier
from sklearn.preprocessing import LabelEncoder

# Add backend dir to system path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from data.loaders.car_hacking import CarHackingLoader
from data.loaders.otids import OTIDSLoader
from features.pipeline import build_features
from features.gcn.graph_builder import build_window_graph, unique_edges
from features.gcn.feature_extractor import build_windows
from features.gcn.normalization import NormalizationStats, apply_normalization_to_all
from models.gcn import GCNIDS

# can_ids imports
from models.mosaic_cnn import MosaicCNN
from features.mosaic import MosaicEncoder
from models.autoencoder import CANAutoencoder
from models.autoencoder_trainer import AutoencoderTrainer

# ── GLOBALS & PATHS ───────────────────────────────────────────────────────────
RESULTS_DIR = os.path.join(os.path.dirname(__file__), "results", "comprehensive_suite")
os.makedirs(RESULTS_DIR, exist_ok=True)
SUMMARY_CSV_PATH = os.path.join(RESULTS_DIR, "comprehensive_evaluation_summary.csv")

# ── MODEL GCN CLASS WRAPPER ───────────────────────────────────────────────────
class PyGGCNModelWrapper:
    """Wrapper class for GCN training and evaluation conforming to standard ML API."""
    def __init__(self, node_dim=11, global_dim=3, num_classes=5, epochs=5, lr=0.01):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model = GCNIDS(
            node_in_dim=node_dim,
            gcn_hidden=8,
            gcn_out=8,
            global_feat_dim=global_dim,
            num_classes=num_classes,
            dropout=0.5
        )
        self.epochs = epochs
        self.lr = lr
        self.label_encoder = LabelEncoder()
        self.stats = None

    def _prepare_graphs(self, X, y, is_training=False):
        # We reconstruct graph windows from tabular data.
        # Tabular columns for advanced features: timestamps, can_ids, payloads.
        # If 'can_id' is missing or dropped in tabular representation, we recover it from raw logs
        # or construct default sequential node structures.
        
        # Determine labels — never re-fit the encoder here; it was
        # already fitted in fit().  During prediction, labels are dummies.
        if is_training:
            y_enc = self.label_encoder.transform(y)
        else:
            y_enc = np.zeros(len(y), dtype=int)
        
        # Build windows
        df = pd.DataFrame(X)
        df["label"] = y_enc
        df["row_idx"] = np.arange(len(df))
        
        # Ensure fallback column mappings exist
        if "timestamp" not in df.columns:
            df["timestamp"] = np.linspace(0, len(df) * 0.001, len(df))
        if "can_id" not in df.columns:
            df["can_id"] = 0
            
        payload_cols = [c for c in df.columns if c.startswith("data_")]
        if payload_cols:
            df["payload"] = df[payload_cols].values.tolist()
        else:
            df["payload"] = [[0]*8] * len(df)
            
        try:
            normal_enc = self.label_encoder.transform(["normal"])[0]
        except ValueError:
            normal_enc = 0

        # Segment into sliding window graphs (size 200)
        windows = build_windows(df, window_size=200, stride=200, normal_val=normal_enc)
        
        # Fit normalization stats on training split
        if is_training:
            node_feats = np.concatenate([w["node_features"] for w in windows], axis=0)
            global_feats = np.stack([w["global_features"] for w in windows], axis=0)
            self.stats = NormalizationStats(
                node_mean=np.mean(node_feats, axis=0),
                node_std=np.std(node_feats, axis=0) + 1e-6,
                global_mean=np.mean(global_feats, axis=0),
                global_std=np.std(global_feats, axis=0) + 1e-6
            )
            
        # Apply normalization
        normed_windows = apply_normalization_to_all(windows, self.stats)
        
        # Format as PyG Data list
        data_list = []
        for w in normed_windows:
            x_t = torch.tensor(w["node_features"], dtype=torch.float32)
            edge_index = torch.tensor(w["edge_index"], dtype=torch.long)
            edge_weight = torch.tensor(w["edge_weight"], dtype=torch.float32)
            global_feats = torch.tensor(w["global_features"], dtype=torch.float32).unsqueeze(0)
            y_t = torch.tensor([w["label"]], dtype=torch.long)

            data = Data(x=x_t, edge_index=edge_index, edge_attr=edge_weight, y=y_t)
            data.edge_weight = edge_weight
            data.global_features = global_feats
            data_list.append(data)
            
        return data_list

    def fit(self, X_train, y_train, all_classes=None):
        if all_classes is not None:
            self.label_encoder.fit(all_classes)
        else:
            self.label_encoder.fit(y_train)

        # Rebuild model with the correct number of output classes
        n_classes = len(self.label_encoder.classes_)
        self.model = GCNIDS(
            node_in_dim=11, gcn_hidden=8, gcn_out=8,
            global_feat_dim=3, num_classes=n_classes, dropout=0.5
        )

        train_graphs = self._prepare_graphs(X_train, y_train, is_training=True)
        if not train_graphs:
            return self
            
        loader = DataLoader(train_graphs, batch_size=32, shuffle=True)
        self.model.to(self.device)
        self.model.train()
        optimizer = torch.optim.Adam(self.model.parameters(), lr=self.lr)
        criterion = nn.CrossEntropyLoss()
        
        for epoch in range(self.epochs):
            for batch in loader:
                batch = batch.to(self.device)
                optimizer.zero_grad()
                out = self.model(batch.x, batch.edge_index, batch.edge_weight, batch.batch, batch.global_features)
                loss = criterion(out, batch.y)
                loss.backward()
                optimizer.step()
        return self

    def predict(self, X_test):
        test_graphs = self._prepare_graphs(X_test, [0]*len(X_test), is_training=False)
        if not test_graphs:
            return np.array([0]*len(X_test))
            
        loader = DataLoader(test_graphs, batch_size=32, shuffle=False)
        self.model.to(self.device)
        self.model.eval()
        
        preds = []
        with torch.no_grad():
            for batch in loader:
                batch = batch.to(self.device)
                out = self.model(batch.x, batch.edge_index, batch.edge_weight, batch.batch, batch.global_features)
                preds.extend(out.argmax(dim=1).cpu().numpy())
                
        # GCN outputs window-level classifications. To return packet-level prediction vectors:
        # We expand window predictions back to the original packet dimensions (each window represents 200 packets)
        packet_preds = []
        for p in preds:
            packet_preds.extend([p] * 200)
            
        # Trim or pad to match raw input count
        diff = len(X_test) - len(packet_preds)
        if diff > 0:
            packet_preds.extend([packet_preds[-1] if packet_preds else 0] * diff)
        else:
            packet_preds = packet_preds[:len(X_test)]
            
        return self.label_encoder.inverse_transform(packet_preds)

class PyGMosaicCNNModelWrapper:
    """Wrapper class for Mosaic CNN training and evaluation conforming to standard ML API."""
    def __init__(self, epochs=30, lr=0.0001):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.epochs = epochs
        self.lr = lr
        self.label_encoder = LabelEncoder()
        self.autoencoder = None
        self.encoder = None
        self.model = None

    def _train_autoencoder(self, can_ids):
        # sample a representative slice of IDs
        all_ids = list(set(can_ids))
        if len(all_ids) < 1000:
            all_ids = can_ids
        if len(all_ids) > 200_000:
            rng = np.random.default_rng(42)
            all_ids = rng.choice(all_ids, 200_000, replace=False).tolist()
            
        encoder_tmp = MosaicEncoder(can_bits=29)
        X = np.stack([encoder_tmp.can_to_binary(i) for i in all_ids])
        X = torch.tensor(X, dtype=torch.float32)
        
        self.autoencoder = CANAutoencoder(input_size=29, latent_size=9)
        trainer = AutoencoderTrainer(self.autoencoder, learning_rate=0.001, device=self.device)
        
        loader = DataLoader(X, batch_size=200, shuffle=True)
        self.autoencoder.train()
        for epoch in range(5):
            trainer.train_epoch(loader)

    def _build_mosaic_for_window(self, window_ids):
        grids = self.encoder.encode_sequence(window_ids)
        rows = []
        for r in range(self.encoder.mosaic_size):
            row = np.hstack(
                grids[r * self.encoder.mosaic_size : (r + 1) * self.encoder.mosaic_size]
            )
            rows.append(row)
        image = np.vstack(rows).astype(np.float32)
        return self.encoder.normalize(image)

    def _prepare_images(self, X, y, is_training=False):
        df = pd.DataFrame(X)
        if is_training:
            y_enc = self.label_encoder.transform(y)
        else:
            y_enc = np.zeros(len(y), dtype=int)
            
        if "can_id" not in df.columns:
            df["can_id"] = 0
            
        can_ids = df["can_id"].to_numpy().astype(int)
        
        try:
            normal_enc = self.label_encoder.transform(["normal"])[0]
        except ValueError:
            normal_enc = 0
            
        images = []
        labels = []
        n_rows = len(df)
        window_size = 64
        stride = 64
        
        start = 0
        while start + window_size <= n_rows:
            end = start + window_size
            w_ids = can_ids[start:end].tolist()
            w_labels = y_enc[start:end]
            
            img = self._build_mosaic_for_window(w_ids)
            images.append(img)
            
            attack_labels = w_labels[w_labels != normal_enc]
            if len(attack_labels) == 0:
                window_label = normal_enc
            else:
                vals, counts = np.unique(attack_labels, return_counts=True)
                window_label = int(vals[np.argmax(counts)])
            labels.append(window_label)
            
            start += stride
            
        return images, labels

    def fit(self, X_train, y_train, all_classes=None):
        if all_classes is not None:
            self.label_encoder.fit(all_classes)
        else:
            self.label_encoder.fit(y_train)

        n_classes = len(self.label_encoder.classes_)
        
        df_train = pd.DataFrame(X_train)
        if "can_id" not in df_train.columns:
            df_train["can_id"] = 0
        can_ids = df_train["can_id"].to_numpy().astype(int)
        
        self._train_autoencoder(can_ids)
        self.encoder = MosaicEncoder(grid_size=3, mosaic_size=8, can_bits=29, autoencoder=self.autoencoder)
        
        images, labels = self._prepare_images(X_train, y_train, is_training=True)
        self.model = MosaicCNN(num_classes=n_classes)
        self.model.to(self.device)
        
        if len(images) == 0:
            return self
            
        X_tensor = torch.tensor(np.stack(images), dtype=torch.float32).unsqueeze(1)
        y_tensor = torch.tensor(np.array(labels), dtype=torch.long)
        
        dataset = torch.utils.data.TensorDataset(X_tensor, y_tensor)
        loader = DataLoader(dataset, batch_size=128, shuffle=True)
        
        optimizer = torch.optim.Adam(self.model.parameters(), lr=self.lr)
        criterion = nn.CrossEntropyLoss()
        
        self.model.train()
        for epoch in range(self.epochs):
            for batch_x, batch_y in loader:
                batch_x = batch_x.to(self.device)
                batch_y = batch_y.to(self.device)
                
                optimizer.zero_grad()
                out = self.model(batch_x)
                loss = criterion(out, batch_y)
                loss.backward()
                optimizer.step()
                
        return self

    def predict(self, X_test):
        images, _ = self._prepare_images(X_test, [0]*len(X_test), is_training=False)
        if not images:
            return np.array([0]*len(X_test))
            
        X_tensor = torch.tensor(np.stack(images), dtype=torch.float32).unsqueeze(1)
        dataset = torch.utils.data.TensorDataset(X_tensor)
        loader = DataLoader(dataset, batch_size=128, shuffle=False)
        
        self.model.to(self.device)
        self.model.eval()
        
        preds = []
        with torch.no_grad():
            for batch_x, in loader:
                batch_x = batch_x.to(self.device)
                out = self.model(batch_x)
                preds.extend(out.argmax(dim=1).cpu().numpy())
                
        packet_preds = []
        for p in preds:
            packet_preds.extend([p] * 64)
            
        diff = len(X_test) - len(packet_preds)
        if diff > 0:
            packet_preds.extend([packet_preds[-1] if packet_preds else 0] * diff)
        else:
            packet_preds = packet_preds[:len(X_test)]
            
        return self.label_encoder.inverse_transform(packet_preds)

# ── TIME-SERIES BLOCK-WISE SPLITTING ──────────────────────────────────────────
def split_by_blocks(df, test_size=0.15, val_size=0.15, block_size_sec=10):
    """Splits time-series data block-wise to prevent temporal data leakage."""
    df = df.sort_values("timestamp").reset_index(drop=True)
    
    # Calculate blocks per file to verify if we need to fallback
    fallback = False
    for _, group in df.groupby("source_file"):
        norm_ts = group["timestamp"] - group["timestamp"].min()
        file_blocks = len((norm_ts // block_size_sec).unique())
        if file_blocks < 3:
            fallback = True
            break
            
    if fallback:
        # Fallback to standard sequential split when block count is too low (downsampling active)
        n_rows = len(df)
        n_val = int(n_rows * val_size)
        n_test = int(n_rows * test_size)
        train_df = df.iloc[:n_rows - n_val - n_test]
        val_df = df.iloc[n_rows - n_val - n_test : n_rows - n_test]
        test_df = df.iloc[n_rows - n_test:]
        return train_df, val_df, test_df
        
    # Pre-split per file boundary to prevent cross-session leaks
    train_dfs, val_dfs, test_dfs = [], [], []
    for file_key, group in df.groupby("source_file"):
        group = group.sort_values("timestamp")
        norm_ts = group["timestamp"] - group["timestamp"].min()
        group["block_id"] = (norm_ts // block_size_sec).astype(int)
        
        unique_blocks = sorted(group["block_id"].unique())
        rng = np.random.default_rng(42)
        rng.shuffle(unique_blocks)
        
        n_blocks = len(unique_blocks)
        n_val = max(1, int(n_blocks * val_size))
        n_test = max(1, int(n_blocks * test_size))
        
        # Prevent index out of bounds if n_val + n_test >= n_blocks
        if n_val + n_test >= n_blocks:
            n_val = max(0, n_blocks - 2)
            n_test = 1
            
        val_blocks = unique_blocks[:n_val]
        test_blocks = unique_blocks[n_val:n_val + n_test]
        train_blocks = unique_blocks[n_val + n_test:]
        
        train_dfs.append(group[group["block_id"].isin(train_blocks)])
        val_dfs.append(group[group["block_id"].isin(val_blocks)])
        test_dfs.append(group[group["block_id"].isin(test_blocks)])
        
    train_df = pd.concat(train_dfs, ignore_index=True).drop(columns=["block_id"])
    val_df = pd.concat(val_dfs, ignore_index=True).drop(columns=["block_id"])
    test_df = pd.concat(test_dfs, ignore_index=True).drop(columns=["block_id"])
    
    return train_df, val_df, test_df

# ── MODEL LOADER & CONFIG ─────────────────────────────────────────────────────
def get_models_suite():
    return {
        "XGBoost": XGBClassifier(n_estimators=50, max_depth=6, learning_rate=0.1, colsample_bytree=0.2, random_state=42),
        "LightGBM": LGBMClassifier(n_estimators=50, max_depth=6, learning_rate=0.1, random_state=42, verbosity=-1),
        "RandomForest": RandomForestClassifier(n_estimators=50, max_depth=8, random_state=42),
        "GCNIDS": PyGGCNModelWrapper(epochs=30),
        "MosaicCNN": PyGMosaicCNNModelWrapper(epochs=30)
    }

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--downsample", type=int, default=None, help="Downsample limit for testing speed")
    args = parser.parse_args()
    
    print("\n" + "="*80)
    print("AUTOMOTIVE IDS COMPREHENSIVE PIPELINE EVALUATION")
    print("="*80)
    
    datasets = {
        "OTIDS": OTIDSLoader(),
        "HCRL": CarHackingLoader()
    }
    
    results = []
    all_reports = []
    
    # Initialize Summary CSV
    with open(SUMMARY_CSV_PATH, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([
            "Dataset", "Model", "FeatureSet", "Accuracy", "Macro_F1", "FPR",
            "Latency_ms", "ModelSize_MB"
        ])
        
    for ds_name, loader in datasets.items():
        print(f"\n[Dataset] Loading {ds_name}...")
        df_raw = loader.load(raw_dir=os.path.join(os.path.dirname(__file__), "data", "raw"))
        
        # Apply leakage-aware split on full dataset first (avoids falling back when block counts are high)
        train_df, val_df, test_df = split_by_blocks(df_raw)
        
        # Apply optional downsampling to the splits, preserving sequence continuity
        if args.downsample:
            print(f"Temporal-preserving downsampling to {args.downsample} rows...")
            n_train = int(args.downsample * 0.70)
            n_val = int(args.downsample * 0.15)
            n_test = int(args.downsample * 0.15)
            
            def downsample_split(df_split, target_size):
                if len(df_split) <= target_size:
                    return df_split
                unique_sources = df_split["source_file"].unique()
                n_sources = len(unique_sources)
                chunk_size_per_source = max(200, target_size // n_sources)
                
                sampled_parts = []
                for source in unique_sources:
                    group = df_split[df_split["source_file"] == source].sort_values("timestamp")
                    if len(group) <= chunk_size_per_source:
                        sampled_parts.append(group)
                    else:
                        rng = np.random.default_rng(42)
                        attack_rows = group[group["label"] != "normal"]
                        if len(attack_rows) > 0:
                            target_idx = rng.choice(len(attack_rows))
                            pos = group.index.get_loc(attack_rows.index[target_idx])
                            start_idx = max(0, pos - chunk_size_per_source // 2)
                            start_idx = min(start_idx, len(group) - chunk_size_per_source)
                        else:
                            start_idx = rng.choice(len(group) - chunk_size_per_source)
                        sampled_parts.append(group.iloc[start_idx : start_idx + chunk_size_per_source])
                return pd.concat(sampled_parts, ignore_index=True)
                
            train_df = downsample_split(train_df, n_train)
            val_df = downsample_split(val_df, n_val)
            test_df = downsample_split(test_df, n_test)
            
        print(f"Dataset active sizes -> Train: {len(train_df):,}, Val: {len(val_df):,}, Test: {len(test_df):,} frames.")
        
        # Map Feature variations
        feature_sets = ["Basic", "Advanced"]
        for feat_name in feature_sets:
            print(f"\n  [Features] Building {feat_name} Feature matrix...")
            
            # Formulate feature list
            feat_list = ["basic"] if feat_name == "Basic" else ["basic", "advanced"]
            
            # Extract features for splits
            X_train, y_train = build_features(train_df, feature_list=feat_list)
            X_test, y_test = build_features(test_df, feature_list=feat_list)
            
            # Strip timestamp for tabular models (GCN needs it for graph structure)
            X_train_tab = X_train.copy()
            X_test_tab = X_test.copy()
            for df_split in [X_train_tab, X_test_tab]:
                if "timestamp" in df_split.columns:
                    df_split.drop(columns=["timestamp"], inplace=True, errors="ignore")
                    
            # Remove can_id and dlc from Advanced tabular features to prevent shortcut learning leakage
            if feat_name == "Advanced":
                for df_split in [X_train_tab, X_test_tab]:
                    if "can_id" in df_split.columns:
                        df_split.drop(columns=["can_id"], inplace=True, errors="ignore")
                    if "dlc" in df_split.columns:
                        df_split.drop(columns=["dlc"], inplace=True, errors="ignore")
                    
            # Encode categorical target — fit on union of all labels so
            # test-only classes (from block-wise split) don't crash
            le = LabelEncoder()
            all_labels = sorted(set(y_train.unique()) | set(y_test.unique()))
            le.fit(all_labels)
            y_train_enc = le.transform(y_train)
            y_test_enc = le.transform(y_test)
            
            # Standardize categoricals
            categorical_cols = ["can_id"] if "can_id" in X_train_tab.columns else []
            for col in categorical_cols:
                train_cats = sorted(X_train_tab[col].dropna().unique())
                X_train_tab[col] = pd.Categorical(X_train_tab[col]).set_categories(train_cats)
                X_test_tab[col] = pd.Categorical(X_test_tab[col]).set_categories(train_cats)
                
            # If XGBoost T1/T2 are evaluated, they don't support categorical natively on older versions,
            # so we encode categorized columns as integers for XGBoost & Random Forest.
            # LightGBM supports native categoricals.
            X_train_num = X_train_tab.copy()
            X_test_num = X_test_tab.copy()
            for col in categorical_cols:
                X_train_num[col] = X_train_num[col].cat.codes
                X_test_num[col] = X_test_num[col].cat.codes
                
            models = get_models_suite()
            for model_name, model in models.items():
                print(f"    [Model] Training {model_name}...")
                
                # Check data requirements
                if model_name in ["XGBoost", "RandomForest"]:
                    X_tr_in, X_te_in = X_train_num, X_test_num
                elif model_name in ["GCNIDS", "MosaicCNN"]:
                    X_tr_in, X_te_in = X_train, X_test  # GCN & CNN need can_id / sequence intact
                else:
                    X_tr_in, X_te_in = X_train_tab, X_test_tab
                    
                # Train model
                t0 = time.perf_counter()
                if model_name in ["GCNIDS", "MosaicCNN"]:
                    model.fit(X_tr_in, y_train, all_classes=all_labels)
                else:
                    model.fit(X_tr_in, y_train_enc)
                fit_time = (time.perf_counter() - t0) * 1000.0 # ms
                
                # Guard: skip when test set is empty (aggressive downsample + block split)
                if len(X_te_in) == 0:
                    print(f"      -> SKIPPED (empty test set)")
                    continue

                # Inference profile
                t0 = time.perf_counter()
                preds = model.predict(X_te_in)
                inference_time = (time.perf_counter() - t0) * 1000.0 # ms
                avg_latency = inference_time / len(X_te_in)
                
                # Convert predictions if output is labels directly
                if preds.dtype.kind in ['U', 'S', 'O']:
                    preds_enc = le.transform(preds)
                else:
                    preds_enc = preds
                    
                # Calculate metrics
                accuracy = np.mean(preds_enc == y_test_enc)
                report = classification_report(y_test_enc, preds_enc, output_dict=True, zero_division=0)
                macro_f1 = report["macro avg"]["f1-score"]
                
                # Calculate False Positive Rate (FPR)
                all_class_indices = list(range(len(le.classes_)))
                cm = confusion_matrix(y_test_enc, preds_enc, labels=all_class_indices)
                
                # Identify index of "normal" class
                try:
                    normal_idx = list(le.classes_).index("normal")
                except ValueError:
                    normal_idx = 0
                    
                if cm.shape[0] > 1:
                    fp = sum(cm[i, normal_idx] for i in range(cm.shape[0]) if i != normal_idx)
                    tn = cm[normal_idx, normal_idx]
                    fpr = fp / (fp + tn) if (fp + tn) > 0 else 0.0
                else:
                    fpr = 0.0
                    
                # Model size estimation
                model_size_mb = 0.0
                if model_name in ["GCNIDS", "MosaicCNN"]:
                    # Save state dict to calculate size
                    temp_pt = os.path.join(RESULTS_DIR, "temp.pt")
                    torch.save(model.model.state_dict(), temp_pt)
                    model_size_mb = os.path.getsize(temp_pt) / (1024.0 * 1024.0)
                    os.remove(temp_pt)
                else:
                    temp_pkl = os.path.join(RESULTS_DIR, "temp.pkl")
                    with open(temp_pkl, "wb") as f_temp:
                        pickle.dump(model, f_temp)
                    model_size_mb = os.path.getsize(temp_pkl) / (1024.0 * 1024.0)
                    os.remove(temp_pkl)
                    
                # Save confusion matrix to standalone PNG
                fig, ax = plt.subplots(figsize=(6, 5))
                cax = ax.matshow(cm, cmap=plt.cm.Blues)
                fig.colorbar(cax)
                classes = list(le.classes_)
                ax.set_xticks(range(len(classes)))
                ax.set_yticks(range(len(classes)))
                ax.set_xticklabels(classes)
                ax.set_yticklabels(classes)
                plt.xlabel("Predicted")
                plt.ylabel("Actual")
                plt.title(f"CM: {ds_name} - {model_name} ({feat_name})", y=1.1)
                
                # Annotate values
                for i in range(cm.shape[0]):
                    for j in range(cm.shape[1]):
                        ax.text(j, i, format(cm[i, j], 'd'),
                                ha="center", va="center",
                                color="white" if cm[i, j] > cm.max()/2. else "black")
                
                plt.tight_layout()
                cm_name = f"cm_{ds_name}_{model_name}_{feat_name}.png"
                plt.savefig(os.path.join(RESULTS_DIR, cm_name), dpi=150)
                plt.close()
                
                # Log metrics to console
                print(f"      -> Accuracy: {accuracy:.4%}, Macro F1: {macro_f1:.4%}, FPR: {fpr:.4%}")
                print(f"      -> Latency: {avg_latency*1000.0:.3f} microseconds, Size: {model_size_mb:.4f} MB")
                
                # Build and write dynamic JSON report with class-wise metrics & hyperparameters
                report_dict = {
                    "dataset": ds_name,
                    "model_name": model_name,
                    "feature_set": feat_name,
                    "metrics": {
                        "accuracy": accuracy,
                        "macro_f1": macro_f1,
                        "fpr": fpr,
                        "latency_us": avg_latency * 1000.0,
                        "model_size_mb": model_size_mb
                    },
                    "hyperparameters": {},
                    "classification_report": {}
                }
                
                class_names = list(le.classes_)
                for key, val in report.items():
                    if key.isdigit() or (key.startswith('-') and key[1:].isdigit()):
                        class_idx = int(key)
                        class_name = class_names[class_idx]
                        report_dict["classification_report"][class_name] = val
                    else:
                        report_dict["classification_report"][key] = val
                        
                if model_name == "GCNIDS":
                    report_dict["hyperparameters"] = {
                        "epochs": model.epochs,
                        "learning_rate": model.lr,
                        "device": str(model.device),
                        "node_in_dim": 11,
                        "gcn_hidden": 8,
                        "gcn_out": 8,
                        "global_feat_dim": 3,
                        "dropout": 0.5
                    }
                elif model_name == "MosaicCNN":
                    report_dict["hyperparameters"] = {
                        "epochs": model.epochs,
                        "learning_rate": model.lr,
                        "device": str(model.device),
                        "autoencoder_epochs": 5,
                        "grid_size": 3,
                        "mosaic_size": 8,
                        "can_bits": 29
                    }
                elif hasattr(model, "get_params"):
                    try:
                        raw_params = model.get_params()
                        serializable_params = {}
                        for p_k, p_v in raw_params.items():
                            try:
                                json.dumps({p_k: p_v})
                                serializable_params[p_k] = p_v
                            except TypeError:
                                serializable_params[p_k] = str(p_v)
                        report_dict["hyperparameters"] = serializable_params
                    except Exception:
                        pass
                        
                        
                all_reports.append(report_dict)
                
                # Append to Summary CSV
                with open(SUMMARY_CSV_PATH, "a", newline="") as f:
                    writer = csv.writer(f)
                    writer.writerow([
                        ds_name, model_name, feat_name, f"{accuracy:.4%}", f"{macro_f1:.4%}", f"{fpr:.4%}",
                        f"{avg_latency*1000.0:.3f}", f"{model_size_mb:.4f}"
                    ])
                    
    # Save all detailed evaluations in a single JSON file
    reports_json_path = os.path.join(RESULTS_DIR, "comprehensive_evaluation_details.json")
    with open(reports_json_path, "w") as f_json:
        json.dump(all_reports, f_json, indent=4)
                    
    print("\n" + "="*80)
    print("COMPREHENSIVE PIPELINE EVALUATION RUN COMPLETE!")
    print(f"Summary metrics CSV written to: {SUMMARY_CSV_PATH}")
    print(f"Detailed classification reports written to: {reports_json_path}")
    print(f"Standalone Confusion Matrices PNGs written to: {RESULTS_DIR}")
    print("="*80)

if __name__ == "__main__":
    main()

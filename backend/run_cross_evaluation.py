import os
import sys
import time
import json
import pickle
import numpy as np
import pandas as pd
from sklearn.metrics import classification_report, confusion_matrix, f1_score
from data.loaders.registry import get_loader
from features.generalization import extract_window_features
from models.registry import get_model

# Constants
PROCESSED_DIR = "data/processed"
WINDOW_SIZE = 100
STEP_SIZE = 50

def get_cached_window_features(dataset_name):
    """Loads window features from cache or computes them and saves to cache."""
    cache_x_path = os.path.join(PROCESSED_DIR, f"{dataset_name}_win_x.csv")
    cache_y_path = os.path.join(PROCESSED_DIR, f"{dataset_name}_win_y.csv")
    
    if os.path.exists(cache_x_path) and os.path.exists(cache_y_path):
        print(f"[{dataset_name}] Loading window features from cache...")
        X_win = pd.read_csv(cache_x_path)
        y_win = pd.read_csv(cache_y_path)["label"]
        return X_win, y_win
        
    print(f"[{dataset_name}] Cache not found. Loading raw dataset...")
    loader = get_loader(dataset_name)
    df = loader.load()
    
    print(f"[{dataset_name}] Extracting sliding window features (size={WINDOW_SIZE}, step={STEP_SIZE})...")
    start_time = time.time()
    X_win, y_win = extract_window_features(df, window_size=WINDOW_SIZE, step_size=STEP_SIZE)
    duration = time.time() - start_time
    print(f"[{dataset_name}] Feature extraction completed in {duration:.2f}s.")
    
    # Save to cache
    os.makedirs(PROCESSED_DIR, exist_ok=True)
    X_win.to_csv(cache_x_path, index=False)
    pd.DataFrame({"label": y_win}).to_csv(cache_y_path, index=False)
    print(f"[{dataset_name}] Saved window features cache.")
    
    return X_win, y_win

def train_and_evaluate(train_name, test_name, X_train, y_train, X_test, y_test, model_type):
    """Trains a model on train_name and evaluates it on test_name."""
    print(f"\n--- Training {model_type.upper()} on {train_name} -> Evaluating on {test_name} ---")
    
    # Map labels to binary (normal vs attack) for robust cross-dataset evaluation
    y_train_binary = y_train.apply(lambda x: "normal" if x == "normal" else "attack")
    y_test_binary = y_test.apply(lambda x: "normal" if x == "normal" else "attack")
    
    # Initialize model with model-specific verbosity settings
    params = {
        "n_estimators": 100,
        "max_depth": 6,
        "learning_rate": 0.1,
        "random_state": 42,
        "verbosity": 0 if model_type == "xgboost" else -1
    }
    model = get_model(model_type, params=params)
    
    # Train
    start_time = time.time()
    model.train(X_train, y_train_binary)
    train_duration = time.time() - start_time
    
    # Predict
    preds = model.predict(X_test)
    
    # Compute metrics
    accuracy = np.mean(preds == y_test_binary)
    macro_f1 = f1_score(y_test_binary, preds, average="macro")
    
    report = classification_report(y_test_binary, preds, output_dict=True)
    cm = confusion_matrix(y_test_binary, preds, labels=["normal", "attack"])
    
    # Calculate False Positive Rate (FPR)
    # confusion matrix layout: [[TN, FP], [FN, TP]]
    tn, fp, fn, tp = cm.ravel()
    fpr = fp / (tn + fp) if (tn + fp) > 0 else 0.0
    
    print(f"Accuracy: {accuracy:.4f} | Macro F1: {macro_f1:.4f} | FPR: {fpr*100:.2f}% | Train Time: {train_duration:.2f}s")
    print("Confusion Matrix (Labels: [normal, attack]):")
    print(cm)
    
    return {
        "accuracy": accuracy,
        "macro_f1": macro_f1,
        "fpr": fpr,
        "train_time_sec": train_duration,
        "classification_report": report,
        "confusion_matrix": cm.tolist()
    }

def main():
    # 1. Load window features
    print("=== LOADING WINDOW FEATURES FOR BOTH DATASETS ===")
    X_otids, y_otids = get_cached_window_features("otids")
    X_ch, y_ch = get_cached_window_features("car_hacking")
    
    print(f"\nOTIDS shape: {X_otids.shape} | Car-Hacking shape: {X_ch.shape}")
    
    # 2. Split by source file (70% train / 30% test chronologically per file)
    # This solves the "Concatenation Trap" and ensures all attack classes exist in both splits
    split_ratio = 0.70
    
    def split_by_file(X_win, y_win, ratio=0.70):
        X_train_list, X_test_list = [], []
        y_train_list, y_test_list = [], []
        
        for file_key, group_x in X_win.groupby("source_file"):
            group_y = y_win.loc[group_x.index]
            split_idx = int(len(group_x) * ratio)
            
            X_train_list.append(group_x.iloc[:split_idx])
            X_test_list.append(group_x.iloc[split_idx:])
            y_train_list.append(group_y.iloc[:split_idx])
            y_test_list.append(group_y.iloc[split_idx:])
            
        X_train = pd.concat(X_train_list, ignore_index=True)
        X_test = pd.concat(X_test_list, ignore_index=True)
        y_train = pd.concat(y_train_list, ignore_index=True)
        y_test = pd.concat(y_test_list, ignore_index=True)
        
        # Drop source_file before returning so GBDTs only receive numeric features
        X_train_clean = X_train.drop(columns=["source_file"], errors="ignore")
        X_test_clean = X_test.drop(columns=["source_file"], errors="ignore")
        
        return X_train_clean, X_test_clean, y_train, y_test

    X_otids_train, X_otids_test, y_otids_train, y_otids_test = split_by_file(X_otids, y_otids, split_ratio)
    X_ch_train, X_ch_test, y_ch_train, y_ch_test = split_by_file(X_ch, y_ch, split_ratio)
    
    # 3. Z-Score Normalization (Standardization) Local to Each Vehicle
    # This solves the "Domain Shift" where different car models have varying baseline normal frequencies/IATs.
    # We fit the scaler ONLY on the normal traffic of each vehicle's training set.
    from sklearn.preprocessing import StandardScaler
    
    def scale_dataset(X_tr, X_te, y_tr):
        scaler = StandardScaler()
        # Fit only on the normal training windows to establish a clean vehicle baseline
        normal_idx = (y_tr == "normal")
        scaler.fit(X_tr[normal_idx])
        
        X_tr_scaled = pd.DataFrame(scaler.transform(X_tr), columns=X_tr.columns)
        X_te_scaled = pd.DataFrame(scaler.transform(X_te), columns=X_te.columns)
        return X_tr_scaled, X_te_scaled
        
    X_otids_train, X_otids_test = scale_dataset(X_otids_train, X_otids_test, y_otids_train)
    X_ch_train, X_ch_test = scale_dataset(X_ch_train, X_ch_test, y_ch_train)
    
    # Map labels to binary for testing sets to evaluate cross-domain attack transferability
    results = []
    
    # Run evaluation matrix for XGBoost and LightGBM
    for model_type in ["xgboost", "lightgbm"]:
        # Scenario A: Train on OTIDS (KIA Soul), Test on OTIDS (In-Domain)
        res_a_in = train_and_evaluate(
            "OTIDS", "OTIDS", 
            X_otids_train, y_otids_train, 
            X_otids_test, y_otids_test, 
            model_type
        )
        results.append({
            "model": model_type.upper(),
            "train_set": "OTIDS (KIA)",
            "test_set": "OTIDS (KIA)",
            "domain": "In-Domain",
            **res_a_in
        })
        
        # Scenario C: Train on Car-Hacking (Hyundai), Test on Car-Hacking (In-Domain)
        res_b_in = train_and_evaluate(
            "Car-Hacking", "Car-Hacking", 
            X_ch_train, y_ch_train, 
            X_ch_test, y_ch_test, 
            model_type
        )
        results.append({
            "model": model_type.upper(),
            "train_set": "Car-Hacking (Hyundai)",
            "test_set": "Car-Hacking (Hyundai)",
            "domain": "In-Domain",
            **res_b_in
        })
        
    # Print final summary table
    summary_rows = []
    for r in results:
        summary_rows.append({
            "Model": r["model"],
            "Train Set": r["train_set"],
            "Test Set": r["test_set"],
            "Domain": r["domain"],
            "Accuracy": f"{r['accuracy']*100:.2f}%",
            "Macro F1": f"{r['macro_f1']*100:.2f}%",
            "False Alarm Rate (FPR)": f"{r['fpr']*100:.2f}%"
        })
        
    summary_df = pd.DataFrame(summary_rows)
    print("\n" + "="*80)
    print("                         CROSS-DATASET EVALUATION RESULTS")
    print("="*80)
    print(summary_df.to_string(index=False))
    print("="*80)
    
    # Save results to disk organized by day
    day_str = time.strftime("%Y-%m-%d")
    time_str = time.strftime("%H%M%S")
    results_dir = f"results/{day_str}"
    os.makedirs(results_dir, exist_ok=True)
    out_path = os.path.join(results_dir, f"cross_dataset_comparison_{time_str}.csv")
    summary_df.to_csv(out_path, index=False)
    print(f"Results saved to: {out_path}")

if __name__ == "__main__":
    main()

import os
import sys
import pickle
import numpy as np
import pandas as pd
from sklearn.metrics import classification_report, confusion_matrix
from data.loaders.registry import get_loader
from features.pipeline import build_features
from models.registry import get_model

def run_tests():
    print("Loading Car-Hacking dataset...")
    loader = get_loader("car_hacking")
    df = loader.load()
    
    print(f"Dataset loaded. Shape: {df.shape}")
    
    # Apply block-wise split exactly like run_suite.py
    block_size_sec = 10
    X_train_list, X_test_list = [], []
    y_train_list, y_test_list = [], []
    
    features_to_build = ["basic", "advanced"]
    
    print("Building features block-by-block...")
    for file_key, group in df.groupby("source_file"):
        group = group.sort_values("timestamp")
        norm_ts = group["timestamp"] - group["timestamp"].min()
        block_idx = (norm_ts // block_size_sec).astype(int)
        group["block_id"] = block_idx
        unique_blocks = sorted(block_idx.unique())
        
        train_blocks, test_blocks = [], []
        for i, b in enumerate(unique_blocks):
            rem = i % 20
            if rem < 14:
                train_blocks.append(b)
            elif rem < 17:
                pass # skip validation set for this diagnostic
            else:
                test_blocks.append(b)
                
        X_blocks_list = []
        y_blocks_list = []
        for b_id, block_df in group.groupby("block_id"):
            X_block, y_block = build_features(block_df, feature_list=features_to_build)
            X_block["block_id"] = b_id
            X_blocks_list.append(X_block)
            y_blocks_list.append(y_block)
            
        X_file = pd.concat(X_blocks_list, ignore_index=True)
        y_file = pd.concat(y_blocks_list, ignore_index=True)
        
        in_train = X_file["block_id"].isin(train_blocks)
        in_test = X_file["block_id"].isin(test_blocks)
        
        X_tr = X_file[in_train].drop(columns=["block_id"]).copy()
        y_tr = y_file[in_train].copy()
        X_te = X_file[in_test].drop(columns=["block_id"]).copy()
        y_te = y_file[in_test].copy()
        
        for x_df in [X_tr, X_te]:
            if "timestamp" in x_df.columns:
                x_df.drop(columns=["timestamp"], inplace=True, errors="ignore")
                
        X_train_list.append(X_tr)
        X_test_list.append(X_te)
        y_train_list.append(y_tr)
        y_test_list.append(y_te)
        
    X_train_full = pd.concat(X_train_list, ignore_index=True)
    X_test_full = pd.concat(X_test_list, ignore_index=True)
    y_train = pd.concat(y_train_list, ignore_index=True)
    y_test = pd.concat(y_test_list, ignore_index=True)
    
    # ----------------------------------------------------
    # Test 2 & Baseline: Run model WITH can_id
    # ----------------------------------------------------
    print("\n=== RUNNING BASELINE MODEL (WITH can_id) ===")
    
    # Make copy of data
    X_train_base = X_train_full.copy()
    X_test_base = X_test_full.copy()
    
    # Handle category encoding for can_id
    if "can_id" in X_train_base.columns:
        train_categories = sorted(X_train_base["can_id"].dropna().unique())
        X_train_base["can_id"] = pd.Categorical(X_train_base["can_id"], categories=train_categories)
        X_test_base["can_id"] = pd.Categorical(X_test_base["can_id"], categories=train_categories)
        
    # We will use LightGBM for speed and native categorical support
    params = {
        "n_estimators": 100,
        "max_depth": 6,
        "learning_rate": 0.1,
        "random_state": 42,
        "verbosity": -1
    }
    
    model_base = get_model("lightgbm", params=params)
    print("Training baseline model...")
    model_base.train(X_train_base, y_train)
    
    print("Evaluating baseline model...")
    preds_base = model_base.predict(X_test_base)
    
    print("\n--- BASELINE CLASSIFICATION REPORT ---")
    print(classification_report(y_test, preds_base))
    
    print("\n--- BASELINE CONFUSION MATRIX ---")
    labels = sorted(y_test.unique())
    print("Labels:", labels)
    print(confusion_matrix(y_test, preds_base, labels=labels))
    
    # Feature Importances mapping
    print("\n--- BASELINE FEATURE IMPORTANCES ---")
    importances = model_base.model.feature_importances_
    features_list = X_train_base.columns.tolist()
    for feat, imp in sorted(zip(features_list, importances), key=lambda x: x[1], reverse=True):
        print(f"  {feat}: {imp}")
        
    # ----------------------------------------------------
    # Test 1: Run model WITHOUT can_id (and basic payload features if they duplicate can_id)
    # Spec: keep only iat, jitter, payload_hamming_dist, payload_entropy, message_frequency
    # ----------------------------------------------------
    print("\n=== RUNNING TEST 1 (NO can_id, ONLY ADVANCED TIMING/ENTROPY FEATURES) ===")
    
    target_features = ["iat", "jitter", "payload_hamming_dist", "payload_entropy", "message_frequency"]
    
    X_train_t1 = X_train_full[target_features].copy()
    X_test_t1 = X_test_full[target_features].copy()
    
    model_t1 = get_model("lightgbm", params=params)
    print("Training Test 1 model...")
    model_t1.train(X_train_t1, y_train)
    
    print("Evaluating Test 1 model...")
    preds_t1 = model_t1.predict(X_test_t1)
    
    print("\n--- TEST 1 CLASSIFICATION REPORT (NO can_id) ---")
    print(classification_report(y_test, preds_t1))
    
    print("\n--- TEST 1 CONFUSION MATRIX ---")
    print("Labels:", labels)
    print(confusion_matrix(y_test, preds_t1, labels=labels))
    
    print("\n--- TEST 1 FEATURE IMPORTANCES ---")
    importances_t1 = model_t1.model.feature_importances_
    for feat, imp in sorted(zip(target_features, importances_t1), key=lambda x: x[1], reverse=True):
        print(f"  {feat}: {imp}")

if __name__ == "__main__":
    run_tests()

import os
import sys
import time
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import shap

from data.loaders.registry import get_loader
from models.registry import get_model

# Constants
X_CACHE_PATH = "data/processed/car_hacking_win_x.csv"
Y_CACHE_PATH = "data/processed/car_hacking_win_y.csv"

def main():
    print("=== SHAP INDIVIDUAL GRAPH GENERATOR ===")
    
    # 1. Load window features from cache
    if not os.path.exists(X_CACHE_PATH) or not os.path.exists(Y_CACHE_PATH):
        print("Error: Window feature cache not found. Please run 'run_cross_evaluation.py' first to build the cache.")
        sys.exit(1)
        
    print("Loading cached window features (Car-Hacking)...")
    X_win = pd.read_csv(X_CACHE_PATH)
    y_win = pd.read_csv(Y_CACHE_PATH)["label"]
    
    # Map to binary labels
    y_binary = y_win.apply(lambda x: "normal" if x == "normal" else "attack")
    X_clean = X_win.drop(columns=["source_file"], errors="ignore")
    
    # Train/Test Split (70/30)
    split_idx = int(len(X_clean) * 0.70)
    X_train, X_test = X_clean.iloc[:split_idx], X_clean.iloc[split_idx:]
    y_train, y_test = y_binary.iloc[:split_idx], y_binary.iloc[split_idx:]
    
    # Encode label integers (0: normal, 1: attack)
    y_train_encoded = (y_train == "attack").astype(int)
    
    # 2. Train both models
    params_lgb = {
        "n_estimators": 50,
        "max_depth": 5,
        "learning_rate": 0.1,
        "random_state": 42,
        "verbosity": -1
    }
    params_xgb = {
        "n_estimators": 50,
        "max_depth": 5,
        "learning_rate": 0.1,
        "random_state": 42,
        "verbosity": 0
    }
    
    print("Training LightGBM model...")
    model_lgb = get_model("lightgbm", params=params_lgb)
    model_lgb.model.fit(X_train, y_train_encoded)
    
    print("Training XGBoost model...")
    model_xgb = get_model("xgboost", params=params_xgb)
    model_xgb.model.fit(X_train, y_train_encoded)
    
    # 3. Subsample test set for SHAP computation
    np.random.seed(42)
    sample_size = min(1000, len(X_test))
    sample_indices = np.random.choice(X_test.index, size=sample_size, replace=False)
    X_sample = X_test.loc[sample_indices]
    
    # 4. Compute SHAP values
    print("Computing SHAP values for LightGBM...")
    explainer_lgb = shap.TreeExplainer(model_lgb.model)
    shap_values_lgb = explainer_lgb(X_sample)
    
    print("Computing SHAP values for XGBoost...")
    explainer_xgb = shap.TreeExplainer(model_xgb.model)
    shap_values_xgb = explainer_xgb(X_sample)
    
    # 5. Generate and Save Individual plots (to prevent overlap issues)
    out_dir = "results/shap"
    os.makedirs(out_dir, exist_ok=True)
    
    print("Generating and saving individual plots...")

    # Plot 1: LightGBM Beeswarm
    plt.figure(figsize=(10, 6))
    shap.summary_plot(shap_values_lgb, X_sample, plot_type="dot", show=False)
    plt.title("LightGBM Beeswarm Feature Contribution Plot", fontsize=14, pad=15)
    plt.tight_layout()
    lgb_beeswarm_path = os.path.join(out_dir, "lightgbm_shap_beeswarm.png")
    plt.savefig(lgb_beeswarm_path, dpi=150)
    plt.close()

    # Plot 2: XGBoost Beeswarm
    plt.figure(figsize=(10, 6))
    shap.summary_plot(shap_values_xgb, X_sample, plot_type="dot", show=False)
    plt.title("XGBoost Beeswarm Feature Contribution Plot", fontsize=14, pad=15)
    plt.tight_layout()
    xgb_beeswarm_path = os.path.join(out_dir, "xgboost_shap_beeswarm.png")
    plt.savefig(xgb_beeswarm_path, dpi=150)
    plt.close()

    # Plot 3: LightGBM Global Bar
    plt.figure(figsize=(10, 6))
    shap.summary_plot(shap_values_lgb, X_sample, plot_type="bar", show=False)
    plt.title("LightGBM Global Feature Importance (Mean |SHAP|)", fontsize=14, pad=15)
    plt.tight_layout()
    lgb_bar_path = os.path.join(out_dir, "lightgbm_shap_bar.png")
    plt.savefig(lgb_bar_path, dpi=150)
    plt.close()

    # Plot 4: XGBoost Global Bar
    plt.figure(figsize=(10, 6))
    shap.summary_plot(shap_values_xgb, X_sample, plot_type="bar", show=False)
    plt.title("XGBoost Global Feature Importance (Mean |SHAP|)", fontsize=14, pad=15)
    plt.tight_layout()
    xgb_bar_path = os.path.join(out_dir, "xgboost_shap_bar.png")
    plt.savefig(xgb_bar_path, dpi=150)
    plt.close()
    
    print("\n=== PLOT GENERATION COMPLETE ===")
    print(f"Saved: {lgb_beeswarm_path}")
    print(f"Saved: {xgb_beeswarm_path}")
    print(f"Saved: {lgb_bar_path}")
    print(f"Saved: {xgb_bar_path}")
    
    # Print ranked mean absolute SHAP values for both models to console
    mean_shap_lgb = np.abs(shap_values_lgb.values).mean(axis=0)
    mean_shap_xgb = np.abs(shap_values_xgb.values).mean(axis=0)
    
    importance_lgb = sorted(zip(X_sample.columns, mean_shap_lgb), key=lambda x: x[1], reverse=True)
    importance_xgb = sorted(zip(X_sample.columns, mean_shap_xgb), key=lambda x: x[1], reverse=True)
    
    print("\n" + "="*50)
    print(f"{'FEATURE':<22} | {'LIGHTGBM |SHAP|':<15} | {'XGBOOST |SHAP|':<15}")
    print("="*50)
    
    lgb_dict = dict(importance_lgb)
    xgb_dict = dict(importance_xgb)
    for feat in X_sample.columns:
        print(f"{feat:<22} | {lgb_dict[feat]:<15.4f} | {xgb_dict[feat]:<15.4f}")
    print("="*50)

if __name__ == "__main__":
    main()

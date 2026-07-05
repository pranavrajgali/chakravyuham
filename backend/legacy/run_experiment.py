import sys
import os
import json
import pickle
import shutil
import datetime
import re
from sklearn.model_selection import train_test_split

from utils.config import load_config
from data.loaders.registry import get_loader
from features.pipeline import build_features
from models.registry import get_model
from evaluation.metrics import compute_metrics
from evaluation.benchmark import run_benchmark
from evaluation.visualize import generate_visuals


def select_config():
    if len(sys.argv) > 1:
        arg_path = sys.argv[1]
        if os.path.exists(arg_path):
            return arg_path
        alt_path = os.path.join("configs", arg_path)
        if os.path.exists(alt_path):
            return alt_path
        print(f"Config '{arg_path}' not found.")
        sys.exit(1)

    config_files = sorted(f for f in os.listdir("configs") if f.endswith(".yaml") or f.endswith(".yml"))

    if not config_files:
        print("No config files found in configs/")
        sys.exit(1)

    print("Available configs:")
    for i, name in enumerate(config_files):
        print(f"  [{i}] {name}")

    choice = input("Select a config by number: ").strip()
    try:
        index = int(choice)
        return os.path.join("configs", config_files[index])
    except (ValueError, IndexError):
        print("Invalid selection.")
        sys.exit(1)


config_path = select_config()
config = load_config(config_path)

loader = get_loader(config["dataset"])
df = loader.load()

X_train_list, X_val_list, X_test_list = [], [], []
y_train_list, y_val_list, y_test_list = [], [], []

# Group by source file to split chronologically per session
for file_key, group in df.groupby("source_file"):
    # Sort chronologically by timestamp
    group = group.sort_values("timestamp")
    
    # Extract features for this file
    X_file, y_file = build_features(group, feature_list=config["features"])
    
    # Convert can_id to pandas categorical if present in features
    if "can_id" in X_file.columns:
        X_file["can_id"] = X_file["can_id"].astype("category")
        
    # Get split config parameters
    split_config = config.get("split", {})
    block_size_sec = split_config.get("block_size_sec", 10)
    
    # Compute block indices based on normalized timestamps (starting at 0.0)
    norm_ts = group["timestamp"] - group["timestamp"].min()
    block_idx = (norm_ts // block_size_sec).astype(int)
    unique_blocks = sorted(block_idx.unique())
    
    train_blocks = []
    val_blocks = []
    test_blocks = []
    
    # Assign blocks round-robin: 70% Train, 15% Val, 15% Test
    for i, b in enumerate(unique_blocks):
        rem = i % 10
        if rem < 7:
            train_blocks.append(b)
        elif rem == 7:
            val_blocks.append(b)
        else:
            test_blocks.append(b)
            
    # Filter features and labels
    in_train = block_idx.isin(train_blocks)
    in_val = block_idx.isin(val_blocks)
    in_test = block_idx.isin(test_blocks)
    
    X_tr = X_file[in_train].copy()
    y_tr = y_file[in_train].copy()
    
    X_va = X_file[in_val].copy()
    y_va = y_file[in_val].copy()
    
    X_te = X_file[in_test].copy()
    y_te = y_file[in_test].copy()
    
    # Drop raw timestamp if present
    for x_df in [X_tr, X_va, X_te]:
        if "timestamp" in x_df.columns:
            x_df.drop(columns=["timestamp"], inplace=True, errors="ignore")
            
    X_train_list.append(X_tr)
    X_val_list.append(X_va)
    X_test_list.append(X_te)
    y_train_list.append(y_tr)
    y_val_list.append(y_va)
    y_test_list.append(y_te)

import pandas as pd
X_train = pd.concat(X_train_list, ignore_index=True)
X_val = pd.concat(X_val_list, ignore_index=True)
X_test = pd.concat(X_test_list, ignore_index=True)
y_train = pd.concat(y_train_list, ignore_index=True)
y_val = pd.concat(y_val_list, ignore_index=True)
y_test = pd.concat(y_test_list, ignore_index=True)

model = get_model(config["model"], params=config["params"])
eval_set = (X_val, y_val) if len(X_val) > 0 else None
model.train(X_train, y_train, eval_set=eval_set)
predictions = model.predict(X_test)

metrics = compute_metrics(y_test, predictions)
benchmark = run_benchmark(model, X_test, thresholds=config.get("thresholds"))

if len(sys.argv) > 2:
    run_name = sys.argv[2]
else:
    run_name = input("Name this experiment run: ").strip()
safe_name = re.sub(r"[^a-zA-Z0-9_-]", "_", run_name.replace(" ", "_"))
timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
results_dir = f"results/{config['model']}/{safe_name}_{timestamp}"
os.makedirs(results_dir, exist_ok=True)

with open(os.path.join(results_dir, "metrics.json"), "w") as f:
    json.dump(metrics, f, indent=2)

generate_visuals(metrics, results_dir)

with open(os.path.join(results_dir, "benchmark.json"), "w") as f:
    json.dump(benchmark, f, indent=2)

with open(os.path.join(results_dir, "model.pkl"), "wb") as f:
    pickle.dump(model, f)

shutil.copy(config_path, os.path.join(results_dir, "config.yaml"))

print("Accuracy:", metrics["accuracy"])
print("Benchmark:", benchmark)
print("Results saved to:", results_dir)
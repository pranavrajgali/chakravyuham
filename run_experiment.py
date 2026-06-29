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

X, y = build_features(df, feature_list=config["features"])

X_train, X_test, y_train, y_test = train_test_split(
    X, y,
    test_size=config["split"]["test_size"],
    stratify=y if config["split"]["stratify"] else None,
    shuffle=config["split"]["shuffle"],
    random_state=config["params"].get("random_state", 42),
)

model = get_model(config["model"], params=config["params"])
model.train(X_train, y_train)
predictions = model.predict(X_test)

metrics = compute_metrics(y_test, predictions)
benchmark = run_benchmark(model, X_test, thresholds=config.get("thresholds"))

run_name = input("Name this experiment run: ").strip()
safe_name = re.sub(r"[^a-zA-Z0-9_-]", "_", run_name.replace(" ", "_"))
timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
results_dir = f"results/{safe_name}_{timestamp}"
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
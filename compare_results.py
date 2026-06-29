import sys
import os
import json
import yaml
import csv
import datetime
import numpy as np
import matplotlib.pyplot as plt
from sklearn.metrics import ConfusionMatrixDisplay


def load_run(run_folder):
    base = os.path.join("results", run_folder)

    with open(os.path.join(base, "config.yaml")) as f:
        config = yaml.safe_load(f)
    with open(os.path.join(base, "metrics.json")) as f:
        metrics = json.load(f)
    with open(os.path.join(base, "benchmark.json")) as f:
        benchmark = json.load(f)

    return {
        "run_name": run_folder,
        "config": config,
        "metrics": metrics,
        "benchmark": benchmark,
    }


def select_runs():
    all_folders = sorted(
        f for f in os.listdir("results")
        if os.path.isdir(os.path.join("results", f)) and f != "comparisons"
    )

    if not all_folders:
        print("No experiment runs found in results/")
        sys.exit(1)

    print("Available runs:")
    for i, name in enumerate(all_folders):
        print(f"  [{i}] {name}")

    choice = input("Select run numbers to compare (comma-separated, e.g. 0,2,3): ").strip()
    try:
        indices = [int(x.strip()) for x in choice.split(",")]
        selected = [all_folders[i] for i in indices]
    except (ValueError, IndexError):
        print("Invalid selection.")
        sys.exit(1)

    return selected


def print_console_table(runs):
    header = f"{'Run':40} {'Model':15} {'Accuracy':10} {'Latency(ms)':12} {'Size(MB)':10}"
    print(header)
    print("-" * len(header))
    for run in runs:
        name = run["run_name"][:38]
        model = run["config"].get("model", "?")
        accuracy = run["metrics"]["accuracy"]
        latency = run["benchmark"]["latency_ms"]
        size = run["benchmark"]["model_size_mb"]
        print(f"{name:40} {model:15} {accuracy:<10.4f} {latency:<12.4f} {size:<10.2f}")


def save_csv(runs, out_path):
    all_classes = sorted({
        cls for run in runs for cls in run["metrics"]["per_class"].keys()
    })

    fieldnames = ["run_name", "dataset", "model", "features", "accuracy",
                  "latency_ms", "model_size_mb", "memory_mb"]
    for cls in all_classes:
        fieldnames += [f"{cls}_precision", f"{cls}_recall", f"{cls}_f1"]

    with open(out_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()

        for run in runs:
            row = {
                "run_name": run["run_name"],
                "dataset": run["config"].get("dataset"),
                "model": run["config"].get("model"),
                "features": ",".join(run["config"].get("features", [])),
                "accuracy": run["metrics"]["accuracy"],
                "latency_ms": run["benchmark"]["latency_ms"],
                "model_size_mb": run["benchmark"]["model_size_mb"],
                "memory_mb": run["benchmark"]["memory_mb"],
            }
            for cls in all_classes:
                per_class = run["metrics"]["per_class"].get(cls)
                if per_class:
                    row[f"{cls}_precision"] = per_class["precision"]
                    row[f"{cls}_recall"] = per_class["recall"]
                    row[f"{cls}_f1"] = per_class["f1"]
            writer.writerow(row)


def save_combined_confusion_matrices(runs, out_path):
    n = len(runs)
    cols = min(n, 3)
    rows = (n + cols - 1) // cols

    fig, axes = plt.subplots(rows, cols, figsize=(6 * cols, 5 * rows))
    axes = np.array(axes).reshape(-1) if n > 1 else [axes]

    for i, run in enumerate(runs):
        cm = np.array(run["metrics"]["confusion_matrix"])
        labels = run["metrics"]["confusion_matrix_labels"]
        disp = ConfusionMatrixDisplay(confusion_matrix=cm, display_labels=labels)
        disp.plot(ax=axes[i], cmap="Blues", values_format="d", colorbar=False)
        axes[i].set_title(run["run_name"], fontsize=9)

    for j in range(len(runs), len(axes)):
        axes[j].axis("off")

    plt.tight_layout()
    plt.savefig(out_path, dpi=150)
    plt.close(fig)


def main():
    run_folders = select_runs()
    runs = [load_run(f) for f in run_folders]

    print_console_table(runs)

    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    comparison_dir = os.path.join("results", "comparisons", f"comparison_{timestamp}")
    os.makedirs(comparison_dir, exist_ok=True)

    csv_path = os.path.join(comparison_dir, "comparison.csv")
    save_csv(runs, csv_path)

    cm_path = os.path.join(comparison_dir, "confusion_matrices.png")
    save_combined_confusion_matrices(runs, cm_path)

    print(f"\nComparison saved to: {comparison_dir}")


if __name__ == "__main__":
    main()
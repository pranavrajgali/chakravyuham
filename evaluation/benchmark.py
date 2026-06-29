import time
import pickle
import os
import psutil


def measure_inference_latency(model, X_test, n_runs=100):
    sample = X_test.iloc[:n_runs] if hasattr(X_test, "iloc") else X_test[:n_runs]

    model.predict(sample)  # warm-up

    start = time.perf_counter()
    model.predict(sample)
    end = time.perf_counter()

    total_ms = (end - start) * 1000
    avg_ms_per_sample = total_ms / len(sample)
    return avg_ms_per_sample


def measure_model_size(model, tmp_path="results/_tmp_model.pkl"):
    os.makedirs(os.path.dirname(tmp_path), exist_ok=True)
    with open(tmp_path, "wb") as f:
        pickle.dump(model, f)

    size_mb = os.path.getsize(tmp_path) / (1024 * 1024)
    os.remove(tmp_path)
    return size_mb


def measure_memory_usage(model, X_test, n_runs=100):
    """
    Approximate memory used during inference, in MB, using actual
    process RSS (resident set size) rather than tracemalloc's
    Python-heap-only tracking.
    """
    sample = X_test.iloc[:n_runs] if hasattr(X_test, "iloc") else X_test[:n_runs]
    process = psutil.Process(os.getpid())

    mem_before = process.memory_info().rss / (1024 * 1024)
    model.predict(sample)
    mem_after = process.memory_info().rss / (1024 * 1024)

    return max(mem_after - mem_before, 0.0)


def run_benchmark(model, X_test, thresholds=None):
    latency_ms = measure_inference_latency(model, X_test)
    size_mb = measure_model_size(model)
    memory_mb = measure_memory_usage(model, X_test)

    result = {
        "latency_ms": latency_ms,
        "model_size_mb": size_mb,
        "memory_mb": memory_mb,
    }

    if thresholds:
        result["latency_pass"] = latency_ms < thresholds.get("max_latency_ms", float("inf"))
        result["size_pass"] = size_mb < thresholds.get("max_model_size_mb", float("inf"))

    return result
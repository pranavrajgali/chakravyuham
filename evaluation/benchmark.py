import time
import pickle
import os
import tracemalloc


def measure_inference_latency(model, X_test, n_runs=100):
    """
    Measures average per-sample inference latency in ms.
    Uses a small repeated subset to get a stable estimate.
    """
    sample = X_test.iloc[:n_runs] if hasattr(X_test, "iloc") else X_test[:n_runs]

    # warm-up run (avoids first-call overhead skewing results)
    model.predict(sample)

    start = time.perf_counter()
    model.predict(sample)
    end = time.perf_counter()

    total_ms = (end - start) * 1000
    avg_ms_per_sample = total_ms / len(sample)
    return avg_ms_per_sample


def measure_model_size(model, tmp_path="results/_tmp_model.pkl"):
    """
    Measures serialized model size in MB by pickling to disk.
    """
    os.makedirs(os.path.dirname(tmp_path), exist_ok=True)
    with open(tmp_path, "wb") as f:
        pickle.dump(model, f)

    size_mb = os.path.getsize(tmp_path) / (1024 * 1024)
    os.remove(tmp_path)
    return size_mb


def measure_memory_usage(model, X_test, n_runs=100):
    """
    Approximate peak memory used during inference, in MB.
    """
    sample = X_test.iloc[:n_runs] if hasattr(X_test, "iloc") else X_test[:n_runs]

    tracemalloc.start()
    model.predict(sample)
    current, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    peak_mb = peak / (1024 * 1024)
    return peak_mb


def run_benchmark(model, X_test, thresholds=None):
    """
    Runs all benchmark measurements and checks against thresholds if provided.
    thresholds example: {"max_latency_ms": 5, "max_model_size_mb": 10}
    """
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
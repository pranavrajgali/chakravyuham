"""
Feature extraction for CAN-bus window graphs using relative imports.
"""

from __future__ import annotations
import math
from collections import defaultdict
import numpy as np
import pandas as pd

from .graph_builder import WindowGraph, build_window_graph, unique_edges
from .rolling_baseline import RollingBaselineStore

N_NODE_FEATURES = 11
N_GLOBAL_FEATURES = 3


def _shannon_entropy(counts: list[int]) -> float:
    total = sum(counts)
    if total <= 0:
        return 0.0
    ent = 0.0
    for c in counts:
        if c <= 0:
            continue
        p = c / total
        ent -= p * math.log2(p)
    return ent


def _payload_entropy(payloads: list[list[int]]) -> float:
    byte_counts = defaultdict(int)
    total = 0
    for p in payloads:
        for b in p:
            byte_counts[b] += 1
            total += 1
    if total == 0:
        return 0.0
    return _shannon_entropy(list(byte_counts.values()))


def _mean_hamming(payloads: list[list[int]]) -> float:
    if len(payloads) < 2:
        return 0.0
    dists = []
    for a, b in zip(payloads[:-1], payloads[1:]):
        d = sum(bin(x ^ y).count("1") for x, y in zip(a, b))
        dists.append(d)
    return float(np.mean(dists)) if dists else 0.0


def _iat_stats(timestamps: list[float]) -> tuple[float, float, float]:
    if len(timestamps) < 2:
        return 0.0, 0.0, 0.0
    iats = np.diff(np.array(timestamps, dtype=np.float64))
    iats = iats[iats >= 0]
    if len(iats) == 0:
        return 0.0, 0.0, 0.0
    mean = float(np.mean(iats))
    var = float(np.var(iats, ddof=1)) if len(iats) > 1 else 0.0
    std = math.sqrt(var)
    cv = std / mean if mean > 1e-9 else 0.0
    return mean, var, cv


def extract_node_features(
    graph: WindowGraph,
    can_ids_in_order: list[int],
    timestamps_in_order: list[float],
    payloads_in_order: list[list[int]],
    baseline: RollingBaselineStore,
) -> np.ndarray:
    n = len(graph.ids)
    feats = np.zeros((n, N_NODE_FEATURES), dtype=np.float32)

    per_node_timestamps: dict[int, list[float]] = defaultdict(list)
    per_node_payloads: dict[int, list[list[int]]] = defaultdict(list)
    per_node_occurrence: dict[int, int] = defaultdict(int)

    for cid, ts, pl in zip(can_ids_in_order, timestamps_in_order, payloads_in_order):
        node = graph.id_to_node[cid]
        per_node_timestamps[node].append(ts)
        per_node_payloads[node].append(pl)
        per_node_occurrence[node] += 1

    self_loop_count = defaultdict(int)
    for k in range(len(graph.sequence) - 1):
        if graph.sequence[k] == graph.sequence[k + 1]:
            self_loop_count[graph.sequence[k]] += 1

    in_neighbors: dict[int, set] = defaultdict(set)
    out_neighbors: dict[int, set] = defaultdict(set)
    out_transition_counts: dict[int, dict[int, int]] = defaultdict(lambda: defaultdict(int))
    for (src, dst), w in graph.edge_weight_map.items():
        out_neighbors[src].add(dst)
        in_neighbors[dst].add(src)
        out_transition_counts[src][dst] += w

    for node_idx, can_id in enumerate(graph.ids):
        indegree = len(in_neighbors.get(node_idx, set()))
        outdegree = len(out_neighbors.get(node_idx, set()))
        sl_count = self_loop_count.get(node_idx, 0)
        occ_freq = per_node_occurrence.get(node_idx, 0)

        iat_mean, iat_var, burstiness = _iat_stats(per_node_timestamps[node_idx])
        entropy = _payload_entropy(per_node_payloads[node_idx])
        hamming = _mean_hamming(per_node_payloads[node_idx])
        out_trans_ent = _shannon_entropy(list(out_transition_counts.get(node_idx, {}).values()))

        freq_z = baseline.zscore(can_id, "freq", occ_freq)
        iat_mean_z = baseline.zscore(can_id, "iat_mean", iat_mean)
        iat_var_z = baseline.zscore(can_id, "iat_var", iat_var)
        entropy_z = baseline.zscore(can_id, "payload_entropy", entropy)
        hamming_z = baseline.zscore(can_id, "payload_hamming", hamming)

        feats[node_idx] = [
            indegree, outdegree, sl_count, occ_freq,
            freq_z, iat_mean_z, iat_var_z, entropy_z, hamming_z,
            out_trans_ent, burstiness,
        ]

        baseline.update(can_id, "freq", occ_freq)
        baseline.update(can_id, "iat_mean", iat_mean)
        baseline.update(can_id, "iat_var", iat_var)
        baseline.update(can_id, "payload_entropy", entropy)
        baseline.update(can_id, "payload_hamming", hamming)

    return feats


def extract_global_features(graph: WindowGraph) -> np.ndarray:
    n = len(graph.ids)
    unique_id_count = n

    weights = list(graph.edge_weight_map.values())
    total = sum(weights)
    transition_entropy = 0.0
    if total > 0:
        for w in weights:
            p = w / total
            if p > 0:
                transition_entropy -= p * math.log2(p)

    possible_edges = n * n if n > 0 else 1
    observed_edges = len(graph.edge_weight_map)
    graph_density = observed_edges / possible_edges if possible_edges > 0 else 0.0

    return np.array([unique_id_count, transition_entropy, graph_density], dtype=np.float32)


def build_windows(df: pd.DataFrame, window_size: int = 200, stride: int = 200, normal_val: int = 0) -> list[dict]:
    df = df.sort_values("row_idx").reset_index(drop=True)
    n_rows = len(df)

    can_ids = df["can_id"].to_numpy()
    timestamps = df["timestamp"].to_numpy()
    payloads = df["payload"].tolist()
    labels = df["label"].to_numpy()

    baseline = RollingBaselineStore()
    windows: list[dict] = []

    window_idx = 0
    start = 0
    while start + window_size <= n_rows:
        end = start + window_size
        w_ids = can_ids[start:end].tolist()
        w_ts = timestamps[start:end].tolist()
        w_payloads = payloads[start:end]
        w_labels = labels[start:end]

        graph = build_window_graph(w_ids)
        node_feats = extract_node_features(
            graph=graph,
            can_ids_in_order=w_ids,
            timestamps_in_order=w_ts,
            payloads_in_order=w_payloads,
            baseline=baseline,
        )
        edge_index, edge_weight = unique_edges(graph)
        global_feats = extract_global_features(graph)

        attack_labels = w_labels[w_labels != normal_val]
        if attack_labels.size == 0:
            window_label = normal_val
        else:
            vals, counts = np.unique(attack_labels, return_counts=True)
            window_label = int(vals[np.argmax(counts)])

        windows.append({
            "window_idx": window_idx,
            "node_features": node_feats,
            "edge_index": edge_index,
            "edge_weight": edge_weight,
            "global_features": global_feats,
            "label": window_label,
            "num_nodes": len(graph.ids),
            "timestamp_start": float(w_ts[0]),
            "timestamp_end": float(w_ts[-1]),
        })

        window_idx += 1
        start += stride

    return windows

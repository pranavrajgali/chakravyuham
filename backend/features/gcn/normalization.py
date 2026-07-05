"""
Feature normalization classes and apply helpers.
"""

from __future__ import annotations
from dataclasses import dataclass
import numpy as np


@dataclass
class NormalizationStats:
    node_mean: np.ndarray   # (11,)
    node_std: np.ndarray    # (11,)
    global_mean: np.ndarray  # (3,)
    global_std: np.ndarray   # (3,)


def apply_normalization(window: dict, stats: NormalizationStats) -> dict:
    normed = dict(window)
    normed["node_features"] = (window["node_features"] - stats.node_mean) / stats.node_std
    normed["global_features"] = (window["global_features"] - stats.global_mean) / stats.global_std
    return normed


def apply_normalization_to_all(windows: list[dict], stats: NormalizationStats) -> list[dict]:
    return [apply_normalization(w, stats) for w in windows]


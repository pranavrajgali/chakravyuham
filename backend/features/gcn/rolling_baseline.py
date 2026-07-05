"""
Per-CAN-ID rolling baselines, maintained ACROSS windows (never reset).
Uses Welford's online algorithm for numerically stable running mean/var.
"""

from __future__ import annotations
from dataclasses import dataclass


@dataclass
class _Welford:
    n: int = 0
    mean: float = 0.0
    m2: float = 0.0

    def update(self, x: float) -> None:
        self.n += 1
        delta = x - self.mean
        self.mean += delta / self.n
        delta2 = x - self.mean
        self.m2 += delta * delta2

    @property
    def std(self) -> float:
        if self.n < 2:
            return 0.0
        return (self.m2 / (self.n - 1)) ** 0.5

    def zscore(self, x: float, eps: float = 1e-6) -> float:
        if self.n < 2:
            return 0.0
        s = self.std
        if s < eps:
            return 0.0
        return (x - self.mean) / s


class RollingBaselineStore:
    """Holds one _Welford tracker per (can_id, metric_name)."""

    METRICS = (
        "freq",
        "iat_mean",
        "iat_var",
        "payload_entropy",
        "payload_hamming",
    )

    def __init__(self):
        self._store: dict[tuple[int, str], _Welford] = {}

    def _get(self, can_id: int, metric: str) -> _Welford:
        key = (can_id, metric)
        if key not in self._store:
            self._store[key] = _Welford()
        return self._store[key]

    def zscore(self, can_id: int, metric: str, value: float) -> float:
        return self._get(can_id, metric).zscore(value)

    def update(self, can_id: int, metric: str, value: float) -> None:
        self._get(can_id, metric).update(value)

    def has_history(self, can_id: int, metric: str) -> bool:
        return self._get(can_id, metric).n >= 2

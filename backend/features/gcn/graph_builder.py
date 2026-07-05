"""
Builds the directed multigraph for a single window of 200 consecutive
CAN messages.

Node: one node per unique arbitration ID present in the window.
Edge: message k's ID -> message k+1's ID (directed), self-loops retained
      when the same ID repeats consecutively.
Edge weight: number of times a specific (src_id -> dst_id) transition
             occurs in the window.
"""

from __future__ import annotations
from dataclasses import dataclass
import numpy as np


@dataclass
class WindowGraph:
    ids: list[int]                       # ordered unique IDs -> node index
    id_to_node: dict[int, int]
    edge_list: list[tuple[int, int]]      # (src_node, dst_node) per raw transition
    edge_weight_map: dict[tuple[int, int], int]  # (src_node,dst_node) -> count
    sequence: list[int]                  # sequence of (can_id, node_idx) for the raw 200 messages


def build_window_graph(can_id_sequence: list[int]) -> WindowGraph:
    unique_ids = list(dict.fromkeys(can_id_sequence))  # stable order of first appearance
    id_to_node = {cid: i for i, cid in enumerate(unique_ids)}
    node_sequence = [id_to_node[c] for c in can_id_sequence]

    edge_weight_map: dict[tuple[int, int], int] = {}
    edge_list: list[tuple[int, int]] = []
    for k in range(len(node_sequence) - 1):
        src, dst = node_sequence[k], node_sequence[k + 1]
        edge_list.append((src, dst))
        edge_weight_map[(src, dst)] = edge_weight_map.get((src, dst), 0) + 1

    return WindowGraph(
        ids=unique_ids,
        id_to_node=id_to_node,
        edge_list=edge_list,
        edge_weight_map=edge_weight_map,
        sequence=node_sequence,
    )


def unique_edges(graph: WindowGraph) -> tuple[np.ndarray, np.ndarray]:
    """Return (edge_index[2, E], edge_weight[E]) over UNIQUE transitions."""
    if not graph.edge_weight_map:
        return np.zeros((2, 0), dtype=np.int64), np.zeros((0,), dtype=np.float32)

    pairs = list(graph.edge_weight_map.keys())
    src = np.array([p[0] for p in pairs], dtype=np.int64)
    dst = np.array([p[1] for p in pairs], dtype=np.int64)
    w = np.array([graph.edge_weight_map[p] for p in pairs], dtype=np.float32)
    edge_index = np.vstack([src, dst])
    return edge_index, w

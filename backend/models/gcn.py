"""
Lightweight GCN classifier close to original GCNIDS design.
11 -> GCNConv -> 8 -> GCNConv -> 8 -> global_mean_pool
   -> concat [unique_id_count, transition_entropy, graph_density] (3)
   -> Dropout(0.5) -> Linear -> num_classes
"""

from __future__ import annotations
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.nn import GCNConv, global_mean_pool


class GCNIDS(nn.Module):
    def __init__(
        self,
        node_in_dim: int = 11,
        gcn_hidden: int = 8,
        gcn_out: int = 8,
        global_feat_dim: int = 3,
        num_classes: int = 5,
        dropout: float = 0.5,
    ):
        super().__init__()
        self.conv1 = GCNConv(node_in_dim, gcn_hidden)
        self.conv2 = GCNConv(gcn_hidden, gcn_out)
        self.dropout = nn.Dropout(dropout)
        self.classifier = nn.Linear(gcn_out + global_feat_dim, num_classes)

    def forward(self, x, edge_index, edge_weight, batch, global_features):
        if edge_index.numel() == 0:
            num_nodes = x.size(0)
            self_idx = torch.arange(num_nodes, device=x.device)
            edge_index = torch.stack([self_idx, self_idx], dim=0)
            edge_weight = torch.ones(num_nodes, device=x.device)

        h = self.conv1(x, edge_index, edge_weight=edge_weight)
        h = F.relu(h)
        h = self.conv2(h, edge_index, edge_weight=edge_weight)
        h = F.relu(h)

        pooled = global_mean_pool(h, batch)          # (B, gcn_out)
        combined = torch.cat([pooled, global_features], dim=1)  # (B, gcn_out+3)
        combined = self.dropout(combined)
        logits = self.classifier(combined)
        return logits

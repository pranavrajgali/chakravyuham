"""
Trainer for CAN Autoencoder
"""

from __future__ import annotations

import torch
import torch.nn as nn
from torch.utils.data import DataLoader


class AutoencoderTrainer:

    def __init__(

        self,

        model,

        learning_rate=1e-3,

        device="cpu",

    ):

        self.device = device

        self.model = model.to(device)

        self.loss_fn = nn.BCELoss()

        self.optimizer = torch.optim.Adam(

            model.parameters(),

            lr=learning_rate,

        )

    ##############################################################

    def train_epoch(

        self,

        loader: DataLoader,

    ):

        self.model.train()

        running_loss = 0

        for batch in loader:

            batch = batch.to(self.device)

            self.optimizer.zero_grad()

            reconstruction = self.model(batch)

            loss = self.loss_fn(

                reconstruction,

                batch,

            )

            loss.backward()

            self.optimizer.step()

            running_loss += loss.item()

        return running_loss / len(loader)

    ##############################################################

    @torch.no_grad()

    def validate(

        self,

        loader,

    ):

        self.model.eval()

        running_loss = 0

        for batch in loader:

            batch = batch.to(self.device)

            reconstruction = self.model(batch)

            loss = self.loss_fn(

                reconstruction,

                batch,

            )

            running_loss += loss.item()

        return running_loss / len(loader)

    ##############################################################

    def save(

        self,

        path,

    ):

        torch.save(

            self.model.state_dict(),

            path,

        )

    ##############################################################

    def load(

        self,

        path,

    ):

        self.model.load_state_dict(

            torch.load(path)

        )
"""
Autoencoder for Mosaic-CNN

Compresses 29-bit CAN IDs into
9-dimensional latent vectors.

Author: Tejasri Project
"""

from __future__ import annotations

import torch
import torch.nn as nn


class CANAutoencoder(nn.Module):

    def __init__(

        self,

        input_size=29,

        latent_size=9,

    ):

        super().__init__()

        ##############################################################
        # Encoder
        ##############################################################

        self.encoder = nn.Sequential(

            nn.Linear(input_size, 64),

            nn.ReLU(),

            nn.Linear(64, 32),

            nn.ReLU(),

            nn.Linear(32, latent_size),

            nn.Sigmoid(),

        )

        ##############################################################
        # Decoder
        ##############################################################

        self.decoder = nn.Sequential(

            nn.Linear(latent_size, 32),

            nn.ReLU(),

            nn.Linear(32, 64),

            nn.ReLU(),

            nn.Linear(64, input_size),

            nn.Sigmoid(),

        )

    ##############################################################
    # Forward
    ##############################################################

    def forward(self, x):

        latent = self.encoder(x)

        reconstructed = self.decoder(latent)

        return reconstructed

    ##############################################################
    # Encode only
    ##############################################################

    def encode(self, x):

        return self.encoder(x)

    ##############################################################
    # Decode only
    ##############################################################

    def decode(self, x):

        return self.decoder(x)
"""
Mosaic Encoding Module
----------------------

Implements the Mosaic Coding method for
CAN Intrusion Detection.

Author: Tejasri Project
"""

from __future__ import annotations

import random
from typing import List

import numpy as np
import torch
import matplotlib.pyplot as plt


class MosaicEncoder:

    def __init__(
        self,
        grid_size: int = 3,
        mosaic_size: int = 8,
        can_bits: int = 29,
        autoencoder=None,
    ):

        self.grid_size = grid_size
        self.mosaic_size = mosaic_size
        self.can_bits = can_bits

        self.image_size = grid_size * mosaic_size

        # Later we'll replace the placeholder
        # with the trained encoder.
        self.autoencoder = autoencoder
        self.cache = {}

    ####################################################################
    # CAN → Binary
    ####################################################################

    def can_to_binary(
        self,
        can_id: int,
    ) -> np.ndarray:

        binary = format(
            int(can_id),
            f"0{self.can_bits}b"
        )

        return np.array(
            [int(x) for x in binary],
            dtype=np.float32,
        )

    ####################################################################
    # Placeholder
    ####################################################################

    def reduce_to_nine_bits(
        self,
        binary: np.ndarray,
    ) -> np.ndarray:

        if len(binary) >= 9:

            return binary[:9]

        padded = np.zeros(
            9,
            dtype=np.float32,
        )

        padded[:len(binary)] = binary

        return padded

    ####################################################################
    # Bits → 3×3 Grid
    ####################################################################

    def bits_to_grid(
        self,
        bits: np.ndarray,
    ) -> np.ndarray:

        return bits.reshape(
            self.grid_size,
            self.grid_size,
        )

    ####################################################################
    # Encode One CAN ID
    ####################################################################

    def encode_can(
        self,
        can_id: int,
    ) -> np.ndarray:
        if can_id in self.cache:
            return self.cache[can_id]

        binary = self.can_to_binary(can_id)

        ############################################################

        if self.autoencoder is None:

            reduced = self.reduce_to_nine_bits(
                binary
            )

        else:
            device = next(self.autoencoder.parameters()).device
            tensor = torch.tensor(
                binary,
                dtype=torch.float32,
            ).unsqueeze(0).to(device)

            with torch.no_grad():

                reduced = self.autoencoder.encode(
                    tensor
                )

            reduced = reduced.squeeze().cpu().numpy()

        ############################################################

        grid = self.bits_to_grid(
            reduced
        )

        self.cache[can_id] = grid
        return grid

    ####################################################################
    # Encode Sequence
    ####################################################################

    def encode_sequence(
        self,
        ids: List[int],
    ) -> List[np.ndarray]:

        grids = []

        for cid in ids:

            grids.append(

                self.encode_can(cid)

            )

        return grids

    ####################################################################
    # Random Window
    ####################################################################

    def random_window(
        self,
        ids: List[int],
    ) -> List[int]:

        total = self.mosaic_size ** 2

        if len(ids) < total:

            raise ValueError(
                "Not enough CAN IDs."
            )

        start = random.randint(
            0,
            len(ids) - total,
        )

        return ids[
            start:start + total
        ]
    ####################################################################
    # Build Mosaic Image
    ####################################################################

    def build_mosaic(
        self,
        ids: List[int],
    ) -> np.ndarray:

        window = self.random_window(ids)

        grids = self.encode_sequence(window)

        rows = []

        for r in range(self.mosaic_size):

            row = np.hstack(

                grids[
                    r * self.mosaic_size:
                    (r + 1) * self.mosaic_size
                ]

            )

            rows.append(row)

        image = np.vstack(rows)

        return image.astype(np.float32)

    ####################################################################
    # Normalize Image
    ####################################################################

    def normalize(
        self,
        image: np.ndarray,
    ) -> np.ndarray:

        image = image.astype(np.float32)

        mn = image.min()

        mx = image.max()

        if mx - mn == 0:

            return image

        image = (image - mn) / (mx - mn)

        return image

    ####################################################################
    # Build Dataset
    ####################################################################

    def create_dataset(

        self,

        ids: List[int],

        label: int,

        samples: int = 1000,

    ):

        X = []

        y = []

        for _ in range(samples):

            mosaic = self.build_mosaic(ids)

            mosaic = self.normalize(mosaic)

            X.append(mosaic)

            y.append(label)

        X = np.asarray(

            X,

            dtype=np.float32,

        )

        y = np.asarray(

            y,

            dtype=np.int64,

        )

        return X, y

    ####################################################################
    # Tensor Conversion
    ####################################################################

    def to_tensor(

        self,

        X,

    ):

        return torch.tensor(

            X,

            dtype=torch.float32,

        ).unsqueeze(1)

    ####################################################################
    # Display
    ####################################################################

    def show(

        self,

        image,

    ):

        plt.figure(figsize=(5,5))

        plt.imshow(

            image,

            cmap="gray",

        )

        plt.axis("off")

        plt.show()
        
########################################################################
# Test
########################################################################

if __name__ == "__main__":

    print()
    print("=" * 50)
    print("Testing Mosaic Encoder")
    print("=" * 50)

    encoder = MosaicEncoder()

    # Dummy CAN IDs
    ids = list(range(64))

    image = encoder.build_mosaic(ids)

    print()
    print("Image Shape :", image.shape)
    print()

    encoder.show(image)

    X, y = encoder.create_dataset(
        ids=ids,
        label=0,
        samples=15,
    )

    print("=" * 40)
    print("MOSAIC DATASET")
    print("=" * 40)
    print("Samples :", len(X))
    print("Shape   :", X.shape)
    print("Labels  :", np.unique(y))
    print("=" * 40)

    print()
    print("Finished Successfully!")
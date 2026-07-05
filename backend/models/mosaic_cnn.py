"""
Mosaic CNN
----------

CNN architecture for Mosaic-coded CAN images.

Input:
    1 x 24 x 24

Output:
    Attack class probabilities

Author: Tejasri Project
"""

from __future__ import annotations

import torch
import torch.nn as nn


class MosaicCNN(nn.Module):

    def __init__(
        self,
        num_classes: int = 5,
    ):

        super().__init__()

        ############################################################
        # Feature Extractor
        ############################################################

        self.features = nn.Sequential(

            nn.Conv2d(
                in_channels=1,
                out_channels=20,
                kernel_size=3,
                padding=1,
            ),

            nn.ReLU(inplace=True),

            nn.AvgPool2d(
                kernel_size=2,
                stride=2,
            ),

            nn.Conv2d(
                20,
                40,
                kernel_size=3,
                padding=1,
            ),

            nn.ReLU(inplace=True),

            nn.AvgPool2d(
                kernel_size=2,
                stride=2,
            ),
        )

        ############################################################
        # Classifier
        ############################################################

        self.classifier = nn.Sequential(

            nn.Flatten(),

            nn.Linear(
                40 * 6 * 6,
                128,
            ),

            nn.ReLU(),

            nn.Dropout(0.5),

            nn.Linear(
                128,
                num_classes,
            ),
        )

    ############################################################

    def forward(self, x):

        x = self.features(x)

        x = self.classifier(x)

        return x

    ############################################################

    @torch.no_grad()
    def predict(self, x):

        self.eval()

        logits = self.forward(x)

        probabilities = torch.softmax(
            logits,
            dim=1,
        )

        prediction = torch.argmax(
            probabilities,
            dim=1,
        )

        return prediction, probabilities


############################################################
# Test
############################################################

if __name__ == "__main__":

    model = MosaicCNN()

    dummy = torch.randn(
        4,
        1,
        24,
        24,
    )

    output = model(dummy)

    print()

    print("=" * 50)
    print("Mosaic CNN")
    print("=" * 50)
    print("Input :", dummy.shape)
    print("Output:", output.shape)
    print("=" * 50)
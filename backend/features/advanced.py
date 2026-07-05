import numpy as np
import pandas as pd

# Population count (set bits count) lookup table for 0-255
POPCOUNT_TABLE = np.array([bin(i).count("1") for i in range(256)], dtype=np.uint8)


def precompute_entropy_table():
    """
    Precomputes the Shannon entropy of 8-byte sorted payloads.
    With 8 sorted bytes, there are 7 binary transition points,
    yielding 128 unique equivalence pattern configurations.
    """
    table = np.zeros(128, dtype=np.float32)
    for mask in range(128):
        bits = [(mask >> j) & 1 for j in range(7)]
        groups = []
        curr_size = 1
        for b in bits:
            if b == 0:
                curr_size += 1
            else:
                groups.append(curr_size)
                curr_size = 1
        groups.append(curr_size)
        
        ent = 0.0
        for g in groups:
            p = g / 8.0
            ent -= p * np.log2(p)
        table[mask] = ent
    return table


ENTROPY_LOOKUP_TABLE = precompute_entropy_table()


def extract(df):
    """
    Extracts engineered features matching the exact mathematical specs of the
    vehicular network security model:
    - can_id (categorical/numeric pass-through)
    - dlc
    - iat: Inter-Arrival Time per CAN ID
    - jitter: Jitter (Variance in IAT) per CAN ID
    - message_frequency: message rate aggregated globally across the bus
    - payload_entropy: Shannon Information Entropy of the 8-byte payload
    - payload_hamming_dist: Hamming distance of data bytes per CAN ID
    """
    res = pd.DataFrame(index=df.index)
    res["can_id"] = df["can_id"]
    res["dlc"] = df["dlc"]

    # 1. Inter-Arrival Time (IAT)
    res["iat"] = df.groupby("can_id")["timestamp"].diff().fillna(0.0)

    # 2. Jitter (Variance in IAT): J_k = | IAT_k - IAT_{k-1} | per CAN ID
    res["jitter"] = res.groupby("can_id")["iat"].diff().abs().fillna(0.0)

    # 3. Message Frequency: rolling count of all messages in the bus.
    # Calculated as N / elapsed time. Using a rolling 50-message stride:
    elapsed = df["timestamp"].diff(periods=50).fillna(0.0)
    # Prevent divide-by-zero on simultaneous packet logs
    res["message_frequency"] = np.where(elapsed > 0, 50.0 / elapsed, 0.0)

    # 4. Payload Shannon Entropy (vectorized mapping via precomputed lookup table)
    data_cols = [f"data_{i}" for i in range(8)]
    payloads = df[data_cols].values
    sorted_payloads = np.sort(payloads, axis=1)
    diffs = sorted_payloads[:, 1:] != sorted_payloads[:, :-1]
    powers = 2 ** np.arange(7)
    masks = np.dot(diffs, powers)
    res["payload_entropy"] = ENTROPY_LOOKUP_TABLE[masks]

    # 5. Payload Hamming Distance per CAN ID
    shifted = (
        df.groupby("can_id")[data_cols]
        .shift(1)
        .fillna(0)
        .astype(int)
    )

    hamming_dist = np.zeros(len(df), dtype=np.int32)
    for col in data_cols:
        xor_val = df[col].astype(int) ^ shifted[col]
        hamming_dist += POPCOUNT_TABLE[xor_val]

    res["payload_hamming_dist"] = hamming_dist

    # Drop raw features (can_id and dlc) to prevent data leakage in the Advanced feature set
    res.drop(columns=["can_id", "dlc"], inplace=True, errors="ignore")
    return res

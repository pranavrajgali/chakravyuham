import numpy as np
import pandas as pd
from features.advanced import ENTROPY_LOOKUP_TABLE, POPCOUNT_TABLE


def extract_window_features(df, window_size=100, step_size=50):
    """
    Constructs the Protocol-Agnostic Standard Feature Vector (V_W)
    by windowing the raw CAN stream using a sliding message-count window.
    
    Formula:
    V_W = [ mu_IAT, var_IAT, F_window, mu_Entropy, var_Entropy, mu_Hamming, U_ID_Ratio ]
    
    Returns:
        X_win (pd.DataFrame): The standardized window feature vectors
        y_win (pd.Series): The mapped labels for each window (majority/any attack rule)
    """
    timestamps = df["timestamp"].values
    can_ids = df["can_id"].values
    labels = df["label"].values
    source_files = df["source_file"].values
    
    # Pre-calculate message-level features to aggregate inside windows
    # 1. Global IAT
    global_iats = np.diff(timestamps, prepend=timestamps[0])
    
    # 2. Shannon Entropy per message
    data_cols = [f"data_{i}" for i in range(8)]
    payloads = df[data_cols].values
    sorted_payloads = np.sort(payloads, axis=1)
    diffs = sorted_payloads[:, 1:] != sorted_payloads[:, :-1]
    powers = 2 ** np.arange(7)
    masks = np.dot(diffs, powers)
    entropies = ENTROPY_LOOKUP_TABLE[masks]
    
    # 3. Hamming distance between consecutive payloads of the same CAN ID
    shifted = (
        df.groupby("can_id")[data_cols]
        .shift(1)
        .fillna(0)
        .astype(int)
    )
    hamming_dists = np.zeros(len(df), dtype=np.float32)
    for col in data_cols:
        xor_val = df[col].astype(int) ^ shifted[col]
        hamming_dists += POPCOUNT_TABLE[xor_val]
        
    n_samples = len(df)
    windows_x = []
    windows_y = []
    windows_src = []
    
    # Slide across the logs
    for start_idx in range(0, n_samples - window_size + 1, step_size):
        end_idx = start_idx + window_size
        
        # Slices
        win_ts = timestamps[start_idx:end_idx]
        win_ids = can_ids[start_idx:end_idx]
        win_iats = global_iats[start_idx:end_idx]
        win_ent = entropies[start_idx:end_idx]
        win_ham = hamming_dists[start_idx:end_idx]
        win_lbl = labels[start_idx:end_idx]
        
        # Compute V_W components
        mu_iat = np.mean(win_iats)
        var_iat = np.var(win_iats)
        
        # Aggregate frequency: F_window = N_W / W
        duration = win_ts[-1] - win_ts[0]
        f_window = float(window_size) / duration if duration > 0 else 0.0
        
        mu_entropy = np.mean(win_ent)
        var_entropy = np.var(win_ent)
        
        mu_hamming = np.mean(win_ham)
        
        # Unique ID ratio: U_ID_Ratio = unique IDs / total messages
        unique_ids = len(np.unique(win_ids))
        u_id_ratio = float(unique_ids) / float(window_size)
        
        # Append feature vector
        windows_x.append([
            mu_iat, var_iat, f_window,
            mu_entropy, var_entropy, mu_hamming,
            u_id_ratio
        ])
        
        # Labeling rule: if any message inside the window is an attack,
        # label the window with the most common attack class. Else, normal.
        attacks = [lbl for lbl in win_lbl if lbl != "normal"]
        if attacks:
            # majority vote among the attack labels
            win_y = max(set(attacks), key=attacks.count)
        else:
            win_y = "normal"
            
        windows_y.append(win_y)
        
        # Track majority source file for the window
        win_src = source_files[start_idx:end_idx]
        win_src_file = max(set(win_src), key=list(win_src).count)
        windows_src.append(win_src_file)
        
    cols = [
        "mu_iat", "var_iat", "f_window",
        "mu_entropy", "var_entropy", "mu_hamming",
        "u_id_ratio"
    ]
    X_df = pd.DataFrame(windows_x, columns=cols)
    X_df["source_file"] = windows_src
    return X_df, pd.Series(windows_y)

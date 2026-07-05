import os
import pandas as pd
import numpy as np
from data.loaders.base_loader import BaseLoader, COLUMN_NAMES

RAW_SUBDIR = "car_hacking"

FILES = {
    "DoS_dataset.csv": "dos",
    "Fuzzy_dataset.csv": "fuzzy",
    "RPM_dataset.csv": "rpm",
    "gear_dataset.csv": "gear",
}


def _parse_file(filepath):
    rows = []
    with open(filepath, "r") as f:
        for line in f:
            parts = line.strip().split(",")
            if not parts or len(parts) < 3:
                continue
            try:
                # 1. Scan and extract label flag programmatically to solve structural misalignments
                label_char = None
                if "R" in parts:
                    label_char = "R"
                    clean_parts = [p for p in parts if p != "R"]
                elif "T" in parts:
                    label_char = "T"
                    clean_parts = [p for p in parts if p != "T"]
                else:
                    label_char = parts[-1]
                    clean_parts = parts[:-1]
                
                ts = float(clean_parts[0])
                can_id = int(clean_parts[1], 16)
                dlc = int(clean_parts[2])
                
                # 2. Extract payload bytes from the remaining fields and pad/trim to 64-bit structure
                payload_parts = clean_parts[3:]
                data_bytes = []
                for p in payload_parts:
                    try:
                        data_bytes.append(int(p, 16))
                    except ValueError:
                        continue
                
                while len(data_bytes) < 8:
                    data_bytes.append(0)
                    
                rows.append([ts, can_id, dlc] + data_bytes[:8] + [label_char])
            except (ValueError, IndexError):
                continue
                
    df = pd.DataFrame(rows, columns=COLUMN_NAMES + ["label_char"])
    
    # 3. Trim significant temporal gaps at the conclusion of attack captures (dead air > 5 seconds)
    if len(df) > 1:
        global_diffs = df["timestamp"].diff().fillna(0.0)
        large_gaps = df[global_diffs > 5.0].index
        if not large_gaps.empty:
            first_gap_idx = large_gaps[0]
            print(f"Trimming {len(df) - first_gap_idx} rows of dead air at the end of log.")
            df = df.iloc[:first_gap_idx].copy()
            
    return df


class CarHackingLoader(BaseLoader):
    name = "car_hacking"

    def _build(self, raw_dir):
        base_path = raw_dir
        if "raw" in raw_dir:
            alt_path = os.path.dirname(raw_dir)
            if os.path.exists(os.path.join(alt_path, RAW_SUBDIR)):
                base_path = alt_path
                
        dir_path = os.path.join(base_path, RAW_SUBDIR)
        
        all_dfs = []
        for filename, key in FILES.items():
            filepath = os.path.join(dir_path, filename)
            print(f"[{self.name}] Parsing {filename}...")
            df = _parse_file(filepath)
            
            # Map T -> key (attack name), R -> normal
            df["label"] = df["label_char"].apply(lambda x: key if x == "T" else "normal")
            df.drop(columns=["label_char"], inplace=True)
            df["source_file"] = key
            all_dfs.append(df)
            
        return pd.concat(all_dfs, ignore_index=True)

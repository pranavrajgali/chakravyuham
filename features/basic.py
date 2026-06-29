import pandas as pd

BASIC_FEATURE_COLUMNS = ["can_id", "dlc",
                          "data_0", "data_1", "data_2", "data_3",
                          "data_4", "data_5", "data_6", "data_7"]


def extract(df):
    """
    Extracts basic per-message features.
    Input: validated dataframe from a loader (timestamp, can_id, dlc,
           data_0..7, label, source_file)
    Output: dataframe containing only BASIC_FEATURE_COLUMNS
            (label is handled separately in pipeline.py)
    """
    return df[BASIC_FEATURE_COLUMNS].copy()
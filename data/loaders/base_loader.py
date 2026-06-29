from abc import ABC, abstractmethod
import os
import pandas as pd

COLUMN_NAMES = ["timestamp", "can_id", "dlc",
                "data_0", "data_1", "data_2", "data_3",
                "data_4", "data_5", "data_6", "data_7"]

REQUIRED_COLUMNS = COLUMN_NAMES + ["label"]


class BaseLoader(ABC):
    """
    Schema contract for all dataset loaders.
    Every loader must implement _build() which returns a raw dataframe
    matching COLUMN_NAMES + label. This base class handles validation
    and processed-folder caching so individual loaders don't repeat it.
    """

    name = "base"  # override in subclass, e.g. "otids"

    @abstractmethod
    def _build(self, raw_dir):
        """Dataset-specific parsing + labeling. Must return a dataframe
        with columns matching REQUIRED_COLUMNS (extra columns allowed)."""
        raise NotImplementedError

    def validate(self, df):
        for col in REQUIRED_COLUMNS:
            if col not in df.columns:
                raise ValueError(f"[{self.name}] Schema broken: missing column '{col}'")

        if not pd.api.types.is_float_dtype(df["timestamp"]):
            raise ValueError(f"[{self.name}] timestamp must be float")

        if not pd.api.types.is_integer_dtype(df["can_id"]):
            raise ValueError(f"[{self.name}] can_id must be int")

        for i in range(8):
            col = f"data_{i}"
            if not df[col].between(0, 255).all():
                raise ValueError(f"[{self.name}] {col} has values outside 0-255")

        if df[REQUIRED_COLUMNS].isnull().any().any():
            raise ValueError(f"[{self.name}] Schema broken: missing values found")

        return True

    def load(self, raw_dir="data/raw", processed_dir="data/processed", use_cache=True):
        cache_path = os.path.join(processed_dir, f"{self.name}_clean.csv")

        if use_cache and os.path.exists(cache_path):
            return pd.read_csv(cache_path)

        df = self._build(raw_dir)
        self.validate(df)

        os.makedirs(processed_dir, exist_ok=True)
        df.to_csv(cache_path, index=False)

        return df
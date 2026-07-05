from models.xgboost_model import XGBoostModel
from models.lightgbm_model import LightGBMModel

MODEL_REGISTRY = {
    "xgboost": XGBoostModel,
    "lightgbm": LightGBMModel,
}


def get_model(name, params=None):
    if name not in MODEL_REGISTRY:
        raise ValueError(f"Unknown model: '{name}'")
    return MODEL_REGISTRY[name](params)
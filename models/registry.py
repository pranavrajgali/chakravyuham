from models.random_forest import RandomForestModel
from models.xgboost_model import XGBoostModel

MODEL_REGISTRY = {
    "random_forest": RandomForestModel,
    "xgboost": XGBoostModel,
}


def get_model(name, params=None):
    if name not in MODEL_REGISTRY:
        raise ValueError(f"Unknown model: '{name}'")
    return MODEL_REGISTRY[name](params)
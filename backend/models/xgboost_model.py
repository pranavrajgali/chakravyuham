from xgboost import XGBClassifier
from sklearn.preprocessing import LabelEncoder
from models.base_model import BaseModel


from sklearn.utils.class_weight import compute_sample_weight

import numpy as np
from sklearn.utils.class_weight import compute_class_weight

class XGBoostModel(BaseModel):
    name = "xgboost"

    def __init__(self, params=None):
        params = params or {}
        # Enable categorical support natively in XGBoost
        self.model = XGBClassifier(**params, eval_metric="mlogloss", enable_categorical=True)
        self.label_encoder = LabelEncoder()

    def train(self, X_train, y_train, eval_set=None):
        y_encoded = self.label_encoder.fit_transform(y_train)
        
        # Compute balanced class weights and cap them at a max multiplier of 8.0
        classes = np.unique(y_encoded)
        raw_weights = compute_class_weight("balanced", classes=classes, y=y_encoded)
        capped_weights = np.clip(raw_weights, a_min=1.0, a_max=8.0)
        weight_dict = dict(zip(classes, capped_weights))
        sample_weights = np.array([weight_dict[y] for y in y_encoded])
        
        fit_kwargs = {"sample_weight": sample_weights}
        if eval_set is not None:
            X_val, y_val = eval_set
            y_val_encoded = self.label_encoder.transform(y_val)
            fit_kwargs["eval_set"] = [(X_val, y_val_encoded)]
            self.model.set_params(early_stopping_rounds=10)
            
        self.model.fit(X_train, y_encoded, **fit_kwargs)

    def predict(self, X_test):
        y_pred_encoded = self.model.predict(X_test)
        return self.label_encoder.inverse_transform(y_pred_encoded)
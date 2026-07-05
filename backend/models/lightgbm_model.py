from lightgbm import LGBMClassifier
from sklearn.preprocessing import LabelEncoder
from models.base_model import BaseModel


from sklearn.utils.class_weight import compute_sample_weight

import numpy as np
from sklearn.utils.class_weight import compute_class_weight

class LightGBMModel(BaseModel):
    name = "lightgbm"

    def __init__(self, params=None):
        params = params or {}
        # Set default verbosity to 1 to show training logs, but allow overriding to -1
        if "verbosity" not in params:
            params["verbosity"] = 1
        self.verbose_eval = params["verbosity"] >= 0
        self.model = LGBMClassifier(**params)
        self.label_encoder = LabelEncoder()

    def train(self, X_train, y_train, eval_set=None):
        y_encoded = self.label_encoder.fit_transform(y_train)
        
        # Compute balanced class weights and cap them at a max multiplier of 8.0
        classes = np.unique(y_encoded)
        raw_weights = compute_class_weight("balanced", classes=classes, y=y_encoded)
        capped_weights = np.clip(raw_weights, a_min=1.0, a_max=8.0)
        weight_dict = dict(zip(classes, capped_weights))
        sample_weights = np.array([weight_dict[y] for y in y_encoded])
        
        # Explicitly pass categorical features if any exist
        cat_cols = [col for col in X_train.columns if X_train[col].dtype.name == 'category']
        
        fit_kwargs = {
            "sample_weight": sample_weights,
            "categorical_feature": cat_cols
        }
        if eval_set is not None:
            import lightgbm as lgb
            X_val, y_val = eval_set
            y_val_encoded = self.label_encoder.transform(y_val)
            fit_kwargs["eval_set"] = [(X_val, y_val_encoded)]
            
            # Setup logging callbacks for training progress output
            callbacks = [lgb.early_stopping(stopping_rounds=10, verbose=self.verbose_eval)]
            if self.verbose_eval:
                callbacks.append(lgb.log_evaluation(period=10))
            fit_kwargs["callbacks"] = callbacks
            
        self.model.fit(X_train, y_encoded, **fit_kwargs)

    def predict(self, X_test):
        y_pred_encoded = self.model.predict(X_test)
        return self.label_encoder.inverse_transform(y_pred_encoded)

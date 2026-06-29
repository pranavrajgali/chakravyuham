from xgboost import XGBClassifier
from sklearn.preprocessing import LabelEncoder
from models.base_model import BaseModel


class XGBoostModel(BaseModel):
    name = "xgboost"

    def __init__(self, params=None):
        params = params or {}
        self.model = XGBClassifier(**params, use_label_encoder=False, eval_metric="mlogloss")
        self.label_encoder = LabelEncoder()

    def train(self, X_train, y_train):
        y_encoded = self.label_encoder.fit_transform(y_train)
        self.model.fit(X_train, y_encoded)

    def predict(self, X_test):
        y_pred_encoded = self.model.predict(X_test)
        return self.label_encoder.inverse_transform(y_pred_encoded)
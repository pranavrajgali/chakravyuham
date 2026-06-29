from sklearn.ensemble import RandomForestClassifier
from models.base_model import BaseModel


class RandomForestModel(BaseModel):
    name = "random_forest"

    def __init__(self, params=None):
        params = params or {}
        self.model = RandomForestClassifier(**params)

    def train(self, X_train, y_train):
        self.model.fit(X_train, y_train)

    def predict(self, X_test):
        return self.model.predict(X_test)
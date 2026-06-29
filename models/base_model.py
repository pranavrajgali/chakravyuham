from abc import ABC, abstractmethod


class BaseModel(ABC):
    """
    Contract for all models. Every model must implement train() and predict().
    No feature engineering or data loading logic belongs here.
    """

    name = "base"

    @abstractmethod
    def train(self, X_train, y_train):
        raise NotImplementedError

    @abstractmethod
    def predict(self, X_test):
        raise NotImplementedError
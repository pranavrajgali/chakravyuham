from sklearn.metrics import (
    accuracy_score,
    precision_recall_fscore_support,
    classification_report,
    confusion_matrix,
)


def compute_metrics(y_test, y_pred):
    """
    Returns overall + per-class metrics for multiclass labels
    (normal, dos, fuzzy, impersonation).
    """
    accuracy = accuracy_score(y_test, y_pred)

    precision, recall, f1, support = precision_recall_fscore_support(
        y_test, y_pred, average=None, labels=sorted(set(y_test))
    )

    labels = sorted(set(y_test))
    per_class = {}
    for i, label in enumerate(labels):
        per_class[label] = {
            "precision": float(precision[i]),
            "recall": float(recall[i]),
            "f1": float(f1[i]),
            "support": int(support[i]),
        }

    report = classification_report(y_test, y_pred, output_dict=False)
    cm = confusion_matrix(y_test, y_pred, labels=labels).tolist()

    return {
        "accuracy": float(accuracy),
        "per_class": per_class,
        "confusion_matrix": cm,
        "confusion_matrix_labels": labels,
        "classification_report_text": report,
    }
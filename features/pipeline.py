from features import basic

FEATURE_REGISTRY = {
    "basic": basic.extract,
    # "timing": timing.extract,   # added in Stage 5
}


def build_features(df, feature_list):
    """
    Builds X by applying each requested feature module and concatenating
    columns. y is the multiclass label, taken directly from df.

    feature_list: list of strings from config, e.g. ["basic"]
                  or later ["basic", "timing"]
    """
    feature_frames = []
    for name in feature_list:
        if name not in FEATURE_REGISTRY:
            raise ValueError(f"Unknown feature set: '{name}'")
        feature_frames.append(FEATURE_REGISTRY[name](df))

    import pandas as pd
    X = pd.concat(feature_frames, axis=1)
    y = df["label"]

    return X, y
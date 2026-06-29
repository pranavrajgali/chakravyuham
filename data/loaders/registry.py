from data.loaders.otids import OTIDSLoader

LOADER_REGISTRY = {
    "otids": OTIDSLoader,
    # "car_hacking": CarHackingLoader,   # added when you build a second dataset
}


def get_loader(name):
    if name not in LOADER_REGISTRY:
        raise ValueError(f"Unknown dataset: '{name}'")
    return LOADER_REGISTRY[name]()
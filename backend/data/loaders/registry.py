from data.loaders.otids import OTIDSLoader
from data.loaders.car_hacking import CarHackingLoader

LOADER_REGISTRY = {
    "otids": OTIDSLoader,
    "car_hacking": CarHackingLoader,
}


def get_loader(name):
    if name not in LOADER_REGISTRY:
        raise ValueError(f"Unknown dataset: '{name}'")
    return LOADER_REGISTRY[name]()
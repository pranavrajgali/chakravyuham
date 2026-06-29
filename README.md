## Dataset Setup
To get the OTIDS dataset up and running follow the given instructions:
Download from: https://ocslab.hksecurity.net/Dataset/CAN-intrusion-dataset
Place the four .txt files into: data/raw/otids/
  - Attack_free_dataset.txt
  - DoS_attack_dataset.txt
  - Fuzzy_attack_dataset.txt
  - Impersonation_attack_dataset.txt

## Running an experiment
python run_experiment.py configs/exp_rf.yaml

First run will parse raw files and cache to data/processed/ (slow, ~minutes).
Subsequent runs reuse the cache (fast).

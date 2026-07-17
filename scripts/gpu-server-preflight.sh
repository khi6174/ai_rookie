#!/usr/bin/env bash

set -u

section() {
  echo
  echo "[$1]"
}

command_status() {
  local name="$1"
  if command -v "$name" >/dev/null 2>&1; then
    echo "$name=AVAILABLE"
  else
    echo "$name=NOT_FOUND"
  fi
}

echo "SafeRoute AI GPU server preflight"
echo "This script is read-only and does not print environment variables or secrets."

section "system"
uname -a 2>/dev/null || true
echo "working_directory=$(pwd)"

section "gpu"
if command -v nvidia-smi >/dev/null 2>&1; then
  nvidia-smi \
    --query-gpu=index,name,memory.total,memory.free,driver_version \
    --format=csv,noheader,nounits
else
  echo "nvidia-smi=NOT_FOUND"
fi

section "cuda"
if command -v nvcc >/dev/null 2>&1; then
  nvcc --version | tail -n 1
else
  echo "nvcc=NOT_FOUND"
fi

section "runtime"
command_status python3
command_status pip3
command_status git
command_status docker
command_status nvidia-container-cli

if command -v python3 >/dev/null 2>&1; then
  python3 --version
  python3 - <<'PY'
import importlib.util

print(f"torch_installed={importlib.util.find_spec('torch') is not None}")
print(f"transformers_installed={importlib.util.find_spec('transformers') is not None}")
print(f"accelerate_installed={importlib.util.find_spec('accelerate') is not None}")
PY
fi

section "storage"
df -h . 2>/dev/null || true

section "scheduler"
command_status srun
command_status sbatch
command_status qsub

section "result"
echo "PREFLIGHT_COMPLETE"

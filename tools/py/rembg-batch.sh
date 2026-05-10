#!/usr/bin/env bash
# Run rembg in folder-batch mode under the project's venv + nix-provided libstdc++.
# Usage: rembg-batch.sh <model> <input_dir> <output_dir>
set -euo pipefail

MODEL="$1"
IN_DIR="$2"
OUT_DIR="$3"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mkdir -p "$OUT_DIR"

exec nix-shell -p stdenv.cc.cc.lib zlib --run "
  source '$SCRIPT_DIR/venv/bin/activate'
  export LD_LIBRARY_PATH=\$NIX_LD_LIBRARY_PATH:\${LD_LIBRARY_PATH:-}
  rembg p -m '$MODEL' '$IN_DIR' '$OUT_DIR'
"

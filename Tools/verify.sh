#!/usr/bin/env bash
# Compiles PRIVE's engine-free assembly graph and runs the core tests without Unity.
# See Tools/README.md.
set -euo pipefail
exec python3 "$(dirname "$0")/verify.py" "$@"

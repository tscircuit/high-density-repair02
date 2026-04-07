#!/usr/bin/env bash
set -euo pipefail

SCENARIO_LIMIT=""
CONCURRENCY=""
MARGIN=""
PROGRESS_INTERVAL=""

print_help() {
  cat <<'EOH'
Usage:
  ./benchmark.sh [scenario-limit] [--concurrency N] [--margin N] [--progress-interval MS]
  ./benchmark.sh [--scenario-limit N] [--concurrency N] [--margin N] [--progress-interval MS]

Options:
  --scenario-limit N    Run only first N samples
  --concurrency N       Number of workers
  --margin N            Boundary buffer margin in mm (default from TS script: 0.4)
  --progress-interval N Worker progress interval in ms (default from TS script: 200)
  -h, --help            Show this help

Defaults:
  Running ./benchmark.sh with no parameters benchmarks first 1000 samples.

Examples:
  ./benchmark.sh
  ./benchmark.sh 200
  ./benchmark.sh --scenario-limit 200 --concurrency 4
  ./benchmark.sh 100 --margin 0.4 --progress-interval 250
EOH
}

if [ "${1:-}" != "" ] && [[ "${1}" != --* ]]; then
  SCENARIO_LIMIT="$1"
  shift
fi

while [ "$#" -gt 0 ]; do
  case "$1" in
    -h|--help)
      print_help
      exit 0
      ;;
    --scenario-limit)
      SCENARIO_LIMIT="${2:-}"
      shift 2
      ;;
    --concurrency)
      CONCURRENCY="${2:-}"
      shift 2
      ;;
    --margin)
      MARGIN="${2:-}"
      shift 2
      ;;
    --progress-interval)
      PROGRESS_INTERVAL="${2:-}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1"
      echo "Run ./benchmark.sh --help for usage"
      exit 1
      ;;
  esac
done

CMD=(bun "scripts/benchmark-first-1000.ts")

if [ -n "${SCENARIO_LIMIT}" ]; then
  CMD+=("--limit" "${SCENARIO_LIMIT}")
fi

if [ -n "${CONCURRENCY}" ]; then
  CMD+=("--concurrency" "${CONCURRENCY}")
fi

if [ -n "${MARGIN}" ]; then
  CMD+=("--margin" "${MARGIN}")
fi

if [ -n "${PROGRESS_INTERVAL}" ]; then
  CMD+=("--progress-interval" "${PROGRESS_INTERVAL}")
fi

"${CMD[@]}"

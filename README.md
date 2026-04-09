# high-density-repair02

Simple Bun/TypeScript solver that repairs high-density routes near a node boundary.

## Setup

```bash
bun install
```

## Main Commands

```bash
bun run typecheck
bun test
bun run start
./benchmark.sh
```

- `bun run start`: open interactive Cosmos debugger.
- `./benchmark.sh`: run benchmark on dataset samples (default first 5000 combined samples from `dataset01` + `dataset02`).

## Quick Usage

```ts
import { HighDensityRepairSolver, type DatasetSample } from "high-density-repair02"

const sample: DatasetSample = { nodeWithPortPoints: {}, nodeHdRoutes: [], adjacentObstacles: [] }
const solver = new HighDensityRepairSolver({ sample, margin: 0.4 })
solver.solve()
console.log(solver.getOutput().repairedRoutes)
```

## Install From GitHub Hash

Use a specific commit in your app's `package.json`:

```json
{
  "dependencies": {
    "high-density-repair02": "github:tscircuit/high-density-repair02#<commit-hash>"
  }
}
```

Example:

```json
{
  "dependencies": {
    "high-density-repair02": "github:tscircuit/high-density-repair02#0ec411"
  }
}
```

Then install:

```bash
bun install
```

## Notes

- Main export: `HighDensityRepairSolver` from `lib/index.ts`
- Tests are visual snapshots in `tests/`
- Benchmark script options: `./benchmark.sh --help`
- Benchmark datasets:
  - `dataset01`: `sample*.json` from `datasets/dataset01` (symlink to `node_modules/dataset-hd08/samples`)
  - `dataset02`: circuit/bugreport/repro JSON inputs from `datasets/dataset02`
  - Selection: `./benchmark.sh --dataset dataset01` or `./benchmark.sh --dataset dataset02` (default is all)
  - Scenario limit: default `5000`; set `--scenario-limit all` to run all combined scenarios

## License

MIT (`LICENSE`)

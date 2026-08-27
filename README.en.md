<p align="center">
  English · <a href="README.md">简体中文</a>
</p>

<p align="center">
  <img src="https://img.shields.io/github/actions/workflow/status/xiaoxuhui/turing-machine-simulator/CI.yml?branch=main" alt="CI">
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License">
  <img src="https://img.shields.io/badge/version-0.3.0-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/node-%3E%3D20.19-brightgreen.svg" alt="Node">
</p>

# Turing Machine Simulator

A visual, programmable single-tape deterministic Turing machine simulator.

## Live Demo

Hosted on GitHub Pages: [https://xiaoxuhui.github.io/turing-machine-simulator/](https://xiaoxuhui.github.io/turing-machine-simulator/)

(The demo goes live after you enable GitHub Pages in the repo's **Settings → Pages** and pick the `main` branch root, or wire up a deploy workflow.)

## Features

- Sparse tape that extends left and right, with head-following view
- Step, run, pause, reset, speed up to 1000 steps/s, real speed display, and step limits
- Plain-text and structured rule-table editing
- Unary increment, binary increment, palindrome, and busy-beaver examples
- Local autosave, project JSON import/export, and execution-log CSV export
- Clear accept / reject / halt / missing-rule feedback
- Generate a Wang tile puzzle from the machine's finite computation history
- Click/drag tiling, edge-match validation, cycle detection, and one-click correct solution
- Full-route overview (default 10,000 steps, larger values allowed) compressed into a space-time diagram

## The Tile Puzzle

After you apply a machine definition, a shuffled set of tiles is generated at the bottom of the page. The board reads top-to-bottom as time and left-to-right as tape position; tiles labeled with a state name mark the head. The current version generates the finite computation history (tableau) within the chosen step count and tape window, up to 30 steps, and detects cycles using the full machine configuration.

The "full-route overview" executes the current machine in a cancellable background task: red marks the head route and green marks the non-blank tape. Very long runs are compressed to at most ~2,400 sampled visualization rows; you can keep running the simulator or solving tiles while it generates, and cancel at any time.

## Screenshots

> Screenshots to be added. After running the app locally, feel free to drop UI screenshots into `doc/screenshots/` and reference them here.

## Run Locally

Requires Node.js 20.19 or newer and pnpm 11.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Build and test:

```bash
pnpm test
pnpm run build
pnpm run check
```

Open the local URL printed in the terminal. Everything runs entirely in your browser; machine definitions and tape contents are never uploaded.

## Project Structure

- `src/core.ts`: Turing machine and sparse-tape domain logic.
- `src/execution-scheduler.ts`: continuous-run ticking and real speed statistics.
- `src/route-controller.ts`, `src/route-worker.ts`: cancellable background full-route computation.
- `src/project-codec.ts`: project JSON v1 validation and local-storage boundary.
- `src/tile-puzzle.ts`: Wang tile puzzle from finite computation history.
- `doc/`: requirements, design, implementation plans, test reports, and phase summaries.

## Contributing and Security

Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting code. Report security issues privately per [SECURITY.md](SECURITY.md), and follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community interactions. Version changes are recorded in [CHANGELOG.md](CHANGELOG.md).

## License

This project is licensed under the [MIT License](LICENSE).

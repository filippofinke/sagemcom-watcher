# Sagemcom Watcher

[![CI](https://github.com/filippofinke/sagemcom-watcher/actions/workflows/ci.yml/badge.svg)](https://github.com/filippofinke/sagemcom-watcher/actions/workflows/ci.yml)
[![Docker Hub](https://img.shields.io/docker/pulls/filippofinke/sagemcom-watcher.svg)](https://hub.docker.com/r/filippofinke/sagemcom-watcher)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Sagemcom Watcher** is a modular monitoring utility and web dashboard for Sagemcom home routers. It was developed to track and debug issues with the **Salt Fiber Box X6**, whose internal watchdog frequently causes reboots, but works with **any Sagemcom router** supported by [`sagemcom-api`](https://pypi.org/project/sagemcom-api/).

## Features

- **Wide compatibility** — any Sagemcom router supported by `sagemcom-api`.
- **Specialized for Salt Fiber Box X6** — tracks uptime, system stats, and throughput to identify crash patterns.
- **Background daemon polling** — periodic async polling of router stats.
- **Smart storage** — a "constant / dynamic" separation algorithm only records changed values to minimize disk usage.
- **Daily chunking** — splits history into daily JSON files for fast queries.
- **Embedded web UI** — live interactive dashboard built with `aiohttp` and `Chart.js`.
- **Docker ready** — deployable via Docker / Docker Compose with persistent data volumes.

## Prerequisites

- **Python** `>=3.12`
- **Package manager** — [`uv`](https://github.com/astral-sh/uv) (recommended) or `pip`.

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/filippofinke/sagemcom-watcher.git
cd sagemcom-watcher
```

### 2. Install dependencies

With **uv** (recommended):

```bash
uv sync
```

With **pip**:

```bash
python -m venv .venv
source .venv/bin/activate
pip install .
```

### 3. Configure the environment

Copy the template and fill in your router credentials:

```bash
cp .env.example .env
```

```env
ROUTER_HOST=192.168.1.1
ROUTER_USERNAME=admin
ROUTER_PASSWORD=your_router_password
ROUTER_ENCRYPTION=SHA512

WEB_PORT=3456

HISTORY_FILE=data/history.json
POLL_INTERVAL_SECONDS=60
```

## Running

Start both the background poller and the web dashboard:

```bash
uv run sagemcom-watcher
# or, with the venv activated:
sagemcom-watcher
```

Open the dashboard at [http://localhost:3456](http://localhost:3456).

## Running with Docker

```bash
docker compose up -d --build
```

History is persisted under `./data` on the host.

## Development

Install dev dependencies and run the test suite:

```bash
uv sync --extra dev
uv run ruff check src tests
uv run python -m unittest discover -s tests -v
```

## License

This project is licensed under the **MIT License**. See [LICENSE](LICENSE) for details.

## Author

👤 **Filippo Finke**

- Website: https://filippofinke.ch
- Github: [@filippofinke](https://github.com/filippofinke)
- LinkedIn: [@filippofinke](https://linkedin.com/in/filippofinke)

## Show your support

Give a ⭐️ if this project helped you!

<a href="https://www.buymeacoffee.com/filippofinke">
  <img src="https://github.com/filippofinke/filippofinke/raw/main/images/buymeacoffe.png" alt="Buy Me A McFlurry">
</a>

# The trading agent world service. Unverified: written without Docker at hand (see README).
#
#   docker build -t agent-world .
#   docker run --env-file .env -p 8789:8789 -v agent-world-data:/data agent-world

# ---- builder: the locked environment, TradingAgents from its git tag included ----
FROM python:3.13-slim AS builder

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.13.1 /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/opt/venv

WORKDIR /src
COPY pyproject.toml uv.lock README.md ./
# Dependencies first, so a code change does not reinstall them.
RUN uv sync --frozen --no-dev --no-install-project
COPY agent_world ./agent_world
RUN uv sync --frozen --no-dev --no-editable

# OpenBB writes its static Python interface for the installed extensions into site-packages.
# Build it once here, as root; the service then imports it read-only (OPENBB_AUTO_BUILD=false).
RUN /opt/venv/bin/python -c "import openbb; openbb.build()"

# ---- runtime ----
FROM python:3.13-slim

RUN useradd --create-home --uid 10001 agent \
 && mkdir -p /data \
 && chown agent:agent /data

COPY --from=builder /opt/venv /opt/venv

ENV PATH="/opt/venv/bin:${PATH}" \
    PYTHONUNBUFFERED=1 \
    AGENT_WORLD_DATA_DIR=/data \
    OPENBB_AUTO_BUILD=false \
    TZ=UTC

USER agent
WORKDIR /home/agent
VOLUME ["/data"]
EXPOSE 8789

CMD uvicorn agent_world.app:app --host 0.0.0.0 --port 8789

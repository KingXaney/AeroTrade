"""The HTTP face of the service: health, signed runs, run status, and Paperclip's heartbeat.

``uvicorn agent_world.app:app --port 8789``. Settings are read when the app starts (from the
environment, after ``services/agent-world/.env`` if present); a missing ``AGENT_WORLD_SECRET`` or
``AEROTRADE_URL`` stops it there.
"""

from __future__ import annotations

import importlib
import importlib.metadata
import json
import logging
import os
import platform
import threading
import time
from collections.abc import Callable, Mapping
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from agent_world import __version__, bootstrap
from agent_world.config import Settings, same_origin
from agent_world.contract import RELAYED_SOURCES, Heartbeat, RunRequest
from agent_world.signing import (
    HEARTBEAT_HEADER,
    SIGNATURE_HEADER,
    TIMESTAMP_HEADER,
    same_secret,
    signed_headers,
    verify,
)

logger = logging.getLogger("agent_world")

MAX_BODY_BYTES = 64 * 1024
# A wake carries its issue as markdown several times over; it is read whole, behind the header check.
HEARTBEAT_MAX_BYTES = 2 * 1024 * 1024
ROUTINE_TAKEN = "Handed to AeroTrade, which runs a manual session and records it on an issue of its own."
ROUTINE_REFUSED = "AeroTrade did not take this session ({why}); nothing ran."
FORWARD_TIMEOUT_S = 5.0
PAPERCLIP_PROBE_S = 60.0
SESSIONS_PATH = "/api/agent-world/sessions"
VERSION_PACKAGES = ("tradingagents", "openbb-core", "openbb-yfinance", "openbb-equity", "openbb-news",
                    "openbb-economy", "openbb-technical", "openbb-sec", "openbb-fred")
PROVIDER_MODULES = {"yfinance": "openbb_yfinance", "sec": "openbb_sec", "fred": "openbb_fred"}

# forward(url, body, headers) -> HTTP status (raises on a network failure)
Forward = Callable[[str, bytes, Mapping[str, str]], int]
# close(issueId, runId, comment) -> whether Paperclip took it
CloseIssue = Callable[[str, str, str], bool]


def _configure_logging() -> None:
    root = logging.getLogger()
    if root.handlers:
        return
    handler = logging.StreamHandler()
    formatter = logging.Formatter("%(asctime)sZ %(levelname)s %(name)s: %(message)s", "%Y-%m-%dT%H:%M:%S")
    formatter.converter = time.gmtime  # logs in UTC
    handler.setFormatter(formatter)
    root.addHandler(handler)
    root.setLevel(logging.INFO)


def _version(name: str) -> str | None:
    try:
        return importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        return None


_probe_lock = threading.Lock()
_probe: dict[str, Any] | None = None


def probe_imports() -> dict[str, Any]:
    """Which providers import, and whether openbb-technical does (it may not under pandas 3)."""
    global _probe
    with _probe_lock:
        if _probe is not None:
            return _probe
        providers = {}
        for name, module in PROVIDER_MODULES.items():
            try:
                importlib.import_module(module)
                providers[name] = True
            except Exception:
                providers[name] = False
        try:
            importlib.import_module("openbb_technical")
            technical_ok = True
        except Exception as exc:
            logger.warning("openbb-technical does not import (%s); indicators use stockstats", type(exc).__name__)
            technical_ok = False
        _probe = {"providers": providers, "technical": technical_ok}
        return _probe


def package_versions(technical_ok: bool) -> dict[str, str | None]:
    versions: dict[str, str | None] = {"python": platform.python_version()}
    for name in VERSION_PACKAGES:
        versions[name] = _version(name)
    if not technical_ok:
        versions["openbb-technical"] = None
    return versions


def httpx_forward(url: str, body: bytes, headers: Mapping[str, str]) -> int:
    import httpx

    with httpx.Client(timeout=FORWARD_TIMEOUT_S, follow_redirects=False) as client:
        return client.post(url, content=body, headers=dict(headers)).status_code


def paperclip_closer(settings: Settings) -> CloseIssue:
    def close(issue_id: str, run_id: str, comment: str) -> bool:
        from agent_world.paperclip import PaperclipClient

        client = PaperclipClient(settings.paperclip_url, settings.paperclip_api_key, settings.paperclip_company_id)
        try:
            return client.close_issue(issue_id, run_id, comment)
        finally:
            client.close()

    return close


class PaperclipProbe:
    """Paperclip's reachability for /health, refreshed in the background at most once a minute."""

    def __init__(self, settings: Settings, check: Callable[[], bool | None] | None = None) -> None:
        self.settings = settings
        self._check = check or self._default_check
        self._lock = threading.Lock()
        self._value: bool | None = None
        self._at = 0.0
        self._running = False

    def _default_check(self) -> bool | None:
        from agent_world.paperclip import PaperclipClient

        client = PaperclipClient(self.settings.paperclip_url, self.settings.paperclip_api_key,
                                 self.settings.paperclip_company_id)
        try:
            return client.me() is not None
        finally:
            client.close()

    def _refresh(self) -> None:
        try:
            value = self._check()
        except Exception:
            value = False
        with self._lock:
            self._value, self._at, self._running = value, time.monotonic(), False

    def reachable(self) -> bool | None:
        if not self.settings.paperclip_configured:
            return None
        with self._lock:
            stale = time.monotonic() - self._at > PAPERCLIP_PROBE_S
            if stale and not self._running:
                self._running = True
                threading.Thread(target=self._refresh, name="paperclip-probe", daemon=True).start()
            return self._value


def _error(status: int, error: str, **extra: Any) -> JSONResponse:
    return JSONResponse({"error": error, **extra}, status_code=status)


def create_app(settings: Settings | None = None, *, worker_factory: Callable[[Settings], Any] | None = None,
               register_vendors: bool = True, prepare: bool = True, forward: Forward | None = None,
               close_issue: CloseIssue | None = None, paperclip_check: Callable[[], bool | None] | None = None,
               clock: Callable[[], float] = time.time) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        _configure_logging()
        nonlocal settings
        if settings is None:
            bootstrap.load_service_env()
            settings = Settings.from_env(os.environ)
        if prepare:
            bootstrap.prepare(settings)
        registered = False
        if register_vendors:
            from agent_world.vendors import register_openbb

            register_openbb(settings.fred_api_key)
            registered = True
        if worker_factory is not None:
            worker = worker_factory(settings)
        else:
            from agent_world.worker import Worker

            worker = Worker(settings)
        worker.start()
        app.state.settings = settings
        app.state.worker = worker
        app.state.registered = registered
        app.state.started = time.monotonic()
        app.state.paperclip_probe = PaperclipProbe(settings, paperclip_check)
        logger.info("agent-world %s listening; AeroTrade at %s; models %s", __version__,
                    settings.aerotrade_origin, settings.models)
        try:
            yield
        finally:
            worker.stop()

    app = FastAPI(title="agent-world", version=__version__, lifespan=lifespan, docs_url=None, redoc_url=None,
                  openapi_url=None)
    send = forward or httpx_forward

    def close(issue_id: str, run_id: str, comment: str) -> bool:
        closer = close_issue or paperclip_closer(app.state.settings)
        return closer(issue_id, run_id, comment)

    @app.get("/health")
    def health(request: Request) -> JSONResponse:
        from agent_world.vendors import chains

        state = request.app.state
        s: Settings = state.settings
        probe = probe_imports()
        worker = state.worker
        alive = bool(getattr(worker, "alive", True))
        body = {
            "ok": alive and (state.registered or not register_vendors),
            "service": {"version": __version__, "uptimeS": int(time.monotonic() - state.started)},
            "versions": package_versions(probe["technical"]),
            "providers": probe["providers"],
            "keys": {
                "google": s.google_key_present,
                "anthropic": s.anthropic_key_present,
                "fred": bool(s.fred_api_key),
                "secEdgarUserAgent": bool(s.sec_edgar_user_agent),
                "paperclip": s.paperclip_configured,
                "roleKeys": len(s.paperclip_role_keys),
            },
            "vendors": chains(s.data_vendors),
            "models": s.models,
            "worker": worker.state(),
            "paperclip": {"configured": s.paperclip_configured, "reachable": state.paperclip_probe.reachable()},
        }
        return JSONResponse(body, headers={"Cache-Control": "no-store"})

    @app.post("/runs")
    async def post_run(request: Request) -> JSONResponse:
        s: Settings = request.app.state.settings
        declared = request.headers.get("content-length")
        if declared and declared.isdigit() and int(declared) > MAX_BODY_BYTES:
            return _error(413, "too-large")
        body = await request.body()
        if len(body) > MAX_BODY_BYTES:
            return _error(413, "too-large")
        if not verify(s.secret, request.headers.get(TIMESTAMP_HEADER), request.headers.get(SIGNATURE_HEADER),
                      body, clock()):
            return _error(401, "unauthorized")
        try:
            run = RunRequest.model_validate(json.loads(body))
        except (ValueError, ValidationError) as exc:
            detail = exc.errors(include_url=False, include_input=False)[:5] if isinstance(exc, ValidationError) else "not JSON"
            return _error(400, "invalid", detail=json.loads(json.dumps(detail, default=str)))
        if not same_origin(run.callbackUrl, s.aerotrade_origin):
            return _error(400, "callback-origin", detail=f"callbackUrl must be on {s.aerotrade_origin}")
        status, current = request.app.state.worker.submit(run)
        if status == "busy":
            return _error(409, "busy", sessionId=current)
        if status == "known":
            snapshot = request.app.state.worker.snapshot(run.sessionId) or {}
            return JSONResponse({"sessionId": run.sessionId, "status": snapshot.get("status", "known")}, status_code=200)
        return JSONResponse({"sessionId": run.sessionId, "status": "queued"}, status_code=202)

    @app.get("/runs/{session_id}")
    def get_run(session_id: str, request: Request) -> JSONResponse:
        snapshot = request.app.state.worker.snapshot(session_id)
        if snapshot is None:
            return _error(404, "not-found")
        return JSONResponse(snapshot, headers={"Cache-Control": "no-store"})

    @app.post("/paperclip/heartbeat")
    async def heartbeat(request: Request) -> JSONResponse:
        s: Settings = request.app.state.settings
        if not same_secret(s.heartbeat_secret, request.headers.get(HEARTBEAT_HEADER)):
            return _error(401, "unauthorized")
        declared = request.headers.get("content-length")
        if declared and declared.isdigit() and int(declared) > HEARTBEAT_MAX_BYTES:
            return _error(413, "too-large")
        raw = await request.body()
        if len(raw) > HEARTBEAT_MAX_BYTES:
            return _error(413, "too-large")
        try:
            beat = Heartbeat.model_validate(json.loads(raw or b"{}"))
        except (ValueError, ValidationError):
            return JSONResponse({"forwarded": False})
        context = beat.context
        if context.source not in RELAYED_SOURCES:
            return JSONResponse({"forwarded": False, "ignored": True})
        issue = context.issueId or context.taskId
        payload = json.dumps({
            "source": "paperclip",
            "paperclipRunId": beat.runId,
            "taskId": issue,
            "wakeReason": context.wakeReason,
            "agentId": beat.agentId,
        }, separators=(",", ":")).encode("utf-8")
        url = s.aerotrade_origin + SESSIONS_PATH
        forwarded = False
        why = "AeroTrade could not be reached"
        try:
            status = await _in_thread(send, url, payload, signed_headers(s.secret, payload, clock()))
            forwarded = 200 <= int(status) < 300
            if not forwarded:
                why = f"HTTP {status}"
                logger.warning("AeroTrade answered the heartbeat relay with HTTP %s", status)
        except Exception as exc:
            logger.warning("Heartbeat relay to AeroTrade failed: %s", type(exc).__name__)
        # The routine's issue is checked out to this wake's run, which takes updates only while this
        # request is unanswered; left open, Paperclip would park it in blocked and skip the
        # routine's next run while it stays open. The session keeps its own issue.
        closed: bool | None = None
        if issue and beat.runId:
            comment = ROUTINE_TAKEN if forwarded else ROUTINE_REFUSED.format(why=why)
            try:
                closed = bool(await _in_thread(close, issue, beat.runId, comment))
            except Exception as exc:
                closed = False
                logger.warning("Closing the routine's issue failed: %s", type(exc).__name__)
        return JSONResponse({"forwarded": forwarded, "closed": closed})

    return app


async def _in_thread(fn: Callable[..., Any], *args: Any) -> Any:
    from starlette.concurrency import run_in_threadpool

    return await run_in_threadpool(fn, *args)


app = create_app()

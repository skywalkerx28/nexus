"""Observability API - FastAPI service exposing metrics, logs, and events."""

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime
from typing import AsyncIterator, Dict, List, Optional

import structlog
from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import CONTENT_TYPE_LATEST, CollectorRegistry, Counter, Gauge, generate_latest
from pydantic import BaseModel, Field
from starlette.responses import Response

# Configure structured logging
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.JSONRenderer(),
    ]
)

logger = structlog.get_logger()


# Pydantic models
class HealthResponse(BaseModel):
    """Health check response."""

    status: str = Field(default="healthy")
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    version: str = Field(default="0.1.0")
    uptime_seconds: float = Field(default=0.0)


class LogEntry(BaseModel):
    """Structured log entry."""

    timestamp: str
    level: str
    message: str
    module: Optional[str] = None
    correlation_id: Optional[str] = None
    metadata: Optional[Dict] = None


class LogSearchRequest(BaseModel):
    """Log search request."""

    query: Optional[str] = None
    level: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    limit: int = Field(default=100, le=1000)


class EventMessage(BaseModel):
    """Real-time event message."""

    event_type: str
    timestamp: str
    data: Dict


# Prometheus metrics
registry = CollectorRegistry()
request_counter = Counter(
    "nexus_api_requests_total", "Total API requests", ["method", "endpoint"], registry=registry
)
active_websockets = Gauge(
    "nexus_active_websockets", "Number of active WebSocket connections", registry=registry
)


# WebSocket connection manager
class ConnectionManager:
    """Manage WebSocket connections."""

    def __init__(self) -> None:
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        """Accept and track a new WebSocket connection."""
        await websocket.accept()
        self.active_connections.append(websocket)
        active_websockets.set(len(self.active_connections))
        logger.info("websocket_connected", total_connections=len(self.active_connections))

    def disconnect(self, websocket: WebSocket) -> None:
        """Remove a WebSocket connection."""
        self.active_connections.remove(websocket)
        active_websockets.set(len(self.active_connections))
        logger.info("websocket_disconnected", total_connections=len(self.active_connections))

    async def broadcast(self, message: Dict) -> None:
        """Broadcast message to all connected clients."""
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error("broadcast_failed", error=str(e))
                disconnected.append(connection)

        # Clean up disconnected clients
        for connection in disconnected:
            self.disconnect(connection)


manager = ConnectionManager()


# Lifespan context manager
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan events."""
    logger.info("observability_api_starting")
    # Start background tasks
    asyncio.create_task(heartbeat_task())
    yield
    logger.info("observability_api_shutting_down")


# Create FastAPI app
app = FastAPI(
    title="Nexus Observability API",
    description="Metrics, logs, and events for Nexus Observatory",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],  # UI dev servers
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Background task for heartbeat
async def heartbeat_task() -> None:
    """Send periodic heartbeats to connected clients."""
    while True:
        await asyncio.sleep(30)
        await manager.broadcast(
            {"event_type": "heartbeat", "timestamp": datetime.utcnow().isoformat(), "data": {}}
        )


# Routes
@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Health check endpoint."""
    request_counter.labels(method="GET", endpoint="/health").inc()
    return HealthResponse()


@app.get("/metrics")
async def metrics() -> Response:
    """Prometheus metrics endpoint."""
    data = generate_latest(registry)
    return Response(content=data, media_type=CONTENT_TYPE_LATEST)


@app.post("/logs/search", response_model=List[LogEntry])
async def search_logs(request: LogSearchRequest) -> List[LogEntry]:
    """Search logs with filters."""
    request_counter.labels(method="POST", endpoint="/logs/search").inc()

    # TODO: Integrate with ClickHouse or similar log storage
    # For now, return mock data
    mock_logs = [
        LogEntry(
            timestamp=datetime.utcnow().isoformat(),
            level="INFO",
            message="System started",
            module="main",
            correlation_id="test-123",
            metadata={"component": "api"},
        )
    ]

    logger.info("log_search", query=request.query, limit=request.limit)
    return mock_logs[: request.limit]


@app.websocket("/events")
async def events_websocket(websocket: WebSocket) -> None:
    """WebSocket endpoint for real-time events."""
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive and handle incoming messages
            data = await websocket.receive_text()
            logger.debug("websocket_message_received", data=data)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        logger.info("websocket_client_disconnected")


@app.get("/status")
async def status() -> Dict:
    """System status summary."""
    request_counter.labels(method="GET", endpoint="/status").inc()
    return {
        "api_version": "0.1.0",
        "active_connections": len(manager.active_connections),
        "timestamp": datetime.utcnow().isoformat(),
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=9400, log_level="info")


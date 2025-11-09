"""Tests for Observability API."""

import pytest
from fastapi.testclient import TestClient
from observability_api.main import app


@pytest.fixture
def client():
    """Create test client."""
    return TestClient(app)


def test_health_endpoint(client):
    """Test health check endpoint."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "timestamp" in data
    assert "version" in data


def test_metrics_endpoint(client):
    """Test Prometheus metrics endpoint."""
    response = client.get("/metrics")
    assert response.status_code == 200
    assert "text/plain" in response.headers["content-type"]


def test_status_endpoint(client):
    """Test status endpoint."""
    response = client.get("/status")
    assert response.status_code == 200
    data = response.json()
    assert "api_version" in data
    assert "timestamp" in data
    assert "active_connections" in data


def test_log_search(client):
    """Test log search endpoint."""
    response = client.post("/logs/search", json={"query": "test", "limit": 10})
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


def test_websocket_connection(client):
    """Test WebSocket connection."""
    with client.websocket_connect("/events") as websocket:
        # Connection should be established
        # Send a test message
        websocket.send_text("ping")
        # Should stay connected (will timeout if broken)


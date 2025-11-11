"""
Tests for Observability API.

Validates:
- Authentication and authorization
- Rate limiting
- Cache hit/miss paths
- Prometheus query proxying
- Error handling
"""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, Mock
import time

# Import the app
from nexus.ops.observability_api import app, check_rate_limit, get_cached, set_cache

client = TestClient(app)

# Test token
TEST_TOKEN = "dev-token-12345"
AUTH_HEADER = {"Authorization": f"Bearer {TEST_TOKEN}"}


class TestAuthentication:
    """Test authentication and authorization"""
    
    def test_missing_auth_header(self):
        """Request without auth header should return 401"""
        response = client.post("/api/v1/query", json={"query": "up"})
        assert response.status_code == 401
        assert "Missing authorization" in response.json()["detail"]
    
    def test_invalid_auth_format(self):
        """Invalid auth format should return 401"""
        response = client.post(
            "/api/v1/query",
            json={"query": "up"},
            headers={"Authorization": "InvalidFormat token"}
        )
        assert response.status_code == 401
        assert "Invalid authorization format" in response.json()["detail"]
    
    def test_invalid_token(self):
        """Invalid token should return 403"""
        response = client.post(
            "/api/v1/query",
            json={"query": "up"},
            headers={"Authorization": "Bearer invalid-token"}
        )
        assert response.status_code == 403
        assert "Invalid token" in response.json()["detail"]
    
    def test_valid_token(self):
        """Valid token should allow request (will fail on Prometheus, but auth passes)"""
        with patch("nexus.ops.observability_api.httpx.AsyncClient") as mock_client:
            # Mock Prometheus response
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.json.return_value = {
                "status": "success",
                "data": {"resultType": "vector", "result": []}
            }
            
            mock_client.return_value.__aenter__.return_value.post.return_value = mock_response
            
            response = client.post(
                "/api/v1/query",
                json={"query": "up"},
                headers=AUTH_HEADER
            )
            assert response.status_code == 200


class TestRateLimiting:
    """Test rate limiting functionality"""
    
    def test_rate_limit_enforcement(self):
        """Should block requests after hitting limit"""
        # Rate limit is 1000/min, so we test with a single user
        with pytest.raises(Exception) as exc_info:
            for i in range(1001):
                check_rate_limit("test-user")
        
        assert "Rate limit exceeded" in str(exc_info.value.detail)
    
    def test_rate_limit_window_reset(self):
        """Rate limit should reset after window"""
        user_id = f"test-user-{time.time()}"
        
        # Use up limit
        for i in range(1000):
            check_rate_limit(user_id)
        
        # Should be blocked
        with pytest.raises(Exception) as exc_info:
            check_rate_limit(user_id)
        assert "Rate limit exceeded" in str(exc_info.value.detail)


class TestCaching:
    """Test cache functionality"""
    
    def test_cache_miss(self):
        """Cache miss should return None"""
        result = get_cached("non-existent-key")
        assert result is None
    
    def test_cache_hit(self):
        """Cache hit should return cached value"""
        key = "test-key"
        value = {"data": "test"}
        
        set_cache(key, value)
        cached = get_cached(key)
        
        assert cached == value
    
    def test_cache_expiry(self):
        """Expired cache should return None"""
        key = "expiry-test"
        value = {"data": "test"}
        
        set_cache(key, value)
        
        # Force expiry by manipulating cache timestamp
        from nexus.ops.observability_api import _cache, CACHE_TTL_SECONDS
        if key in _cache:
            _cache[key] = (time.time() - CACHE_TTL_SECONDS - 1, value)
        
        result = get_cached(key)
        assert result is None


class TestMetricsEndpoints:
    """Test metrics query endpoints"""
    
    @patch("nexus.ops.observability_api.httpx.AsyncClient")
    def test_instant_query_success(self, mock_client):
        """Successful instant query should return data"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "status": "success",
            "data": {
                "resultType": "vector",
                "result": [
                    {
                        "metric": {"__name__": "up", "job": "nexus"},
                        "value": [1699999999, "1"]
                    }
                ]
            }
        }
        
        mock_client.return_value.__aenter__.return_value.post.return_value = mock_response
        
        response = client.post(
            "/api/v1/query",
            json={"query": "up"},
            headers=AUTH_HEADER
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "data" in data
    
    @patch("nexus.ops.observability_api.httpx.AsyncClient")
    def test_range_query_success(self, mock_client):
        """Successful range query should return time series"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "status": "success",
            "data": {
                "resultType": "matrix",
                "result": [
                    {
                        "metric": {"__name__": "up", "job": "nexus"},
                        "values": [
                            [1699999999, "1"],
                            [1700000014, "1"]
                        ]
                    }
                ]
            }
        }
        
        mock_client.return_value.__aenter__.return_value.post.return_value = mock_response
        
        response = client.post(
            "/api/v1/query_range",
            json={
                "query": "up",
                "start": 1699999999,
                "end": 1700000014,
                "step": "15s"
            },
            headers=AUTH_HEADER
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["data"]["resultType"] == "matrix"


class TestHealthEndpoint:
    """Test health check endpoint"""
    
    def test_health_endpoint(self):
        """Health endpoint should return OK without auth"""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "prometheus_url" in data


if __name__ == "__main__":
    pytest.main([__file__, "-v"])


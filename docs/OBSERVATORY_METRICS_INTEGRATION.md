# Observatory Metrics Integration Guide

**Purpose:** Integrate Nexus Prometheus metrics into Observatory (Next.js) frontend  
**Status:** Ready for implementation  
**Date:** 2025-11-10

---

## Quick Start

```bash
# 1. Start Prometheus server
brew services start prometheus

# 2. Verify Prometheus is scraping Nexus
open http://localhost:9090/targets
# Should show "nexus-ingestion" target as UP

# 3. Start Nexus ingestion (exposes metrics on port 9401)
./scripts/launch_monday_python.sh

# 4. Query metrics
curl http://localhost:9090/api/v1/query?query=nexus_events_received_total

# 5. Integrate into Next.js Observatory (see below)
```

---

## Overview

Nexus now exposes 16 comprehensive metrics via Prometheus HTTP API on port 9401. This guide shows how to query and visualize these metrics in the Observatory frontend.

---

## Metrics Available

### Counters (Cumulative)
```
nexus_events_received_total{symbol="AAPL"}
nexus_events_written_total{symbol="AAPL"}
nexus_validation_errors_total{symbol="AAPL"}
nexus_connection_errors_total
nexus_reconnects_total
```

### Histograms (Latencies)
```
nexus_tick_processing_seconds{symbol="AAPL"}
nexus_flush_duration_seconds{symbol="AAPL"}
nexus_network_latency_seconds{symbol="AAPL"}
```

### Gauges (Current State)
```
nexus_connected                      # 0 or 1
nexus_subscribed_symbols             # Count
nexus_active_writers                 # Count
nexus_writer_rows_written{symbol="AAPL"}
nexus_writer_validation_errors{symbol="AAPL"}
```

---

## Architecture

### Metrics Flow

```
Nexus Adapter (port 9401)
    -> exposes /metrics
Prometheus Server (port 9090)
    -> scrapes every 15s
    -> stores time-series
Next.js Observatory
    -> queries /api/v1/query
Prometheus Server
```

**Key Points:**
- Nexus adapter runs Prometheus **exporter** on port 9401
- Prometheus **server** scrapes the exporter and stores metrics
- Next.js queries the Prometheus server API (port 9090)
- Never query the exporter directly from UI (no time-series support)

---

## Query Metrics from Next.js (via Observability API)

**Architecture Note:** Observatory UI queries metrics through the **Observability API** (not Prometheus directly).
This ensures:
- Unified authentication and RBAC
- Response caching for performance
- Rate limiting per user
- Audit trails for all queries
- Future-proof for logs/events integration

### 1. API Route (Server-Side)

Create `/app/api/metrics/route.ts`:

```typescript
import { NextResponse } from 'next/server';

// Observability API endpoint (proxies to Prometheus with RBAC/caching)
const OBSERVABILITY_API_URL = process.env.OBSERVABILITY_API_URL || 'http://localhost:9400';
const API_TOKEN = process.env.OBSERVATORY_API_TOKEN || 'dev-token-12345';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query');
  
  if (!query) {
    return NextResponse.json({ error: 'Missing query parameter' }, { status: 400 });
  }
  
  try {
    // Query via Observability API (not Prometheus directly)
    const response = await fetch(
      `${OBSERVABILITY_API_URL}/api/v1/query`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_TOKEN}`
        },
        body: JSON.stringify({ query }),
        next: { revalidate: 5 } // API handles caching internally too
      }
    );
    
    if (!response.ok) {
      throw new Error(`Prometheus error: ${response.statusText}`);
    }
    
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Metrics query failed:', error);
    return NextResponse.json(
      { error: 'Failed to fetch metrics' },
      { status: 500 }
    );
  }
}

// Range query for time series
export async function POST(request: Request) {
  const { query, start, end, step } = await request.json();
  
  try {
    const response = await fetch(
      `${PROMETHEUS_URL}/api/v1/query_range`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          query,
          start: start.toString(),
          end: end.toString(),
          step: step || '15s'
        })
      }
    );
    
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Range query failed:', error);
    return NextResponse.json(
      { error: 'Failed to fetch time series' },
      { status: 500 }
    );
  }
}
```

---

## Observatory UI Components

### 2. Connection Status Tile

`/app/observatory/components/ConnectionStatus.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function ConnectionStatus() {
  const [connected, setConnected] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/metrics?query=nexus_connected');
        const data = await res.json();
        
        if (data.status === 'success' && data.data.result.length > 0) {
          setConnected(parseFloat(data.data.result[0].value[1]));
        }
      } catch (error) {
        console.error('Failed to fetch connection status:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000); // Poll every 5s
    
    return () => clearInterval(interval);
  }, []);
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>IB Gateway</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-muted-foreground">Loading...</div>
        ) : (
          <div className="flex items-center gap-2">
            <div className={`h-3 w-3 rounded-full ${
              connected === 1 ? 'bg-green-500' : 'bg-red-500'
            }`} />
            <span className="text-2xl font-bold">
              {connected === 1 ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

---

### 3. Live Event Counter

`/app/observatory/components/EventCounter.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface EventStats {
  received: number;
  written: number;
  errors: number;
}

export function EventCounter({ symbol }: { symbol: string }) {
  const [stats, setStats] = useState<EventStats | null>(null);
  
  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Fetch multiple metrics in parallel
        const [received, written, errors] = await Promise.all([
          fetch(`/api/metrics?query=nexus_events_received_total{symbol="${symbol}"}`),
          fetch(`/api/metrics?query=nexus_events_written_total{symbol="${symbol}"}`),
          fetch(`/api/metrics?query=nexus_validation_errors_total{symbol="${symbol}"}`)
        ]).then(responses => Promise.all(responses.map(r => r.json())));
        
        setStats({
          received: parseFloat(received.data.result[0]?.value[1] || 0),
          written: parseFloat(written.data.result[0]?.value[1] || 0),
          errors: parseFloat(errors.data.result[0]?.value[1] || 0)
        });
      } catch (error) {
        console.error('Failed to fetch event stats:', error);
      }
    };
    
    fetchStats();
    const interval = setInterval(fetchStats, 2000);
    
    return () => clearInterval(interval);
  }, [symbol]);
  
  if (!stats) return <div>Loading...</div>;
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>{symbol}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Received:</span>
            <span className="font-mono text-lg">{stats.received.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Written:</span>
            <span className="font-mono text-lg">{stats.written.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Errors:</span>
            <span className={`font-mono text-lg ${stats.errors > 0 ? 'text-red-500' : 'text-green-500'}`}>
              {stats.errors}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

---

### 4. Latency Chart (Recharts)

`/app/observatory/components/LatencyChart.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function LatencyChart({ symbol }: { symbol: string }) {
  const [data, setData] = useState<any[]>([]);
  
  useEffect(() => {
    const fetchLatency = async () => {
      const end = Math.floor(Date.now() / 1000);
      const start = end - 300; // Last 5 minutes
      
      try {
        const response = await fetch('/api/metrics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `rate(nexus_tick_processing_seconds_sum{symbol="${symbol}"}[30s]) / rate(nexus_tick_processing_seconds_count{symbol="${symbol}"}[30s])`,
            start,
            end,
            step: '15s'
          })
        });
        
        const result = await response.json();
        
        if (result.status === 'success' && result.data.result.length > 0) {
          const values = result.data.result[0].values.map((v: any) => ({
            timestamp: new Date(v[0] * 1000).toLocaleTimeString(),
            latency: parseFloat(v[1]) * 1000 // Convert to ms
          }));
          
          setData(values);
        }
      } catch (error) {
        console.error('Failed to fetch latency:', error);
      }
    };
    
    fetchLatency();
    const interval = setInterval(fetchLatency, 15000);
    
    return () => clearInterval(interval);
  }, [symbol]);
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tick Processing Latency ({symbol})</CardTitle>
      </CardHeader>
      <CardContent>
        <LineChart width={600} height={300} data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="timestamp" />
          <YAxis label={{ value: 'Latency (ms)', angle: -90, position: 'insideLeft' }} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="latency" stroke="#8884d8" />
        </LineChart>
      </CardContent>
    </Card>
  );
}
```

---

### 5. Writer Performance Tile

`/app/observatory/components/WriterPerformance.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function WriterPerformance({ symbol }: { symbol: string }) {
  const [metrics, setMetrics] = useState<{
    rows: number;
    flushDuration: number;
  } | null>(null);
  
  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const [rows, flush] = await Promise.all([
          fetch(`/api/metrics?query=nexus_writer_rows_written{symbol="${symbol}"}`),
          fetch(`/api/metrics?query=rate(nexus_flush_duration_seconds_sum{symbol="${symbol}"}[1m]) / rate(nexus_flush_duration_seconds_count{symbol="${symbol}"}[1m])`)
        ]).then(responses => Promise.all(responses.map(r => r.json())));
        
        setMetrics({
          rows: parseFloat(rows.data.result[0]?.value[1] || 0),
          flushDuration: parseFloat(flush.data.result[0]?.value[1] || 0) * 1000 // ms
        });
      } catch (error) {
        console.error('Failed to fetch writer metrics:', error);
      }
    };
    
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000);
    
    return () => clearInterval(interval);
  }, [symbol]);
  
  if (!metrics) return <div>Loading...</div>;
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Writer ({symbol})</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Rows Written:</span>
            <span className="font-mono text-lg">{metrics.rows.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Avg Flush Time:</span>
            <span className="font-mono text-lg">{metrics.flushDuration.toFixed(2)}ms</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

---

## Observatory Page Layout

`/app/observatory/page.tsx`:

```typescript
import { ConnectionStatus } from './components/ConnectionStatus';
import { EventCounter } from './components/EventCounter';
import { LatencyChart } from './components/LatencyChart';
import { WriterPerformance } from './components/WriterPerformance';

export default function ObservatoryPage() {
  const symbols = ['AAPL', 'MSFT', 'SPY', 'QQQ', 'TSLA'];
  
  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-4xl font-bold">Observatory</h1>
      
      {/* Status Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ConnectionStatus />
        {/* Add more status tiles */}
      </div>
      
      {/* Per-Symbol Metrics */}
      {symbols.map(symbol => (
        <div key={symbol} className="space-y-4">
          <h2 className="text-2xl font-semibold">{symbol}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <EventCounter symbol={symbol} />
            <WriterPerformance symbol={symbol} />
          </div>
          <LatencyChart symbol={symbol} />
        </div>
      ))}
    </div>
  );
}
```

---

## Useful PromQL Queries

### Event Rate (events/second)
```
rate(nexus_events_written_total{symbol="AAPL"}[1m])
```

### P95 Latency
```
histogram_quantile(0.95, rate(nexus_tick_processing_seconds_bucket{symbol="AAPL"}[5m]))
```

### Error Rate
```
rate(nexus_validation_errors_total[5m])
```

### Throughput (all symbols)
```
sum(rate(nexus_events_written_total[1m]))
```

### Network Latency (avg)
```
rate(nexus_network_latency_seconds_sum[1m]) / rate(nexus_network_latency_seconds_count[1m])
```

---

## Prometheus Server Setup

### 1. Install Prometheus

```bash
# macOS
brew install prometheus

# Ubuntu
sudo apt-get install prometheus
```

### 2. Configure Prometheus

Create `/usr/local/etc/prometheus.yml` (or edit existing):

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'nexus-ingestion'
    static_configs:
      - targets: ['localhost:9401']  # Nexus adapter exporter
        labels:
          service: 'nexus'
          component: 'ibkr-adapter'
```

### 3. Start Prometheus

```bash
# macOS (Homebrew)
brew services start prometheus

# Manual
prometheus --config.file=/usr/local/etc/prometheus.yml

# Verify: http://localhost:9090/targets (should show nexus-ingestion UP)
```

---

## Environment Configuration

Add to `.env.local`:

```bash
# Prometheus SERVER (queries go here, not to the exporter!)
PROMETHEUS_URL=http://localhost:9090

# Polling intervals (ms)
NEXT_PUBLIC_METRICS_POLL_INTERVAL=5000
NEXT_PUBLIC_CHART_UPDATE_INTERVAL=15000
```

---

## Deployment Considerations

### Production Setup

1. **Prometheus Server:** Already configured above (scrapes port 9401)
2. **Grafana (Optional):** Use Grafana for advanced dashboards, then embed in Next.js
3. **Caching:** Use React Query or SWR for efficient client-side caching
4. **Alerts:** Configure Prometheus Alertmanager for critical metrics

### Alert Rules Example

`/usr/local/etc/prometheus/rules.yml`:

```yaml
groups:
  - name: nexus_alerts
    interval: 30s
    rules:
      - alert: NexusDisconnected
        expr: nexus_connected == 0
        for: 1m
        annotations:
          summary: "Nexus disconnected from IB Gateway"
      
      - alert: HighValidationErrors
        expr: rate(nexus_validation_errors_total[5m]) > 0.01
        for: 5m
        annotations:
          summary: "High validation error rate: {{ $value }}/s"
      
      - alert: NoDataFlow
        expr: rate(nexus_events_written_total[5m]) == 0
        for: 5m
        annotations:
          summary: "No events written in 5 minutes"
```

---

## Next Steps

1. **Metrics Implemented** - All 16 metrics exposed via Prometheus
2. **Observatory UI** - Implement tiles and charts in Next.js
3. **Real-time Updates** - Use WebSockets or Server-Sent Events for live updates
4. **Alerting** - Configure thresholds for critical metrics
5. **Historical Data** - Store metrics in time-series DB for long-term analysis

---

## Monitoring Checklist

- [ ] Connection status tile (green/red indicator)
- [ ] Per-symbol event counters (received, written, errors)
- [ ] Latency charts (tick processing, flush, network)
- [ ] Writer performance (rows written, flush duration)
- [ ] Error rate tracking
- [ ] Throughput graphs (events/second)
- [ ] Reconnect counter
- [ ] Alert badges for anomalies

---

**Document:** Observatory Metrics Integration  
**Status:** Ready for frontend implementation  
**Metrics Available:** 16 (5 counters, 3 histograms, 3 gauges, 5 writer metrics)  
**Next:** Build Next.js components using this guide


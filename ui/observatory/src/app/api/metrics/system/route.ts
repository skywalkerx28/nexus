import { NextRequest, NextResponse } from 'next/server';

/**
 * System Metrics API Route
 * Aggregates all Prometheus metrics for the Pulse page
 * 
 * Queries:
 * - IBKR feed metrics (events, latency, errors)
 * - Observability API metrics
 * - Per-symbol breakdowns
 */

const OBSERVABILITY_API_URL = process.env.OBSERVABILITY_API_URL || 'http://localhost:8001';
const API_TOKEN = process.env.OBSERVATORY_API_TOKEN || 'dev-token-12345';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const range = searchParams.get('range') || '5m';
  
  try {
    // Query all metrics from Observability API's Prometheus proxy
    const metrics = await fetchAllMetrics(range);
    
    return NextResponse.json({
      metrics,
      timestamp: new Date().toISOString(),
      range,
    });
    
  } catch (error) {
    console.error('Failed to fetch system metrics:', error);
    
    // Return mock data on error for development
    return NextResponse.json({
      metrics: getMockSystemMetrics(),
      timestamp: new Date().toISOString(),
      range,
      source: 'MOCK',
    });
  }
}

async function fetchAllMetrics(range: string) {
  // Helper to query Prometheus via Observability API
  const query = async (promql: string) => {
    const response = await fetch(`${OBSERVABILITY_API_URL}/metrics/instant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_TOKEN}`,
      },
      body: JSON.stringify({ query: promql }),
    });
    
    if (!response.ok) {
      throw new Error(`Query failed: ${promql}`);
    }
    
    const data = await response.json();
    return data.data?.result || [];
  };

  // Parallel queries for all metrics
  const [
    connected,
    feedMode,
    subscribedSymbols,
    activeWriters,
    eventsReceived,
    eventsWritten,
    receiveRate,
    writeRate,
    tickProcessingP50,
    tickProcessingP95,
    tickProcessingP99,
    flushP50,
    flushP95,
    flushP99,
    networkLatencyP50,
    networkLatencyP95,
    networkLatencyP99,
    validationErrors,
    connectionErrors,
    reconnects,
    apiRequests,
    requestRate,
    activeWS,
    cacheHits,
    cacheMisses,
  ] = await Promise.all([
    query('nexus_connected'),
    query('nexus_feed_mode'),
    query('nexus_subscribed_symbols'),
    query('nexus_active_writers'),
    query('sum(nexus_events_received_total)'),
    query('sum(nexus_events_written_total)'),
    query(`sum(rate(nexus_events_received_total[${range}]))`),
    query(`sum(rate(nexus_events_written_total[${range}]))`),
    query(`histogram_quantile(0.50, sum(rate(nexus_tick_processing_seconds_bucket[${range}])) by (le))`),
    query(`histogram_quantile(0.95, sum(rate(nexus_tick_processing_seconds_bucket[${range}])) by (le))`),
    query(`histogram_quantile(0.99, sum(rate(nexus_tick_processing_seconds_bucket[${range}])) by (le))`),
    query(`histogram_quantile(0.50, sum(rate(nexus_flush_duration_seconds_bucket[${range}])) by (le))`),
    query(`histogram_quantile(0.95, sum(rate(nexus_flush_duration_seconds_bucket[${range}])) by (le))`),
    query(`histogram_quantile(0.99, sum(rate(nexus_flush_duration_seconds_bucket[${range}])) by (le))`),
    query(`histogram_quantile(0.50, sum(rate(nexus_network_latency_seconds_bucket[${range}])) by (le))`),
    query(`histogram_quantile(0.95, sum(rate(nexus_network_latency_seconds_bucket[${range}])) by (le))`),
    query(`histogram_quantile(0.99, sum(rate(nexus_network_latency_seconds_bucket[${range}])) by (le))`),
    query('sum(nexus_validation_errors_total)'),
    query('sum(nexus_connection_errors_total)'),
    query('sum(nexus_reconnects_total)'),
    query('sum(nexus_api_requests_total)'),
    query(`sum(rate(nexus_api_requests_total[${range}]))`),
    query('nexus_active_websockets'),
    query('sum(nexus_cache_hits_total)'),
    query('sum(nexus_cache_misses_total)'),
  ]);

  // Per-symbol metrics
  const perSymbolWritten = await query('nexus_events_written_total');
  const perSymbolRate = await query(`rate(nexus_events_written_total[${range}])`);
  const perSymbolRows = await query('nexus_writer_rows_written');
  const perSymbolErrors = await query('nexus_writer_validation_errors');

  // Extract scalar values
  const getValue = (result: any[], defaultValue: number = 0): number => {
    if (!result || result.length === 0) return defaultValue;
    const value = parseFloat(result[0].value[1]);
    return isNaN(value) ? defaultValue : value;
  };

  // Build per-symbol map
  const perSymbol: any = {};
  
  perSymbolWritten.forEach((item: any) => {
    const symbol = item.metric.symbol;
    if (!symbol) return;
    
    if (!perSymbol[symbol]) {
      perSymbol[symbol] = {
        eventsWritten: 0,
        rate: 0,
        rowsWritten: 0,
        validationErrors: 0,
      };
    }
    perSymbol[symbol].eventsWritten = parseFloat(item.value[1]) || 0;
  });

  perSymbolRate.forEach((item: any) => {
    const symbol = item.metric.symbol;
    if (symbol && perSymbol[symbol]) {
      perSymbol[symbol].rate = parseFloat(item.value[1]) || 0;
    }
  });

  perSymbolRows.forEach((item: any) => {
    const symbol = item.metric.symbol;
    if (symbol && perSymbol[symbol]) {
      perSymbol[symbol].rowsWritten = parseFloat(item.value[1]) || 0;
    }
  });

  perSymbolErrors.forEach((item: any) => {
    const symbol = item.metric.symbol;
    if (symbol && perSymbol[symbol]) {
      perSymbol[symbol].validationErrors = parseFloat(item.value[1]) || 0;
    }
  });

  // Calculate cache hit rate
  const hits = getValue(cacheHits);
  const misses = getValue(cacheMisses);
  const cacheHitRate = (hits + misses) > 0 ? hits / (hits + misses) : 0;

  return {
    connection: {
      connected: getValue(connected, 0) === 1,
      feedMode: getValue(feedMode, 3) === 1 ? 'live' : 'delayed',
      subscribedSymbols: getValue(subscribedSymbols),
      activeWriters: getValue(activeWriters),
    },
    ingestion: {
      eventsReceived: getValue(eventsReceived),
      eventsWritten: getValue(eventsWritten),
      receiveRate: getValue(receiveRate),
      writeRate: getValue(writeRate),
    },
    latency: {
      tickProcessing: {
        p50: getValue(tickProcessingP50),
        p95: getValue(tickProcessingP95),
        p99: getValue(tickProcessingP99),
        count: getValue(eventsWritten), // Approximate
        sum: 0, // Would need separate query
      },
      flushDuration: {
        p50: getValue(flushP50),
        p95: getValue(flushP95),
        p99: getValue(flushP99),
        count: getValue(eventsWritten) / 2000, // Approximate (flush every 2000 events)
        sum: 0,
      },
      networkLatency: {
        p50: getValue(networkLatencyP50),
        p95: getValue(networkLatencyP95),
        p99: getValue(networkLatencyP99),
        count: getValue(eventsReceived),
        sum: 0,
      },
    },
    errors: {
      validationErrors: getValue(validationErrors),
      connectionErrors: getValue(connectionErrors),
      reconnects: getValue(reconnects),
    },
    api: {
      totalRequests: getValue(apiRequests),
      requestRate: getValue(requestRate),
      activeWebsockets: getValue(activeWS),
      cacheHitRate,
    },
    perSymbol,
  };
}

// Mock data for development/fallback
function getMockSystemMetrics() {
  const symbols = ['AAPL', 'MSFT', 'GOOGL', 'SPY', 'QQQ'];
  const perSymbol: any = {};
  
  symbols.forEach(symbol => {
    perSymbol[symbol] = {
      eventsWritten: Math.floor(50000 + Math.random() * 50000),
      rate: 50 + Math.random() * 150,
      rowsWritten: Math.floor(50000 + Math.random() * 50000),
      validationErrors: Math.random() > 0.95 ? Math.floor(Math.random() * 5) : 0,
    };
  });

  return {
    connection: {
      connected: true,
      feedMode: 'live' as const,
      subscribedSymbols: 5,
      activeWriters: 5,
    },
    ingestion: {
      eventsReceived: 458234,
      eventsWritten: 458234,
      receiveRate: 245.5,
      writeRate: 245.5,
    },
    latency: {
      tickProcessing: {
        p50: 0.0012,
        p95: 0.0045,
        p99: 0.0078,
        count: 458234,
        sum: 548.12,
      },
      flushDuration: {
        p50: 0.0023,
        p95: 0.0089,
        p99: 0.0145,
        count: 229,
        sum: 1.23,
      },
      networkLatency: {
        p50: 0.0085,
        p95: 0.0234,
        p99: 0.0456,
        count: 458234,
        sum: 3894.56,
      },
    },
    errors: {
      validationErrors: 0,
      connectionErrors: 0,
      reconnects: 0,
    },
    api: {
      totalRequests: 2456,
      requestRate: 12.3,
      activeWebsockets: 3,
      cacheHitRate: 0.87,
    },
    perSymbol,
  };
}


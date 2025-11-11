/**
 * Metrics Library - Prometheus query utilities
 * Provides type-safe interfaces for querying metrics
 */

export interface PrometheusResponse {
  status: string;
  data: {
    resultType: 'vector' | 'matrix' | 'scalar' | 'string';
    result: PrometheusResult[];
  };
}

export interface PrometheusResult {
  metric: Record<string, string>;
  value?: [number, string];
  values?: [number, string][];
}

export interface MetricsQuery {
  query: string;
  time?: number;
}

export interface RangeQuery {
  query: string;
  start: number;
  end: number;
  step?: string;
}

/**
 * Query instant metrics from Prometheus
 */
export async function queryMetrics(query: string, time?: number): Promise<PrometheusResponse> {
  const response = await fetch('/api/metrics', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, time }),
  });

  if (!response.ok) {
    throw new Error(`Failed to query metrics: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Query range metrics from Prometheus (time series)
 */
export async function queryRangeMetrics(
  query: string,
  start: number,
  end: number,
  step: string = '15s'
): Promise<PrometheusResponse> {
  const response = await fetch('/api/metrics/range', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, start, end, step }),
  });

  if (!response.ok) {
    throw new Error(`Failed to query range metrics: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Extract single numeric value from Prometheus response
 */
export function extractValue(response: PrometheusResponse): number | null {
  if (response.data.result.length === 0) return null;
  const result = response.data.result[0];
  if (!result.value) return null;
  return parseFloat(result.value[1]);
}

/**
 * Extract all values from Prometheus response
 */
export function extractValues(response: PrometheusResponse): number[] {
  return response.data.result
    .map(result => result.value ? parseFloat(result.value[1]) : null)
    .filter((v): v is number => v !== null);
}

/**
 * Extract time series from Prometheus range response
 */
export function extractTimeSeries(response: PrometheusResponse): Array<{ time: number; value: number }> {
  if (response.data.result.length === 0) return [];
  const result = response.data.result[0];
  if (!result.values) return [];
  
  return result.values.map(([timestamp, value]) => ({
    time: timestamp * 1000, // Convert to milliseconds
    value: parseFloat(value),
  }));
}

/**
 * Common Nexus metric queries
 */
export const NEXUS_QUERIES = {
  // System status
  connected: 'nexus_connected',
  feedMode: 'nexus_feed_mode',
  subscribedSymbols: 'nexus_subscribed_symbols',
  activeWriters: 'nexus_active_writers',
  
  // Ingestion metrics
  eventsReceivedTotal: 'sum(nexus_events_received_total)',
  eventsWrittenTotal: 'sum(nexus_events_written_total)',
  eventsReceivedRate: 'sum(rate(nexus_events_received_total[1m]))',
  eventsWrittenRate: 'sum(rate(nexus_events_written_total[1m]))',
  validationErrorsTotal: 'sum(nexus_validation_errors_total)',
  
  // Latency metrics (percentiles)
  tickProcessingP50: 'histogram_quantile(0.50, sum(rate(nexus_tick_processing_seconds_bucket[1m])) by (le))',
  tickProcessingP95: 'histogram_quantile(0.95, sum(rate(nexus_tick_processing_seconds_bucket[1m])) by (le))',
  tickProcessingP99: 'histogram_quantile(0.99, sum(rate(nexus_tick_processing_seconds_bucket[1m])) by (le))',
  
  networkLatencyP50: 'histogram_quantile(0.50, sum(rate(nexus_network_latency_seconds_bucket[1m])) by (le))',
  networkLatencyP95: 'histogram_quantile(0.95, sum(rate(nexus_network_latency_seconds_bucket[1m])) by (le))',
  networkLatencyP99: 'histogram_quantile(0.99, sum(rate(nexus_network_latency_seconds_bucket[1m])) by (le))',
  
  flushDurationP50: 'histogram_quantile(0.50, sum(rate(nexus_flush_duration_seconds_bucket[1m])) by (le))',
  flushDurationP95: 'histogram_quantile(0.95, sum(rate(nexus_flush_duration_seconds_bucket[1m])) by (le))',
  flushDurationP99: 'histogram_quantile(0.99, sum(rate(nexus_flush_duration_seconds_bucket[1m])) by (le))',
  
  // Data quality
  writerRowsWritten: 'sum(nexus_writer_rows_written)',
  writerValidationErrors: 'sum(nexus_writer_validation_errors)',
  
  // Connection health
  connectionErrors: 'sum(nexus_connection_errors_total)',
  reconnects: 'sum(nexus_reconnects_total)',
};


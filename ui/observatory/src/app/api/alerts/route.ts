import { NextResponse } from 'next/server';

/**
 * Alerts API Route
 * Evaluates PromQL alert rules and returns active alerts
 * 
 * Alert Rules:
 * 1. Disconnected: nexus_connected == 0
 * 2. Zero flow: rate(nexus_events_received_total[1m]) == 0 (when connected)
 * 3. High validation errors: rate(nexus_validation_errors_total[5m]) > 10
 * 4. High latency: p99 tick processing > 50ms
 * 5. Connection errors: rate(nexus_connection_errors_total[5m]) > 0
 */

const OBSERVABILITY_API_URL = process.env.OBSERVABILITY_API_URL || 'http://localhost:8001';
const API_TOKEN = process.env.OBSERVATORY_API_TOKEN || 'dev-token-12345';

interface AlertRule {
  id: string;
  name: string;
  query: string;
  condition: (value: number) => boolean;
  severity: 'critical' | 'warning' | 'info';
  message: (value: number) => string;
}

const ALERT_RULES: AlertRule[] = [
  {
    id: 'disconnected',
    name: 'IBKR Disconnected',
    query: 'nexus_connected',
    condition: (v) => v === 0,
    severity: 'critical',
    message: () => 'IBKR Gateway connection lost',
  },
  {
    id: 'zero_flow',
    name: 'Zero Data Flow',
    query: 'sum(rate(nexus_events_received_total[1m]))',
    condition: (v) => v === 0,
    severity: 'critical',
    message: () => 'No events received in the last minute',
  },
  {
    id: 'high_validation_errors',
    name: 'High Validation Errors',
    query: 'sum(rate(nexus_validation_errors_total[5m]))',
    condition: (v) => v > 10,
    severity: 'warning',
    message: (v) => `Validation error rate: ${v.toFixed(1)}/s (threshold: 10/s)`,
  },
  {
    id: 'high_latency',
    name: 'High P99 Latency',
    query: 'histogram_quantile(0.99, sum(rate(nexus_tick_processing_seconds_bucket[5m])) by (le))',
    condition: (v) => v > 0.05, // 50ms
    severity: 'warning',
    message: (v) => `P99 tick processing: ${(v * 1000).toFixed(2)}ms (threshold: 50ms)`,
  },
  {
    id: 'connection_errors',
    name: 'Connection Errors',
    query: 'sum(rate(nexus_connection_errors_total[5m]))',
    condition: (v) => v > 0,
    severity: 'warning',
    message: (v) => `Connection error rate: ${v.toFixed(2)}/s`,
  },
  {
    id: 'high_cache_miss_rate',
    name: 'High Cache Miss Rate',
    query: 'sum(rate(nexus_cache_misses_total[5m])) / (sum(rate(nexus_cache_hits_total[5m])) + sum(rate(nexus_cache_misses_total[5m])))',
    condition: (v) => v > 0.5, // > 50% miss rate
    severity: 'info',
    message: (v) => `Cache miss rate: ${(v * 100).toFixed(1)}% (threshold: 50%)`,
  },
];

export async function GET() {
  try {
    const alerts = await evaluateAlerts();
    
    return NextResponse.json({
      alerts,
      timestamp: new Date().toISOString(),
      rulesEvaluated: ALERT_RULES.length,
    });
    
  } catch (error) {
    console.error('Failed to evaluate alerts:', error);
    
    return NextResponse.json({
      alerts: [],
      timestamp: new Date().toISOString(),
      error: 'Failed to evaluate alert rules',
    });
  }
}

async function evaluateAlerts() {
  const queryPrometheus = async (promql: string) => {
    try {
      const response = await fetch(`${OBSERVABILITY_API_URL}/metrics/instant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_TOKEN}`,
        },
        body: JSON.stringify({ query: promql }),
      });
      
      if (!response.ok) {
        return null;
      }
      
      const data = await response.json();
      const results = data.data?.result || [];
      
      if (results.length === 0) {
        return null;
      }
      
      return parseFloat(results[0].value[1]);
    } catch (error) {
      console.error(`Failed to query: ${promql}`, error);
      return null;
    }
  };

  const activeAlerts = [];
  const now = new Date().toISOString();

  for (const rule of ALERT_RULES) {
    const value = await queryPrometheus(rule.query);
    
    if (value !== null && rule.condition(value)) {
      activeAlerts.push({
        id: rule.id,
        severity: rule.severity,
        message: rule.message(value),
        timestamp: now,
        query: rule.query,
        value,
      });
    }
  }

  return activeAlerts;
}


"use client";

import { useState, useEffect } from 'react';
import { queryMetrics, extractValue, NEXUS_QUERIES } from '@/lib/metrics';

/**
 * Latency Monitor - Microsecond precision timing
 * XTX-style: Every microsecond matters
 */
export function LatencyMonitor() {
  const [latency, setLatency] = useState({
    tickProcessing: { p50: 0, p95: 0, p99: 0 },
    networkLatency: { p50: 0, p95: 0, p99: 0 },
    flushDuration: { p50: 0, p95: 0, p99: 0 },
  });

  useEffect(() => {
    const fetchLatency = async () => {
      try {
        // Query all latency percentiles in parallel
        const [
          tickP50, tickP95, tickP99,
          netP50, netP95, netP99,
          flushP50, flushP95, flushP99
        ] = await Promise.all([
          queryMetrics(NEXUS_QUERIES.tickProcessingP50),
          queryMetrics(NEXUS_QUERIES.tickProcessingP95),
          queryMetrics(NEXUS_QUERIES.tickProcessingP99),
          queryMetrics(NEXUS_QUERIES.networkLatencyP50),
          queryMetrics(NEXUS_QUERIES.networkLatencyP95),
          queryMetrics(NEXUS_QUERIES.networkLatencyP99),
          queryMetrics(NEXUS_QUERIES.flushDurationP50),
          queryMetrics(NEXUS_QUERIES.flushDurationP95),
          queryMetrics(NEXUS_QUERIES.flushDurationP99),
        ]);

        setLatency({
          tickProcessing: {
            p50: extractValue(tickP50) ?? 0,
            p95: extractValue(tickP95) ?? 0,
            p99: extractValue(tickP99) ?? 0,
          },
          networkLatency: {
            p50: extractValue(netP50) ?? 0,
            p95: extractValue(netP95) ?? 0,
            p99: extractValue(netP99) ?? 0,
          },
          flushDuration: {
            p50: extractValue(flushP50) ?? 0,
            p95: extractValue(flushP95) ?? 0,
            p99: extractValue(flushP99) ?? 0,
          },
        });
      } catch (error) {
        console.error('Failed to fetch latency metrics:', error);
        // Keep previous values on error
      }
    };

    fetchLatency();
    const interval = setInterval(fetchLatency, 5000);
    return () => clearInterval(interval);
  }, []);

  const formatLatency = (μs: number): string => {
    if (μs < 1000) return `${μs.toFixed(0)}μs`;
    if (μs < 1000000) return `${(μs / 1000).toFixed(1)}ms`;
    return `${(μs / 1000000).toFixed(2)}s`;
  };

  const sections = [
    { label: 'TICK PROCESSING', data: latency.tickProcessing },
    { label: 'NETWORK LAT', data: latency.networkLatency },
    { label: 'FLUSH DURATION', data: latency.flushDuration },
  ];

  return (
    <div className="border border-black/10 dark:border-white/10 bg-white dark:bg-black h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-black/10 dark:border-white/10 px-4 py-2">
        <h2 className="text-xs font-bold tracking-wider text-black/60 dark:text-white/60 uppercase">
          Latency Distribution
        </h2>
      </div>

      {/* Percentiles grid */}
      <div className="flex-1 p-4">
        <div className="space-y-6">
          {sections.map((section, idx) => (
            <div key={idx}>
              <div className="text-[10px] text-black/40 dark:text-white/40 uppercase tracking-wider mb-2">
                {section.label}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(['p50', 'p95', 'p99'] as const).map((percentile) => (
                  <div key={percentile} className="text-center">
                    <div className="text-[9px] text-black/30 dark:text-white/30 mb-1">
                      {percentile.toUpperCase()}
                    </div>
                    <div className="text-lg font-bold tabular-nums text-black dark:text-white">
                      {formatLatency(section.data[percentile] * 1000)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Status indicator */}
      <div className="border-t border-black/10 dark:border-white/10 px-4 py-2">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-black/40 dark:text-white/40 uppercase tracking-wider">STATUS</span>
          <span className={`uppercase tracking-wider ${
            latency.tickProcessing.p99 < 2000 ? 'text-black dark:text-white' : 'text-black/50 dark:text-white/50'
          }`}>
            {latency.tickProcessing.p99 < 2000 ? 'OPTIMAL' : 'DEGRADED'}
          </span>
        </div>
      </div>
    </div>
  );
}


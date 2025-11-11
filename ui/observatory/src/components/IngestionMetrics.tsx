"use client";

import { useState, useEffect } from 'react';
import { queryMetrics, extractValue, NEXUS_QUERIES } from '@/lib/metrics';

/**
 * Ingestion Metrics - Event throughput and processing
 * Terminal aesthetic: monospace numbers, high contrast
 */
export function IngestionMetrics() {
  const [metrics, setMetrics] = useState({
    eventsReceived: 0,
    eventsWritten: 0,
    eventsPerSec: 0,
    validationErrors: 0,
  });

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        // Query ingestion metrics in parallel
        const [receivedTotal, writtenTotal, receivedRate, validationErrors] = await Promise.all([
          queryMetrics(NEXUS_QUERIES.eventsReceivedTotal),
          queryMetrics(NEXUS_QUERIES.eventsWrittenTotal),
          queryMetrics(NEXUS_QUERIES.eventsReceivedRate),
          queryMetrics(NEXUS_QUERIES.validationErrorsTotal),
        ]);

        setMetrics({
          eventsReceived: Math.floor(extractValue(receivedTotal) ?? 0),
          eventsWritten: Math.floor(extractValue(writtenTotal) ?? 0),
          eventsPerSec: Math.floor(extractValue(receivedRate) ?? 0),
          validationErrors: Math.floor(extractValue(validationErrors) ?? 0),
        });
      } catch (error) {
        console.error('Failed to fetch ingestion metrics:', error);
        // Keep previous values on error
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, []);

  const stats = [
    { label: 'EVENTS RX', value: metrics.eventsReceived.toLocaleString(), unit: 'total' },
    { label: 'EVENTS TX', value: metrics.eventsWritten.toLocaleString(), unit: 'total' },
    { label: 'THROUGHPUT', value: metrics.eventsPerSec.toLocaleString(), unit: 'evt/s' },
    { label: 'ERRORS', value: metrics.validationErrors.toString(), unit: '', alert: metrics.validationErrors > 0 },
  ];

  return (
    <div className="border border-black/10 dark:border-white/10 bg-white dark:bg-black h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-black/10 dark:border-white/10 px-4 py-2 flex-shrink-0">
        <h2 className="text-xs font-bold tracking-wider text-black/60 dark:text-white/60 uppercase">
          Ingestion Pipeline
        </h2>
      </div>

      {/* Metrics */}
      <div className="flex-1 p-4 space-y-4">
        {stats.map((stat, idx) => (
          <div key={idx} className="flex items-baseline justify-between">
            <span className="text-[10px] text-black/40 dark:text-white/40 uppercase tracking-wider">
              {stat.label}
            </span>
            <div className="text-right">
              <span className="text-2xl font-bold tabular-nums text-black dark:text-white">
                {stat.value}
              </span>
              {stat.unit && (
                <span className="text-xs text-black/30 dark:text-white/30 ml-2">
                  {stat.unit}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Mini sparkline */}
      <div className="border-t border-black/10 dark:border-white/10 px-4 py-2 flex-shrink-0">
        <div className="h-8 flex items-end gap-[2px]">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 bg-black/20 dark:bg-white/20"
              style={{ height: `${Math.random() * 100}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}


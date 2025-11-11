"use client";

import { useState, useEffect } from 'react';
import { queryMetrics, extractValue, NEXUS_QUERIES } from '@/lib/metrics';

/**
 * System Status - Top-level vitals
 * Pure terminal design: black background, white text, minimal borders
 */
export function SystemStatus() {
  const [metrics, setMetrics] = useState({
    connected: false,
    feedMode: 'DELAYED',
    symbols: 0,
    writers: 0,
    uptime: '00:00:00'
  });
  const [startTime] = useState(Date.now());

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        // Query all system vitals in parallel
        const [connectedRes, feedModeRes, symbolsRes, writersRes] = await Promise.all([
          queryMetrics(NEXUS_QUERIES.connected),
          queryMetrics(NEXUS_QUERIES.feedMode),
          queryMetrics(NEXUS_QUERIES.subscribedSymbols),
          queryMetrics(NEXUS_QUERIES.activeWriters),
        ]);

        // Parse responses
        const connected = (extractValue(connectedRes) ?? 0) === 1;
        const feedModeValue = extractValue(feedModeRes) ?? 3;
        const feedMode = feedModeValue === 1 ? 'LIVE' : 'DELAYED';
        const symbols = extractValue(symbolsRes) ?? 0;
        const writers = extractValue(writersRes) ?? 0;
        
        // Calculate uptime
        const uptimeMs = Date.now() - startTime;
        const hours = Math.floor(uptimeMs / 3600000);
        const minutes = Math.floor((uptimeMs % 3600000) / 60000);
        const seconds = Math.floor((uptimeMs % 60000) / 1000);
        const uptime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

        setMetrics({
          connected,
          feedMode,
          symbols,
          writers,
          uptime,
        });
      } catch (error) {
        console.error('Failed to fetch system metrics:', error);
        // Keep previous values on error
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, [startTime]);

  const vitals = [
    { label: 'CONNECTION', value: metrics.connected ? 'ONLINE' : 'OFFLINE', status: metrics.connected },
    { label: 'FEED MODE', value: metrics.feedMode, status: metrics.feedMode === 'LIVE' },
    { label: 'SYMBOLS', value: metrics.symbols.toString(), status: metrics.symbols > 0 },
    { label: 'WRITERS', value: metrics.writers.toString(), status: metrics.writers > 0 },
    { label: 'UPTIME', value: metrics.uptime, status: true },
  ];

  return (
    <div className="border border-black/10 dark:border-white/10 bg-white dark:bg-black">
      {/* Header */}
      <div className="border-b border-black/10 dark:border-white/10 px-4 py-2">
        <h2 className="text-xs font-bold tracking-wider text-black/60 dark:text-white/60 uppercase">
          System Vitals
        </h2>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-5 divide-x divide-black/10 dark:divide-white/10">
        {vitals.map((vital, idx) => (
          <div key={idx} className="px-4 py-3">
            <div className="text-[10px] text-black/40 dark:text-white/40 uppercase tracking-wider mb-1">
              {vital.label}
            </div>
            <div className={`text-lg font-bold tabular-nums ${
              vital.status ? 'text-black dark:text-white' : 'text-black/30 dark:text-white/30'
            }`}>
              {vital.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


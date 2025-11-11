"use client";

import { useState, useEffect } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useSidebar } from '@/contexts/SidebarContext';
import { Sidebar } from '@/components/Sidebar';
import { AlertsPanel } from '@/components/AlertsPanel';

/**
 * Pulse Page - Real-time System Health & Prometheus Metrics
 * Comprehensive view of all system metrics, latencies, and health indicators
 */

interface MetricValue {
  value: number;
  timestamp: number;
}

interface HistogramData {
  p50: number;
  p95: number;
  p99: number;
  count: number;
  sum: number;
}

interface StorageStats {
  total: {
    sizeBytes: number;
    sizeGB: string;
    sizeMB: string;
    files: number;
    symbols: number;
    startDate?: string;
    endDate?: string;
    daysOfData: number;
  };
  perSymbol: {
    [symbol: string]: {
      sizeBytes: number;
      sizeMB: string;
      files: number;
      dateRange?: {
        start: string;
        end: string;
        days: number;
      };
    };
  };
}

interface SystemMetrics {
  connection: {
    connected: boolean;
    feedMode: 'live' | 'delayed' | 'unknown';
    subscribedSymbols: number;
    activeWriters: number;
  };
  ingestion: {
    eventsReceived: number;
    eventsWritten: number;
    receiveRate: number;
    writeRate: number;
  };
  latency: {
    tickProcessing: HistogramData;
    flushDuration: HistogramData;
    networkLatency: HistogramData;
  };
  errors: {
    validationErrors: number;
    connectionErrors: number;
    reconnects: number;
  };
  api: {
    totalRequests: number;
    requestRate: number;
    activeWebsockets: number;
    cacheHitRate: number;
  };
  perSymbol: {
    [symbol: string]: {
      eventsWritten: number;
      rate: number;
      rowsWritten: number;
      validationErrors: number;
    };
  };
}

export default function PulsePage() {
  const { theme } = useTheme();
  const { sidebarWidth } = useSidebar();
  
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [timeRange, setTimeRange] = useState<string>('5m');

  // Fetch metrics from API
  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const response = await fetch(`/api/metrics/system?range=${timeRange}`);
        const data = await response.json();
        setMetrics(data.metrics);
        setLastUpdate(new Date());
        setIsLoading(false);
      } catch (error) {
        console.error('Failed to fetch system metrics:', error);
        setIsLoading(false);
      }
    };

    fetchMetrics();
    
    // Update every 5 seconds
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, [timeRange]);

  // Fetch storage stats (less frequently)
  useEffect(() => {
    const fetchStorage = async () => {
      try {
        const response = await fetch('/api/storage/stats');
        const data = await response.json();
        setStorageStats(data);
      } catch (error) {
        console.error('Failed to fetch storage stats:', error);
      }
    };

    fetchStorage();
    
    // Update every 30 seconds (storage changes slowly)
    const interval = setInterval(fetchStorage, 30000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading || !metrics) {
    return (
      <>
        <Sidebar />
        <div
          className="min-h-screen bg-white dark:bg-black text-black dark:text-white font-mono flex items-center justify-center"
          style={{ paddingLeft: `${sidebarWidth}px` }}
        >
          <div className="text-center">
            <div className="text-sm text-black/40 dark:text-white/40 uppercase tracking-wider mb-2">
              Loading Metrics
            </div>
            <div className="text-xs text-black/60 dark:text-white/60">
              Querying Prometheus...
            </div>
          </div>
        </div>
      </>
    );
  }

  const overallHealth = calculateHealth(metrics);

  return (
    <>
      <Sidebar />
      <div
        className="min-h-screen bg-white dark:bg-black text-black dark:text-white font-mono"
        style={{ paddingLeft: `${sidebarWidth}px` }}
      >
        {/* Header */}
        <header className="border-b border-black/10 dark:border-white/10 bg-white dark:bg-black sticky top-0 z-10">
          <div className="px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-baseline gap-4">
                <h1 className="text-xl font-bold tracking-tight">PULSE</h1>
                <span className="text-xs text-black/40 dark:text-white/40 uppercase tracking-wider">
                  System Health & Metrics
                </span>
              </div>
              <div className="flex items-center gap-6 text-xs">
                {/* Time Range Selector */}
                <div className="flex items-center gap-2">
                  {['1m', '5m', '15m', '1h'].map((range) => (
                    <button
                      key={range}
                      onClick={() => setTimeRange(range)}
                      className={`px-3 py-1 uppercase tracking-wide transition-colors ${
                        timeRange === range
                          ? 'text-black dark:text-white bg-black/10 dark:bg-white/10'
                          : 'text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white'
                      }`}
                    >
                      {range}
                    </button>
                  ))}
                </div>
                
                {/* Overall Health */}
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{
                      backgroundColor: overallHealth.color,
                      boxShadow: `0 0 8px ${overallHealth.color}`,
                    }}
                  />
                  <span className="font-bold uppercase tracking-wide" style={{ color: overallHealth.color }}>
                    {overallHealth.status}
                  </span>
                </div>
                
                {/* Last Update */}
                <div className="text-right">
                  <div className="text-black/40 dark:text-white/40 uppercase tracking-wide mb-1">
                    Last Update
                  </div>
                  <div className="font-mono tabular-nums text-xs">
                    {lastUpdate.toLocaleTimeString('en-US', { hour12: false })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="p-8 space-y-6">
          {/* Connection Status */}
          <ConnectionStatus connection={metrics.connection} theme={theme} />

          {/* Active Alerts */}
          <AlertsPanel />

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-4 gap-4">
            <MetricCard
              title="Events/sec"
              value={metrics.ingestion.receiveRate.toFixed(1)}
              subtitle={`${metrics.ingestion.eventsReceived.toLocaleString()} total`}
              status="nominal"
              theme={theme}
            />
            <MetricCard
              title="Write Rate"
              value={metrics.ingestion.writeRate.toFixed(1)}
              subtitle={`${metrics.ingestion.eventsWritten.toLocaleString()} written`}
              status="nominal"
              theme={theme}
            />
            <MetricCard
              title="p99 Latency"
              value={`${(metrics.latency.tickProcessing.p99 * 1000).toFixed(2)}ms`}
              subtitle={`p50: ${(metrics.latency.tickProcessing.p50 * 1000).toFixed(2)}ms`}
              status={metrics.latency.tickProcessing.p99 < 0.01 ? 'nominal' : 'warning'}
              theme={theme}
            />
            <MetricCard
              title="Error Rate"
              value={metrics.errors.validationErrors.toString()}
              subtitle={`${metrics.errors.connectionErrors} connection errors`}
              status={metrics.errors.validationErrors > 0 ? 'critical' : 'nominal'}
              theme={theme}
            />
          </div>

          {/* Latency Histograms */}
          <LatencySection latency={metrics.latency} theme={theme} />

          {/* Ingestion & Performance */}
          <div className="grid grid-cols-2 gap-6">
            <IngestionPanel ingestion={metrics.ingestion} errors={metrics.errors} theme={theme} />
            <APIHealthPanel api={metrics.api} theme={theme} />
          </div>

          {/* Training Data Storage */}
          {storageStats && <StoragePanel storageStats={storageStats} theme={theme} />}

          {/* Per-Symbol Metrics */}
          <PerSymbolMetrics perSymbol={metrics.perSymbol} theme={theme} />
        </div>
      </div>
    </>
  );
}

// Helper function to calculate overall health
function calculateHealth(metrics: SystemMetrics): { status: string; color: string } {
  if (!metrics.connection.connected) {
    return { status: 'DISCONNECTED', color: '#FF0033' };
  }
  
  if (metrics.errors.validationErrors > 100 || metrics.errors.connectionErrors > 10) {
    return { status: 'DEGRADED', color: '#FFD700' };
  }
  
  if (metrics.latency.tickProcessing.p99 > 0.05) { // > 50ms p99
    return { status: 'SLOW', color: '#FFD700' };
  }
  
  return { status: 'HEALTHY', color: '#00FF41' };
}

// Connection Status Component
function ConnectionStatus({ connection, theme }: { connection: SystemMetrics['connection']; theme: string }) {
  return (
    <div
      className="backdrop-blur-md border p-6"
      style={{
        backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.75)' : 'rgba(255, 255, 255, 0.75)',
        borderColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
        boxShadow: theme === 'dark'
          ? '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.1)'
          : '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.8)',
        borderRadius: '6px',
      }}
    >
      <h2 className="text-sm font-bold uppercase tracking-wider mb-4">Connection Status</h2>
      <div className="grid grid-cols-4 gap-6 text-xs">
        <div>
          <div className="text-black/40 dark:text-white/40 uppercase tracking-wide mb-2">IBKR Gateway</div>
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{
                backgroundColor: connection.connected ? '#00FF41' : '#FF0033',
                boxShadow: connection.connected ? '0 0 8px #00FF41' : '0 0 8px #FF0033',
              }}
            />
            <span className="text-lg font-bold">{connection.connected ? 'CONNECTED' : 'DISCONNECTED'}</span>
          </div>
        </div>
        <div>
          <div className="text-black/40 dark:text-white/40 uppercase tracking-wide mb-2">Feed Mode</div>
          <div className="text-lg font-bold uppercase">{connection.feedMode}</div>
        </div>
        <div>
          <div className="text-black/40 dark:text-white/40 uppercase tracking-wide mb-2">Subscribed Symbols</div>
          <div className="text-lg font-bold tabular-nums">{connection.subscribedSymbols}</div>
        </div>
        <div>
          <div className="text-black/40 dark:text-white/40 uppercase tracking-wide mb-2">Active Writers</div>
          <div className="text-lg font-bold tabular-nums">{connection.activeWriters}</div>
        </div>
      </div>
    </div>
  );
}

// Metric Card Component
function MetricCard({ title, value, subtitle, status, theme }: {
  title: string;
  value: string;
  subtitle: string;
  status: 'nominal' | 'warning' | 'critical';
  theme: string;
}) {
  const statusColor = status === 'critical' ? '#FF0033' : status === 'warning' ? '#FFD700' : '#00FF41';
  
  return (
    <div
      className="backdrop-blur-md border p-4"
      style={{
        backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.75)' : 'rgba(255, 255, 255, 0.75)',
        borderColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
        boxShadow: theme === 'dark'
          ? '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.1)'
          : '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.8)',
        borderRadius: '6px',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] text-black/40 dark:text-white/40 uppercase tracking-wider">{title}</div>
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColor, boxShadow: `0 0 6px ${statusColor}` }} />
      </div>
      <div className="text-2xl font-bold tabular-nums mb-1">{value}</div>
      <div className="text-xs text-black/60 dark:text-white/60 font-mono">{subtitle}</div>
    </div>
  );
}

// Latency Section Component
function LatencySection({ latency, theme }: { latency: SystemMetrics['latency']; theme: string }) {
  return (
    <div
      className="backdrop-blur-md border p-6"
      style={{
        backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.75)' : 'rgba(255, 255, 255, 0.75)',
        borderColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
        boxShadow: theme === 'dark'
          ? '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.1)'
          : '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.8)',
        borderRadius: '6px',
      }}
    >
      <h2 className="text-sm font-bold uppercase tracking-wider mb-4">Latency Histograms</h2>
      <div className="grid grid-cols-3 gap-6">
        <HistogramDisplay
          title="Tick Processing"
          data={latency.tickProcessing}
          theme={theme}
          targetP99={10} // 10ms target
        />
        <HistogramDisplay
          title="Flush Duration"
          data={latency.flushDuration}
          theme={theme}
          targetP99={50} // 50ms target
        />
        <HistogramDisplay
          title="Network Latency"
          data={latency.networkLatency}
          theme={theme}
          targetP99={100} // 100ms target
        />
      </div>
    </div>
  );
}

// Histogram Display Component
function HistogramDisplay({ title, data, theme, targetP99 }: {
  title: string;
  data: HistogramData;
  theme: string;
  targetP99: number;
}) {
  const p99Ms = data.p99 * 1000;
  const isGood = p99Ms < targetP99;
  
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider">{title}</h3>
        <div className={`text-xs font-bold ${isGood ? 'text-[#00FF41]' : 'text-[#FFD700]'}`}>
          {isGood ? 'GOOD' : 'WARN'}
        </div>
      </div>
      <div className="space-y-2 text-xs">
        <div className="flex justify-between items-center">
          <span className="text-black/60 dark:text-white/60">p50</span>
          <span className="font-mono tabular-nums font-bold">{(data.p50 * 1000).toFixed(2)}ms</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-black/60 dark:text-white/60">p95</span>
          <span className="font-mono tabular-nums font-bold">{(data.p95 * 1000).toFixed(2)}ms</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-black/60 dark:text-white/60">p99</span>
          <span className={`font-mono tabular-nums font-bold ${isGood ? 'text-[#00FF41]' : 'text-[#FFD700]'}`}>
            {p99Ms.toFixed(2)}ms
          </span>
        </div>
        <div className="pt-2 border-t border-black/10 dark:border-white/10">
          <div className="flex justify-between items-center text-[10px]">
            <span className="text-black/40 dark:text-white/40">Samples</span>
            <span className="font-mono tabular-nums">{data.count.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Ingestion Panel Component
function IngestionPanel({ ingestion, errors, theme }: {
  ingestion: SystemMetrics['ingestion'];
  errors: SystemMetrics['errors'];
  theme: string;
}) {
  return (
    <div
      className="backdrop-blur-md border p-6"
      style={{
        backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.75)' : 'rgba(255, 255, 255, 0.75)',
        borderColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
        boxShadow: theme === 'dark'
          ? '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.1)'
          : '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.8)',
        borderRadius: '6px',
      }}
    >
      <h2 className="text-sm font-bold uppercase tracking-wider mb-4">Ingestion & Errors</h2>
      <div className="space-y-4 text-xs">
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-black/60 dark:text-white/60 uppercase tracking-wide">Events Received</span>
            <span className="font-mono tabular-nums font-bold">{ingestion.eventsReceived.toLocaleString()}</span>
          </div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-black/60 dark:text-white/60 uppercase tracking-wide">Events Written</span>
            <span className="font-mono tabular-nums font-bold">{ingestion.eventsWritten.toLocaleString()}</span>
          </div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-black/60 dark:text-white/60 uppercase tracking-wide">Receive Rate</span>
            <span className="font-mono tabular-nums font-bold">{ingestion.receiveRate.toFixed(1)}/s</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-black/60 dark:text-white/60 uppercase tracking-wide">Write Rate</span>
            <span className="font-mono tabular-nums font-bold">{ingestion.writeRate.toFixed(1)}/s</span>
          </div>
        </div>
        
        <div className="pt-4 border-t border-black/10 dark:border-white/10">
          <div className="flex justify-between items-center mb-2">
            <span className="text-black/60 dark:text-white/60 uppercase tracking-wide">Validation Errors</span>
            <span className={`font-mono tabular-nums font-bold ${errors.validationErrors > 0 ? 'text-[#FF0033]' : ''}`}>
              {errors.validationErrors}
            </span>
          </div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-black/60 dark:text-white/60 uppercase tracking-wide">Connection Errors</span>
            <span className={`font-mono tabular-nums font-bold ${errors.connectionErrors > 0 ? 'text-[#FF0033]' : ''}`}>
              {errors.connectionErrors}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-black/60 dark:text-white/60 uppercase tracking-wide">Reconnects</span>
            <span className={`font-mono tabular-nums font-bold ${errors.reconnects > 0 ? 'text-[#FFD700]' : ''}`}>
              {errors.reconnects}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// API Health Panel Component
function APIHealthPanel({ api, theme }: { api: SystemMetrics['api']; theme: string }) {
  return (
    <div
      className="backdrop-blur-md border p-6"
      style={{
        backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.75)' : 'rgba(255, 255, 255, 0.75)',
        borderColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
        boxShadow: theme === 'dark'
          ? '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.1)'
          : '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.8)',
        borderRadius: '6px',
      }}
    >
      <h2 className="text-sm font-bold uppercase tracking-wider mb-4">Observatory API</h2>
      <div className="space-y-4 text-xs">
        <div className="flex justify-between items-center">
          <span className="text-black/60 dark:text-white/60 uppercase tracking-wide">Total Requests</span>
          <span className="font-mono tabular-nums font-bold">{api.totalRequests.toLocaleString()}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-black/60 dark:text-white/60 uppercase tracking-wide">Request Rate</span>
          <span className="font-mono tabular-nums font-bold">{api.requestRate.toFixed(1)}/s</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-black/60 dark:text-white/60 uppercase tracking-wide">Active WebSockets</span>
          <span className="font-mono tabular-nums font-bold">{api.activeWebsockets}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-black/60 dark:text-white/60 uppercase tracking-wide">Cache Hit Rate</span>
          <span className={`font-mono tabular-nums font-bold ${api.cacheHitRate > 0.8 ? 'text-[#00FF41]' : ''}`}>
            {(api.cacheHitRate * 100).toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}

// Storage Panel Component
function StoragePanel({ storageStats, theme }: { storageStats: StorageStats; theme: string }) {
  const totalSizeGB = parseFloat(storageStats.total.sizeGB);
  const totalSizeMB = parseFloat(storageStats.total.sizeMB);
  
  return (
    <div
      className="backdrop-blur-md border p-6"
      style={{
        backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.75)' : 'rgba(255, 255, 255, 0.75)',
        borderColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
        boxShadow: theme === 'dark'
          ? '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.1)'
          : '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.8)',
        borderRadius: '6px',
      }}
    >
      <h2 className="text-sm font-bold uppercase tracking-wider mb-4">Training Data Accumulated</h2>
      
      <div className="grid grid-cols-5 gap-6 mb-6 text-xs">
        <div>
          <div className="text-black/40 dark:text-white/40 uppercase tracking-wide mb-2">Total Size</div>
          <div className="text-2xl font-bold tabular-nums">
            {totalSizeGB >= 1 ? `${totalSizeGB.toFixed(2)} GB` : `${totalSizeMB.toFixed(0)} MB`}
          </div>
        </div>
        <div>
          <div className="text-black/40 dark:text-white/40 uppercase tracking-wide mb-2">Files</div>
          <div className="text-2xl font-bold tabular-nums">{storageStats.total.files}</div>
        </div>
        <div>
          <div className="text-black/40 dark:text-white/40 uppercase tracking-wide mb-2">Symbols</div>
          <div className="text-2xl font-bold tabular-nums">{storageStats.total.symbols}</div>
        </div>
        <div>
          <div className="text-black/40 dark:text-white/40 uppercase tracking-wide mb-2">Days of Data</div>
          <div className="text-2xl font-bold tabular-nums">{storageStats.total.daysOfData}</div>
        </div>
        <div>
          <div className="text-black/40 dark:text-white/40 uppercase tracking-wide mb-2">Date Range</div>
          <div className="text-xs font-mono">
            {storageStats.total.startDate && storageStats.total.endDate ? (
              <>
                <div>{new Date(storageStats.total.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                <div className="text-black/40 dark:text-white/40">to</div>
                <div>{new Date(storageStats.total.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
              </>
            ) : (
              <div className="text-black/40 dark:text-white/40">No data</div>
            )}
          </div>
        </div>
      </div>

      {/* Per-Symbol Storage Breakdown */}
      <div className="border-t border-black/10 dark:border-white/10 pt-4">
        <h3 className="text-xs font-bold uppercase tracking-wider mb-3 text-black/60 dark:text-white/60">
          Per-Symbol Breakdown
        </h3>
        <div className="grid grid-cols-2 gap-3 text-xs">
          {Object.entries(storageStats.perSymbol)
            .sort((a, b) => b[1].sizeBytes - a[1].sizeBytes)
            .map(([symbol, data]) => (
              <div
                key={symbol}
                className="flex items-center justify-between p-3 rounded bg-black/5 dark:bg-white/5"
              >
                <div className="flex items-center gap-3">
                  <span className="font-bold">{symbol}</span>
                  <span className="text-black/40 dark:text-white/40">|</span>
                  <span className="text-black/60 dark:text-white/60">{data.files} files</span>
                </div>
                <span className="font-mono tabular-nums font-bold">{data.sizeMB} MB</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// Per-Symbol Metrics Component
function PerSymbolMetrics({ perSymbol, theme }: { perSymbol: SystemMetrics['perSymbol']; theme: string }) {
  const symbols = Object.entries(perSymbol).sort((a, b) => b[1].rate - a[1].rate);
  
  return (
    <div
      className="backdrop-blur-md border"
      style={{
        backgroundColor: theme === 'dark' ? 'rgba(0, 0, 0, 0.75)' : 'rgba(255, 255, 255, 0.75)',
        borderColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
        boxShadow: theme === 'dark'
          ? '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.1)'
          : '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.8)',
        borderRadius: '6px',
      }}
    >
      <div className="p-4 border-b border-black/10 dark:border-white/10">
        <h2 className="text-sm font-bold uppercase tracking-wider">Per-Symbol Metrics</h2>
      </div>
      <div className="overflow-auto max-h-96">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-black/5 dark:bg-white/5">
            <tr className="text-black/60 dark:text-white/60 uppercase tracking-wide">
              <th className="text-left p-3 font-mono">Symbol</th>
              <th className="text-right p-3 font-mono">Events</th>
              <th className="text-right p-3 font-mono">Rate/s</th>
              <th className="text-right p-3 font-mono">Rows Written</th>
              <th className="text-right p-3 font-mono">Errors</th>
            </tr>
          </thead>
          <tbody>
            {symbols.map(([symbol, data]) => (
              <tr key={symbol} className="border-b border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                <td className="p-3 font-bold">{symbol}</td>
                <td className="p-3 text-right tabular-nums">{data.eventsWritten.toLocaleString()}</td>
                <td className="p-3 text-right tabular-nums">{data.rate.toFixed(1)}</td>
                <td className="p-3 text-right tabular-nums">{data.rowsWritten.toLocaleString()}</td>
                <td className={`p-3 text-right tabular-nums font-bold ${data.validationErrors > 0 ? 'text-[#FF0033]' : ''}`}>
                  {data.validationErrors}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


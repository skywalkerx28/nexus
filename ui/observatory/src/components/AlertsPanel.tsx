"use client";

import { useState, useEffect } from 'react';
import { useTheme } from '@/contexts/ThemeContext';

/**
 * Alerts Panel Component
 * PromQL-backed alerting for critical system conditions
 * 
 * Alert Rules:
 * - Disconnected: nexus_connected == 0
 * - Zero flow: rate(nexus_events_received_total[1m]) == 0
 * - High validation errors: rate(nexus_validation_errors_total[5m]) > 10
 * - High latency: histogram_quantile(0.99, rate(nexus_tick_processing_seconds_bucket[5m])) > 0.05
 * - Connection errors: rate(nexus_connection_errors_total[5m]) > 0
 */

type AlertSeverity = 'critical' | 'warning' | 'info';

interface Alert {
  id: string;
  severity: AlertSeverity;
  message: string;
  timestamp: string;
  query: string;
  value?: number;
}

interface AlertsPanelProps {
  className?: string;
}

export function AlertsPanel({ className = '' }: AlertsPanelProps) {
  const { theme } = useTheme();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const response = await fetch('/api/alerts');
        const data = await response.json();
        setAlerts(data.alerts || []);
        setIsLoading(false);
      } catch (error) {
        console.error('Failed to fetch alerts:', error);
        setIsLoading(false);
      }
    };

    fetchAlerts();
    
    // Update every 10 seconds
    const interval = setInterval(fetchAlerts, 10000);
    return () => clearInterval(interval);
  }, []);

  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const warningCount = alerts.filter(a => a.severity === 'warning').length;

  const getSeverityColor = (severity: AlertSeverity) => {
    switch (severity) {
      case 'critical':
        return '#FF0033';
      case 'warning':
        return '#FFD700';
      case 'info':
        return theme === 'dark' ? '#ffffff' : '#000000';
    }
  };

  return (
    <div
      className={`backdrop-blur-md border ${className}`}
      style={{
        backgroundColor: theme === 'dark'
          ? 'rgba(0, 0, 0, 0.75)'
          : 'rgba(255, 255, 255, 0.75)',
        borderColor: theme === 'dark'
          ? 'rgba(255, 255, 255, 0.15)'
          : 'rgba(0, 0, 0, 0.15)',
        boxShadow: theme === 'dark'
          ? '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.1)'
          : '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.8)',
        borderRadius: '6px',
      }}
    >
      {/* Header */}
      <div className="p-4 border-b border-black/10 dark:border-white/10">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider">Active Alerts</h2>
          <div className="flex items-center gap-3 text-xs">
            {criticalCount > 0 && (
              <div className="flex items-center gap-1.5">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{
                    backgroundColor: '#FF0033',
                    boxShadow: '0 0 8px #FF0033',
                  }}
                />
                <span className="font-bold font-mono tabular-nums" style={{ color: '#FF0033' }}>
                  {criticalCount}
                </span>
              </div>
            )}
            {warningCount > 0 && (
              <div className="flex items-center gap-1.5">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{
                    backgroundColor: '#FFD700',
                    boxShadow: '0 0 8px #FFD700',
                  }}
                />
                <span className="font-bold font-mono tabular-nums" style={{ color: '#FFD700' }}>
                  {warningCount}
                </span>
              </div>
            )}
            {alerts.length === 0 && !isLoading && (
              <span className="text-black/40 dark:text-white/40 uppercase tracking-wide">
                All Clear
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Alerts List */}
      <div className="overflow-auto max-h-96">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-black/40 dark:text-white/40">
            Evaluating alert rules...
          </div>
        ) : alerts.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-2xl mb-2" style={{ color: '#00FF41' }}>✓</div>
            <div className="text-xs text-black/60 dark:text-white/60 uppercase tracking-wide">
              No Active Alerts
            </div>
            <div className="text-xs text-black/40 dark:text-white/40 mt-1">
              All systems operational
            </div>
          </div>
        ) : (
          <div className="divide-y divide-black/10 dark:divide-white/10">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="p-4 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                    style={{
                      backgroundColor: getSeverityColor(alert.severity),
                      boxShadow: `0 0 8px ${getSeverityColor(alert.severity)}`,
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className="text-xs font-bold uppercase tracking-wide"
                        style={{ color: getSeverityColor(alert.severity) }}
                      >
                        {alert.severity}
                      </span>
                      <span className="text-[10px] text-black/40 dark:text-white/40 font-mono">
                        {new Date(alert.timestamp).toLocaleTimeString('en-US', { hour12: false })}
                      </span>
                    </div>
                    <div className="text-sm mb-2">{alert.message}</div>
                    {alert.value !== undefined && (
                      <div className="text-xs text-black/60 dark:text-white/60 font-mono">
                        Value: {alert.value.toFixed(4)}
                      </div>
                    )}
                    <div className="text-[10px] text-black/40 dark:text-white/40 font-mono mt-1 truncate">
                      {alert.query}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


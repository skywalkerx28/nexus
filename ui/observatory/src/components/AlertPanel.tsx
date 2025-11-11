"use client";

import { useState, useEffect } from 'react';

interface Alert {
  id: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  message: string;
  timestamp: Date;
}

/**
 * Alert Panel - Critical system alerts
 * Minimal design: Thin bar, only shows critical issues
 */
export function AlertPanel() {
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    const checkAlerts = async () => {
      try {
        // Query for critical conditions
        // - Connection drops
        // - High validation error rate
        // - Latency spikes
        // TODO: Implement actual alert logic

        // Mock: Random alerts for demonstration
        if (Math.random() > 0.95) {
          const newAlert: Alert = {
            id: Date.now().toString(),
            severity: ['CRITICAL', 'WARNING', 'INFO'][Math.floor(Math.random() * 3)] as Alert['severity'],
            message: [
              'IB Gateway connection lost',
              'Validation error rate spike detected',
              'Latency p99 exceeds threshold',
              'Writer flush timeout',
              'Feed mode switched to DELAYED'
            ][Math.floor(Math.random() * 5)],
            timestamp: new Date(),
          };

          setAlerts(prev => [newAlert, ...prev].slice(0, 5));
        }
      } catch (error) {
        console.error('Failed to check alerts:', error);
      }
    };

    checkAlerts();
    const interval = setInterval(checkAlerts, 10000);
    return () => clearInterval(interval);
  }, []);

  const dismissAlert = (id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  if (alerts.length === 0) return null;

  return (
    <div className="border-b border-black/10 dark:border-white/10 bg-white dark:bg-black">
      {alerts.map(alert => (
        <div
          key={alert.id}
          className={`px-8 py-2 flex items-center justify-between text-xs ${
            alert.severity === 'CRITICAL' ? 'bg-black/5 dark:bg-white/5' :
            alert.severity === 'WARNING' ? 'bg-black/[0.02] dark:bg-white/[0.02]' :
            'bg-white dark:bg-black'
          }`}
        >
          <div className="flex items-center gap-4">
            <div className={`w-1.5 h-1.5 ${
              alert.severity === 'CRITICAL' ? 'bg-black dark:bg-white' :
              alert.severity === 'WARNING' ? 'bg-black/60 dark:bg-white/60' :
              'bg-black/30 dark:bg-white/30'
            }`} />
            <span className="font-mono text-black/40 dark:text-white/40 tabular-nums">
              {alert.timestamp.toLocaleTimeString('en-US', { hour12: false })}
            </span>
            <span className={`uppercase tracking-wider ${
              alert.severity === 'CRITICAL' ? 'text-black dark:text-white' :
              alert.severity === 'WARNING' ? 'text-black/80 dark:text-white/80' :
              'text-black/60 dark:text-white/60'
            }`}>
              [{alert.severity}]
            </span>
            <span className="text-black/80 dark:text-white/80">{alert.message}</span>
          </div>
          <button
            onClick={() => dismissAlert(alert.id)}
            className="text-black/30 dark:text-white/30 hover:text-black dark:hover:text-white transition-colors text-[10px] uppercase tracking-wider"
          >
            DISMISS
          </button>
        </div>
      ))}
    </div>
  );
}


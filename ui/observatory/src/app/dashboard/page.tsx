"use client";

import { useState, useEffect } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useSidebar } from '@/contexts/SidebarContext';
import { Sidebar } from '@/components/Sidebar';
import { Clock } from '@/components/Clock';

/**
 * Observatory Mission Control Dashboard
 * 
 * Design Philosophy: Pure Black & White Terminal
 * Dark Mode: Black bg, white text
 * Light Mode: White bg, black text
 */
export default function DashboardPage() {
  const { theme, toggleTheme } = useTheme();
  const { sidebarWidth } = useSidebar();
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  useEffect(() => {
    const pollInterval = setInterval(() => {
      setLastUpdate(new Date());
      fetch('/api/health')
        .then(res => res.ok ? setIsConnected(true) : setIsConnected(false))
        .catch(() => setIsConnected(false));
    }, 5000);

    return () => clearInterval(pollInterval);
  }, []);

  return (
    <>
      {/* Sidebar navigation */}
      <Sidebar />
      
      <div 
        className="min-h-screen bg-white dark:bg-black text-black dark:text-white font-mono transition-all duration-300"
        style={{ paddingLeft: `${sidebarWidth}px` }}
      >
        {/* Header with theme toggle */}
        <header className="border-b border-black/10 dark:border-white/10 bg-white dark:bg-black">
          <div className="px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-baseline gap-4">
                <h1 className="text-xl font-bold tracking-tight">
                  NEXUS OBSERVATORY
                </h1>
                <span className="text-xs text-black/40 dark:text-white/40 uppercase tracking-wider">
                  Mission Control v1.0
                </span>
              </div>
              
              <div className="flex items-center gap-6 text-xs">
                {/* Connection status indicator */}
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 ${isConnected ? 'bg-black dark:bg-white' : 'bg-black/20 dark:bg-white/20'}`} />
                  <span className="text-black/40 dark:text-white/40 uppercase tracking-wider text-[10px]">
                    {isConnected ? 'CONNECTED' : 'OFFLINE'}
                  </span>
                </div>

                {/* Theme toggle */}
                <button
                  onClick={toggleTheme}
                  className="text-black/60 dark:text-white/60 uppercase tracking-wide hover:text-black dark:hover:text-white transition-colors"
                  title="Toggle theme"
                >
                  {theme === 'dark' ? '☀ LIGHT' : '☾ DARK'}
                </button>
                
                {/* Clock display with local and UTC time */}
                <Clock />
              </div>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="p-8">
          <div className="space-y-6">
            {/* Welcome message */}
            <div className="border border-black/10 dark:border-white/10 bg-white dark:bg-black p-8">
              <h2 className="text-2xl font-bold mb-4">Welcome to Observatory</h2>
              <p className="text-sm text-black/60 dark:text-white/60 mb-4">
                Mission control for Nexus algorithmic trading platform.
              </p>
              <div className="space-y-2 text-xs text-black/40 dark:text-white/40">
                <div>Status: <span className={isConnected ? 'text-black dark:text-white' : 'text-black/40 dark:text-white/40'}>{isConnected ? 'CONNECTED' : 'DISCONNECTED'}</span></div>
                <div>Theme: <span className="text-black dark:text-white uppercase">{theme}</span></div>
                <div>Sidebar: <span className="text-black dark:text-white">ACTIVE</span></div>
              </div>
            </div>

            {/* System vitals placeholder */}
            <div className="grid grid-cols-4 gap-4">
              {['Events Received', 'Events Written', 'Validation Errors', 'Active Writers'].map((label, idx) => (
                <div key={idx} className="border border-black/10 dark:border-white/10 bg-white dark:bg-black p-4">
                  <div className="text-[10px] text-black/40 dark:text-white/40 uppercase tracking-wider mb-2">
                    {label}
                  </div>
                  <div className="text-2xl font-bold tabular-nums">
                    {idx === 0 ? '0' : idx === 1 ? '0' : idx === 2 ? '0' : '0'}
                  </div>
                </div>
              ))}
            </div>

            {/* Coming soon sections */}
            <div className="border border-black/10 dark:border-white/10 bg-white dark:bg-black p-6">
              <h3 className="text-sm font-bold uppercase tracking-wider mb-4">Metrics Integration</h3>
              <div className="text-xs text-black/60 dark:text-white/60 space-y-2">
                <div>• Real-time event feed</div>
                <div>• Latency monitoring (p50/p95/p99)</div>
                <div>• Data quality metrics</div>
                <div>• Live Prometheus integration</div>
              </div>
            </div>
          </div>
        </main>

        {/* Terminal footer */}
        <footer className="border-t border-black/10 dark:border-white/10 bg-white dark:bg-black">
          <div className="px-8 py-3">
            <div className="flex items-center justify-between text-xs text-black/40 dark:text-white/40">
              <div className="font-mono">
                SYNTROPIC TECHNOLOGIES INC • NEXUS v1.0.0
              </div>
              <div className="flex items-center gap-6 uppercase tracking-wide">
                <a href="/docs" className="hover:text-black dark:hover:text-white transition-colors">DOCS</a>
                <a href="/api/health" target="_blank" className="hover:text-black dark:hover:text-white transition-colors">API</a>
                <a href="http://localhost:9090" target="_blank" className="hover:text-black dark:hover:text-white transition-colors">PROM</a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}

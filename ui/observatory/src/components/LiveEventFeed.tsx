"use client";

import { useState } from 'react';
import { useEventStream } from '@/hooks/useEventStream';

/**
 * Live Event Feed - Real-time market data stream
 * Terminal-style log: monospace, scrolling, high-density
 * Now powered by WebSocket for true real-time updates
 */
export function LiveEventFeed() {
  const [paused, setPaused] = useState(false);
  const { events, isConnected, clearEvents } = useEventStream({
    enabled: !paused,
    maxEvents: 100,
  });

  return (
    <div className="border border-black/10 dark:border-white/10 bg-white dark:bg-black">
      {/* Header with controls */}
      <div className="border-b border-black/10 dark:border-white/10 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-bold tracking-wider text-black/60 dark:text-white/60 uppercase">
            Live Event Stream
          </h2>
          <div className="flex items-center gap-2">
            <div className={`w-1 h-1 ${isConnected ? 'bg-black dark:bg-white' : 'bg-black/20 dark:bg-white/20'}`} />
            <span className="text-[10px] text-black/40 dark:text-white/40 uppercase tracking-wider">
              {isConnected ? 'WS' : 'OFFLINE'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={clearEvents}
            className="text-[10px] text-black/40 dark:text-white/40 uppercase tracking-wider hover:text-black dark:hover:text-white transition-colors"
          >
            CLEAR
          </button>
          <button
            onClick={() => setPaused(!paused)}
            className="text-[10px] text-black/60 dark:text-white/60 uppercase tracking-wider hover:text-black dark:hover:text-white transition-colors"
          >
            {paused ? 'RESUME' : 'PAUSE'}
          </button>
        </div>
      </div>

      {/* Table header */}
      <div className="border-b border-black/5 dark:border-white/5 px-4 py-2 grid grid-cols-6 gap-4 text-[9px] text-black/30 dark:text-white/30 uppercase tracking-wider">
        <div>TIMESTAMP</div>
        <div>SYMBOL</div>
        <div className="text-right">PRICE</div>
        <div className="text-right">SIZE</div>
        <div>VENUE</div>
        <div>TYPE</div>
      </div>

      {/* Scrolling event log */}
      <div className="h-[400px] overflow-y-auto">
        {events.map((event, idx) => (
          <div
            key={idx}
            className="px-4 py-2 grid grid-cols-6 gap-4 text-xs hover:bg-black/5 dark:hover:bg-white/5 transition-colors border-b border-black/5 dark:border-white/5"
          >
            <div className="font-mono text-black/40 dark:text-white/40 tabular-nums">
              {new Date(event.timestamp).toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 3 })}
            </div>
            <div className="font-bold text-black dark:text-white">{event.symbol}</div>
            <div className="text-right font-mono tabular-nums text-black dark:text-white">
              ${event.price.toFixed(2)}
            </div>
            <div className="text-right font-mono tabular-nums text-black/60 dark:text-white/60">
              {event.size.toLocaleString()}
            </div>
            <div className="text-black/40 dark:text-white/40">{event.venue}</div>
            <div className="text-black/40 dark:text-white/40">{event.type}</div>
          </div>
        ))}
      </div>

      {/* Footer stats */}
      <div className="border-t border-black/10 dark:border-white/10 px-4 py-2 flex items-center justify-between text-[10px]">
        <span className="text-black/40 dark:text-white/40 uppercase tracking-wider">
          {events.length} EVENTS
        </span>
        <span className="text-black/40 dark:text-white/40 uppercase tracking-wider">
          {paused ? 'PAUSED' : 'STREAMING'}
        </span>
      </div>
    </div>
  );
}


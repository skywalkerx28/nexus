"use client";

import { useState, useEffect } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { TRADING_VENUES, isMarketOpen, type VenueMetrics } from '@/lib/venues';


// World Market Footer Component
// Displays global exchange statuses and market news at the bottom of the World page
 

interface WorldMarketFooterProps {
  className?: string;
  sidebarWidth?: number;
  venueMetrics: VenueMetrics[];
}

export function WorldMarketFooter({ className = '', sidebarWidth = 256, venueMetrics }: WorldMarketFooterProps) {
  const { theme } = useTheme();
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Count open vs closed exchanges
  const exchanges = Object.values(TRADING_VENUES);
  const openExchanges = exchanges.filter(venue => isMarketOpen(venue));
  const closedExchanges = exchanges.filter(venue => !isMarketOpen(venue));

  return (
    <div
      className={`backdrop-blur-xl border-t overflow-hidden ${className}`}
      style={{
        paddingLeft: `${sidebarWidth}px`,
        backgroundColor: theme === 'dark'
          ? 'rgba(0, 0, 0, 0.75)'
          : 'rgba(255, 255, 255, 0.75)',
        borderColor: theme === 'dark'
          ? 'rgba(255, 255, 255, 0.15)'
          : 'rgba(0, 0, 0, 0.15)',
        boxShadow: theme === 'dark'
          ? '0 -4px 24px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
          : '0 -4px 24px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
      }}
    >
      <div className="flex items-stretch h-28">
        {/* Exchange Status Section */}
        <div className="flex-1 px-6 py-4 flex items-center gap-6 overflow-x-auto scrollbar-hide">
          {/* Summary Stats */}
          <div className="flex items-center gap-4 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor: '#00FF41',
                  boxShadow: '0 0 8px #00FF41',
                }}
              />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-black dark:text-white font-mono">
                  {openExchanges.length}
                </span>
                <span className="text-[9px] text-black/40 dark:text-white/40 uppercase tracking-wide">
                  OPEN
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor: '#FF0033',
                  boxShadow: '0 0 8px #FF0033',
                }}
              />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-black dark:text-white font-mono">
                  {closedExchanges.length}
                </span>
                <span className="text-[9px] text-black/40 dark:text-white/40 uppercase tracking-wide">
                  CLOSED
                </span>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div
            className="h-12 w-px flex-shrink-0"
            style={{
              backgroundColor: theme === 'dark'
                ? 'rgba(255, 255, 255, 0.1)'
                : 'rgba(0, 0, 0, 0.1)',
            }}
          />

          {/* Individual Exchange Status */}
          <div className="flex items-center gap-4">
            {exchanges.map((venue) => {
              const isOpen = isMarketOpen(venue);
              const metric = venueMetrics.find(m => m.venue === venue.id);
              
              return (
                <div
                  key={venue.id}
                  className="flex items-center gap-2 flex-shrink-0 px-3 py-1.5 rounded"
                  style={{
                    backgroundColor: theme === 'dark'
                      ? 'rgba(255, 255, 255, 0.05)'
                      : 'rgba(0, 0, 0, 0.05)',
                  }}
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      backgroundColor: isOpen ? '#00FF41' : '#FF0033',
                      boxShadow: isOpen 
                        ? '0 0 6px #00FF41' 
                        : '0 0 6px #FF0033',
                    }}
                  />
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-black dark:text-white font-mono leading-tight">
                      {venue.id}
                    </span>
                    <span className="text-[8px] text-black/40 dark:text-white/40 uppercase tracking-wide leading-tight">
                      {venue.country}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Market News Section - Placeholder for future scraper integration */}
        <div
          className="w-96 px-6 py-4 border-l flex flex-col justify-center"
          style={{
            borderColor: theme === 'dark'
              ? 'rgba(255, 255, 255, 0.1)'
              : 'rgba(0, 0, 0, 0.1)',
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <div
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{
                backgroundColor: '#00FF41',
                boxShadow: '0 0 6px #00FF41',
              }}
            />
            <span className="text-[9px] text-black/40 dark:text-white/40 uppercase tracking-wider font-mono">
              MARKET NEWS
            </span>
          </div>
          
          <div className="text-xs text-black/60 dark:text-white/60 font-mono leading-relaxed">
            Live news feed integration coming soon...
          </div>
          
          <div className="mt-1 text-[9px] text-black/30 dark:text-white/30 font-mono">
            {currentTime.toLocaleString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false,
            })}
          </div>
        </div>
      </div>
    </div>
  );
}


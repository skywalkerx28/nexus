"use client";

import { useState, useEffect } from 'react';
import { useTheme } from '@/contexts/ThemeContext';

/**
 * Market Ticker Bar Component
 * Displays live market data for major indexes and stocks
 * Data sourced from IBKR market data feed
 */

export interface TickerData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  lastUpdate: string;
}

interface MarketTickerBarProps {
  className?: string;
  sidebarWidth?: number;
}

export function MarketTickerBar({ className = '', sidebarWidth = 256 }: MarketTickerBarProps) {
  const { theme } = useTheme();
  const [tickers, setTickers] = useState<TickerData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch market data from API
  useEffect(() => {
    const fetchMarketData = async () => {
      try {
        const response = await fetch('/api/market/tickers');
        if (response.ok) {
          const data = await response.json();
          setTickers(data.tickers || []);
        } else {
          // Fallback to mock data if API not available
          setTickers(getMockTickers());
        }
      } catch (error) {
        console.error('Failed to fetch market data:', error);
        setTickers(getMockTickers());
      } finally {
        setIsLoading(false);
      }
    };

    fetchMarketData();
    const interval = setInterval(fetchMarketData, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className={`backdrop-blur-xl border-b overflow-hidden ${className}`}
      style={{
        paddingLeft: `${sidebarWidth}px`,
        backgroundColor: theme === 'dark'
          ? 'rgba(0, 0, 0, 0.75)'
          : 'rgba(255, 255, 255, 0.75)',
        borderColor: theme === 'dark'
          ? 'rgba(255, 255, 255, 0.15)'
          : 'rgba(0, 0, 0, 0.15)',
        boxShadow: theme === 'dark'
          ? '0 4px 24px rgba(0, 0, 0, 0.5), inset 0 -1px 0 rgba(255, 255, 255, 0.1)'
          : '0 4px 24px rgba(0, 0, 0, 0.1), inset 0 -1px 0 rgba(255, 255, 255, 0.9)',
      }}
    >
      <div className="flex items-center h-16 px-6">
        {/* Ticker Items - Auto-scrolling */}
        {isLoading ? (
          <div className="text-xs text-black/40 dark:text-white/40 font-mono">
            Loading market data...
          </div>
        ) : (
          <div className="flex-1 overflow-hidden">
            <div className="flex items-center gap-8 ticker-scroll">
              {/* First set of tickers */}
              {tickers.map((ticker) => (
                <TickerItem key={`${ticker.symbol}-1`} ticker={ticker} theme={theme} />
              ))}
              {/* Duplicate set for seamless loop */}
              {tickers.map((ticker) => (
                <TickerItem key={`${ticker.symbol}-2`} ticker={ticker} theme={theme} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface TickerItemProps {
  ticker: TickerData;
  theme: 'light' | 'dark';
}

function TickerItem({ ticker, theme }: TickerItemProps) {
  const isPositive = ticker.change >= 0;
  const changeColor = isPositive ? '#00FF41' : '#FF0033'; // Matrix green / red

  return (
    <div className="flex items-center gap-3 flex-shrink-0">
      {/* Symbol */}
      <div className="flex flex-col">
        <span className="text-xs font-bold text-black dark:text-white tracking-tight font-mono">
          {ticker.symbol}
        </span>
        <span className="text-[9px] text-black/40 dark:text-white/40 uppercase tracking-wide">
          {ticker.name}
        </span>
      </div>

      {/* Price */}
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-bold text-black dark:text-white tabular-nums font-mono">
          {ticker.price.toFixed(2)}
        </span>

        {/* Change */}
        <div
          className="flex items-center gap-1 text-[10px] font-bold tabular-nums font-mono"
          style={{ color: changeColor }}
        >
          <span>{isPositive ? '▲' : '▼'}</span>
          <span>{Math.abs(ticker.change).toFixed(2)}</span>
          <span>({isPositive ? '+' : ''}{ticker.changePercent.toFixed(2)}%)</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Mock ticker data for development/fallback
 */
function getMockTickers(): TickerData[] {
  const now = new Date().toISOString();
  
  return [
    {
      symbol: 'SPX',
      name: 'S&P 500',
      price: 4783.45,
      change: 23.67,
      changePercent: 0.50,
      lastUpdate: now,
    },
    {
      symbol: 'DJI',
      name: 'DOW JONES',
      price: 37305.16,
      change: -89.22,
      changePercent: -0.24,
      lastUpdate: now,
    },
    {
      symbol: 'IXIC',
      name: 'NASDAQ',
      price: 14813.92,
      change: 55.98,
      changePercent: 0.38,
      lastUpdate: now,
    },
    {
      symbol: 'VIX',
      name: 'VOLATILITY',
      price: 13.45,
      change: -0.87,
      changePercent: -6.08,
      lastUpdate: now,
    },
    {
      symbol: 'AAPL',
      name: 'APPLE',
      price: 178.23,
      change: 2.45,
      changePercent: 1.39,
      lastUpdate: now,
    },
    {
      symbol: 'MSFT',
      name: 'MICROSOFT',
      price: 374.56,
      change: 4.12,
      changePercent: 1.11,
      lastUpdate: now,
    },
    {
      symbol: 'GOOGL',
      name: 'ALPHABET',
      price: 141.80,
      change: -0.95,
      changePercent: -0.66,
      lastUpdate: now,
    },
    {
      symbol: 'TSLA',
      name: 'TESLA',
      price: 242.84,
      change: 8.91,
      changePercent: 3.81,
      lastUpdate: now,
    },
    {
      symbol: 'NVDA',
      name: 'NVIDIA',
      price: 495.22,
      change: 12.34,
      changePercent: 2.55,
      lastUpdate: now,
    },
    {
      symbol: 'META',
      name: 'META',
      price: 353.96,
      change: -2.18,
      changePercent: -0.61,
      lastUpdate: now,
    },
  ];
}


"use client";

import { useState, useEffect } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useSidebar } from '@/contexts/SidebarContext';
import { Sidebar } from '@/components/Sidebar';

/**
 * Positions Page - Real-time portfolio and risk monitoring
 * Shows current positions, geographic distribution, risk metrics, and daily trades
 */

interface Position {
  symbol: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  venue: string;
  country: string;
  sector: string;
  riskScore: number;
}

interface TradesSummary {
  totalTrades: number;
  buyTrades: number;
  sellTrades: number;
  volume: number;
  totalPnL: number;
}

interface RiskMetrics {
  totalExposure: number;
  netExposure: number;
  grossExposure: number;
  concentration: { [key: string]: number };
  varDaily: number;
  sharpeRatio: number;
}

export default function PositionsPage() {
  const { theme } = useTheme();
  const { sidebarWidth } = useSidebar();
  
  const [positions, setPositions] = useState<Position[]>([]);
  const [tradesSummary, setTradesSummary] = useState<TradesSummary | null>(null);
  const [riskMetrics, setRiskMetrics] = useState<RiskMetrics | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch positions data
  useEffect(() => {
    const fetchPositions = async () => {
      try {
        const response = await fetch('/api/positions');
        const data = await response.json();
        setPositions(data.positions || []);
        setRiskMetrics(data.riskMetrics);
        setIsLoading(false);
      } catch (error) {
        console.error('Failed to fetch positions:', error);
        setIsLoading(false);
      }
    };

    const fetchTrades = async () => {
      try {
        const response = await fetch('/api/positions/trades/summary');
        const data = await response.json();
        setTradesSummary(data);
      } catch (error) {
        console.error('Failed to fetch trades summary:', error);
      }
    };

    fetchPositions();
    fetchTrades();

    // Update every 5 seconds
    const interval = setInterval(() => {
      fetchPositions();
      fetchTrades();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Calculate summary metrics
  const totalPnL = positions.reduce((sum, p) => sum + p.unrealizedPnL, 0);
  const totalValue = positions.reduce((sum, p) => sum + p.marketValue, 0);
  const longPositions = positions.filter(p => p.quantity > 0).length;
  const shortPositions = positions.filter(p => p.quantity < 0).length;

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
                <h1 className="text-xl font-bold tracking-tight">POSITIONS</h1>
                <span className="text-xs text-black/40 dark:text-white/40 uppercase tracking-wider">
                  Real-time Portfolio Monitor
                </span>
              </div>
              <div className="flex items-center gap-6 text-xs">
                <div className="text-right">
                  <div className="text-black/40 dark:text-white/40 uppercase tracking-wide mb-1">
                    Total P&L
                  </div>
                  <div className={`text-lg font-bold tabular-nums ${
                    totalPnL >= 0 ? 'text-[#00FF41]' : 'text-[#FF0033]'
                  }`}>
                    {totalPnL >= 0 ? '+' : ''}{totalPnL.toFixed(2)} USD
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-black/40 dark:text-white/40 uppercase tracking-wide mb-1">
                    Portfolio Value
                  </div>
                  <div className="text-lg font-bold tabular-nums">
                    {totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="p-8 space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-4 gap-4">
            <SummaryCard
              title="Open Positions"
              value={positions.length.toString()}
              subtitle={`${longPositions} Long / ${shortPositions} Short`}
              theme={theme}
            />
            <SummaryCard
              title="Daily Trades"
              value={tradesSummary?.totalTrades.toString() || '0'}
              subtitle={`${tradesSummary?.buyTrades || 0} Buy / ${tradesSummary?.sellTrades || 0} Sell`}
              theme={theme}
            />
            <SummaryCard
              title="Net Exposure"
              value={riskMetrics ? `${(riskMetrics.netExposure / 1000).toFixed(1)}K` : '0'}
              subtitle={`Gross: ${riskMetrics ? (riskMetrics.grossExposure / 1000).toFixed(1) + 'K' : '0'}`}
              theme={theme}
            />
            <SummaryCard
              title="Sharpe Ratio"
              value={riskMetrics?.sharpeRatio.toFixed(2) || '0.00'}
              subtitle={`VaR: ${riskMetrics ? riskMetrics.varDaily.toFixed(2) + '%' : '0%'}`}
              theme={theme}
            />
          </div>

          {/* Main Grid: Positions Table + Risk Panel */}
          <div className="grid grid-cols-3 gap-6">
            {/* Positions Table - 2/3 width */}
            <div className="col-span-2">
              <PositionsTable 
                positions={positions}
                isLoading={isLoading}
                onSelectPosition={setSelectedPosition}
                selectedPosition={selectedPosition}
                theme={theme}
              />
            </div>

            {/* Risk & Geographic Panel - 1/3 width */}
            <div className="space-y-6">
              <RiskPanel riskMetrics={riskMetrics} theme={theme} />
              <GeographicDistribution positions={positions} theme={theme} />
              <SectorExposure positions={positions} theme={theme} />
            </div>
          </div>

          {/* Daily Trades Summary */}
          {tradesSummary && (
            <TradesPanel tradesSummary={tradesSummary} theme={theme} />
          )}
        </div>
      </div>
    </>
  );
}

// Summary Card Component
function SummaryCard({ title, value, subtitle, theme }: {
  title: string;
  value: string;
  subtitle: string;
  theme: string;
}) {
  return (
    <div
      className="backdrop-blur-md border p-4"
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
      <div className="text-[10px] text-black/40 dark:text-white/40 uppercase tracking-wider mb-2">
        {title}
      </div>
      <div className="text-2xl font-bold tabular-nums mb-1">{value}</div>
      <div className="text-xs text-black/60 dark:text-white/60 font-mono">
        {subtitle}
      </div>
    </div>
  );
}

// Positions Table Component
function PositionsTable({ positions, isLoading, onSelectPosition, selectedPosition, theme }: {
  positions: Position[];
  isLoading: boolean;
  onSelectPosition: (position: Position) => void;
  selectedPosition: Position | null;
  theme: string;
}) {
  return (
    <div
      className="backdrop-blur-md border"
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
      <div className="p-4 border-b border-black/10 dark:border-white/10">
        <h3 className="text-sm font-bold uppercase tracking-wider">Open Positions</h3>
      </div>
      <div className="overflow-auto max-h-[600px]">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-black/5 dark:bg-white/5">
            <tr className="text-black/60 dark:text-white/60 uppercase tracking-wide">
              <th className="text-left p-3 font-mono">Symbol</th>
              <th className="text-right p-3 font-mono">Qty</th>
              <th className="text-right p-3 font-mono">Avg Price</th>
              <th className="text-right p-3 font-mono">Current</th>
              <th className="text-right p-3 font-mono">Value</th>
              <th className="text-right p-3 font-mono">P&L</th>
              <th className="text-right p-3 font-mono">P&L %</th>
              <th className="text-left p-3 font-mono">Venue</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className="text-center p-8 text-black/40 dark:text-white/40">
                  Loading positions...
                </td>
              </tr>
            ) : positions.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center p-8 text-black/40 dark:text-white/40">
                  No open positions
                </td>
              </tr>
            ) : (
              positions.map((position) => (
                <tr
                  key={position.symbol}
                  onClick={() => onSelectPosition(position)}
                  className={`border-b border-black/5 dark:border-white/5 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${
                    selectedPosition?.symbol === position.symbol ? 'bg-black/10 dark:bg-white/10' : ''
                  }`}
                >
                  <td className="p-3 font-bold">{position.symbol}</td>
                  <td className="p-3 text-right tabular-nums">
                    {position.quantity > 0 ? '+' : ''}{position.quantity}
                  </td>
                  <td className="p-3 text-right tabular-nums">${position.avgPrice.toFixed(2)}</td>
                  <td className="p-3 text-right tabular-nums">${position.currentPrice.toFixed(2)}</td>
                  <td className="p-3 text-right tabular-nums">${position.marketValue.toLocaleString()}</td>
                  <td className={`p-3 text-right tabular-nums font-bold ${
                    position.unrealizedPnL >= 0 ? 'text-[#00FF41]' : 'text-[#FF0033]'
                  }`}>
                    {position.unrealizedPnL >= 0 ? '+' : ''}{position.unrealizedPnL.toFixed(2)}
                  </td>
                  <td className={`p-3 text-right tabular-nums ${
                    position.unrealizedPnLPercent >= 0 ? 'text-[#00FF41]' : 'text-[#FF0033]'
                  }`}>
                    {position.unrealizedPnLPercent >= 0 ? '+' : ''}{position.unrealizedPnLPercent.toFixed(2)}%
                  </td>
                  <td className="p-3">{position.venue}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Risk Panel Component
function RiskPanel({ riskMetrics, theme }: { riskMetrics: RiskMetrics | null; theme: string }) {
  if (!riskMetrics) return null;

  return (
    <div
      className="backdrop-blur-md border p-4"
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
      <h3 className="text-sm font-bold uppercase tracking-wider mb-4">Risk Metrics</h3>
      <div className="space-y-3 text-xs">
        <div className="flex justify-between items-center">
          <span className="text-black/60 dark:text-white/60">Total Exposure</span>
          <span className="font-bold tabular-nums">${(riskMetrics.totalExposure / 1000).toFixed(1)}K</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-black/60 dark:text-white/60">Net Exposure</span>
          <span className="font-bold tabular-nums">${(riskMetrics.netExposure / 1000).toFixed(1)}K</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-black/60 dark:text-white/60">Gross Exposure</span>
          <span className="font-bold tabular-nums">${(riskMetrics.grossExposure / 1000).toFixed(1)}K</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-black/60 dark:text-white/60">Daily VaR (95%)</span>
          <span className="font-bold tabular-nums text-[#FF0033]">{riskMetrics.varDaily.toFixed(2)}%</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-black/60 dark:text-white/60">Sharpe Ratio</span>
          <span className="font-bold tabular-nums">{riskMetrics.sharpeRatio.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

// Geographic Distribution Component
function GeographicDistribution({ positions, theme }: { positions: Position[]; theme: string }) {
  const byCountry = positions.reduce((acc, p) => {
    acc[p.country] = (acc[p.country] || 0) + Math.abs(p.marketValue);
    return acc;
  }, {} as { [key: string]: number });

  const countries = Object.entries(byCountry)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return (
    <div
      className="backdrop-blur-md border p-4"
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
      <h3 className="text-sm font-bold uppercase tracking-wider mb-4">Geographic Risk</h3>
      <div className="space-y-2 text-xs">
        {countries.map(([country, value]) => (
          <div key={country} className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-black/80 dark:text-white/80">{country}</span>
              <span className="font-mono tabular-nums">${(value / 1000).toFixed(1)}K</span>
            </div>
            <div className="h-1.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-black dark:bg-white"
                style={{
                  width: `${(value / Math.max(...Object.values(byCountry))) * 100}%`
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Sector Exposure Component
function SectorExposure({ positions, theme }: { positions: Position[]; theme: string }) {
  const bySector = positions.reduce((acc, p) => {
    acc[p.sector] = (acc[p.sector] || 0) + Math.abs(p.marketValue);
    return acc;
  }, {} as { [key: string]: number });

  const sectors = Object.entries(bySector)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return (
    <div
      className="backdrop-blur-md border p-4"
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
      <h3 className="text-sm font-bold uppercase tracking-wider mb-4">Sector Exposure</h3>
      <div className="space-y-2 text-xs">
        {sectors.map(([sector, value]) => (
          <div key={sector} className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-black/80 dark:text-white/80">{sector}</span>
              <span className="font-mono tabular-nums">${(value / 1000).toFixed(1)}K</span>
            </div>
            <div className="h-1.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-black dark:bg-white"
                style={{
                  width: `${(value / Math.max(...Object.values(bySector))) * 100}%`
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Trades Panel Component
function TradesPanel({ tradesSummary, theme }: { tradesSummary: TradesSummary; theme: string }) {
  return (
    <div
      className="backdrop-blur-md border p-6"
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
      <h3 className="text-sm font-bold uppercase tracking-wider mb-4">Today's Trading Activity</h3>
      <div className="grid grid-cols-5 gap-6 text-xs">
        <div>
          <div className="text-black/40 dark:text-white/40 uppercase tracking-wide mb-2">
            Total Trades
          </div>
          <div className="text-2xl font-bold tabular-nums">{tradesSummary.totalTrades}</div>
        </div>
        <div>
          <div className="text-black/40 dark:text-white/40 uppercase tracking-wide mb-2">
            Buy Trades
          </div>
          <div className="text-2xl font-bold tabular-nums text-[#00FF41]">{tradesSummary.buyTrades}</div>
        </div>
        <div>
          <div className="text-black/40 dark:text-white/40 uppercase tracking-wide mb-2">
            Sell Trades
          </div>
          <div className="text-2xl font-bold tabular-nums text-[#FF0033]">{tradesSummary.sellTrades}</div>
        </div>
        <div>
          <div className="text-black/40 dark:text-white/40 uppercase tracking-wide mb-2">
            Volume
          </div>
          <div className="text-2xl font-bold tabular-nums">{tradesSummary.volume.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-black/40 dark:text-white/40 uppercase tracking-wide mb-2">
            Realized P&L
          </div>
          <div className={`text-2xl font-bold tabular-nums ${
            tradesSummary.totalPnL >= 0 ? 'text-[#00FF41]' : 'text-[#FF0033]'
          }`}>
            {tradesSummary.totalPnL >= 0 ? '+' : ''}{tradesSummary.totalPnL.toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  );
}


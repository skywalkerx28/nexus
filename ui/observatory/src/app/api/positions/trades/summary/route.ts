import { NextResponse } from 'next/server';

/**
 * Trades Summary API Route
 * Returns summary of today's trading activity
 * 
 * Data source: EventLog (Parquet files) via Observability API
 */

const OBSERVABILITY_API_URL = process.env.OBSERVABILITY_API_URL || 'http://localhost:8001';
const API_TOKEN = process.env.OBSERVATORY_API_TOKEN || 'dev-token-12345';

export async function GET() {
  try {
    // Fetch from Observability API (will query EventLog in production)
    const response = await fetch(`${OBSERVABILITY_API_URL}/positions/trades/summary`, {
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
      },
      next: { revalidate: 10 } // Cache for 10 seconds
    });

    if (!response.ok) {
      throw new Error(`Observability API returned ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Failed to fetch trades summary from Observability API:', error);
    
    // Fallback to mock data
    return NextResponse.json(getMockTradesSummary());
  }
}

/**
 * Generate mock trades summary for development
 * In production, this will aggregate EventLog data for today's date
 */
function getMockTradesSummary() {
  const now = new Date();
  
  // Generate realistic intraday trading activity
  const hour = now.getHours();
  const minutesSinceOpen = Math.max(0, (hour - 9) * 60 + now.getMinutes() - 30);
  
  // Scale trades based on time of day (more activity near open/close)
  const tradesFactor = Math.min(1, minutesSinceOpen / 390); // 390 min in trading day
  
  const totalTrades = Math.floor(45 + tradesFactor * 120 + Math.random() * 20);
  const buyTrades = Math.floor(totalTrades * (0.52 + Math.random() * 0.08));
  const sellTrades = totalTrades - buyTrades;
  
  const volume = Math.floor(15000 + tradesFactor * 35000 + Math.random() * 5000);
  const totalPnL = -1200 + Math.random() * 4500; // Slightly positive bias

  return {
    totalTrades,
    buyTrades,
    sellTrades,
    volume,
    totalPnL: Math.round(totalPnL * 100) / 100,
    timestamp: now.toISOString(),
    tradingDate: now.toISOString().split('T')[0],
    source: 'MOCK'
  };
}


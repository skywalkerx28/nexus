import { NextResponse } from 'next/server';


// Market Tickers API Route
// Returns live market data for major indexes and stocks from IBKR feed via Observability API
 

const OBSERVABILITY_API_URL = process.env.OBSERVABILITY_API_URL || 'http://localhost:8001';
const API_TOKEN = process.env.OBSERVATORY_API_TOKEN || 'dev-token-12345';

export async function GET() {
  try {
    // Fetch from Observability API (connected to IBKR feed + Prometheus)
    const response = await fetch(`${OBSERVABILITY_API_URL}/market/tickers`, {
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
      },
      next: { revalidate: 5 } // Cache for 5 seconds
    });

    if (!response.ok) {
      throw new Error(`Observability API returned ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Failed to fetch market tickers from Observability API:', error);
    
    // Fallback to local mock data only on complete API failure
    return NextResponse.json({
      tickers: getMockTickers(),
      timestamp: new Date().toISOString(),
      source: 'MOCK_FALLBACK',
      marketOpen: false,
      error: 'Observability API unavailable'
    });
  }
}

/**
 * Generate mock ticker data with realistic variations
 * This will be replaced with actual IBKR feed data
 */
function getMockTickers() {
  const now = new Date().toISOString();
  const variation = () => (Math.random() - 0.5) * 2; // Random variation between -1 and 1

  return [
    {
      symbol: 'SPX',
      name: 'S&P 500',
      price: 4783.45 + variation() * 10,
      change: 23.67 + variation() * 5,
      changePercent: 0.50 + variation() * 0.2,
      lastUpdate: now,
    },
    {
      symbol: 'DJI',
      name: 'DOW JONES',
      price: 37305.16 + variation() * 20,
      change: -89.22 + variation() * 10,
      changePercent: -0.24 + variation() * 0.1,
      lastUpdate: now,
    },
    {
      symbol: 'IXIC',
      name: 'NASDAQ',
      price: 14813.92 + variation() * 15,
      change: 55.98 + variation() * 8,
      changePercent: 0.38 + variation() * 0.15,
      lastUpdate: now,
    },
    {
      symbol: 'VIX',
      name: 'VOLATILITY',
      price: 13.45 + variation() * 0.5,
      change: -0.87 + variation() * 0.3,
      changePercent: -6.08 + variation() * 2,
      lastUpdate: now,
    },
    {
      symbol: 'AAPL',
      name: 'APPLE',
      price: 178.23 + variation() * 2,
      change: 2.45 + variation(),
      changePercent: 1.39 + variation() * 0.5,
      lastUpdate: now,
    },
    {
      symbol: 'MSFT',
      name: 'MICROSOFT',
      price: 374.56 + variation() * 3,
      change: 4.12 + variation() * 1.5,
      changePercent: 1.11 + variation() * 0.4,
      lastUpdate: now,
    },
    {
      symbol: 'GOOGL',
      name: 'ALPHABET',
      price: 141.80 + variation(),
      change: -0.95 + variation() * 0.5,
      changePercent: -0.66 + variation() * 0.3,
      lastUpdate: now,
    },
    {
      symbol: 'TSLA',
      name: 'TESLA',
      price: 242.84 + variation() * 5,
      change: 8.91 + variation() * 3,
      changePercent: 3.81 + variation(),
      lastUpdate: now,
    },
    {
      symbol: 'NVDA',
      name: 'NVIDIA',
      price: 495.22 + variation() * 8,
      change: 12.34 + variation() * 4,
      changePercent: 2.55 + variation() * 0.8,
      lastUpdate: now,
    },
    {
      symbol: 'META',
      name: 'META',
      price: 353.96 + variation() * 3,
      change: -2.18 + variation(),
      changePercent: -0.61 + variation() * 0.3,
      lastUpdate: now,
    },
  ];
}


import { NextResponse } from 'next/server';

/**
 * Positions API Route
 * Returns current positions with risk metrics
 * 
 * Data source: EventLog (Parquet files) via Observability API
 */

const OBSERVABILITY_API_URL = process.env.OBSERVABILITY_API_URL || 'http://localhost:8001';
const API_TOKEN = process.env.OBSERVATORY_API_TOKEN || 'dev-token-12345';

export async function GET() {
  try {
    // Fetch from Observability API (will query EventLog in production)
    const response = await fetch(`${OBSERVABILITY_API_URL}/positions`, {
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
    console.error('Failed to fetch positions from Observability API:', error);
    
    // Fallback to mock data
    return NextResponse.json(getMockPositions());
  }
}


// Generate mock positions data for development
// In production, this will query EventLog Parquet files

function getMockPositions() {
  const now = new Date();
  
  const positions = [
    {
      symbol: 'AAPL',
      quantity: 500,
      avgPrice: 178.25,
      currentPrice: 185.92,
      marketValue: 92960,
      unrealizedPnL: 3835,
      unrealizedPnLPercent: 4.30,
      venue: 'NASDAQ',
      country: 'USA',
      sector: 'Technology',
      riskScore: 0.15
    },
    {
      symbol: 'MSFT',
      quantity: 300,
      avgPrice: 365.50,
      currentPrice: 378.44,
      marketValue: 113532,
      unrealizedPnL: 3882,
      unrealizedPnLPercent: 3.54,
      venue: 'NASDAQ',
      country: 'USA',
      sector: 'Technology',
      riskScore: 0.12
    },
    {
      symbol: 'GOOGL',
      quantity: 800,
      avgPrice: 142.15,
      currentPrice: 140.23,
      marketValue: 112184,
      unrealizedPnL: -1536,
      unrealizedPnLPercent: -1.35,
      venue: 'NASDAQ',
      country: 'USA',
      sector: 'Technology',
      riskScore: 0.18
    },
    {
      symbol: 'TSLA',
      quantity: -200,
      avgPrice: 255.30,
      currentPrice: 248.15,
      marketValue: -49630,
      unrealizedPnL: 1430,
      unrealizedPnLPercent: 2.80,
      venue: 'NASDAQ',
      country: 'USA',
      sector: 'Automotive',
      riskScore: 0.35
    },
    {
      symbol: 'NVDA',
      quantity: 150,
      avgPrice: 478.90,
      currentPrice: 495.22,
      marketValue: 74283,
      unrealizedPnL: 2448,
      unrealizedPnLPercent: 3.41,
      venue: 'NASDAQ',
      country: 'USA',
      sector: 'Technology',
      riskScore: 0.25
    },
    {
      symbol: 'JPM',
      quantity: 400,
      avgPrice: 148.75,
      currentPrice: 152.30,
      marketValue: 60920,
      unrealizedPnL: 1420,
      unrealizedPnLPercent: 2.39,
      venue: 'NYSE',
      country: 'USA',
      sector: 'Financials',
      riskScore: 0.10
    },
    {
      symbol: 'BA',
      quantity: 250,
      avgPrice: 185.60,
      currentPrice: 192.45,
      marketValue: 48112,
      unrealizedPnL: 1713,
      unrealizedPnLPercent: 3.69,
      venue: 'NYSE',
      country: 'USA',
      sector: 'Industrials',
      riskScore: 0.22
    },
    {
      symbol: 'V',
      quantity: 350,
      avgPrice: 258.30,
      currentPrice: 264.75,
      marketValue: 92663,
      unrealizedPnL: 2258,
      unrealizedPnLPercent: 2.50,
      venue: 'NYSE',
      country: 'USA',
      sector: 'Financials',
      riskScore: 0.11
    },
    {
      symbol: 'DIS',
      quantity: -150,
      avgPrice: 95.20,
      currentPrice: 92.85,
      marketValue: -13928,
      unrealizedPnL: 353,
      unrealizedPnLPercent: 2.47,
      venue: 'NYSE',
      country: 'USA',
      sector: 'Media',
      riskScore: 0.16
    },
    {
      symbol: 'AMZN',
      quantity: 600,
      avgPrice: 148.25,
      currentPrice: 151.94,
      marketValue: 91164,
      unrealizedPnL: 2214,
      unrealizedPnLPercent: 2.49,
      venue: 'NASDAQ',
      country: 'USA',
      sector: 'Technology',
      riskScore: 0.19
    },
  ];

  // Calculate risk metrics
  const totalExposure = positions.reduce((sum, p) => sum + Math.abs(p.marketValue), 0);
  const netExposure = positions.reduce((sum, p) => sum + p.marketValue, 0);
  const grossExposure = positions.reduce((sum, p) => sum + Math.abs(p.marketValue), 0);
  
  // Concentration by sector
  const sectorExposure = positions.reduce((acc, p) => {
    acc[p.sector] = (acc[p.sector] || 0) + Math.abs(p.marketValue);
    return acc;
  }, {} as { [key: string]: number });

  const riskMetrics = {
    totalExposure,
    netExposure,
    grossExposure,
    concentration: sectorExposure,
    varDaily: 2.35, // 95% VaR
    sharpeRatio: 1.85
  };

  return {
    positions,
    riskMetrics,
    timestamp: now.toISOString(),
    source: 'MOCK'
  };
}


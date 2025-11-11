import { NextRequest, NextResponse } from 'next/server';


 // Range Metrics API Route - Proxy to Observability API
 // Handles Prometheus range queries for time series data
 

const OBSERVABILITY_API_URL = process.env.OBSERVABILITY_API_URL || 'http://localhost:8001';
const API_TOKEN = process.env.OBSERVATORY_API_TOKEN || 'dev-token-12345';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, start, end, step } = body;

    if (!query || !start || !end) {
      return NextResponse.json(
        { error: 'Missing required parameters: query, start, end' },
        { status: 400 }
      );
    }

    // Forward to Observability API
    const response = await fetch(`${OBSERVABILITY_API_URL}/metrics/range`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_TOKEN}`,
      },
      body: JSON.stringify({ query, start, end, step: step || '15s' }),
    });

    if (!response.ok) {
      throw new Error(`Observability API error: ${response.statusText}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Failed to query range metrics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch range metrics', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}


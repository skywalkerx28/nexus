import { NextResponse } from 'next/server';


// Venues Status API Route - Proxy to Observability API
// Returns status of all trading venues
 

const OBSERVABILITY_API_URL = process.env.OBSERVABILITY_API_URL || 'http://localhost:8001';
const API_TOKEN = process.env.OBSERVATORY_API_TOKEN || 'dev-token-12345';

export async function GET() {
  try {
    // Fetch venue status from Observability API
    const response = await fetch(`${OBSERVABILITY_API_URL}/venues/status`, {
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Observability API error: ${response.statusText}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Failed to fetch venue status:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch venue status', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}


import { NextResponse } from 'next/server';

/**
 * Storage Statistics API Route
 * Returns size and stats of accumulated Parquet data for training
 * 
 * Queries the data/parquet directory structure to provide:
 * - Total data size (bytes, formatted)
 * - File count
 * - Per-symbol breakdown
 * - Date range coverage
 */

const OBSERVABILITY_API_URL = process.env.OBSERVABILITY_API_URL || 'http://localhost:8001';
const API_TOKEN = process.env.OBSERVATORY_API_TOKEN || 'dev-token-12345';

export async function GET() {
  try {
    // Fetch storage stats from Observability API (no caching)
    const response = await fetch(`${OBSERVABILITY_API_URL}/storage/stats`, {
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
      },
      cache: 'no-store', // Don't cache storage stats
    });

    if (!response.ok) {
      throw new Error(`Observability API returned ${response.status}`);
    }

    const data = await response.json();
    
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });

  } catch (error) {
    console.error('Failed to fetch storage stats from Observability API:', error);
    
    // Fallback to mock data
    return NextResponse.json(getMockStorageStats());
  }
}

/**
 * Generate mock storage stats for development
 * In production, this will scan the actual Parquet directory
 */
function getMockStorageStats() {
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - 7); // 7 days of data
  
  // Mock per-symbol breakdown
  const symbols = ['AAPL', 'MSFT', 'GOOGL', 'SPY', 'QQQ', 'TSLA', 'NVDA'];
  const perSymbol: any = {};
  
  let totalSizeBytes = 0;
  let totalFiles = 0;
  let totalRows = 0;
  
  symbols.forEach(symbol => {
    const sizeBytes = Math.floor(50_000_000 + Math.random() * 150_000_000); // 50-200 MB per symbol
    const files = Math.floor(5 + Math.random() * 10); // 5-15 files
    const rows = Math.floor(500_000 + Math.random() * 1_500_000); // 500k-2M rows
    
    perSymbol[symbol] = {
      sizeBytes,
      sizeMB: (sizeBytes / 1024 / 1024).toFixed(2),
      files,
      rows,
      avgRowSize: Math.floor(sizeBytes / rows),
      compressionRatio: (2.5 + Math.random() * 1.5).toFixed(2), // 2.5-4x compression
    };
    
    totalSizeBytes += sizeBytes;
    totalFiles += files;
    totalRows += rows;
  });

  return {
    total: {
      sizeBytes: totalSizeBytes,
      sizeGB: (totalSizeBytes / 1024 / 1024 / 1024).toFixed(2),
      sizeMB: (totalSizeBytes / 1024 / 1024).toFixed(2),
      files: totalFiles,
      rows: totalRows,
      symbols: symbols.length,
      startDate: startDate.toISOString().split('T')[0],
      endDate: now.toISOString().split('T')[0],
      daysOfData: 7,
    },
    perSymbol,
    timestamp: now.toISOString(),
    source: 'MOCK',
    directory: './data/parquet',
  };
}


/**
 * Venue Data Model
 * Trading venue information including coordinates, timezones, and trading hours
 */

export interface TradingVenue {
  id: string;
  name: string;
  fullName: string;
  coordinates: [number, number]; // [longitude, latitude]
  timezone: string;
  tradingHours: {
    open: string;
    close: string;
  };
  country: string;
  countryCode: string;
}

export interface VenueMetrics {
  venue: string;
  status: 'connected' | 'disconnected' | 'degraded' | 'unknown';
  marketOpen: boolean;
  latencyMs: number | null;
  ingestRate: number | null;
  errorCount: number;
  lastUpdate: string;
}

/**
 * Major global trading venues with precise coordinates
 */
export const TRADING_VENUES: Record<string, TradingVenue> = {
  NYSE: {
    id: 'NYSE',
    name: 'NYSE',
    fullName: 'New York Stock Exchange',
    coordinates: [-74.0112, 40.7074], // 11 Wall Street
    timezone: 'America/New_York',
    tradingHours: { open: '09:30', close: '16:00' },
    country: 'United States',
    countryCode: 'US',
  },
  NASDAQ: {
    id: 'NASDAQ',
    name: 'NASDAQ',
    fullName: 'NASDAQ Stock Market',
    coordinates: [-73.9936, 40.7589], // Times Square
    timezone: 'America/New_York',
    tradingHours: { open: '09:30', close: '16:00' },
    country: 'United States',
    countryCode: 'US',
  },
  LSE: {
    id: 'LSE',
    name: 'LSE',
    fullName: 'London Stock Exchange',
    coordinates: [-0.0909, 51.5143], // Paternoster Square
    timezone: 'Europe/London',
    tradingHours: { open: '08:00', close: '16:30' },
    country: 'United Kingdom',
    countryCode: 'GB',
  },
  TSE: {
    id: 'TSE',
    name: 'TSE',
    fullName: 'Tokyo Stock Exchange',
    coordinates: [139.7771, 35.6737], // Nihonbashi
    timezone: 'Asia/Tokyo',
    tradingHours: { open: '09:00', close: '15:00' },
    country: 'Japan',
    countryCode: 'JP',
  },
  HKEX: {
    id: 'HKEX',
    name: 'HKEX',
    fullName: 'Hong Kong Stock Exchange',
    coordinates: [114.1577, 22.2842], // Exchange Square
    timezone: 'Asia/Hong_Kong',
    tradingHours: { open: '09:30', close: '16:00' },
    country: 'Hong Kong',
    countryCode: 'HK',
  },
  SSE: {
    id: 'SSE',
    name: 'SSE',
    fullName: 'Shanghai Stock Exchange',
    coordinates: [121.4939, 31.2385], // Shanghai
    timezone: 'Asia/Shanghai',
    tradingHours: { open: '09:30', close: '15:00' },
    country: 'China',
    countryCode: 'CN',
  },
  FWB: {
    id: 'FWB',
    name: 'FWB',
    fullName: 'Frankfurt Stock Exchange',
    coordinates: [8.6722, 50.1163], // Frankfurt
    timezone: 'Europe/Berlin',
    tradingHours: { open: '09:00', close: '17:30' },
    country: 'Germany',
    countryCode: 'DE',
  },
  CME: {
    id: 'CME',
    name: 'CME',
    fullName: 'Chicago Mercantile Exchange',
    coordinates: [-87.6321, 41.8782], // CME Center
    timezone: 'America/Chicago',
    tradingHours: { open: '08:30', close: '15:00' },
    country: 'United States',
    countryCode: 'US',
  },
  CBOE: {
    id: 'CBOE',
    name: 'CBOE',
    fullName: 'Chicago Board Options Exchange',
    coordinates: [-87.6321, 41.8786],
    timezone: 'America/Chicago',
    tradingHours: { open: '08:30', close: '15:15' },
    country: 'United States',
    countryCode: 'US',
  },
  EURONEXT: {
    id: 'EURONEXT',
    name: 'Euronext',
    fullName: 'Euronext Paris',
    coordinates: [2.3429, 48.8699], // Paris
    timezone: 'Europe/Paris',
    tradingHours: { open: '09:00', close: '17:30' },
    country: 'France',
    countryCode: 'FR',
  },
};

/**
 * Check if a venue is currently in trading hours
 */
export function isMarketOpen(venue: TradingVenue, now: Date = new Date()): boolean {
  try {
    // Get current time in venue timezone
    const venueTime = new Date(now.toLocaleString('en-US', { timeZone: venue.timezone }));
    const hours = venueTime.getHours();
    const minutes = venueTime.getMinutes();
    const currentMinutes = hours * 60 + minutes;

    // Parse trading hours
    const [openHour, openMin] = venue.tradingHours.open.split(':').map(Number);
    const [closeHour, closeMin] = venue.tradingHours.close.split(':').map(Number);
    const openMinutes = openHour * 60 + openMin;
    const closeMinutes = closeHour * 60 + closeMin;

    // Check if current time is within trading hours
    // Note: This doesn't account for weekends/holidays yet
    const dayOfWeek = venueTime.getDay();
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

    return isWeekday && currentMinutes >= openMinutes && currentMinutes < closeMinutes;
  } catch (error) {
    console.error(`Failed to check market hours for ${venue.name}:`, error);
    return false;
  }
}

// Get status color for a venue based on metrics
// Colors are theme-agnostic and rely on the marker border for theme adaptation
 
export function getVenueStatusColor(
  status: VenueMetrics['status'],
  marketOpen: boolean,
  isDarkMode: boolean = false
): string {
  // Active and trading
  if (status === 'connected' && marketOpen) {
    return isDarkMode ? '#ffffff' : '#000000';
  }
  // Connected but market closed
  if (status === 'connected' && !marketOpen) {
    return isDarkMode ? '#888888' : '#666666';
  }
  // Degraded connection
  if (status === 'degraded') {
    return isDarkMode ? '#666666' : '#999999';
  }
  // Disconnected
  return isDarkMode ? '#444444' : '#CCCCCC';
}

/**
 * Fetch venue metrics from API
 */
export async function fetchVenueMetrics(): Promise<VenueMetrics[]> {
  const response = await fetch('/api/venues/status');
  if (!response.ok) {
    throw new Error(`Failed to fetch venue status: ${response.statusText}`);
  }
  return response.json();
}


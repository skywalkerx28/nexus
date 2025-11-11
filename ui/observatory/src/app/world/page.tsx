"use client";

import { useState, useEffect, useRef } from 'react';
import Map, { Marker, type MapRef } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useTheme } from '@/contexts/ThemeContext';
import { useSidebar } from '@/contexts/SidebarContext';
import { Sidebar } from '@/components/Sidebar';
import { MarketTickerBar } from '@/components/MarketTickerBar';
import { WorldMarketFooter } from '@/components/WorldMarketFooter';
import {
  TRADING_VENUES,
  fetchVenueMetrics,
  isMarketOpen,
  type VenueMetrics,
} from '@/lib/venues';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
const MAPBOX_STYLE_LIGHT =
  process.env.NEXT_PUBLIC_MAPBOX_STYLE_LIGHT ||
  'mapbox://styles/xabouch/cmhtqd0q9002n01sc4ez7bmh4';
const MAPBOX_STYLE_DARK =
  process.env.NEXT_PUBLIC_MAPBOX_STYLE_DARK ||
  'mapbox://styles/xabouch/cmhtqdthi00a401r03vx01xx9';

/**
 * World Page - Global trading venue visualization
 * Mapbox integration with venue status markers
 */
export default function WorldPage() {
  const { theme } = useTheme();
  const { sidebarWidth } = useSidebar();
  const [venueMetrics, setVenueMetrics] = useState<VenueMetrics[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<string | null>(null);
  const mapRef = useRef<MapRef | null>(null);
  const [viewState, setViewState] = useState({
    longitude: 0,
    latitude: 20,
    zoom: 1.5,
  });
  const desiredStyle = theme === 'dark' ? MAPBOX_STYLE_DARK : MAPBOX_STYLE_LIGHT;
  const [activeStyle, setActiveStyle] = useState<string>(desiredStyle);

  useEffect(() => {
    const loadVenueData = async () => {
      try {
        const metrics = await fetchVenueMetrics();
        setVenueMetrics(metrics);
      } catch (error) {
        console.error('Failed to load venue metrics:', error);
      }
    };

    loadVenueData();
    const interval = setInterval(loadVenueData, 10000); // Update every 10s
    return () => clearInterval(interval);
  }, []);

  // Keep style in sync with theme
  useEffect(() => {
    setActiveStyle(desiredStyle);
  }, [desiredStyle]);

  const getVenueMetric = (venueId: string): VenueMetrics | undefined => {
    return venueMetrics.find((m) => m.venue === venueId);
  };

  const selectedVenueData = selectedVenue ? TRADING_VENUES[selectedVenue] : null;
  const selectedVenueMetric = selectedVenue ? getVenueMetric(selectedVenue) : null;

  // Update times for selected venue and markers every second
  const [currentTime, setCurrentTime] = useState(new Date());
  
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (!MAPBOX_TOKEN) {
    return (
      <>
        <Sidebar />
        <div
          className="min-h-screen bg-white dark:bg-black text-black dark:text-white font-mono"
          style={{ paddingLeft: `${sidebarWidth}px` }}
        >
          <header className="border-b border-black/10 dark:border-white/10 bg-white dark:bg-black">
            <div className="px-8 py-4">
              <h1 className="text-xl font-bold tracking-tight">WORLD MAP</h1>
            </div>
          </header>
          <div className="p-8">
            <div className="border border-black/10 dark:border-white/10 p-8 text-center">
              <p className="text-sm text-black/60 dark:text-white/60 mb-4">
                Mapbox token not configured
              </p>
              <p className="text-xs text-black/40 dark:text-white/40">
                Add NEXT_PUBLIC_MAPBOX_TOKEN to your .env.local file
              </p>
            </div>
          </div>
        </div>
      </>
    );
  }

  const mapStyle = activeStyle;

  return (
    <>
      <Sidebar />
      <div
        className="h-screen bg-white dark:bg-black text-black dark:text-white font-mono relative"
        style={{ paddingLeft: `${sidebarWidth}px` }}
      >
        {/* Market Ticker Bar - Fixed at top */}
        <MarketTickerBar className="absolute top-0 left-0 right-0 z-20" sidebarWidth={sidebarWidth} />

        {/* Map container - Full screen with padding for ticker and footer */}
        <div className="absolute inset-0" style={{ paddingTop: '64px', paddingBottom: '112px' }}>
          <Map
            ref={mapRef}
            {...viewState}
            onMove={(evt) => setViewState(evt.viewState)}
            mapStyle={mapStyle}
            mapboxAccessToken={MAPBOX_TOKEN}
            style={{ width: '100%', height: '100%' }}
            attributionControl={true}
            onLoad={() => {
              try {
                const map = mapRef.current?.getMap();
                if (!map) return;
                const style = map.getStyle();
                const visibleLayers =
                  (style?.layers || []).filter((l: any) =>
                    l?.layout && typeof l.layout.visibility !== 'undefined'
                      ? l.layout.visibility !== 'none'
                      : true
                  );
                // If the custom style has no visible layers (e.g., blank Studio style),
                // fall back to a standard Mapbox base style so the map is not blank.
                if (!visibleLayers || visibleLayers.length <= 1) {
                  const fallback =
                    theme === 'dark'
                      ? 'mapbox://styles/mapbox/dark-v11'
                      : 'mapbox://styles/mapbox/light-v11';
                  setActiveStyle(fallback);
                  // eslint-disable-next-line no-console
                  console.warn(
                    '[WorldMap] Custom style appears to have no visible layers. Falling back to',
                    fallback
                  );
                }
              } catch (e) {
                // eslint-disable-next-line no-console
                console.error('[WorldMap] Failed to validate map style:', e);
              }
            }}
          >
            {/* Venue markers with badges */}
            {Object.values(TRADING_VENUES).map((venue) => {
              const metric = getVenueMetric(venue.id);
              const marketOpen = isMarketOpen(venue);
              const status = metric?.status || 'unknown';
              
              // Matrix-inspired colors
              const dotColor = marketOpen ? '#00FF41' : '#FF0033'; // Matrix green / red
              const isConnected = status === 'connected';


              return (
                <Marker
                  key={venue.id}
                  longitude={venue.coordinates[0]}
                  latitude={venue.coordinates[1]}
                  anchor="bottom-left"
                  onClick={(e) => {
                    e.originalEvent.stopPropagation();
                    setSelectedVenue(venue.id);
                  }}
                >
                  <div className="cursor-pointer flex items-center gap-2 group">
                    {/* Status dot with glow */}
                    <div
                      className="w-4 h-4 rounded-full flex-shrink-0 transition-all duration-300 group-hover:scale-125"
                      style={{
                        backgroundColor: dotColor,
                        border: `2px solid ${theme === 'dark' ? '#ffffff' : '#000000'}`,
                        boxShadow: marketOpen
                          ? `0 0 12px ${dotColor}, 0 0 6px ${dotColor}, inset 0 0 4px rgba(255,255,255,0.3)`
                          : `0 0 8px ${dotColor}, inset 0 0 4px rgba(255,255,255,0.2)`,
                        opacity: isConnected ? 1 : 0.5,
                      }}
                    />
                    
                    {/* Small compact badge */}
                    <div
                      className="backdrop-blur-sm border px-2 py-1 transition-all duration-200 group-hover:backdrop-blur-md"
                      style={{
                        backgroundColor: theme === 'dark'
                          ? 'rgba(0, 0, 0, 0.6)'
                          : 'rgba(255, 255, 255, 0.6)',
                        borderColor: theme === 'dark'
                          ? 'rgba(255, 255, 255, 0.15)'
                          : 'rgba(0, 0, 0, 0.15)',
                        boxShadow: theme === 'dark'
                          ? '0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                          : '0 2px 8px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.8)',
                        borderRadius: '4px',
                      }}
                    >
                      <span className="text-[10px] font-bold text-black dark:text-white font-mono uppercase tracking-wide whitespace-nowrap">
                        {venue.name}
                      </span>
                    </div>
                  </div>
                </Marker>
              );
            })}
          </Map>

          {/* Glassmorphic Detail Panel - Slides in from left */}
          {selectedVenueData && (() => {
            // Calculate times for selected venue
            const venueLocalTime = currentTime.toLocaleTimeString('en-US', {
              timeZone: selectedVenueData.timezone,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false,
            });
            const utcTime = currentTime.toLocaleTimeString('en-US', {
              timeZone: 'UTC',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false,
            });

            return (
              <div
                className="absolute w-80 max-h-[65vh] backdrop-blur-xl border rounded-lg transition-all duration-500 ease-out overflow-y-auto z-10"
                style={{
                  left: `${sidebarWidth + 24}px`,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  backgroundColor: theme === 'dark'
                    ? 'rgba(0, 0, 0, 0.9)'
                    : 'rgba(255, 255, 255, 0.9)',
                  borderColor: theme === 'dark'
                    ? 'rgba(255, 255, 255, 0.2)'
                    : 'rgba(0, 0, 0, 0.2)',
                  boxShadow: theme === 'dark'
                    ? '0 16px 64px rgba(0, 0, 0, 0.7), inset 0 1px 2px rgba(255, 255, 255, 0.15)'
                    : '0 16px 64px rgba(0, 0, 0, 0.25), inset 0 1px 2px rgba(255, 255, 255, 1)',
                }}
              >
                {/* Panel Header */}
              <div className="sticky top-0 z-10 backdrop-blur-xl border-b p-4"
                style={{
                  backgroundColor: theme === 'dark'
                    ? 'rgba(0, 0, 0, 0.9)'
                    : 'rgba(255, 255, 255, 0.9)',
                  borderColor: theme === 'dark'
                    ? 'rgba(255, 255, 255, 0.1)'
                    : 'rgba(0, 0, 0, 0.1)',
                }}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor: isMarketOpen(selectedVenueData) ? '#00FF41' : '#FF0033',
                        boxShadow: isMarketOpen(selectedVenueData)
                          ? '0 0 10px #00FF41'
                          : '0 0 8px #FF0033',
                      }}
                    />
                    <h2 className="text-xl font-bold text-black dark:text-white font-mono tracking-tight">
                      {selectedVenueData.name}
                    </h2>
                  </div>
                  <button
                    onClick={() => setSelectedVenue(null)}
                    className="text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white transition-colors text-sm p-1"
                  >
                    ✕
                  </button>
                </div>
                <p className="text-xs text-black/60 dark:text-white/60 font-mono">
                  {selectedVenueData.fullName}
                </p>
                <p className="text-[10px] text-black/40 dark:text-white/40 font-mono mt-0.5">
                  {selectedVenueData.country}
                </p>
              </div>

              {/* Panel Content */}
              <div className="p-4 space-y-5 font-mono">
                {/* Market Status Section */}
                <div>
                  <h3 className="text-[10px] text-black/40 dark:text-white/40 uppercase tracking-wider mb-2">
                    Market Status
                  </h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-black/60 dark:text-white/60 uppercase tracking-wide">
                        Status
                      </span>
                      <span
                        className="text-sm font-bold uppercase tracking-wide px-2 py-0.5 rounded text-[11px]"
                        style={{
                          color: isMarketOpen(selectedVenueData) ? '#00FF41' : '#FF0033',
                          backgroundColor: theme === 'dark'
                            ? 'rgba(255, 255, 255, 0.05)'
                            : 'rgba(0, 0, 0, 0.05)',
                          textShadow: `0 0 10px ${isMarketOpen(selectedVenueData) ? '#00FF41' : '#FF0033'}`,
                        }}
                      >
                        {isMarketOpen(selectedVenueData) ? 'OPEN' : 'CLOSED'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-black/60 dark:text-white/60 uppercase tracking-wide">
                        Connection
                      </span>
                      <span className="text-xs font-bold text-black dark:text-white uppercase tracking-wide">
                        {selectedVenueMetric?.status || 'UNKNOWN'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Trading Hours Section */}
                <div
                  className="border-t pt-4"
                  style={{
                    borderColor: theme === 'dark'
                      ? 'rgba(255, 255, 255, 0.1)'
                      : 'rgba(0, 0, 0, 0.1)',
                  }}
                >
                  <h3 className="text-[10px] text-black/40 dark:text-white/40 uppercase tracking-wider mb-2">
                    Trading Hours
                  </h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-black/60 dark:text-white/60">
                        Opens
                      </span>
                      <span className="text-sm font-bold text-black dark:text-white tabular-nums">
                        {selectedVenueData.tradingHours.open}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-black/60 dark:text-white/60">
                        Closes
                      </span>
                      <span className="text-sm font-bold text-black dark:text-white tabular-nums">
                        {selectedVenueData.tradingHours.close}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-black/60 dark:text-white/60">
                        Timezone
                      </span>
                      <span className="text-sm text-black dark:text-white">
                        {selectedVenueData.timezone}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Current Time Section */}
                <div
                  className="border-t pt-4"
                  style={{
                    borderColor: theme === 'dark'
                      ? 'rgba(255, 255, 255, 0.1)'
                      : 'rgba(0, 0, 0, 0.1)',
                  }}
                >
                  <h3 className="text-[10px] text-black/40 dark:text-white/40 uppercase tracking-wider mb-2">
                    Current Time
                  </h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-black/60 dark:text-white/60">
                        Local ({selectedVenueData.timezone.split('/')[1]})
                      </span>
                      <span className="text-lg font-bold text-black dark:text-white tabular-nums">
                        {venueLocalTime}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-black/60 dark:text-white/60">
                        UTC
                      </span>
                      <span className="text-lg font-bold text-black dark:text-white tabular-nums">
                        {utcTime}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Performance Metrics Section */}
                {(selectedVenueMetric?.latencyMs !== null || selectedVenueMetric?.ingestRate !== null) && (
                  <div
                    className="border-t pt-4"
                    style={{
                      borderColor: theme === 'dark'
                        ? 'rgba(255, 255, 255, 0.1)'
                        : 'rgba(0, 0, 0, 0.1)',
                    }}
                  >
                    <h3 className="text-[10px] text-black/40 dark:text-white/40 uppercase tracking-wider mb-2">
                      Performance Metrics
                    </h3>
                    <div className="space-y-3">
                      {selectedVenueMetric?.latencyMs !== null && selectedVenueMetric?.latencyMs !== undefined && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-black/60 dark:text-white/60">
                              Network Latency
                            </span>
                            <span
                              className="text-xl font-bold tabular-nums"
                              style={{
                                color: selectedVenueMetric.latencyMs < 50 
                                  ? '#00FF41' 
                                  : selectedVenueMetric.latencyMs < 100 
                                  ? '#FFA500' 
                                  : '#FF0033',
                                textShadow: `0 0 10px ${selectedVenueMetric.latencyMs < 50 ? '#00FF41' : selectedVenueMetric.latencyMs < 100 ? '#FFA500' : '#FF0033'}`,
                              }}
                            >
                              {selectedVenueMetric.latencyMs.toFixed(1)}
                              <span className="text-sm ml-1">ms</span>
                            </span>
                          </div>
                          {/* Latency quality bar */}
                          <div className="h-1 rounded-full overflow-hidden"
                            style={{
                              backgroundColor: theme === 'dark'
                                ? 'rgba(255, 255, 255, 0.1)'
                                : 'rgba(0, 0, 0, 0.1)',
                            }}
                          >
                            <div
                              className="h-full transition-all duration-500"
                              style={{
                                width: `${Math.min(100, (1 - selectedVenueMetric.latencyMs / 200) * 100)}%`,
                                backgroundColor: selectedVenueMetric.latencyMs < 50 
                                  ? '#00FF41' 
                                  : selectedVenueMetric.latencyMs < 100 
                                  ? '#FFA500' 
                                  : '#FF0033',
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {selectedVenueMetric?.ingestRate !== null && selectedVenueMetric?.ingestRate !== undefined && (
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-black/60 dark:text-white/60">
                              Ingest Rate
                            </span>
                            <span className="text-xl font-bold text-black dark:text-white tabular-nums">
                              {selectedVenueMetric.ingestRate.toFixed(0)}
                              <span className="text-sm ml-1 text-black/40 dark:text-white/40">evt/s</span>
                            </span>
                          </div>
                        </div>
                      )}

                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-black/60 dark:text-white/60">
                            Errors
                          </span>
                          <span
                            className="text-xl font-bold tabular-nums"
                            style={{
                              color: (selectedVenueMetric?.errorCount || 0) > 0 ? '#FF0033' : '#00FF41',
                            }}
                          >
                            {selectedVenueMetric?.errorCount || 0}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Location Info Section */}
                <div
                  className="border-t pt-4"
                  style={{
                    borderColor: theme === 'dark'
                      ? 'rgba(255, 255, 255, 0.1)'
                      : 'rgba(0, 0, 0, 0.1)',
                  }}
                >
                  <h3 className="text-[10px] text-black/40 dark:text-white/40 uppercase tracking-wider mb-2">
                    Coordinates
                  </h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-black/60 dark:text-white/60">
                        Longitude
                      </span>
                      <span className="text-sm font-mono text-black dark:text-white tabular-nums">
                        {selectedVenueData.coordinates[0].toFixed(4)}°
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-black/60 dark:text-white/60">
                        Latitude
                      </span>
                      <span className="text-sm font-mono text-black dark:text-white tabular-nums">
                        {selectedVenueData.coordinates[1].toFixed(4)}°
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            );
          })()}

          {/* Top right controls */}
          <div className="absolute top-4 right-4 flex flex-col gap-3">
            {/* Venue count */}
            <div
              className="backdrop-blur-md border px-4 py-2"
              style={{
                backgroundColor: theme === 'dark'
                  ? 'rgba(0, 0, 0, 0.75)'
                  : 'rgba(255, 255, 255, 0.75)',
                borderColor: theme === 'dark'
                  ? 'rgba(255, 255, 255, 0.2)'
                  : 'rgba(0, 0, 0, 0.2)',
                boxShadow: theme === 'dark'
                  ? '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.1)'
                  : '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 1px rgba(255, 255, 255, 0.8)',
                borderRadius: '6px',
              }}
            >
              <span className="text-xs text-black/80 dark:text-white/80 uppercase tracking-wider font-mono">
                {venueMetrics.length} Venues
              </span>
            </div>
          </div>
        </div>

        {/* World Market Footer - Fixed at bottom */}
        <WorldMarketFooter 
          className="absolute bottom-0 left-0 right-0 z-20" 
          sidebarWidth={sidebarWidth}
          venueMetrics={venueMetrics}
        />
      </div>
    </>
  );
}


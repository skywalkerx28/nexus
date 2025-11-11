import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * WebSocket hook for real-time event streaming
 * Handles connection, reconnection, and message parsing
 */

export interface StreamEvent {
  timestamp: string;
  symbol: string;
  type: 'TRADE' | 'DEPTH_UPDATE';
  price: number;
  size: number;
  venue: string;
  seq: number;
}

interface UseEventStreamOptions {
  enabled?: boolean;
  maxEvents?: number;
  reconnectDelay?: number;
}

export function useEventStream(options: UseEventStreamOptions = {}) {
  const {
    enabled = true,
    maxEvents = 100,
    reconnectDelay = 5000,
  } = options;

  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (!enabled) return;

    try {
      // WebSocket endpoint (to be implemented in backend)
      const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8001/ws/events';
      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setError(null);
      };

      ws.current.onmessage = (event) => {
        try {
          const streamEvent: StreamEvent = JSON.parse(event.data);
          setEvents(prev => [streamEvent, ...prev].slice(0, maxEvents));
        } catch (err) {
          console.error('Failed to parse event:', err);
        }
      };

      ws.current.onerror = (err) => {
        console.error('WebSocket error:', err);
        setError('WebSocket connection error');
      };

      ws.current.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        
        // Attempt reconnection
        if (enabled) {
          reconnectTimeout.current = setTimeout(connect, reconnectDelay);
        }
      };
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      
      // Attempt reconnection
      if (enabled) {
        reconnectTimeout.current = setTimeout(connect, reconnectDelay);
      }
    }
  }, [enabled, maxEvents, reconnectDelay]);

  const disconnect = useCallback(() => {
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }
    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  return {
    events,
    isConnected,
    error,
    clearEvents,
  };
}


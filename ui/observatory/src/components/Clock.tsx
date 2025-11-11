"use client";

import { useState, useEffect } from 'react';

/**
 * Clock Component
 * Displays current time in both local timezone and UTC
 */
export function Clock() {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const localTime = currentTime.toLocaleTimeString('en-US', { 
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const utcTime = currentTime.toLocaleTimeString('en-US', { 
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC'
  });

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const timezoneAbbr = currentTime.toLocaleTimeString('en-US', { 
    timeZoneName: 'short' 
  }).split(' ').pop() || '';

  return (
    <div className="flex flex-col items-end gap-0.5 font-mono text-xs">
      <div className="flex items-center gap-2">
        <span className="text-black/40 dark:text-white/40 uppercase tracking-wider text-[10px]">
          {timezoneAbbr}
        </span>
        <span className="text-black dark:text-white tabular-nums font-medium">
          {localTime}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-black/40 dark:text-white/40 uppercase tracking-wider text-[10px]">
          UTC
        </span>
        <span className="text-black/60 dark:text-white/60 tabular-nums">
          {utcTime}
        </span>
      </div>
    </div>
  );
}


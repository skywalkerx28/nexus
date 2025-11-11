"""
Venue Timezone Mapping - Exchange timezone lookup for accurate event timestamps.

Purpose: Convert naive datetime from broker ticks to timezone-aware UTC timestamps.
Ensures accurate event timing across venues and DST transitions.

Conforms to: context.md "Keep both monotonic and wall-clock timestamps" principle.
"""

from datetime import datetime, timezone
from typing import Optional
import pytz

# Comprehensive venue->timezone mapping
# Based on: https://www.tradinghours.com/exchanges
VENUE_TIMEZONES = {
    # US Exchanges
    "SMART": "America/New_York",  # IB's smart routing (use NYSE as reference)
    "NYSE": "America/New_York",
    "NASDAQ": "America/New_York",
    "ARCA": "America/New_York",
    "BATS": "America/New_York",
    "IEX": "America/New_York",
    "AMEX": "America/New_York",
    "CBOE": "America/Chicago",
    
    # Canadian Exchanges
    "TSE": "America/Toronto",
    "VENTURE": "America/Vancouver",
    
    # European Exchanges
    "LSE": "Europe/London",
    "LSEETF": "Europe/London",
    "XETRA": "Europe/Berlin",
    "FWB": "Europe/Berlin",  # Frankfurt
    "AEB": "Europe/Amsterdam",
    "SWB": "Europe/Zurich",
    "SFB": "Europe/Stockholm",
    "EBS": "Europe/Zurich",
    "IBIS": "Europe/Berlin",
    "MEXI": "Europe/Moscow",
    
    # Asian Exchanges
    "SEHK": "Asia/Hong_Kong",
    "HKFE": "Asia/Hong_Kong",
    "TSE.JPN": "Asia/Tokyo",
    "OSE.JPN": "Asia/Tokyo",
    "SGX": "Asia/Singapore",
    "KRX": "Asia/Seoul",
    "NSE": "Asia/Kolkata",
    "BSE": "Asia/Kolkata",
    "ASX": "Australia/Sydney",
    
    # Other Americas
    "BOVESPA": "America/Sao_Paulo",
    "BMV": "America/Mexico_City",
    
    # Default fallback (if venue unknown)
    "DEFAULT": "UTC",
}


def get_venue_timezone(venue: str) -> pytz.timezone:
    """
    Get pytz timezone for a venue code.
    
    Args:
        venue: Venue code (e.g., "SMART", "NYSE", "LSE")
    
    Returns:
        pytz timezone object (defaults to UTC if venue unknown)
    """
    tz_name = VENUE_TIMEZONES.get(venue, VENUE_TIMEZONES["DEFAULT"])
    return pytz.timezone(tz_name)


def localize_event_time(
    dt: datetime,
    venue: str,
    fallback_ns: Optional[int] = None
) -> int:
    """
    Convert a datetime to UTC nanoseconds, handling timezone awareness.
    
    Process:
    1. If dt is None -> use fallback_ns
    2. If dt is timezone-aware -> convert to UTC
    3. If dt is naive -> localize to venue timezone, then convert to UTC
    
    Args:
        dt: Datetime from broker tick (may be naive or aware)
        venue: Venue code for timezone lookup
        fallback_ns: Fallback timestamp in nanoseconds (if dt is None)
    
    Returns:
        UTC timestamp in nanoseconds
    
    Example:
        >>> from datetime import datetime
        >>> dt_naive = datetime(2025, 11, 10, 9, 30, 0)  # 9:30 AM (naive)
        >>> ts_ns = localize_event_time(dt_naive, "NYSE", None)
        >>> # Converts to UTC: 9:30 AM EST -> 2:30 PM UTC (approx)
    """
    import math
    
    # Handle None/missing datetime
    if dt is None:
        if fallback_ns is None:
            raise ValueError("Both dt and fallback_ns are None")
        return fallback_ns
    
    # Validate it's actually a datetime
    if not isinstance(dt, datetime):
        if fallback_ns is None:
            raise ValueError(f"dt is not a datetime: {type(dt)}")
        return fallback_ns
    
    try:
        # Case 1: Already timezone-aware
        if dt.tzinfo is not None and dt.tzinfo.utcoffset(dt) is not None:
            # Convert to UTC
            dt_utc = dt.astimezone(timezone.utc)
            timestamp = dt_utc.timestamp()
            
            # Validate finite
            if not math.isfinite(timestamp):
                if fallback_ns is None:
                    raise ValueError(f"Non-finite timestamp: {timestamp}")
                return fallback_ns
            
            return int(timestamp * 1e9)
        
        # Case 2: Naive datetime - localize to venue timezone
        venue_tz = get_venue_timezone(venue)
        
        # Localize (handle DST ambiguity with is_dst=None to raise on ambiguous times)
        try:
            dt_local = venue_tz.localize(dt, is_dst=None)
        except pytz.exceptions.AmbiguousTimeError:
            # During DST transition, assume standard time
            dt_local = venue_tz.localize(dt, is_dst=False)
        except pytz.exceptions.NonExistentTimeError:
            # During DST spring forward, use the later time
            dt_local = venue_tz.localize(dt, is_dst=True)
        
        # Convert to UTC
        dt_utc = dt_local.astimezone(timezone.utc)
        timestamp = dt_utc.timestamp()
        
        # Validate finite
        if not math.isfinite(timestamp):
            if fallback_ns is None:
                raise ValueError(f"Non-finite timestamp: {timestamp}")
            return fallback_ns
        
        return int(timestamp * 1e9)
    
    except Exception as e:
        # On any error, use fallback
        if fallback_ns is None:
            raise ValueError(f"Failed to localize datetime: {e}")
        return fallback_ns


def validate_venue_coverage():
    """
    Validate that all venue timezones are valid pytz timezones.
    Call this during startup to catch configuration errors early.
    """
    errors = []
    for venue, tz_name in VENUE_TIMEZONES.items():
        try:
            pytz.timezone(tz_name)
        except pytz.exceptions.UnknownTimeZoneError:
            errors.append(f"Invalid timezone for {venue}: {tz_name}")
    
    if errors:
        raise ValueError(f"Venue timezone configuration errors:\n" + "\n".join(errors))
    
    return True


# Validate on module import
validate_venue_coverage()


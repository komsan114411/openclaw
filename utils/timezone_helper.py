"""
Timezone Helper Utilities for Thailand (Asia/Bangkok)
Provides centralized timezone management to ensure all datetime operations use Thailand time.
"""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from typing import Optional

# Thailand timezone
THAILAND_TZ = ZoneInfo("Asia/Bangkok")


def get_thailand_now() -> datetime:
    """
    Get current datetime in Thailand timezone.
    
    Returns:
        datetime: Current time in Asia/Bangkok timezone
    """
    return datetime.now(THAILAND_TZ)


def convert_to_thailand(dt: datetime) -> datetime:
    """
    Convert any datetime to Thailand timezone.
    
    Args:
        dt: datetime object (can be timezone-aware or naive)
        
    Returns:
        datetime: datetime converted to Thailand timezone
    """
    if dt is None:
        return None
    
    # If naive datetime, assume it's UTC and convert
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=ZoneInfo("UTC"))
    
    # Convert to Thailand timezone
    return dt.astimezone(THAILAND_TZ)


def format_thai_datetime(dt: datetime, format_str: str = "%d/%m/%Y %H:%M") -> str:
    """
    Format datetime in Thailand timezone with Thai format.
    
    Args:
        dt: datetime object
        format_str: strftime format string (default: "dd/mm/yyyy HH:MM")
        
    Returns:
        str: Formatted datetime string
    """
    if dt is None:
        return ""
    
    # Convert to Thailand time first
    thai_dt = convert_to_thailand(dt)
    return thai_dt.strftime(format_str)


def get_thai_timestamp() -> float:
    """
    Get current timestamp in Thailand timezone.
    
    Returns:
        float: Unix timestamp
    """
    return get_thailand_now().timestamp()


def parse_thai_datetime(date_str: str, format_str: str = "%d/%m/%Y %H:%M") -> Optional[datetime]:
    """
    Parse Thai datetime string to datetime object.
    
    Args:
        date_str: Date string in Thai format
        format_str: strftime format string
        
    Returns:
        datetime: Parsed datetime in Thailand timezone, or None if parsing fails
    """
    try:
        dt = datetime.strptime(date_str, format_str)
        return dt.replace(tzinfo=THAILAND_TZ)
    except (ValueError, TypeError):
        return None


def get_thailand_date_range(days: int = 0) -> tuple[datetime, datetime]:
    """
    Get date range in Thailand timezone.
    
    Args:
        days: Number of days from today (negative for past, positive for future)
        
    Returns:
        tuple: (start_date, end_date) both in Thailand timezone
    """
    now = get_thailand_now()
    target_date = now + timedelta(days=days)
    
    # Start of day
    start = target_date.replace(hour=0, minute=0, second=0, microsecond=0)
    # End of day
    end = target_date.replace(hour=23, minute=59, second=59, microsecond=999999)
    
    return start, end


# Compatibility functions for easy migration
def thailand_utcnow():
    """
    Replacement for datetime.utcnow() that returns Thailand time.
    Use this to replace datetime.utcnow() calls.
    
    Returns:
        datetime: Current time in Thailand timezone (naive)
    """
    return get_thailand_now().replace(tzinfo=None)


def thailand_now():
    """
    Replacement for datetime.now() that returns Thailand time.
    
    Returns:
        datetime: Current time in Thailand timezone (naive)
    """
    return get_thailand_now().replace(tzinfo=None)

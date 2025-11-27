"""
Rate Limiting Middleware
Fixes Bug #9: Rate limiting for webhooks
"""
import logging
import time
from typing import Dict, Tuple
from collections import defaultdict
from datetime import datetime, timedelta

logger = logging.getLogger("rate_limiter")

class RateLimiter:
    """Simple in-memory rate limiter"""
    
    def __init__(self):
        # Store: {key: [(timestamp1, count1), (timestamp2, count2), ...]}
        self.requests = defaultdict(list)
        self.cleanup_interval = 60  # Clean up old entries every 60 seconds
        self.last_cleanup = time.time()
    
    def is_allowed(
        self,
        key: str,
        max_requests: int = 100,
        window_seconds: int = 60
    ) -> Tuple[bool, Dict[str, any]]:
        """
        Check if request is allowed under rate limit
        
        Args:
            key: Unique identifier (e.g., IP address, account_id)
            max_requests: Maximum requests allowed in window
            window_seconds: Time window in seconds
            
        Returns:
            (is_allowed, info_dict)
        """
        current_time = time.time()
        window_start = current_time - window_seconds
        
        # Clean up old requests
        self.requests[key] = [
            req_time for req_time in self.requests[key]
            if req_time > window_start
        ]
        
        # Count requests in current window
        request_count = len(self.requests[key])
        
        # Check limit
        if request_count >= max_requests:
            logger.warning(f"⚠️ Rate limit exceeded for {key}: {request_count}/{max_requests}")
            return False, {
                "allowed": False,
                "current": request_count,
                "limit": max_requests,
                "reset_in": window_seconds - (current_time - self.requests[key][0]) if self.requests[key] else window_seconds
            }
        
        # Add current request
        self.requests[key].append(current_time)
        
        # Periodic cleanup
        if current_time - self.last_cleanup > self.cleanup_interval:
            self._cleanup_old_entries()
            self.last_cleanup = current_time
        
        return True, {
            "allowed": True,
            "current": request_count + 1,
            "limit": max_requests,
            "remaining": max_requests - (request_count + 1)
        }
    
    def _cleanup_old_entries(self):
        """Remove entries older than 5 minutes"""
        cutoff = time.time() - 300  # 5 minutes
        keys_to_remove = []
        
        for key, timestamps in self.requests.items():
            # Filter out old timestamps
            self.requests[key] = [t for t in timestamps if t > cutoff]
            
            # Remove empty keys
            if not self.requests[key]:
                keys_to_remove.append(key)
        
        for key in keys_to_remove:
            del self.requests[key]
        
        if keys_to_remove:
            logger.info(f"🧹 Cleaned up {len(keys_to_remove)} rate limiter entries")

# Global instance
_rate_limiter = None

def get_rate_limiter() -> RateLimiter:
    """Get or create global RateLimiter instance"""
    global _rate_limiter
    if _rate_limiter is None:
        _rate_limiter = RateLimiter()
        logger.info("✅ Rate limiter initialized")
    return _rate_limiter

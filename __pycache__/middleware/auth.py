"""
Authentication Middleware
"""
import logging
from typing import Optional, Callable
from fastapi import Request, HTTPException, status
from fastapi.responses import RedirectResponse
from functools import wraps

logger = logging.getLogger("auth_middleware")

class AuthMiddleware:
    """Authentication and Authorization Middleware"""
    
    def __init__(self, session_manager):
        self.session_manager = session_manager
    
    def get_current_user(self, request: Request) -> Optional[dict]:
        """Get current authenticated user from session"""
        try:
            session_id = request.cookies.get("session_id")
            if not session_id:
                return None
            
            session = self.session_manager.get_session(session_id)
            if not session:
                return None
            
            return {
                "user_id": session["user_id"],
                "username": session["username"],
                "role": session["role"]
            }
        except Exception as e:
            logger.error(f"❌ Error getting current user: {e}")
            return None
    
    def require_auth(self, redirect_to_login: bool = True):
        """Decorator to require authentication"""
        def decorator(func: Callable):
            @wraps(func)
            async def wrapper(request: Request, *args, **kwargs):
                user = self.get_current_user(request)
                
                if not user:
                    if redirect_to_login:
                        return RedirectResponse(url="/login", status_code=status.HTTP_302_FOUND)
                    else:
                        raise HTTPException(
                            status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Authentication required"
                        )
                
                # Add user to request state
                request.state.user = user
                return await func(request, *args, **kwargs)
            
            return wrapper
        return decorator
    
    def require_role(self, required_role: str, redirect_to_login: bool = True):
        """Decorator to require specific role"""
        def decorator(func: Callable):
            @wraps(func)
            async def wrapper(request: Request, *args, **kwargs):
                user = self.get_current_user(request)
                
                if not user:
                    if redirect_to_login:
                        return RedirectResponse(url="/login", status_code=status.HTTP_302_FOUND)
                    else:
                        raise HTTPException(
                            status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Authentication required"
                        )
                
                if user["role"] != required_role and user["role"] != "admin":
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Insufficient permissions"
                    )
                
                # Add user to request state
                request.state.user = user
                return await func(request, *args, **kwargs)
            
            return wrapper
        return decorator

def get_current_user_from_request(request: Request) -> Optional[dict]:
    """Helper function to get current user from request state"""
    return getattr(request.state, "user", None)


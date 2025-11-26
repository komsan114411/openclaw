from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from typing import Dict, Any
import os
from models.user import UserRole

# Initialize templates
templates = Jinja2Templates(directory="templates")

def register_ui_routes(app):
    """Register UI routes for SaaS features"""
    
    # --- Admin UI Routes ---
    
    @app.get("/admin/packages", response_class=HTMLResponse)
    async def admin_packages_page(request: Request):
        """Render admin packages management page"""
        try:
            # Check authentication and authorization
            user = app.state.auth.get_current_user(request)
            if not user:
                return RedirectResponse(url="/login", status_code=302)
            
            if user.get("role") not in ["admin", UserRole.ADMIN]:
                raise HTTPException(status_code=403, detail="Insufficient permissions")
            
            return templates.TemplateResponse("admin/packages.html", {
                "request": request,
                "user": user
            })
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error loading page: {str(e)}")

    @app.get("/admin/system-settings", response_class=HTMLResponse)
    async def admin_settings_page(request: Request):
        """Render admin system settings page"""
        try:
            # Check authentication and authorization
            user = app.state.auth.get_current_user(request)
            if not user:
                return RedirectResponse(url="/login", status_code=302)
            
            if user.get("role") not in ["admin", UserRole.ADMIN]:
                raise HTTPException(status_code=403, detail="Insufficient permissions")
            
            return templates.TemplateResponse("admin/system_settings.html", {
                "request": request,
                "user": user
            })
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error loading page: {str(e)}")

    @app.get("/admin/payments", response_class=HTMLResponse)
    async def admin_payments_page(request: Request):
        """Render admin payments review page"""
        try:
            # Check authentication and authorization
            user = app.state.auth.get_current_user(request)
            if not user:
                return RedirectResponse(url="/login", status_code=302)
            
            if user.get("role") not in ["admin", UserRole.ADMIN]:
                raise HTTPException(status_code=403, detail="Insufficient permissions")
            
            return templates.TemplateResponse("admin/payments.html", {
                "request": request,
                "user": user
            })
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error loading page: {str(e)}")

    # --- User UI Routes ---
    
    @app.get("/user/packages", response_class=HTMLResponse)
    async def user_packages_page(request: Request):
        """Render user package selection page"""
        try:
            # Check authentication
            user = app.state.auth.get_current_user(request)
            if not user:
                return RedirectResponse(url="/login", status_code=302)
            
            return templates.TemplateResponse("user/packages.html", {
                "request": request,
                "user": user
            })
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error loading page: {str(e)}")

    @app.get("/user/quota", response_class=HTMLResponse)
    async def user_quota_page(request: Request):
        """Render user quota dashboard page"""
        try:
            # Check authentication
            user = app.state.auth.get_current_user(request)
            if not user:
                return RedirectResponse(url="/login", status_code=302)
            
            return templates.TemplateResponse("user/quota.html", {
                "request": request,
                "user": user
            })
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error loading page: {str(e)}")

    # Note: /user/dashboard is likely already handled in main.py or another route file
    # If not, we could add it here, but we saw it exists.

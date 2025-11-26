from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from typing import Dict, Any
import os

# Initialize templates
templates = Jinja2Templates(directory="templates")

def register_ui_routes(app):
    """Register UI routes for SaaS features"""
    
    # --- Admin UI Routes ---
    
    @app.get("/admin/packages", response_class=HTMLResponse)
    async def admin_packages_page(request: Request):
        """Render admin packages management page"""
        # In a real app, you'd check admin permissions here
        # user = await get_current_user(request)
        # if not user.is_admin: raise HTTPException...
        return templates.TemplateResponse("admin/packages.html", {"request": request})

    @app.get("/admin/system-settings", response_class=HTMLResponse)
    async def admin_settings_page(request: Request):
        """Render admin system settings page"""
        return templates.TemplateResponse("admin/system_settings.html", {"request": request})

    @app.get("/admin/payments", response_class=HTMLResponse)
    async def admin_payments_page(request: Request):
        """Render admin payments review page"""
        return templates.TemplateResponse("admin/payments.html", {"request": request})

    # --- User UI Routes ---
    
    @app.get("/user/packages", response_class=HTMLResponse)
    async def user_packages_page(request: Request):
        """Render user package selection page"""
        return templates.TemplateResponse("user/packages.html", {"request": request})

    @app.get("/user/quota", response_class=HTMLResponse)
    async def user_quota_page(request: Request):
        """Render user quota dashboard page"""
        return templates.TemplateResponse("user/quota.html", {"request": request})

    # Note: /user/dashboard is likely already handled in main.py or another route file
    # If not, we could add it here, but we saw it exists.

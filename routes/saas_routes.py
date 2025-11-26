"""
SaaS Backend API Routes
Package Management, System Settings, Payments, Subscriptions
"""

from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from models.user import UserRole
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

def register_saas_routes(app):
    '''Register all SaaS routes to the FastAPI app'''
    
    # ==================== Package Management APIs ====================
    
    @app.get("/api/admin/packages")
    async def get_packages(request: Request):
        '''Get all packages (Admin only)'''
        user = app.state.auth.get_current_user(request)
        if not user or user["role"] != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Admin access required")
        
        try:
            packages = app.state.package_model.get_all_packages()
            return {"success": True, "packages": packages}
        except Exception as e:
            logger.error(f"Error fetching packages: {e}")
            return JSONResponse(status_code=500, content={"success": False, "message": str(e)})
    
    @app.post("/api/admin/packages")
    async def create_package(request: Request):
        '''Create new package (Admin only)'''
        user = app.state.auth.get_current_user(request)
        if not user or user["role"] != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Admin access required")
        
        try:
            data = await request.json()
            required = ["name", "price", "slip_quota", "duration_days"]
            for field in required:
                if field not in data:
                    return JSONResponse(status_code=400, content={"success": False, "message": f"Missing: {field}"})
            
            package_id = app.state.package_model.create_package(
                name=data["name"], price=float(data["price"]), slip_quota=int(data["slip_quota"]),
                duration_days=int(data["duration_days"]), description=data.get("description", ""),
                features=data.get("features", []), is_free_starter=data.get("is_free_starter", False)
            )
            return {"success": True, "message": "Package created", "package_id": package_id}
        except Exception as e:
            logger.error(f"Error creating package: {e}")
            return JSONResponse(status_code=500, content={"success": False, "message": str(e)})
    
    @app.put("/api/admin/packages/{package_id}")
    async def update_package(request: Request, package_id: str):
        '''Update package'''
        user = app.state.auth.get_current_user(request)
        if not user or user["role"] != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Admin access required")
        
        try:
            data = await request.json()
            success = app.state.package_model.update_package(package_id, data)
            if success:
                return {"success": True, "message": "Package updated"}
            return JSONResponse(status_code=404, content={"success": False, "message": "Not found"})
        except Exception as e:
            logger.error(f"Error updating package: {e}")
            return JSONResponse(status_code=500, content={"success": False, "message": str(e)})
    
    @app.delete("/api/admin/packages/{package_id}")
    async def delete_package(request: Request, package_id: str):
        '''Deactivate package'''
        user = app.state.auth.get_current_user(request)
        if not user or user["role"] != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Admin access required")
        
        try:
            success = app.state.package_model.deactivate_package(package_id)
            if success:
                return {"success": True, "message": "Package deactivated"}
            return JSONResponse(status_code=404, content={"success": False, "message": "Not found"})
        except Exception as e:
            logger.error(f"Error deactivating: {e}")
            return JSONResponse(status_code=500, content={"success": False, "message": str(e)})
    
    @app.get("/api/user/packages")
    async def get_available_packages(request: Request):
        '''Get active packages'''
        user = app.state.auth.get_current_user(request)
        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")
        
        try:
            packages = app.state.package_model.get_active_packages()
            return {"success": True, "packages": packages}
        except Exception as e:
            logger.error(f"Error: {e}")
            return JSONResponse(status_code=500, content={"success": False, "message": str(e)})

    # ==================== System Settings APIs ====================
    
    @app.get("/api/admin/system-settings")
    async def get_system_settings(request: Request):
        '''Get system settings (Admin only)'''
        user = app.state.auth.get_current_user(request)
        if not user or user["role"] != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Admin access required")
        
        try:
            settings = app.state.system_settings_model.get_settings()
            if not settings:
                # Return empty settings if not found
                return {"success": True, "settings": {
                    "slip_api_key_preview": "",
                    "ai_api_key_preview": "",
                    "bank_accounts": []
                }}
            
            # Create a safe copy without sensitive data
            safe_settings = {}
            if "slip_api_key" in settings and settings["slip_api_key"]:
                safe_settings["slip_api_key_preview"] = settings["slip_api_key"][:10] + "..."
            else:
                safe_settings["slip_api_key_preview"] = ""
                
            if "ai_api_key" in settings and settings["ai_api_key"]:
                safe_settings["ai_api_key_preview"] = settings["ai_api_key"][:10] + "..."
            else:
                safe_settings["ai_api_key_preview"] = ""
            
            # Copy other safe fields
            safe_settings["bank_accounts"] = settings.get("payment_bank_accounts", [])
            safe_settings["slip_api_provider"] = settings.get("slip_api_provider", "thunder")
            safe_settings["ai_model"] = settings.get("ai_model", "gpt-4-mini")
            
            return {"success": True, "settings": safe_settings}
        except Exception as e:
            logger.error(f"Error fetching settings: {e}")
            return JSONResponse(status_code=500, content={"success": False, "message": f"เกิดข้อผิดพลาด: {str(e)}"})

    @app.put("/api/admin/system-settings")
    async def update_system_settings(request: Request):
        '''Update system settings'''
        user = app.state.auth.get_current_user(request)
        if not user or user["role"] != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Admin access required")
        
        try:
            data = await request.json()
            success = app.state.system_settings_model.update_settings(data, user["user_id"])  # Fixed: Added admin_id
            if success:
                return {"success": True, "message": "Settings updated"}
            return JSONResponse(status_code=500, content={"success": False, "message": "Failed to update"})
        except Exception as e:
            logger.error(f"Error updating settings: {e}")
            return JSONResponse(status_code=500, content={"success": False, "message": str(e)})

    @app.post("/api/admin/system-settings/bank-accounts")
    async def add_bank_account(request: Request):
        '''Add bank account'''
        user = app.state.auth.get_current_user(request)
        if not user or user["role"] != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Admin access required")
        
        try:
            data = await request.json()
            required = ["bank_name", "account_number", "account_name"]
            for field in required:
                if field not in data:
                    return JSONResponse(status_code=400, content={"success": False, "message": f"กรุณากรอก: {field}"})
            
            settings = app.state.system_settings_model.get_settings()
            accounts = settings.get("payment_bank_accounts", [])
            
            # Check for duplicates
            if any(acc.get("account_number") == data["account_number"] for acc in accounts):
                return JSONResponse(status_code=400, content={"success": False, "message": "เลขที่บัญชีนี้มีอยู่แล้ว"})
            
            accounts.append({
                "bank_name": data["bank_name"],
                "account_number": data["account_number"],
                "account_name": data["account_name"]
            })
            
            success = app.state.system_settings_model.update_settings(
                {"payment_bank_accounts": accounts},
                user["user_id"]
            )
            
            if success:
                return {"success": True, "message": "เพิ่มบัญชีธนาคารสำเร็จ"}
            return JSONResponse(status_code=500, content={"success": False, "message": "ไม่สามารถเพิ่มบัญชีได้"})
        except Exception as e:
            logger.error(f"Error adding bank account: {e}")
            return JSONResponse(status_code=500, content={"success": False, "message": f"เกิดข้อผิดพลาด: {str(e)}"})

    @app.delete("/api/admin/system-settings/bank-accounts/{index}")
    async def remove_bank_account(request: Request, index: int):
        '''Remove bank account'''
        user = app.state.auth.get_current_user(request)
        if not user or user["role"] != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Admin access required")
        
        try:
            settings = app.state.system_settings_model.get_settings()
            accounts = settings.get("payment_bank_accounts", [])
            
            if index < 0 or index >= len(accounts):
                return JSONResponse(status_code=404, content={"success": False, "message": "ไม่พบบัญชีธนาคาร"})
            
            accounts.pop(index)
            success = app.state.system_settings_model.update_settings(
                {"payment_bank_accounts": accounts}, 
                user["user_id"]
            )
            
            if success:
                return {"success": True, "message": "ลบบัญชีธนาคารสำเร็จ"}
            return JSONResponse(status_code=500, content={"success": False, "message": "ไม่สามารถลบบัญชีได้"})
        except Exception as e:
            logger.error(f"Error removing bank account: {e}")
            return JSONResponse(status_code=500, content={"success": False, "message": f"เกิดข้อผิดพลาด: {str(e)}"})
    
    @app.post("/api/admin/system-settings/test/slip-api")
    async def test_slip_api(request: Request):
        '''Test Slip API connection'''
        user = app.state.auth.get_current_user(request)
        if not user or user["role"] != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Admin access required")
        
        try:
            data = await request.json()
            api_key = data.get("api_key")
            
            if not api_key:
                return JSONResponse(
                    status_code=400,
                    content={"success": False, "message": "กรุณากรอก API Key"}
                )
            
            # Import test function
            from services.slip_checker import test_thunder_api_connection
            result = test_thunder_api_connection(api_key)
            
            # Convert result to match expected format
            if result.get("status") == "success":
                return JSONResponse(content={
                    "success": True,
                    "status": "success",
                    "message": result.get("message", "เชื่อมต่อ API สำเร็จ")
                })
            else:
                return JSONResponse(
                    status_code=400,
                    content={
                        "success": False,
                        "status": "error",
                        "message": result.get("message", "ไม่สามารถเชื่อมต่อ API ได้")
                    }
                )
        except Exception as e:
            logger.error(f"Error testing slip API: {e}")
            return JSONResponse(
                status_code=500,
                content={"success": False, "message": f"เกิดข้อผิดพลาด: {str(e)}"}
            )
    
    @app.post("/api/admin/system-settings/test/ai-api")
    async def test_ai_api(request: Request):
        '''Test AI API connection'''
        user = app.state.auth.get_current_user(request)
        if not user or user["role"] != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Admin access required")
        
        try:
            data = await request.json()
            api_key = data.get("api_key")
            model = data.get("model", "gpt-4-mini")
            
            if not api_key:
                return JSONResponse(
                    status_code=400,
                    content={"success": False, "message": "กรุณากรอก API Key"}
                )
            
            # Test OpenAI API
            try:
                import openai
                client = openai.OpenAI(api_key=api_key)
                
                # Simple test call
                response = client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": "You are a helpful assistant."},
                        {"role": "user", "content": "Say 'API test successful' if you can read this."}
                    ],
                    max_tokens=20
                )
                
                return JSONResponse(content={
                    "success": True,
                    "message": "เชื่อมต่อ API สำเร็จ",
                    "response": response.choices[0].message.content,
                    "model": model
                })
            except Exception as api_error:
                return JSONResponse(
                    status_code=400,
                    content={"success": False, "message": f"ไม่สามารถเชื่อมต่อ API ได้: {str(api_error)}"}
                )
        except ImportError:
            return JSONResponse(
                status_code=500,
                content={"success": False, "message": "OpenAI library ไม่ได้ติดตั้ง"}
            )
        except Exception as e:
            logger.error(f"Error testing AI API: {e}")
            return JSONResponse(
                status_code=500,
                content={"success": False, "message": f"เกิดข้อผิดพลาด: {str(e)}"}
            )

    # ==================== Payment & Subscription APIs ====================
    
    @app.post("/api/user/subscribe")
    async def subscribe_with_slip(request: Request):
        '''Purchase package with slip'''
        user = app.state.auth.get_current_user(request)
        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")
        
        try:
            data = await request.json()
            package_id = data.get("package_id")
            slip_image_data = data.get("slip_image_data")
            
            if not package_id or not slip_image_data:
                return JSONResponse(status_code=400, content={"success": False, "message": "Missing required fields"})
            
            package = app.state.package_model.get_package_by_id(package_id)
            if not package:
                return JSONResponse(status_code=404, content={"success": False, "message": "Package not found"})
            
            payment_id = app.state.payment_model.create_payment(
                user_id=user["user_id"], package_id=package_id, amount=package["price"],
                payment_type="bank_transfer", slip_image_data=slip_image_data
            )
            return {"success": True, "message": "Payment submitted", "payment_id": payment_id}
        except Exception as e:
            logger.error(f"Error creating payment: {e}")
            return JSONResponse(status_code=500, content={"success": False, "message": str(e)})

    @app.post("/api/user/subscribe/usdt")
    async def subscribe_with_usdt(request: Request):
        '''Purchase with USDT'''
        user = app.state.auth.get_current_user(request)
        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")
        
        try:
            data = await request.json()
            package_id = data.get("package_id")
            transaction_hash = data.get("transaction_hash")
            
            if not package_id or not transaction_hash:
                return JSONResponse(status_code=400, content={"success": False, "message": "Missing required fields"})
            
            package = app.state.package_model.get_package_by_id(package_id)
            if not package:
                return JSONResponse(status_code=404, content={"success": False, "message": "Package not found"})
            
            payment_id = app.state.payment_model.create_payment(
                user_id=user["user_id"], package_id=package_id, amount=package["price"],
                payment_type="usdt", transaction_hash=transaction_hash
            )
            return {"success": True, "message": "USDT payment submitted", "payment_id": payment_id}
        except Exception as e:
            logger.error(f"Error creating USDT payment: {e}")
            return JSONResponse(status_code=500, content={"success": False, "message": str(e)})

    @app.get("/api/admin/payments")
    async def get_payments(request: Request, status_filter: str = None):
        '''Get payments (Admin only)'''
        user = app.state.auth.get_current_user(request)
        if not user or user["role"] != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Admin access required")
        
        try:
            if status_filter:
                payments = app.state.payment_model.get_payments_by_status(status_filter)
            else:
                payments = app.state.payment_model.get_all_payments()
            return {"success": True, "payments": payments}
        except Exception as e:
            logger.error(f"Error fetching payments: {e}")
            return JSONResponse(status_code=500, content={"success": False, "message": str(e)})

    @app.post("/api/admin/payments/{payment_id}/approve")
    async def approve_payment(request: Request, payment_id: str):
        '''Approve payment'''
        user = app.state.auth.get_current_user(request)
        if not user or user["role"] != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Admin access required")
        
        try:
            payment = app.state.payment_model.get_payment_by_id(payment_id)
            if not payment:
                return JSONResponse(status_code=404, content={"success": False, "message": "Not found"})
            
            app.state.payment_model.update_payment_status(
                payment_id, "verified", {"verified_by": user["user_id"], "verified_at": datetime.utcnow()}
            )
            
            # Fetch package details for quota and duration
            package = app.state.package_model.get_package_by_id(payment["package_id"])
            if not package:
                return JSONResponse(status_code=404, content={"success": False, "message": "Package not found"})
            
            existing_subs = app.state.subscription_model.get_user_subscriptions(payment["user_id"])
            active_subs = [s for s in existing_subs if s["status"] == "active"]
            
            if active_subs:
                # Extend existing subscription with package quota and duration
                app.state.subscription_model.extend_subscription(
                    user_id=payment["user_id"],
                    additional_slips=package["slip_quota"], 
                    additional_days=package["duration_days"]
                )
            else:
                # Create new subscription with package quota and duration
                app.state.subscription_model.create_subscription(
                    user_id=payment["user_id"], 
                    package_id=payment["package_id"],
                    slips_quota=package["slip_quota"],
                    duration_days=package["duration_days"],
                    payment_id=payment_id
                )
            return {"success": True, "message": "Payment approved"}
        except Exception as e:
            logger.error(f"Error approving payment: {e}")
            return JSONResponse(status_code=500, content={"success": False, "message": str(e)})

    @app.post("/api/admin/payments/{payment_id}/reject")
    async def reject_payment(request: Request, payment_id: str):
        '''Reject payment'''
        user = app.state.auth.get_current_user(request)
        if not user or user["role"] != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Admin access required")
        
        try:
            data = await request.json()
            success = app.state.payment_model.update_payment_status(
                payment_id, "rejected", {"rejected_by": user["user_id"], "admin_notes": data.get("notes", "")}
            )
            if success:
                return {"success": True, "message": "Payment rejected"}
            return JSONResponse(status_code=404, content={"success": False, "message": "Not found"})
        except Exception as e:
            logger.error(f"Error rejecting payment: {e}")
            return JSONResponse(status_code=500, content={"success": False, "message": str(e)})

    @app.get("/api/user/quota")
    async def get_user_quota(request: Request):
        '''Get user quota'''
        user = app.state.auth.get_current_user(request)
        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")
        
        try:
            quota = app.state.subscription_model.check_quota(user["user_id"])
            return {"success": True, "quota": quota}
        except Exception as e:
            logger.error(f"Error checking quota: {e}")
            return JSONResponse(status_code=500, content={"success": False, "message": str(e)})

    @app.get("/api/user/subscriptions")
    async def get_user_subscriptions(request: Request):
        '''Get subscription history'''
        user = app.state.auth.get_current_user(request)
        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")
        
        try:
            subscriptions = app.state.subscription_model.get_user_subscriptions(user["user_id"])
            
            # Enrich with package details for UI
            for sub in subscriptions:
                package = app.state.package_model.get_package_by_id(sub.get("package_id"))
                if package:
                    sub["package_name"] = package["name"]
                    sub["price"] = package["price"]
                else:
                    sub["package_name"] = "Unknown Package"
                    sub["price"] = 0
                
                # Add is_active boolean for UI compatibility
                sub["is_active"] = sub["status"] == "active"
            
            return {"success": True, "subscriptions": subscriptions}
        except Exception as e:
            logger.error(f"Error fetching subscriptions: {e}")
            return JSONResponse(status_code=500, content={"success": False, "message": str(e)})

    @app.post("/api/admin/users/{user_id}/grant-package")
    async def grant_package(request: Request, user_id: str):
        '''Grant package manually'''
        user = app.state.auth.get_current_user(request)
        if not user or user["role"] != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Admin access required")
        
        try:
            data = await request.json()
            if not data.get("package_id"):
                return JSONResponse(status_code=400, content={"success": False, "message": "Missing package_id"})
            
            sub_id = app.state.subscription_model.create_subscription(
                user_id=user_id, package_id=data["package_id"], payment_id=None
            )
            return {"success": True, "message": "Package granted", "subscription_id": sub_id}
        except Exception as e:
            logger.error(f"Error granting package: {e}")
            return JSONResponse(status_code=500, content={"success": False, "message": str(e)})

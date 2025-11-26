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
            safe_settings["slip_api_provider_secondary"] = settings.get("slip_api_provider_secondary", "")
            safe_settings["slip_api_fallback_enabled"] = settings.get("slip_api_fallback_enabled", False)
            safe_settings["slip_api_quota_warning"] = settings.get("slip_api_quota_warning", True)
            if "slip_api_key_secondary" in settings and settings["slip_api_key_secondary"]:
                safe_settings["slip_api_key_secondary_preview"] = settings["slip_api_key_secondary"][:10] + "..."
            else:
                safe_settings["slip_api_key_secondary_preview"] = ""
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
            
            # Handle secondary API key preview
            if "slip_api_key_secondary" in data and data["slip_api_key_secondary"]:
                # Keep the key, don't delete it
                pass
            elif "slip_api_key_secondary" in data and not data["slip_api_key_secondary"]:
                # If empty, don't update it (keep existing)
                del data["slip_api_key_secondary"]
            
            success = app.state.system_settings_model.update_settings(data, user["user_id"])
            if success:
                return {"success": True, "message": "บันทึกการตั้งค่าสำเร็จ"}
            return JSONResponse(status_code=500, content={"success": False, "message": "ไม่สามารถบันทึกการตั้งค่าได้"})
        except Exception as e:
            logger.error(f"Error updating settings: {e}")
            return JSONResponse(status_code=500, content={"success": False, "message": f"เกิดข้อผิดพลาด: {str(e)}"})

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
            provider = data.get("provider", "thunder")
            
            if not api_key:
                return JSONResponse(
                    status_code=400,
                    content={"success": False, "message": "กรุณากรอก API Key"}
                )
            
            # Test based on provider
            if provider == "kbank":
                from services.kbank_checker import kbank_checker
                # Update credentials temporarily for testing
                from utils.config_manager import config_manager
                original_id = config_manager.get("kbank_consumer_id", "")
                original_secret = config_manager.get("kbank_consumer_secret", "")
                
                # For KBank, api_key might be consumer_id, need to handle differently
                # For now, test with existing KBank checker
                result = kbank_checker.test_connection()
                
                if result.get("status") == "success":
                    return JSONResponse(content={
                        "success": True,
                        "status": "success",
                        "message": result.get("message", "เชื่อมต่อ KBank API สำเร็จ")
                    })
                else:
                    return JSONResponse(
                        status_code=400,
                        content={
                            "success": False,
                            "status": "error",
                            "message": result.get("message", "ไม่สามารถเชื่อมต่อ KBank API ได้")
                        }
                    )
            else:
                # Test Thunder API
                from services.slip_checker import test_thunder_api_connection
                result = test_thunder_api_connection(api_key)
                
                # Convert result to match expected format
                if result.get("status") == "success":
                    return JSONResponse(content={
                        "success": True,
                        "status": "success",
                        "message": result.get("message", "เชื่อมต่อ Thunder API สำเร็จ")
                    })
                else:
                    return JSONResponse(
                        status_code=400,
                        content={
                            "success": False,
                            "status": "error",
                            "message": result.get("message", "ไม่สามารถเชื่อมต่อ Thunder API ได้")
                        }
                    )
        except Exception as e:
            logger.error(f"Error testing slip API: {e}")
            return JSONResponse(
                status_code=500,
                content={"success": False, "message": f"เกิดข้อผิดพลาด: {str(e)}"}
            )
    
    @app.get("/api/admin/system-settings/api-status")
    async def get_api_status(request: Request):
        '''Get API status and quota information'''
        user = app.state.auth.get_current_user(request)
        if not user or user["role"] != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Admin access required")
        
        try:
            settings = app.state.system_settings_model.get_settings()
            status_info = {
                "thunder": {"configured": False, "status": "unknown", "message": ""},
                "kbank": {"configured": False, "status": "unknown", "message": ""}
            }
            
            # Check Thunder API
            if settings.get("slip_api_key"):
                try:
                    from services.slip_checker import test_thunder_api_connection
                    result = test_thunder_api_connection(settings.get("slip_api_key"))
                    status_info["thunder"] = {
                        "configured": True,
                        "status": result.get("status", "error"),
                        "message": result.get("message", ""),
                        "balance": result.get("balance", 0),
                        "expires_at": result.get("expires_at", "")
                    }
                except Exception as e:
                    status_info["thunder"] = {
                        "configured": True,
                        "status": "error",
                        "message": f"เกิดข้อผิดพลาด: {str(e)}"
                    }
            
            # Check KBank API
            from utils.config_manager import config_manager
            if config_manager.get("kbank_consumer_id") and config_manager.get("kbank_consumer_secret"):
                try:
                    from services.kbank_checker import kbank_checker
                    result = kbank_checker.test_connection()
                    status_info["kbank"] = {
                        "configured": True,
                        "status": result.get("status", "error"),
                        "message": result.get("message", "")
                    }
                except Exception as e:
                    status_info["kbank"] = {
                        "configured": True,
                        "status": "error",
                        "message": f"เกิดข้อผิดพลาด: {str(e)}"
                    }
            
            return JSONResponse(content={"success": True, "api_status": status_info})
        except Exception as e:
            logger.error(f"Error getting API status: {e}")
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
        '''Purchase package with slip - verifies slip against configured bank accounts'''
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
            
            # Get system settings for bank accounts
            system_settings = app.state.system_settings_model.get_settings()
            bank_accounts = system_settings.get("payment_bank_accounts", [])
            
            if not bank_accounts:
                return JSONResponse(
                    status_code=400,
                    content={"success": False, "message": "ยังไม่ได้ตั้งค่าบัญชีธนาคารสำหรับรับชำระเงิน กรุณาติดต่อผู้ดูแลระบบ"}
                )
            
            # Verify slip against configured bank accounts
            import base64
            from services.slip_checker import verify_slip_with_thunder
            
            # Decode base64 image
            try:
                if slip_image_data.startswith('data:image'):
                    # Remove data URL prefix
                    slip_image_data = slip_image_data.split(',')[1]
                image_bytes = base64.b64decode(slip_image_data)
            except Exception as e:
                logger.error(f"Error decoding image: {e}")
                return JSONResponse(
                    status_code=400,
                    content={"success": False, "message": "รูปภาพไม่ถูกต้อง"}
                )
            
            # Get slip API key from system settings
            slip_api_key = system_settings.get("slip_api_key", "")
            if not slip_api_key:
                return JSONResponse(
                    status_code=500,
                    content={"success": False, "message": "ยังไม่ได้ตั้งค่า API Key สำหรับตรวจสอบสลิป"}
                )
            
            # Verify slip
            logger.info(f"🔍 Verifying slip for payment - Package: {package['name']}, Amount: {package['price']}")
            slip_result = verify_slip_with_thunder(
                message_id=None,
                test_image_data=image_bytes,
                api_token=slip_api_key
            )
            
            if slip_result.get("status") != "success":
                error_msg = slip_result.get("message", "ไม่สามารถตรวจสอบสลิปได้")
                logger.warning(f"⚠️ Slip verification failed: {error_msg}")
                return JSONResponse(
                    status_code=400,
                    content={"success": False, "message": f"ตรวจสอบสลิปไม่สำเร็จ: {error_msg}"}
                )
            
            # Extract slip data
            slip_data = slip_result.get("data", {})
            receiver_account_no = slip_data.get("receiver_account_number", "")
            receiver_name = slip_data.get("receiver_name_th", "") or slip_data.get("receiver_name_en", "")
            slip_amount = slip_data.get("amount", 0)
            receiver_bank_code = slip_data.get("receiver_bank_id", "")
            
            # Verify against configured bank accounts
            matched_account = None
            for bank_acc in bank_accounts:
                # Normalize account numbers (remove spaces, dashes)
                config_account_no = str(bank_acc.get("account_no", "")).replace(" ", "").replace("-", "")
                slip_account_no = str(receiver_account_no).replace(" ", "").replace("-", "")
                
                # Check account number match
                if config_account_no == slip_account_no:
                    # Check bank code if available
                    if receiver_bank_code:
                        config_bank_code = str(bank_acc.get("bank_code", "")).strip()
                        if config_bank_code and config_bank_code != receiver_bank_code:
                            continue
                    
                    matched_account = bank_acc
                    break
            
            if not matched_account:
                logger.warning(f"⚠️ Account number mismatch: {receiver_account_no} not in configured accounts")
                return JSONResponse(
                    status_code=400,
                    content={
                        "success": False,
                        "message": f"เลขบัญชีผู้รับไม่ตรงกับบัญชีที่ตั้งค่าไว้ (พบ: {receiver_account_no})"
                    }
                )
            
            # Verify account name (fuzzy match)
            config_account_name = str(matched_account.get("account_name", "")).strip().lower()
            slip_account_name = str(receiver_name).strip().lower()
            
            # Allow partial match (at least 50% similarity)
            if config_account_name and slip_account_name:
                # Simple similarity check
                if config_account_name not in slip_account_name and slip_account_name not in config_account_name:
                    # Check character similarity
                    common_chars = sum(1 for c in config_account_name if c in slip_account_name)
                    similarity = common_chars / max(len(config_account_name), len(slip_account_name))
                    if similarity < 0.5:
                        logger.warning(f"⚠️ Account name mismatch: '{receiver_name}' vs '{matched_account.get('account_name')}'")
                        return JSONResponse(
                            status_code=400,
                            content={
                                "success": False,
                                "message": f"ชื่อบัญชีผู้รับไม่ตรงกับที่ตั้งค่าไว้ (พบ: {receiver_name})"
                            }
                        )
            
            # Verify amount (allow small difference for fees)
            expected_amount = float(package["price"])
            actual_amount = float(slip_amount)
            amount_diff = abs(expected_amount - actual_amount)
            
            # Allow 5% difference or 10 baht, whichever is larger
            tolerance = max(expected_amount * 0.05, 10.0)
            
            if amount_diff > tolerance:
                logger.warning(f"⚠️ Amount mismatch: Expected {expected_amount}, Got {actual_amount}, Diff: {amount_diff}")
                return JSONResponse(
                    status_code=400,
                    content={
                        "success": False,
                        "message": f"ยอดเงินไม่ตรงกับแพ็คเกจ (คาดหวัง: ฿{expected_amount:,.2f}, พบ: ฿{actual_amount:,.2f})"
                    }
                )
            
            # All checks passed - create payment
            logger.info(f"✅ Slip verification passed - Account: {receiver_account_no}, Amount: {actual_amount}")
            
            payment_id = app.state.payment_model.create_payment(
                user_id=user["user_id"],
                package_id=package_id,
                amount=actual_amount,  # Use actual amount from slip
                payment_type="bank_transfer",
                slip_image_data=image_bytes
            )
            
            # Store verification result
            app.state.payment_model.update_payment_status(
                payment_id,
                "pending",
                verification_result={
                    "verified": True,
                    "receiver_account": receiver_account_no,
                    "receiver_name": receiver_name,
                    "amount": actual_amount,
                    "matched_account": matched_account.get("account_name"),
                    "verification_method": "thunder_api"
                }
            )
            
            return {
                "success": True,
                "message": "ตรวจสอบสลิปสำเร็จ รอการอนุมัติจากผู้ดูแลระบบ",
                "payment_id": payment_id,
                "verification": {
                    "account_matched": True,
                    "name_matched": True,
                    "amount_matched": True,
                    "amount": actual_amount
                }
            }
        except Exception as e:
            logger.error(f"Error creating payment: {e}", exc_info=True)
            return JSONResponse(status_code=500, content={"success": False, "message": f"เกิดข้อผิดพลาด: {str(e)}"})

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
        '''Get payments with user and package details (Admin only)'''
        user = app.state.auth.get_current_user(request)
        if not user or user["role"] != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Admin access required")
        
        try:
            if status_filter:
                payments = app.state.payment_model.get_payments_by_status(status_filter)
            else:
                payments = app.state.payment_model.get_all_payments()
            
            # Enrich payments with user and package information
            enriched_payments = []
            for payment in payments:
                enriched = payment.copy()
                
                # Get user information
                try:
                    user_info = app.state.user_model.get_user_by_id(payment["user_id"])
                    if user_info:
                        enriched["user_name"] = user_info.get("username", "Unknown")
                        enriched["user_email"] = user_info.get("email", "")
                    else:
                        enriched["user_name"] = "Unknown User"
                        enriched["user_email"] = ""
                except Exception as e:
                    logger.warning(f"Error fetching user info for payment {payment['_id']}: {e}")
                    enriched["user_name"] = "Unknown User"
                    enriched["user_email"] = ""
                
                # Get package information
                try:
                    package = app.state.package_model.get_package_by_id(payment["package_id"])
                    if package:
                        enriched["package_name"] = package.get("name", "Unknown Package")
                        enriched["package_price"] = package.get("price", 0)
                    else:
                        enriched["package_name"] = "Unknown Package"
                        enriched["package_price"] = 0
                except Exception as e:
                    logger.warning(f"Error fetching package info for payment {payment['_id']}: {e}")
                    enriched["package_name"] = "Unknown Package"
                    enriched["package_price"] = 0
                
                enriched_payments.append(enriched)
            
            return {"success": True, "payments": enriched_payments}
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

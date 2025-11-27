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
                features=data.get("features", []), is_free_starter=data.get("is_free_starter", False),
                price_usdt=float(data["price_usdt"]) if data.get("price_usdt") else None
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
    
    @app.get("/api/user/payment-info")
    async def get_payment_info(request: Request):
        '''Get payment information (bank accounts, USDT wallet) for users'''
        user = app.state.auth.get_current_user(request)
        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")
        
        try:
            settings = app.state.system_settings_model.get_settings()
            
            # Get bank accounts with consistent field names
            bank_accounts = settings.get("payment_bank_accounts", [])
            # Ensure both account_number and account_no are available
            normalized_accounts = []
            for acc in bank_accounts:
                normalized_acc = {
                    "bank_name": acc.get("bank_name", ""),
                    "account_number": acc.get("account_number", "") or acc.get("account_no", ""),
                    "account_name": acc.get("account_name", "")
                }
                normalized_accounts.append(normalized_acc)
            
            # Get USDT wallet info
            usdt_enabled = settings.get("usdt_enabled", True)
            network = settings.get("usdt_network", "TRC20")
            address = settings.get("usdt_wallet_address", "")
            qr_image = settings.get("usdt_qr_image", "")
            disabled_message = settings.get("usdt_disabled_message", "งดให้บริการชำระเงินด้วย USDT ชั่วคราว")
            
            # Generate explorer URL based on network
            explorer_url = ""
            if address:
                if network == "ERC20":
                    explorer_url = f"https://etherscan.io/address/{address}"
                elif network == "TRC20":
                    explorer_url = f"https://tronscan.org/#/address/{address}"
                elif network == "BEP20":
                    explorer_url = f"https://bscscan.com/address/{address}"
            
            usdt_wallet = {
                "enabled": usdt_enabled,
                "address": address,
                "network": network,
                "qr_image": qr_image,
                "explorer_url": explorer_url,
                "disabled_message": disabled_message
            }
            
            return {
                "success": True,
                "bank_accounts": normalized_accounts,
                "usdt_wallet": usdt_wallet
            }
        except Exception as e:
            logger.error(f"Error getting payment info: {e}")
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
            
            # Copy other safe fields - normalize bank account field names
            raw_bank_accounts = settings.get("payment_bank_accounts", [])
            normalized_bank_accounts = []
            for acc in raw_bank_accounts:
                normalized_acc = {
                    "bank_name": acc.get("bank_name", ""),
                    "account_number": acc.get("account_number", "") or acc.get("account_no", ""),
                    "account_name": acc.get("account_name", "")
                }
                normalized_bank_accounts.append(normalized_acc)
            safe_settings["bank_accounts"] = normalized_bank_accounts
            safe_settings["slip_api_provider"] = settings.get("slip_api_provider", "thunder")
            safe_settings["slip_api_provider_secondary"] = settings.get("slip_api_provider_secondary", "")
            safe_settings["slip_api_fallback_enabled"] = settings.get("slip_api_fallback_enabled", False)
            safe_settings["slip_api_quota_warning"] = settings.get("slip_api_quota_warning", True)
            if "slip_api_key_secondary" in settings and settings["slip_api_key_secondary"]:
                safe_settings["slip_api_key_secondary_preview"] = settings["slip_api_key_secondary"][:10] + "..."
            else:
                safe_settings["slip_api_key_secondary_preview"] = ""
            safe_settings["ai_model"] = settings.get("ai_model", "gpt-4-mini")
            
            # USDT wallet settings
            safe_settings["usdt_enabled"] = settings.get("usdt_enabled", True)
            safe_settings["usdt_network"] = settings.get("usdt_network", "TRC20")
            safe_settings["usdt_wallet_address"] = settings.get("usdt_wallet_address", "")
            safe_settings["usdt_qr_image"] = settings.get("usdt_qr_image", "")
            safe_settings["usdt_disabled_message"] = settings.get("usdt_disabled_message", "งดให้บริการชำระเงินด้วย USDT ชั่วคราว")
            
            # Quota exceeded template settings
            safe_settings["quota_exceeded_response_type"] = settings.get("quota_exceeded_response_type", "text")
            safe_settings["quota_exceeded_message"] = settings.get("quota_exceeded_message", "")
            safe_settings["quota_exceeded_flex_title"] = settings.get("quota_exceeded_flex_title", "")
            safe_settings["quota_exceeded_flex_body"] = settings.get("quota_exceeded_flex_body", "")
            safe_settings["quota_exceeded_flex_button_text"] = settings.get("quota_exceeded_flex_button_text", "")
            safe_settings["quota_exceeded_flex_button_url"] = settings.get("quota_exceeded_flex_button_url", "")
            safe_settings["quota_exceeded_flex_image_url"] = settings.get("quota_exceeded_flex_image_url", "")
            
            # Duplicate slip settings
            safe_settings["duplicate_refund_enabled"] = settings.get("duplicate_refund_enabled", True)
            safe_settings["quota_warning_threshold"] = settings.get("quota_warning_threshold", 10)
            safe_settings["quota_warning_enabled"] = settings.get("quota_warning_enabled", True)
            safe_settings["contact_admin_url"] = settings.get("contact_admin_url", "")
            safe_settings["contact_admin_line"] = settings.get("contact_admin_line", "")
            safe_settings["contact_admin_email"] = settings.get("contact_admin_email", "")
            
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
                "account_no": data["account_number"],  # Also store as account_no for compatibility
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
                "thunder": {"configured": False, "status": "not_configured", "message": "ยังไม่ได้ตั้งค่า"},
                "kbank": {"configured": False, "status": "not_configured", "message": "ยังไม่ได้ตั้งค่า"}
            }
            
            # Check Thunder API
            slip_api_key = settings.get("slip_api_key", "").strip()
            if slip_api_key:
                try:
                    from services.slip_checker import test_thunder_api_connection
                    result = test_thunder_api_connection(slip_api_key)
                    
                    if result.get("status") == "success":
                        # Only include balance if it's a valid number from API response
                        balance = result.get("balance")
                        status_info["thunder"] = {
                            "configured": True,
                            "status": "success",
                            "message": result.get("message", "เชื่อมต่อสำเร็จ"),
                            "balance": balance if isinstance(balance, (int, float)) else None,
                            "expires_at": result.get("expires_at", "")
                        }
                    else:
                        status_info["thunder"] = {
                            "configured": True,
                            "status": "error",
                            "message": result.get("message", "ไม่สามารถเชื่อมต่อได้"),
                            "balance": None,
                            "expires_at": ""
                        }
                except Exception as e:
                    logger.error(f"Error checking Thunder API: {e}")
                    status_info["thunder"] = {
                        "configured": True,
                        "status": "error",
                        "message": f"เกิดข้อผิดพลาด: {str(e)}",
                        "balance": None,
                        "expires_at": ""
                    }
            
            # Check KBank API
            from utils.config_manager import config_manager
            kbank_id = config_manager.get("kbank_consumer_id", "").strip()
            kbank_secret = config_manager.get("kbank_consumer_secret", "").strip()
            if kbank_id and kbank_secret:
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
            
            # Initialize verification variables
            verification_issues = []
            account_matched = False
            name_matched = True
            amount_matched = True
            expected_amount = float(package["price"])
            actual_amount = 0
            receiver_account_no = ""
            receiver_name = ""
            matched_account = None
            api_verified = False
            trans_ref = ""
            is_duplicate = False
            duplicate_info = None
            
            # Check if slip verification succeeded OR is duplicate
            if slip_result.get("status") == "success" or slip_result.get("status") == "duplicate":
                api_verified = True
                # Extract slip data
                slip_data = slip_result.get("data", {})
                receiver_account_no = slip_data.get("receiver_account_number", "")
                receiver_name = slip_data.get("receiver_name_th", "") or slip_data.get("receiver_name_en", "")
                slip_amount = slip_data.get("amount", 0)
                receiver_bank_code = slip_data.get("receiver_bank_id", "")
                actual_amount = float(slip_amount) if slip_amount else 0
                trans_ref = slip_data.get("transRef", "") or slip_data.get("reference", "")
                
                # ═══════════════════════════════════════════════════════════════════
                # CHECK DUPLICATE SLIP IN PAYMENT SYSTEM
                # ═══════════════════════════════════════════════════════════════════
                if trans_ref:
                    duplicate_info = app.state.payment_model.check_duplicate_slip(trans_ref)
                    is_duplicate = duplicate_info.get("is_duplicate", False)
                    
                    if is_duplicate:
                        logger.warning(f"⚠️ Duplicate payment slip detected: trans_ref={trans_ref}")
                        verification_issues.append(f"สลิปซ้ำ: สลิปนี้เคยถูกใช้ชำระเงินแล้ว (ครั้งที่ {duplicate_info.get('duplicate_count', 1)})")
                
                # Also check if API reported as duplicate
                if slip_result.get("status") == "duplicate":
                    is_duplicate = True
                    if "สลิปซ้ำ" not in str(verification_issues):
                        verification_issues.append("สลิปซ้ำ: API แจ้งว่าสลิปนี้เคยถูกตรวจสอบแล้ว")
                
                # Verify against configured bank accounts
                for bank_acc in bank_accounts:
                    # Normalize account numbers (remove spaces, dashes)
                    # Support both field names: account_no and account_number
                    config_account_no = str(bank_acc.get("account_number", "") or bank_acc.get("account_no", "")).replace(" ", "").replace("-", "")
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
                
                # Track verification status
                account_matched = matched_account is not None
                
                if not account_matched:
                    logger.warning(f"⚠️ Account number mismatch: {receiver_account_no} not in configured accounts")
                    verification_issues.append(f"เลขบัญชีผู้รับไม่ตรง (พบ: {receiver_account_no})")
                else:
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
                                name_matched = False
                                logger.warning(f"⚠️ Account name mismatch: '{receiver_name}' vs '{matched_account.get('account_name')}'")
                                verification_issues.append(f"ชื่อบัญชีไม่ตรง (พบ: {receiver_name})")
                
                # Verify amount (allow small difference for fees)
                amount_diff = abs(expected_amount - actual_amount)
                
                # Allow 5% difference or 10 baht, whichever is larger
                tolerance = max(expected_amount * 0.05, 10.0)
                
                if amount_diff > tolerance:
                    amount_matched = False
                    logger.warning(f"⚠️ Amount mismatch: Expected {expected_amount}, Got {actual_amount}, Diff: {amount_diff}")
                    verification_issues.append(f"ยอดเงินไม่ตรง (คาดหวัง: ฿{expected_amount:,.2f}, พบ: ฿{actual_amount:,.2f})")
            else:
                # API failed to verify - create pending payment for manual review
                error_msg = slip_result.get("message", "ไม่สามารถตรวจสอบสลิปได้")
                logger.warning(f"⚠️ Slip verification API failed: {error_msg}")
                verification_issues.append(f"ไม่สามารถตรวจสอบสลิปอัตโนมัติได้: {error_msg}")
            
            # Create payment regardless of verification result
            # Admin can approve/reject manually
            payment_id = app.state.payment_model.create_payment(
                user_id=user["user_id"],
                package_id=package_id,
                amount=actual_amount if actual_amount > 0 else expected_amount,
                payment_type="bank_transfer",
                slip_image_data=image_bytes
            )
            
            # Check if all verifications passed (account, name, amount - NOT including duplicate)
            all_verified = account_matched and name_matched and amount_matched
            
            if all_verified:
                logger.info(f"✅ Slip verification passed - Account: {receiver_account_no}, Amount: {actual_amount}")
            else:
                logger.info(f"⚠️ Slip verification issues - Payment created for admin review: {verification_issues}")
            
            # ═══════════════════════════════════════════════════════════════════
            # DETERMINE PAYMENT STATUS AND AUTO-APPROVAL LOGIC
            # ═══════════════════════════════════════════════════════════════════
            payment_status = "pending"
            admin_notes = ""
            auto_approved = False
            
            if is_duplicate:
                # DUPLICATE SLIP SCENARIO
                if all_verified:
                    # Data matches but slip is duplicate
                    admin_notes = "⚠️ สลิปซ้ำ: ข้อมูลตรงกันแต่สลิปเคยถูกใช้ไปแล้ว (รอตรวจสอบ)"
                    logger.info(f"⚠️ Duplicate slip with matching data - Payment marked pending: {trans_ref}")
                else:
                    admin_notes = f"⚠️ สลิปซ้ำ: {', '.join(verification_issues)}"
                    logger.info(f"⚠️ Duplicate slip with issues - Payment marked pending: {trans_ref}")
            else:
                # NOT DUPLICATE
                if all_verified:
                    # All verifications passed AND not duplicate -> AUTO APPROVE
                    payment_status = "verified"
                    auto_approved = True
                    admin_notes = "✅ ระบบอนุมัติอัตโนมัติ: ตรวจสอบสลิปสำเร็จ ข้อมูลถูกต้องครบถ้วน"
                    logger.info(f"✅ Auto-approved payment - Account: {receiver_account_no}, Amount: {actual_amount}")
                else:
                    admin_notes = f"รอตรวจสอบ: {', '.join(verification_issues)}"
            
            # Build verification result
            verification_result = {
                "verified": all_verified,
                "api_verified": api_verified,
                "receiver_account": receiver_account_no,
                "receiver_name": receiver_name,
                "amount": actual_amount,
                "expected_amount": expected_amount,
                "matched_account": matched_account.get("account_name") if matched_account else None,
                "verification_method": "thunder_api",
                "account_matched": account_matched,
                "name_matched": name_matched,
                "amount_matched": amount_matched,
                "is_duplicate": is_duplicate,
                "trans_ref": trans_ref,
                "issues": verification_issues,
                "auto_approved": auto_approved
            }
            
            # Update payment status
            app.state.payment_model.update_payment_status(
                payment_id,
                payment_status,
                verification_result=verification_result,
                admin_notes=admin_notes,
                admin_id="system" if auto_approved else None
            )
            
            # ═══════════════════════════════════════════════════════════════════
            # AUTO ACTIVATE SUBSCRIPTION IF AUTO-APPROVED
            # ═══════════════════════════════════════════════════════════════════
            if auto_approved:
                try:
                    # Add package to user's subscription
                    success = app.state.subscription_model.add_subscription(
                        user_id=user["user_id"],
                        package_id=package_id,
                        payment_id=payment_id
                    )
                    
                    if success:
                        logger.info(f"✅ Auto-activated subscription for user {user['user_id']} - Package: {package['name']}")
                        return {
                            "success": True,
                            "message": f"🎉 ชำระเงินสำเร็จ! แพ็คเกจ '{package['name']}' ได้ถูกเติมให้คุณแล้ว",
                            "payment_id": payment_id,
                            "auto_approved": True,
                            "package_name": package["name"],
                            "verification": {
                                "account_matched": True,
                                "name_matched": True,
                                "amount_matched": True,
                                "amount": actual_amount
                            }
                        }
                    else:
                        # Subscription failed - revert to pending
                        logger.error(f"❌ Failed to activate subscription for user {user['user_id']}")
                        app.state.payment_model.update_payment_status(
                            payment_id,
                            "pending",
                            admin_notes="❌ เติมแพ็คเกจอัตโนมัติล้มเหลว รอแอดมินตรวจสอบ"
                        )
                except Exception as e:
                    logger.error(f"Error auto-activating subscription: {e}")
                    app.state.payment_model.update_payment_status(
                        payment_id,
                        "pending",
                        admin_notes=f"❌ เติมแพ็คเกจอัตโนมัติล้มเหลว: {str(e)}"
                    )
            
            # Return response based on status
            if is_duplicate:
                # Show slip data even if duplicate
                return {
                    "success": True,
                    "message": "⚠️ ตรวจพบสลิปซ้ำ: สลิปนี้เคยถูกใช้ชำระเงินแล้ว รอตรวจสอบจากผู้ดูแลระบบ",
                    "payment_id": payment_id,
                    "is_duplicate": True,
                    "data_matched": all_verified,
                    "needs_review": True,
                    "slip_data": {
                        "receiver_account": receiver_account_no,
                        "receiver_name": receiver_name,
                        "amount": actual_amount,
                        "trans_ref": trans_ref
                    },
                    "verification": {
                        "account_matched": account_matched,
                        "name_matched": name_matched,
                        "amount_matched": amount_matched,
                        "amount": actual_amount,
                        "issues": verification_issues,
                        "note": "ข้อมูลตรงกันแต่สลิปซ้ำ" if all_verified else None
                    }
                }
            elif all_verified:
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
            else:
                return {
                    "success": True,
                    "message": "รับข้อมูลการชำระเงินแล้ว รอการตรวจสอบจากผู้ดูแลระบบ",
                    "payment_id": payment_id,
                    "needs_review": True,
                    "verification": {
                        "account_matched": account_matched,
                        "name_matched": name_matched,
                        "amount_matched": amount_matched,
                        "amount": actual_amount,
                        "issues": verification_issues
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
            
            # Check if already verified (e.g., auto-approved)
            if payment.get("status") == "verified":
                verification_result = payment.get("verification_result", {})
                if verification_result.get("auto_approved"):
                    return JSONResponse(
                        status_code=400, 
                        content={"success": False, "message": "การชำระเงินนี้ได้รับการอนุมัติอัตโนมัติไปแล้ว"}
                    )
                return JSONResponse(
                    status_code=400, 
                    content={"success": False, "message": "การชำระเงินนี้ได้รับการอนุมัติไปแล้ว"}
                )
            
            # Fetch package details for quota and duration
            package = app.state.package_model.get_package_by_id(payment["package_id"])
            if not package:
                return JSONResponse(status_code=404, content={"success": False, "message": "Package not found"})
            
            # Update payment status with admin info
            app.state.payment_model.update_payment_status(
                payment_id, 
                "verified", 
                verification_result={
                    **payment.get("verification_result", {}),
                    "verified_by": user["user_id"],
                    "admin_approved": True
                },
                admin_notes=f"อนุมัติโดย Admin: {user.get('username', user['user_id'])}",
                admin_id=user["user_id"]
            )
            
            # Add subscription using the new unified method
            success = app.state.subscription_model.add_subscription(
                user_id=payment["user_id"],
                package_id=payment["package_id"],
                payment_id=payment_id
            )
            
            if success:
                logger.info(f"✅ Admin approved payment {payment_id} for user {payment['user_id']}")
                return {"success": True, "message": "อนุมัติการชำระเงินสำเร็จ และเติมแพ็คเกจให้ผู้ใช้แล้ว"}
            else:
                logger.error(f"❌ Failed to add subscription for payment {payment_id}")
                return JSONResponse(
                    status_code=500, 
                    content={"success": False, "message": "อนุมัติสำเร็จแต่ไม่สามารถเติมแพ็คเกจได้ กรุณาตรวจสอบ"}
                )
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
    
    # ==================== Quota Reservation APIs (Two-Phase Commit) ====================
    
    @app.get("/api/user/quota/detailed")
    async def get_user_quota_detailed(request: Request):
        '''Get detailed user quota with reservation info'''
        user = app.state.auth.get_current_user(request)
        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")
        
        try:
            # Get quota status
            quota = app.state.subscription_model.check_quota(user["user_id"])
            
            # Get active reservations
            reservations = app.state.quota_reservation_model.get_user_reservations(
                user["user_id"],
                status="reserved",
                limit=10
            )
            
            # Get reservation statistics
            stats = app.state.quota_reservation_model.get_statistics(user["user_id"])
            
            return {
                "success": True,
                "quota": quota,
                "active_reservations": len(reservations),
                "reservation_stats": stats
            }
        except Exception as e:
            logger.error(f"Error checking detailed quota: {e}")
            return JSONResponse(status_code=500, content={"success": False, "message": str(e)})
    
    @app.get("/api/admin/reservations")
    async def get_all_reservations(request: Request, status_filter: str = None):
        '''Get all quota reservations (Admin only)'''
        user = app.state.auth.get_current_user(request)
        if not user or user["role"] != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Admin access required")
        
        try:
            # Get all reservations with optional status filter
            query = {}
            if status_filter:
                query["status"] = status_filter
            
            reservations = list(app.state.quota_reservation_model.collection.find(query).sort("created_at", -1).limit(100))
            
            for res in reservations:
                res["_id"] = str(res["_id"])
                if res.get("created_at"):
                    res["created_at"] = res["created_at"].isoformat()
                if res.get("expires_at"):
                    res["expires_at"] = res["expires_at"].isoformat()
                if res.get("confirmed_at"):
                    res["confirmed_at"] = res["confirmed_at"].isoformat()
                if res.get("rolled_back_at"):
                    res["rolled_back_at"] = res["rolled_back_at"].isoformat()
            
            # Get statistics
            stats = app.state.quota_reservation_model.get_statistics()
            
            return {"success": True, "reservations": reservations, "statistics": stats}
        except Exception as e:
            logger.error(f"Error fetching reservations: {e}")
            return JSONResponse(status_code=500, content={"success": False, "message": str(e)})
    
    @app.post("/api/admin/reservations/cleanup")
    async def cleanup_expired_reservations(request: Request):
        '''Cleanup expired reservations (Admin only)'''
        user = app.state.auth.get_current_user(request)
        if not user or user["role"] != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Admin access required")
        
        try:
            count = app.state.quota_reservation_model.cleanup_expired_reservations()
            return {"success": True, "message": f"Cleaned up {count} expired reservations", "count": count}
        except Exception as e:
            logger.error(f"Error cleaning up reservations: {e}")
            return JSONResponse(status_code=500, content={"success": False, "message": str(e)})
    
    @app.post("/api/admin/reservations/{reservation_id}/rollback")
    async def admin_rollback_reservation(request: Request, reservation_id: str):
        '''Manually rollback a reservation (Admin only)'''
        user = app.state.auth.get_current_user(request)
        if not user or user["role"] != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Admin access required")
        
        try:
            data = await request.json()
            reason = data.get("reason", "admin_manual_rollback")
            
            success = app.state.quota_reservation_model.rollback_reservation(reservation_id, reason)
            
            if success:
                return {"success": True, "message": "Reservation rolled back successfully"}
            else:
                return JSONResponse(status_code=400, content={"success": False, "message": "Failed to rollback reservation"})
        except Exception as e:
            logger.error(f"Error rolling back reservation: {e}")
            return JSONResponse(status_code=500, content={"success": False, "message": str(e)})
    
    @app.post("/api/admin/reservations/fix/{user_id}")
    async def fix_user_reservations(request: Request, user_id: str):
        '''Fix stuck reservations for a user (Admin only)'''
        user = app.state.auth.get_current_user(request)
        if not user or user["role"] != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Admin access required")
        
        try:
            result = app.state.quota_reservation_model.fix_stuck_reservations(user_id)
            return {"success": True, **result}
        except Exception as e:
            logger.error(f"Error fixing reservations: {e}")
            return JSONResponse(status_code=500, content={"success": False, "message": str(e)})
    
    @app.post("/api/admin/reservations/reset/{user_id}")
    async def reset_user_reservations(request: Request, user_id: str):
        '''Emergency reset all reservations for a user (Admin only)'''
        user = app.state.auth.get_current_user(request)
        if not user or user["role"] != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Admin access required")
        
        try:
            result = app.state.quota_reservation_model.reset_all_reservations(user_id)
            return {"success": True, **result}
        except Exception as e:
            logger.error(f"Error resetting reservations: {e}")
            return JSONResponse(status_code=500, content={"success": False, "message": str(e)})
    
    @app.get("/api/admin/quota/stats")
    async def get_quota_statistics(request: Request):
        '''Get overall quota statistics (Admin only)'''
        user = app.state.auth.get_current_user(request)
        if not user or user["role"] != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Admin access required")
        
        try:
            # Get reservation stats
            reservation_stats = app.state.quota_reservation_model.get_statistics()
            
            # Get subscription stats
            from datetime import datetime
            active_subs = list(app.state.subscription_model.collection.find({
                "status": "active",
                "end_date": {"$gt": datetime.now()}
            }))
            
            total_quota = sum(s.get("slips_quota", 0) for s in active_subs)
            total_used = sum(s.get("slips_used", 0) for s in active_subs)
            total_reserved = sum(s.get("slips_reserved", 0) for s in active_subs)
            
            return {
                "success": True,
                "statistics": {
                    "subscriptions": {
                        "active_count": len(active_subs),
                        "total_quota": total_quota,
                        "total_used": total_used,
                        "total_reserved": total_reserved,
                        "total_available": total_quota - total_used - total_reserved
                    },
                    "reservations": reservation_stats
                }
            }
        except Exception as e:
            logger.error(f"Error getting quota stats: {e}")
            return JSONResponse(status_code=500, content={"success": False, "message": str(e)})

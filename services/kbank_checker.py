# services/kbank_checker.py
import logging
import requests
import base64
import json
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from utils.config_manager import config_manager

logger = logging.getLogger("kbank_checker_service")

class KBankSlipChecker:
    def __init__(self):
        self.base_url = "https://openapi-sandbox.kasikornbank.com"  # สำหรับ sandbox
        # self.base_url = "https://openapi.kasikornbank.com"  # สำหรับ production
        self.oauth_url = f"{self.base_url}/v2/oauth/token"
        
    def _get_access_token(self) -> Optional[str]:
        """ขอ OAuth 2.0 access token ด้วย Client Credentials flow"""
        consumer_id = config_manager.get("kbank_consumer_id", "")
        consumer_secret = config_manager.get("kbank_consumer_secret", "")
        
        if not consumer_id or not consumer_secret:
            logger.error("ไม่พบ KBank Consumer ID หรือ Secret")
            return None
            
        try:
            # สร้าง Basic Auth header
            credentials = f"{consumer_id}:{consumer_secret}"
            encoded_credentials = base64.b64encode(credentials.encode()).decode()
            
            headers = {
                "Authorization": f"Basic {encoded_credentials}",
                "Content-Type": "application/x-www-form-urlencoded"
            }
            
            data = "grant_type=client_credentials"
            
            response = requests.post(
                self.oauth_url,
                headers=headers,
                data=data,
                timeout=30
            )
            
            response.raise_for_status()
            token_data = response.json()
            
            access_token = token_data.get("access_token")
            expires_in = token_data.get("expires_in", 1800)  # ค่าเริ่มต้น 30 นาที
            
            logger.info(f"✅ ได้รับ KBank access token แล้ว หมดอายุใน {expires_in} วินาที")
            return access_token
            
        except requests.exceptions.RequestException as e:
            logger.error(f"❌ ไม่สามารถขอ KBank access token ได้: {e}")
            return None
        except Exception as e:
            logger.error(f"❌ เกิดข้อผิดพลาดไม่คาดคิดในการขอ KBank token: {e}")
            return None
    
    def verify_slip(self, sending_bank_id: str, trans_ref: str) -> Dict[str, Any]:
        """
        ตรวจสอบสลิปด้วย KBank API
        
        Args:
            sending_bank_id: รหัสธนาคาร (เช่น "004" สำหรับกสิกร)
            trans_ref: หมายเลขอ้างอิงรายการโอนจากสลิป
            
        Returns:
            Dict ที่มีผลการตรวจสอบ
        """
        if not config_manager.get("kbank_enabled", False):
            return {"status": "error", "message": "ระบบตรวจสอบสลิป KBank ถูกปิดใช้งาน"}
            
        # ขอ access token
        access_token = self._get_access_token()
        if not access_token:
            return {"status": "error", "message": "ไม่สามารถยืนยันตัวตนกับ KBank API ได้"}
            
        try:
            # เตรียมข้อมูลส่ง request
            verify_url = f"{self.base_url}/v1/verslip/kbank/verify"
            
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
                "x-test-mode": "true",  # สำหรับ sandbox
                "env-id": "SLIP_VERIFICATION"
            }
            
            # สร้าง request ID และ timestamp ที่ไม่ซ้ำ
            request_id = uuid.uuid4().hex
            request_time = datetime.now(timezone.utc).isoformat()
            
            payload = {
                "rqUID": request_id,
                "rqDt": request_time,
                "data": {
                    "sendingBank": sending_bank_id,
                    "transRef": trans_ref
                }
            }
            
            logger.info(f"🔍 กำลังตรวจสอบสลิปด้วย KBank API: {trans_ref}")
            
            response = requests.post(
                verify_url,
                headers=headers,
                json=payload,
                timeout=30
            )
            
            response.raise_for_status()
            result = response.json()
            
            # แปลงผล response จาก KBank
            if result.get("status_code") == "200" and result.get("status_message") == "SUCCESS":
                data = result.get("data", {})
                return {
                    "status": "success",
                    "type": "kbank",
                    "data": {
                        "amount": data.get("amount"),
                        "sender_account": data.get("senderAccount"),
                        "receiver_account": data.get("receiverAccount"),
                        "trans_date": data.get("transDate"),
                        "trans_time": data.get("transTime"),
                        "bank_code": sending_bank_id,
                        "reference": trans_ref,
                        "verified_by": "KBank API"
                    }
                }
            else:
                error_message = result.get("status_message", "การตรวจสอบสลิปล้มเหลว")
                return {"status": "error", "message": f"KBank API: {error_message}"}
                
        except re

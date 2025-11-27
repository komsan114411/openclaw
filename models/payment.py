"""Payment model for subscription payments (bank transfer + USDT)"""
from datetime import datetime
from typing import Optional, Dict, Any, List
from bson import ObjectId
import base64
import logging

logger = logging.getLogger(__name__)


class PaymentModel:
    def __init__(self, db):
        self.db = db
        self.collection = db.payments
        # Create indexes
        self._ensure_indexes()
    
    def _ensure_indexes(self):
        """Create indexes for efficient querying"""
        try:
            self.collection.create_index([("trans_ref", 1)], name="trans_ref_idx")
            self.collection.create_index([("user_id", 1)], name="user_id_idx")
            self.collection.create_index([("status", 1)], name="status_idx")
            self.collection.create_index([("created_at", -1)], name="created_at_idx")
        except Exception as e:
            logger.warning(f"Index creation warning: {e}")
    
    def check_duplicate_slip(self, trans_ref: str) -> Dict[str, Any]:
        """
        ตรวจสอบว่า trans_ref (เลขอ้างอิงสลิป) ซ้ำหรือไม่
        
        Returns:
            {
                "is_duplicate": bool,
                "existing_payment": dict or None,  # ข้อมูล payment เดิมถ้าซ้ำ
                "duplicate_count": int
            }
        """
        try:
            if not trans_ref:
                return {"is_duplicate": False, "existing_payment": None, "duplicate_count": 0}
            
            # Find existing payments with this trans_ref
            existing = self.collection.find_one({
                "verification_result.trans_ref": trans_ref
            })
            
            count = self.collection.count_documents({
                "verification_result.trans_ref": trans_ref
            })
            
            if existing:
                existing["_id"] = str(existing["_id"])
                # Don't send slip image data in duplicate check
                if "slip_image_data" in existing:
                    existing["has_slip"] = True
                    del existing["slip_image_data"]
                
                return {
                    "is_duplicate": True,
                    "existing_payment": existing,
                    "duplicate_count": count
                }
            
            return {"is_duplicate": False, "existing_payment": None, "duplicate_count": 0}
        except Exception as e:
            logger.error(f"Error checking duplicate slip: {e}")
            return {"is_duplicate": False, "existing_payment": None, "duplicate_count": 0}
        
    def create_payment(
        self,
        user_id: str,
        package_id: str,
        amount: float,
        payment_type: str = "bank_transfer",  # bank_transfer or usdt
        slip_image_data: Optional[bytes] = None,
        transaction_hash: Optional[str] = None,
        from_address: Optional[str] = None
    ) -> str:
        """Create a new payment record"""
        payment = {
            "user_id": user_id,
            "package_id": package_id,
            "amount": float(amount),
            "payment_type": payment_type,
            "status": "pending",  # pending, verified, rejected, failed
            "verification_result": None,
            "admin_notes": "",
            "verified_at": None,
            "verified_by": None,
            "created_at": datetime.now(),
            "updated_at": datetime.now()
        }
        
        # Add payment type specific fields
        if payment_type == "bank_transfer":
            payment["slip_image_data"] = base64.b64encode(slip_image_data).decode('utf-8') if slip_image_data else None
        elif payment_type == "usdt":
            payment["transaction_hash"] = transaction_hash
            payment["from_address"] = from_address
        
        result = self.collection.insert_one(payment)
        return str(result.inserted_id)
    
    def get_payment_by_id(self, payment_id: str) -> Optional[Dict[str, Any]]:
        """Get payment by ID"""
        try:
            payment = self.collection.find_one({"_id": ObjectId(payment_id)})
            if payment:
                payment["_id"] = str(payment["_id"])
            return payment
        except:
            return None
    
    def get_user_payments(self, user_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Get all payments for a user"""
        payments = list(self.collection.find({
            "user_id": user_id
        }).sort("created_at", -1).limit(limit))
        
        for payment in payments:
            payment["_id"] = str(payment["_id"])
            # Remove slip image data from list view for performance
            if "slip_image_data" in payment:
                payment["has_slip"] = bool(payment["slip_image_data"])
                del payment["slip_image_data"]
            
        return payments
    
    def get_pending_payments(self, payment_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get all pending payments for admin review"""
        query = {"status": "pending"}
        if payment_type:
            query["payment_type"] = payment_type
        
        payments = list(self.collection.find(query).sort("created_at", 1))
        
        for payment in payments:
            payment["_id"] = str(payment["_id"])
            # Keep has_slip flag but remove actual data
            if "slip_image_data" in payment:
                payment["has_slip"] = bool(payment["slip_image_data"])
                del payment["slip_image_data"]
        
        return payments
    
    def update_payment_status(
        self,
        payment_id: str,
        status: str,
        verification_result: Optional[Dict] = None,
        admin_notes: str = "",
        admin_id: Optional[str] = None
    ) -> bool:
        """Update payment status"""
        try:
            update_data = {
                "status": status,
                "updated_at": datetime.now()
            }
            
            if verification_result:
                update_data["verification_result"] = verification_result
            
            if admin_notes:
                update_data["admin_notes"] = admin_notes
            
            if status == "verified":
                update_data["verified_at"] = datetime.now()
                if admin_id:
                    update_data["verified_by"] = admin_id
            
            result = self.collection.update_one(
                {"_id": ObjectId(payment_id)},
                {"$set": update_data}
            )
            
            return result.modified_count > 0
        except:
            return False
    
    def verify_payment(self, payment_id: str, verification_result: Dict) -> bool:
        """Mark payment as verified with result"""
        return self.update_payment_status(
            payment_id,
            "verified",
            verification_result=verification_result
        )
    
    def reject_payment(self, payment_id: str, reason: str, admin_id: str) -> bool:
        """Reject a payment"""
        return self.update_payment_status(
            payment_id,
            "rejected",
            admin_notes=reason,
            admin_id=admin_id
        )
    
    def approve_payment_manual(self, payment_id: str, admin_id: str, notes: str = "") -> bool:
        """Manually approve a payment (for USDT or manual review)"""
        return self.update_payment_status(
            payment_id,
            "verified",
            admin_notes=notes,
            admin_id=admin_id
        )
    
    def get_payments_by_status(self, status: str) -> List[Dict[str, Any]]:
        """Get payments by status"""
        payments = list(self.collection.find({"status": status}).sort("created_at", -1))
        
        for payment in payments:
            payment["_id"] = str(payment["_id"])
            # Remove slip image data from list view for performance
            if "slip_image_data" in payment:
                payment["has_slip"] = bool(payment["slip_image_data"])
                payment["slip_image"] = payment["slip_image_data"]  # Keep for viewing
                # Don't delete, keep it for modal viewing
        
        return payments
    
    def get_all_payments(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Get all payments"""
        payments = list(self.collection.find({}).sort("created_at", -1).limit(limit))
        
        for payment in payments:
            payment["_id"] = str(payment["_id"])
            # Keep slip_image_data for viewing but add flag
            if "slip_image_data" in payment:
                payment["has_slip"] = bool(payment["slip_image_data"])
                payment["slip_image"] = payment["slip_image_data"]  # Keep for viewing
        
        return payments
    
    def get_total_revenue(self, start_date: Optional[datetime] = None) -> float:
        """Calculate total revenue from verified payments"""
        query = {"status": "verified"}
        
        if start_date:
            query["verified_at"] = {"$gte": start_date}
        
        pipeline = [
            {"$match": query},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
        ]
        
        result = list(self.collection.aggregate(pipeline))
        
        return result[0]["total"] if result else 0.0

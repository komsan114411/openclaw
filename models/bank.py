from datetime import datetime
from typing import Dict, List, Optional
from bson import ObjectId

class BankModel:
    """
    Model สำหรับเก็บข้อมูลธนาคาร (ใช้ PyMongo)
    """
    def __init__(self, db):
        self.collection = db.banks
        self._ensure_indexes()
    
    def _ensure_indexes(self):
        """สร้าง indexes"""
        self.collection.create_index("code", unique=True)
        self.collection.create_index("is_active")
    
    def create_bank(self, code: str, name: str, abbreviation: str = None, 
                   logo_base64: str = None, is_active: bool = True) -> Dict:
        """สร้างธนาคารใหม่"""
        bank = {
            "code": code,
            "name": name,
            "abbreviation": abbreviation or code,
            "logo_base64": logo_base64,
            "is_active": is_active,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        result = self.collection.insert_one(bank)
        bank["_id"] = result.inserted_id
        return bank
    
    def get_bank_by_code(self, code: str) -> Optional[Dict]:
        """ดึงข้อมูลธนาคารจาก code"""
        return self.collection.find_one({"code": code})
    
    def get_bank_by_id(self, bank_id: str) -> Optional[Dict]:
        """ดึงข้อมูลธนาคารจาก ID"""
        try:
            return self.collection.find_one({"_id": ObjectId(bank_id)})
        except:
            return None
    
    def get_all_banks(self, active_only: bool = False) -> List[Dict]:
        """ดึงข้อมูลธนาคารทั้งหมด"""
        query = {"is_active": True} if active_only else {}
        return list(self.collection.find(query).sort("name", 1))
    
    def update_bank(self, bank_id: str, update_data: Dict) -> bool:
        """อัพเดตข้อมูลธนาคาร"""
        try:
            update_data["updated_at"] = datetime.utcnow()
            result = self.collection.update_one(
                {"_id": ObjectId(bank_id)},
                {"$set": update_data}
            )
            return result.modified_count > 0 or result.matched_count > 0
        except:
            return False
    
    def delete_bank(self, bank_id: str) -> bool:
        """ลบธนาคาร"""
        try:
            result = self.collection.delete_one({"_id": ObjectId(bank_id)})
            return result.deleted_count > 0
        except:
            return False
    
    def bank_exists(self, code: str) -> bool:
        """ตรวจสอบว่าธนาคารมีอยู่แล้วหรือไม่"""
        return self.collection.count_documents({"code": code}) > 0
    
    def to_dict(self, bank: Dict) -> Dict:
        """แปลง bank document เป็น dictionary"""
        if not bank:
            return None
        
        return {
            "id": str(bank["_id"]),
            "code": bank.get("code"),
            "name": bank.get("name"),
            "abbreviation": bank.get("abbreviation", bank.get("code")),
            "logo_base64": bank.get("logo_base64"),
            "is_active": bank.get("is_active", True),
            "created_at": bank.get("created_at").isoformat() if bank.get("created_at") else None,
            "updated_at": bank.get("updated_at").isoformat() if bank.get("updated_at") else None
        }

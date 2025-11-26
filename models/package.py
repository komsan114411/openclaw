"""Package model for subscription plans"""
from datetime import datetime
from typing import Optional, Dict, Any
from bson import ObjectId


class PackageModel:
    def __init__(self, db):
        self.db = db
        self.collection = db.packages
        
    def create_package(
        self,
        name: str,
        description: str,
        price: float,
        slip_quota: int,
        duration_days: int,
        is_free_starter: bool = False,
        features: Optional[list] = None,
        price_usdt: Optional[float] = None
    ) -> str:
        """Create a new package"""
        package = {
            "name": name,
            "description": description,
            "price": float(price),
            "price_usdt": float(price_usdt) if price_usdt is not None else None,
            "slip_quota": int(slip_quota),
            "duration_days": int(duration_days),
            "is_active": True,
            "is_free_starter": is_free_starter,
            "features": features or [],
            "created_at": datetime.now(),
            "updated_at": datetime.now()
        }
        
        result = self.collection.insert_one(package)
        return str(result.inserted_id)
    
    def get_package_by_id(self, package_id: str) -> Optional[Dict[str, Any]]:
        """Get package by ID"""
        try:
            package = self.collection.find_one({"_id": ObjectId(package_id)})
            if package:
                package["_id"] = str(package["_id"])
            return package
        except:
            return None
    
    def get_all_packages(self, active_only: bool = False) -> list:
        """Get all packages"""
        query = {"is_active": True} if active_only else {}
        packages = list(self.collection.find(query).sort("price", 1))
        
        for package in packages:
            package["_id"] = str(package["_id"])
        
        return packages
    
    def get_active_packages(self) -> list:
        """Get only active packages (convenience method)"""
        return self.get_all_packages(active_only=True)
    
    def get_free_starter_package(self) -> Optional[Dict[str, Any]]:
        """Get the free starter package"""
        package = self.collection.find_one({
            "is_free_starter": True,
            "is_active": True
        })
        
        if package:
            package["_id"] = str(package["_id"])
        
        return package
    
    def update_package(self, package_id: str, update_data: Dict[str, Any]) -> bool:
        """Update package"""
        try:
            update_data["updated_at"] = datetime.now()
            
            result = self.collection.update_one(
                {"_id": ObjectId(package_id)},
                {"$set": update_data}
            )
            
            return result.modified_count > 0
        except:
            return False
    
    def deactivate_package(self, package_id: str) -> bool:
        """Deactivate a package"""
        return self.update_package(package_id, {"is_active": False})
    
    def activate_package(self, package_id: str) -> bool:
        """Activate a package"""
        return self.update_package(package_id, {"is_active": True})
    
    def delete_package(self, package_id: str) -> bool:
        """Delete a package (soft delete by deactivating)"""
        return self.deactivate_package(package_id)

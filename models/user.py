"""
User Model with Role-based Access Control
Fixed for Python 3.13 and bcrypt compatibility
"""
import logging
from datetime import datetime
from typing import Optional, Dict, Any
import bcrypt
from bson import ObjectId

logger = logging.getLogger("user_model")

class UserRole:
    """User role constants"""
    ADMIN = "admin"
    USER = "user"

class User:
    """User model with authentication and authorization"""
    
    def __init__(self, db):
        self.db = db
        self.collection = db.users
        self._ensure_indexes()
        self._ensure_default_admin()
    
    def _ensure_indexes(self):
        """Create necessary indexes"""
        try:
            self.collection.create_index("username", unique=True)
            self.collection.create_index("email", unique=True, sparse=True)
            logger.info("✅ User indexes created")
        except Exception as e:
            logger.error(f"❌ Error creating indexes: {e}")
    
    def _ensure_default_admin(self):
        """Create default admin user if not exists"""
        try:
            admin_exists = self.collection.find_one({"username": "admin"})
            if not admin_exists:
                # ลองสร้างด้วย create_user method ก่อน
                result = self.create_user(
                    username="admin",
                    password="admin123",
                    role=UserRole.ADMIN,
                    email="admin@system.local",
                    full_name="System Administrator",
                    force_password_change=True
                )
                
                if result:
                    logger.info("✅ Default admin user created (username: admin, password: admin123)")
                else:
                    # ถ้าไม่สำเร็จ ลองสร้างแบบ direct
                    self._create_admin_direct()
        except Exception as e:
            logger.error(f"❌ Error creating default admin: {e}")
            # ลองสร้างแบบ direct อีกครั้ง
            try:
                self._create_admin_direct()
            except Exception as e2:
                logger.error(f"❌ Fallback admin creation also failed: {e2}")
    
    def _create_admin_direct(self):
        """Create admin user directly using bcrypt"""
        try:
            # ตรวจสอบอีกครั้งว่ามี admin แล้วหรือยัง
            admin_exists = self.collection.find_one({"username": "admin"})
            if admin_exists:
                logger.info("✅ Admin user already exists")
                return
            
            # Hash password ด้วย bcrypt โดยตรง
            password = "admin123"
            password_bytes = password.encode('utf-8')
            salt = bcrypt.gensalt()
            hashed = bcrypt.hashpw(password_bytes, salt)
            
            admin_doc = {
                "username": "admin",
                "password": hashed.decode('utf-8'),
                "role": UserRole.ADMIN,
                "email": "admin@system.local",
                "full_name": "System Administrator",
                "force_password_change": True,
                "is_active": True,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
                "last_login": None,
                "line_accounts": []
            }
            
            self.collection.insert_one(admin_doc)
            logger.info("✅ Default admin user created via direct method (username: admin, password: admin123)")
            
        except Exception as e:
            logger.error(f"❌ Error in _create_admin_direct: {e}")
    
    @staticmethod
    def hash_password(password: str) -> str:
        """
        Hash password using bcrypt
        
        Note: bcrypt has a maximum password length of 72 bytes
        """
        try:
            # Encode password to bytes
            password_bytes = password.encode('utf-8')
            
            # bcrypt limit is 72 bytes
            if len(password_bytes) > 72:
                logger.warning("Password exceeds 72 bytes, truncating")
                password_bytes = password_bytes[:72]
            
            # Generate salt and hash
            salt = bcrypt.gensalt()
            hashed = bcrypt.hashpw(password_bytes, salt)
            
            return hashed.decode('utf-8')
            
        except Exception as e:
            logger.error(f"❌ Error hashing password: {e}")
            raise
    
    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        """
        Verify password against hash
        
        Args:
            plain_password: Plain text password
            hashed_password: Hashed password from database
            
        Returns:
            True if password matches, False otherwise
        """
        try:
            password_bytes = plain_password.encode('utf-8')
            
            # bcrypt limit is 72 bytes
            if len(password_bytes) > 72:
                password_bytes = password_bytes[:72]
            
            hashed_bytes = hashed_password.encode('utf-8')
            
            return bcrypt.checkpw(password_bytes, hashed_bytes)
            
        except Exception as e:
            logger.error(f"❌ Error verifying password: {e}")
            return False
    
    def create_user(
        self,
        username: str,
        password: str,
        role: str = UserRole.USER,
        email: Optional[str] = None,
        full_name: Optional[str] = None,
        force_password_change: bool = False
    ) -> Optional[str]:
        """Create new user"""
        try:
            # Check if username already exists
            if self.collection.find_one({"username": username}):
                logger.warning(f"Username '{username}' already exists")
                return None
            
            # Hash password
            hashed_password = self.hash_password(password)
            
            # Create user document
            user_doc = {
                "username": username,
                "password": hashed_password,
                "role": role,
                "email": email,
                "full_name": full_name,
                "force_password_change": force_password_change,
                "is_active": True,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
                "last_login": None,
                "line_accounts": []
            }
            
            result = self.collection.insert_one(user_doc)
            logger.info(f"✅ User created: {username} (role: {role})")
            return str(result.inserted_id)
            
        except Exception as e:
            logger.error(f"❌ Error creating user: {e}")
            return None
    
    def authenticate(self, username: str, password: str) -> Optional[Dict[str, Any]]:
        """Authenticate user and return user data"""
        try:
            user = self.collection.find_one({"username": username})
            
            if not user:
                logger.warning(f"User not found: {username}")
                return None
            
            if not user.get("is_active", False):
                logger.warning(f"User is inactive: {username}")
                return None
            
            if not self.verify_password(password, user["password"]):
                logger.warning(f"Invalid password for user: {username}")
                return None
            
            # Update last login
            self.collection.update_one(
                {"_id": user["_id"]},
                {"$set": {"last_login": datetime.utcnow()}}
            )
            
            # Remove password from returned data
            user.pop("password", None)
            user["_id"] = str(user["_id"])
            
            logger.info(f"✅ User authenticated: {username}")
            return user
            
        except Exception as e:
            logger.error(f"❌ Error authenticating user: {e}")
            return None
    
    def get_user_by_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get user by ID"""
        try:
            user = self.collection.find_one({"_id": ObjectId(user_id)})
            if user:
                user.pop("password", None)
                user["_id"] = str(user["_id"])
            return user
        except Exception as e:
            logger.error(f"❌ Error getting user: {e}")
            return None
    
    def get_user_by_username(self, username: str) -> Optional[Dict[str, Any]]:
        """Get user by username"""
        try:
            user = self.collection.find_one({"username": username})
            if user:
                user.pop("password", None)
                user["_id"] = str(user["_id"])
            return user
        except Exception as e:
            logger.error(f"❌ Error getting user: {e}")
            return None
    
    def update_password(self, user_id: str, new_password: str, clear_force_change: bool = True) -> bool:
        """Update user password"""
        try:
            # Hash new password
            hashed_password = self.hash_password(new_password)
            
            update_data = {
                "password": hashed_password,
                "updated_at": datetime.utcnow()
            }
            
            if clear_force_change:
                update_data["force_password_change"] = False
            
            result = self.collection.update_one(
                {"_id": ObjectId(user_id)},
                {"$set": update_data}
            )
            
            success = result.modified_count > 0
            
            if success:
                logger.info(f"✅ Password updated for user: {user_id}")
            else:
                logger.warning(f"⚠️ Password not updated (no changes) for user: {user_id}")
            
            return success
            
        except Exception as e:
            logger.error(f"❌ Error updating password: {e}")
            return False
    
    def update_user(self, user_id: str, update_data: Dict[str, Any]) -> bool:
        """Update user information"""
        try:
            # Remove sensitive fields that shouldn't be updated this way
            update_data.pop("password", None)
            update_data.pop("_id", None)
            update_data["updated_at"] = datetime.utcnow()
            
            result = self.collection.update_one(
                {"_id": ObjectId(user_id)},
                {"$set": update_data}
            )
            
            success = result.modified_count > 0
            
            if success:
                logger.info(f"✅ User updated: {user_id}")
            
            return success
            
        except Exception as e:
            logger.error(f"❌ Error updating user: {e}")
            return False
    
    def delete_user(self, user_id: str) -> bool:
        """Delete user (soft delete by setting is_active to False)"""
        try:
            result = self.collection.update_one(
                {"_id": ObjectId(user_id)},
                {"$set": {"is_active": False, "updated_at": datetime.utcnow()}}
            )
            
            success = result.modified_count > 0
            
            if success:
                logger.info(f"✅ User deleted (soft): {user_id}")
            
            return success
            
        except Exception as e:
            logger.error(f"❌ Error deleting user: {e}")
            return False
    
    def restore_user(self, user_id: str) -> bool:
        """Restore deleted user (set is_active to True)"""
        try:
            result = self.collection.update_one(
                {"_id": ObjectId(user_id)},
                {"$set": {"is_active": True, "updated_at": datetime.utcnow()}}
            )
            
            success = result.modified_count > 0
            
            if success:
                logger.info(f"✅ User restored: {user_id}")
            
            return success
            
        except Exception as e:
            logger.error(f"❌ Error restoring user: {e}")
            return False
    
    def get_all_users(self, include_inactive: bool = False) -> list:
        """Get all users"""
        try:
            query = {} if include_inactive else {"is_active": True}
            users = list(self.collection.find(query))
            
            for user in users:
                user.pop("password", None)
                user["_id"] = str(user["_id"])
            
            return users
        except Exception as e:
            logger.error(f"❌ Error getting users: {e}")
            return []
    
    def add_line_account_to_user(self, user_id: str, line_account_id: str) -> bool:
        """Add LINE account access to user"""
        try:
            result = self.collection.update_one(
                {"_id": ObjectId(user_id)},
                {"$addToSet": {"line_accounts": line_account_id}}
            )
            return result.modified_count > 0
        except Exception as e:
            logger.error(f"❌ Error adding LINE account to user: {e}")
            return False
    
    def remove_line_account_from_user(self, user_id: str, line_account_id: str) -> bool:
        """Remove LINE account access from user"""
        try:
            result = self.collection.update_one(
                {"_id": ObjectId(user_id)},
                {"$pull": {"line_accounts": line_account_id}}
            )
            return result.modified_count > 0
        except Exception as e:
            logger.error(f"❌ Error removing LINE account from user: {e}")
            return False
    
    def get_user_line_accounts(self, user_id: str) -> list:
        """Get LINE accounts accessible by user"""
        try:
            user = self.collection.find_one({"_id": ObjectId(user_id)})
            if user:
                return user.get("line_accounts", [])
            return []
        except Exception as e:
            logger.error(f"❌ Error getting user LINE accounts: {e}")
            return []

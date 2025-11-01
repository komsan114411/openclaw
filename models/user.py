"""
User Model with Role-based Access Control
"""
import logging
from datetime import datetime
from typing import Optional, Dict, Any
from passlib.context import CryptContext
from bson import ObjectId

logger = logging.getLogger("user_model")

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

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
                self.create_user(
                    username="admin",
                    password="admin123",
                    role=UserRole.ADMIN,
                    email="admin@system.local",
                    full_name="System Administrator",
                    force_password_change=True
                )
                logger.info("✅ Default admin user created (username: admin, password: admin123)")
        except Exception as e:
            logger.error(f"❌ Error creating default admin: {e}")
    
    @staticmethod
    def hash_password(password: str) -> str:
        """Hash password using bcrypt"""
        return pwd_context.hash(password)
    
    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        """Verify password against hash"""
        return pwd_context.verify(plain_password, hashed_password)
    
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
            
            # Create user document
            user_doc = {
                "username": username,
                "password": self.hash_password(password),
                "role": role,
                "email": email,
                "full_name": full_name,
                "force_password_change": force_password_change,
                "is_active": True,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
                "last_login": None,
                "line_accounts": []  # Array of LINE account IDs this user can access
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
            update_data = {
                "password": self.hash_password(new_password),
                "updated_at": datetime.utcnow()
            }
            
            if clear_force_change:
                update_data["force_password_change"] = False
            
            result = self.collection.update_one(
                {"_id": ObjectId(user_id)},
                {"$set": update_data}
            )
            
            return result.modified_count > 0
            
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
            
            return result.modified_count > 0
            
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
            return result.modified_count > 0
        except Exception as e:
            logger.error(f"❌ Error deleting user: {e}")
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


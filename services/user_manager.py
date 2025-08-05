# services/user_manager.py
import logging
from datetime import datetime
from typing import Dict, Any, Optional, List
from models.postgres_models import db_manager, UserModel, ChatHistoryModel

logger = logging.getLogger("user_manager")

class UserManager:
    def __init__(self):
        self.line_token = None
    
    def set_line_token(self, token: str):
        """ตั้งค่า LINE access token"""
        self.line_token = token
    
    async def get_or_create_user(self, user_id: str) -> UserModel:
        """ดึงหรือสร้างผู้ใช้ใหม่"""
        try:
            db = db_manager.get_session()
            
            # หาผู้ใช้ที่มีอยู่
            user = db.query(UserModel).filter(UserModel.user_id == user_id).first()
            
            if user:
                # อัปเดต last_active
                user.last_active = datetime.utcnow()
                db.commit()
                db.close()
                return user
            
            # สร้างผู้ใช้ใหม่
            user = UserModel(
                user_id=user_id,
                display_name=f"User {user_id[:8]}...",
                created_at=datetime.utcnow(),
                last_active=datetime.utcnow()
            )
            
            db.add(user)
            db.commit()
            
            # ดึงข้อมูลโปรไฟล์จาก LINE
            await self._fetch_line_profile(user)
            
            db.close()
            logger.info(f"👤 Created new user: {user_id}")
            return user
            
        except Exception as e:
            logger.error(f"❌ Error managing user {user_id}: {e}")
            if 'db' in locals():
                db.rollback()
                db.close()
            return None
    
    async def _fetch_line_profile(self, user: UserModel):
        """ดึงข้อมูลโปรไฟล์จาก LINE API"""
        if not self.line_token:
            return
        
        try:
            import httpx
            
            url = f"https://api.line.me/v2/bot/profile/{user.user_id}"
            headers = {"Authorization": f"Bearer {self.line_token}"}
            
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(url, headers=headers)
                
                if response.status_code == 200:
                    profile = response.json()
                    
                    # อัปเดตข้อมูลโปรไฟล์
                    db = db_manager.get_session()
                    existing_user = db.query(UserModel).filter(UserModel.user_id == user.user_id).first()
                    
                    if existing_user:
                        existing_user.display_name = profile.get("displayName", existing_user.display_name)
                        existing_user.profile_picture_url = profile.get("pictureUrl", existing_user.profile_picture_url)
                        existing_user.updated_at = datetime.utcnow()
                        
                        db.commit()
                        logger.info(f"✅ Updated profile for {user.user_id}: {existing_user.display_name}")
                    
                    db.close()
        except Exception as e:
            logger.warning(f"⚠️ Could not fetch LINE profile for {user.user_id}: {e}")
    
    def get_all_users(self, limit: int = 100, search: str = None) -> List[UserModel]:
        """ดึงรายชื่อผู้ใช้ทั้งหมด"""
        try:
            db = db_manager.get_session()
            query = db.query(UserModel)
            
            if search:
                search_term = f"%{search}%"
                query = query.filter(
                    (UserModel.display_name.like(search_term)) |
                    (UserModel.first_name.like(search_term)) |
                    (UserModel.last_name.like(search_term)) |
                    (UserModel.user_id.like(search_term))
                )
            
            users = query.order_by(UserModel.last_active.desc()).limit(limit).all()
            db.close()
            return users
            
        except Exception as e:
            logger.error(f"❌ Error getting users: {e}")
            if 'db' in locals():
                db.close()
            return []
    
    def update_user(self, user_id: str, updates: Dict[str, Any]) -> bool:
        """อัปเดตข้อมูลผู้ใช้"""
        try:
            db = db_manager.get_session()
            user = db.query(UserModel).filter(UserModel.user_id == user_id).first()
            
            if user:
                for key, value in updates.items():
                    if hasattr(user, key):
                        setattr(user, key, value)
                
                user.updated_at = datetime.utcnow()
                db.commit()
                db.close()
                logger.info(f"✅ Updated user {user_id}")
                return True
            
            db.close()
            return False
            
        except Exception as e:
            logger.error(f"❌ Error updating user {user_id}: {e}")
            if 'db' in locals():
                db.rollback()
                db.close()
            return False
    
    def get_user_stats(self) -> Dict[str, Any]:
        """ดึงสstatistics ของผู้ใช้"""
        try:
            db = db_manager.get_session()
            
            total_users = db.query(UserModel).count()
            
            # ผู้ใช้ที่ active ใน 24 ชั่วโมงที่ผ่านมา
            from datetime import timedelta
            yesterday = datetime.utcnow() - timedelta(days=1)
            active_users = db.query(UserModel).filter(UserModel.last_active >= yesterday).count()
            
            # ผู้ใช้ใหม่ในสัปดาห์นี้
            week_ago = datetime.utcnow() - timedelta(days=7)
            new_users = db.query(UserModel).filter(UserModel.created_at >= week_ago).count()
            
            db.close()
            
            return {
                "total_users": total_users,
                "active_24h": active_users,
                "new_this_week": new_users
            }
            
        except Exception as e:
            logger.error(f"❌ Error getting user stats: {e}")
            if 'db' in locals():
                db.close()
            return {"total_users": 0, "active_24h": 0, "new_this_week": 0}

# สร้าง instance
user_manager = UserManager()

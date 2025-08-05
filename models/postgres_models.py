# models/postgres_models.py
import os
from datetime import datetime
from typing import Optional, Dict, Any
from sqlalchemy import create_engine, Column, Integer, String, Text, Boolean, DateTime, JSON, ForeignKey, Index
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session, relationship
import logging

logger = logging.getLogger("postgres_models")

# Base class สำหรับ models
Base = declarative_base()

class ConfigModel(Base):
    """Model สำหรับเก็บการตั้งค่าระบบ"""
    __tablename__ = 'system_config'
    
    id = Column(Integer, primary_key=True)
    key = Column(String(100), unique=True, nullable=False, index=True)
    value = Column(Text)
    value_type = Column(String(20), default='string')  # 'string', 'boolean', 'json'
    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def __repr__(self):
        return f"<ConfigModel(key='{self.key}', value_type='{self.value_type}')>"

class UserModel(Base):
    """Model สำหรับเก็บข้อมูลผู้ใช้ LINE"""
    __tablename__ = 'users'
    
    id = Column(Integer, primary_key=True)
    user_id = Column(String(100), unique=True, nullable=False, index=True)  # LINE User ID
    display_name = Column(String(200))  # ชื่อที่แสดงใน LINE
    first_name = Column(String(100))
    last_name = Column(String(100))
    profile_picture_url = Column(Text)  # URL รูปโปรไฟล์
    phone_number = Column(String(20))
    email = Column(String(200))
    notes = Column(Text)  # หมายเหตุจาก admin
    tags = Column(JSON)  # แท็กสำหรับจัดกลุ่มผู้ใช้
    is_blocked = Column(Boolean, default=False)  # บล็อกผู้ใช้หรือไม่
    is_vip = Column(Boolean, default=False)  # ผู้ใช้ VIP หรือไม่
    language = Column(String(10), default='th')  # ภาษาที่ใช้
    timezone = Column(String(50), default='Asia/Bangkok')  # เขตเวลา
    last_active = Column(DateTime, default=datetime.utcnow, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    chat_history = relationship("ChatHistoryModel", back_populates="user", cascade="all, delete-orphan")
    
    # Indexes
    __table_args__ = (
        Index('idx_user_last_active', 'last_active'),
        Index('idx_user_created_at', 'created_at'),
        Index('idx_user_display_name', 'display_name'),
    )
    
    def __repr__(self):
        return f"<UserModel(user_id='{self.user_id}', display_name='{self.display_name}')>"

class ChatHistoryModel(Base):
    """Model สำหรับเก็บประวัติแชท"""
    __tablename__ = 'chat_history'
    
    id = Column(Integer, primary_key=True)
    user_id = Column(String(100), ForeignKey('users.user_id'), nullable=False, index=True)
    direction = Column(String(10), nullable=False)  # 'in' หรือ 'out'
    message_type = Column(String(20), default='text')  # 'text', 'image', 'sticker', etc.
    message_text = Column(Text)  # ข้อความที่ส่ง
    message_data = Column(JSON)  # ข้อมูล JSON ดิบจาก LINE
    sender = Column(String(50), default='unknown')  # 'user', 'ai_bot', 'slip_bot', 'admin', etc.
    read_status = Column(Boolean, default=False)  # อ่านแล้วหรือยัง
    reply_to_message_id = Column(Integer, ForeignKey('chat_history.id'))  # ตอบกลับข้อความไหน
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    
    # Relationships
    user = relationship("UserModel", back_populates="chat_history")
    reply_to = relationship("ChatHistoryModel", remote_side=[id])
    
    # Indexes
    __table_args__ = (
        Index('idx_chat_user_created', 'user_id', 'created_at'),
        Index('idx_chat_direction', 'direction'),
        Index('idx_chat_sender', 'sender'),
        Index('idx_chat_read_status', 'read_status'),
    )
    
    def __repr__(self):
        return f"<ChatHistoryModel(user_id='{self.user_id}', direction='{self.direction}', sender='{self.sender}')>"

class APILogModel(Base):
    """Model สำหรับเก็บ log การใช้งาน API"""
    __tablename__ = 'api_logs'
    
    id = Column(Integer, primary_key=True)
    api_name = Column(String(50), nullable=False, index=True)  # 'thunder', 'kbank', 'line', 'openai'
    endpoint = Column(String(200))  # URL endpoint ที่เรียก
    method = Column(String(10))  # HTTP method
    status_code = Column(Integer)  # HTTP status code
    response_time = Column(Integer)  # เวลาตอบกลับ (milliseconds)
    request_size = Column(Integer)  # ขนาด request (bytes)
    response_size = Column(Integer)  # ขนาด response (bytes)
    user_id = Column(String(100))  # User ID ที่เกี่ยวข้อง (ถ้ามี)
    error_message = Column(Text)  # ข้อความ error (ถ้ามี)
    request_id = Column(String(100))  # Request ID สำหรับ tracking
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    
    # Indexes
    __table_args__ = (
        Index('idx_api_log_api_name_date', 'api_name', 'created_at'),
        Index('idx_api_log_status_code', 'status_code'),
        Index('idx_api_log_user_id', 'user_id'),
    )
    
    def __repr__(self):
        return f"<APILogModel(api_name='{self.api_name}', status_code={self.status_code})>"

class VirtualChannelModel(Base):
    """Model สำหรับเก็บข้อมูล Virtual Channels"""
    __tablename__ = 'virtual_channels'
    
    id = Column(Integer, primary_key=True)
    channel_id = Column(String(100), unique=True, nullable=False, index=True)
    channel_secret = Column(String(200), nullable=False)
    access_token = Column(String(500), nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text)
    channel_type = Column(String(20), default='virtual')  # 'virtual', 'line_import'
    status = Column(String(20), default='active')  # 'active', 'inactive'
    webhook_url = Column(Text)  # Webhook URL ที่ระบบภายนอกใช้
    owner_info = Column(JSON)  # ข้อมูลเจ้าของ channel
    usage_stats = Column(JSON)  # สถิติการใช้งาน
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Indexes
    __table_args__ = (
        Index('idx_virtual_channel_status', 'status'),
        Index('idx_virtual_channel_type', 'channel_type'),
    )
    
    def __repr__(self):
        return f"<VirtualChannelModel(channel_id='{self.channel_id}', name='{self.name}')>"

class SystemEventModel(Base):
    """Model สำหรับเก็บ system events และ audit logs"""
    __tablename__ = 'system_events'
    
    id = Column(Integer, primary_key=True)
    event_type = Column(String(50), nullable=False, index=True)  # 'user_login', 'config_change', 'api_error', etc.
    severity = Column(String(20), default='info')  # 'debug', 'info', 'warning', 'error', 'critical'
    title = Column(String(200), nullable=False)
    description = Column(Text)
    user_id = Column(String(100))  # ผู้ใช้ที่เกี่ยวข้อง
    admin_user = Column(String(100))  # Admin ที่ทำการเปลี่ยนแปลง
    ip_address = Column(String(45))  # IP address
    user_agent = Column(Text)  # User agent
    metadata = Column(JSON)  # ข้อมูลเพิ่มเติม
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    
    # Indexes
    __table_args__ = (
        Index('idx_system_event_type_date', 'event_type', 'created_at'),
        Index('idx_system_event_severity', 'severity'),
        Index('idx_system_event_user_id', 'user_id'),
    )
    
    def __repr__(self):
        return f"<SystemEventModel(event_type='{self.event_type}', severity='{self.severity}')>"

class NotificationModel(Base):
    """Model สำหรับเก็บการแจ้งเตือนระบบ"""
    __tablename__ = 'notifications'
    
    id = Column(Integer, primary_key=True)
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    notification_type = Column(String(20), default='info')  # 'info', 'warning', 'error', 'success'
    target_users = Column(JSON)  # รายชื่อผู้ใช้ที่ต้องได้รับการแจ้งเตือน
    is_broadcast = Column(Boolean, default=False)  # แจ้งเตือนทุกคนหรือไม่
    is_read = Column(Boolean, default=False)  # อ่านแล้วหรือไม่
    read_by = Column(JSON)  # รายชื่อผู้ที่อ่านแล้ว
    expires_at = Column(DateTime)  # วันหมดอายุ
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    
    # Indexes
    __table_args__ = (
        Index('idx_notification_type', 'notification_type'),
        Index('idx_notification_read', 'is_read'),
        Index('idx_notification_expires', 'expires_at'),
    )
    
    def __repr__(self):
        return f"<NotificationModel(title='{self.title}', type='{self.notification_type}')>"

class DatabaseManager:
    """Class สำหรับจัดการ Database operations"""
    
    def __init__(self):
        self.engine = None
        self.SessionLocal = None
        self._initialize_connection()
    
    def _initialize_connection(self):
        """เชื่อมต่อกับ PostgreSQL Database"""
        try:
            # Get DATABASE_URL from environment
            database_url = os.environ.get('DATABASE_URL')
            
            if not database_url:
                logger.warning("⚠️ DATABASE_URL not found, using SQLite fallback")
                database_url = "sqlite:///./fallback.db"
            else:
                # Fix for SQLAlchemy 1.4+ (Heroku uses postgres:// but SQLAlchemy needs postgresql://)
                if database_url.startswith("postgres://"):
                    database_url = database_url.replace("postgres://", "postgresql://", 1)
                logger.info("🐘 Using PostgreSQL database")
            
            # Create engine with connection pooling
            engine_kwargs = {
                'pool_pre_ping': True,
                'pool_recycle': 300,
                'pool_size': 10,
                'max_overflow': 20,
                'pool_timeout': 30,
                'echo': False  # Set to True for SQL debugging
            }
            
            # Add SSL settings for PostgreSQL
            if "postgresql://" in database_url:
                engine_kwargs['connect_args'] = {
                    "sslmode": "require",
                    "options": "-c timezone=Asia/Bangkok"
                }
            
            self.engine = create_engine(database_url, **engine_kwargs)
            
            # Create session factory
            self.SessionLocal = sessionmaker(
                autocommit=False, 
                autoflush=False, 
                bind=self.engine,
                expire_on_commit=False
            )
            
            logger.info("✅ Database connection established")
            
        except Exception as e:
            logger.error(f"❌ Database connection failed: {e}")
            # Fallback to SQLite
            self.engine = create_engine(
                "sqlite:///./emergency_fallback.db",
                pool_pre_ping=True,
                echo=False
            )
            self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
            logger.warning("🔄 Using SQLite fallback database")
    
    def create_tables(self):
        """สร้างตารางทั้งหมด"""
        try:
            # สร้างตารางทั้งหมด
            Base.metadata.create_all(bind=self.engine)
            logger.info("✅ Database tables created/verified")
            
            # เพิ่มข้อมูลเริ่มต้น
            self._initialize_default_data()
            
        except Exception as e:
            logger.error(f"❌ Failed to create tables: {e}")
            raise e
    
    def _initialize_default_data(self):
        """เพิ่มข้อมูลเริ่มต้น"""
        try:
            db = self.get_session()
            
            # ตรวจสอบว่ามีข้อมูล config แล้วหรือไม่
            existing_configs = db.query(ConfigModel).count()
            if existing_configs > 0:
                logger.info(f"📊 Found {existing_configs} existing configurations")
                db.close()
                return
            
            # Default configurations
            default_configs = [
                # LINE Settings
                {
                    'key': 'line_channel_secret', 
                    'value': os.environ.get('LINE_CHANNEL_SECRET', ''), 
                    'value_type': 'string', 
                    'description': 'LINE Channel Secret for webhook verification'
                },
                {
                    'key': 'line_channel_access_token', 
                    'value': os.environ.get('LINE_CHANNEL_ACCESS_TOKEN', ''), 
                    'value_type': 'string', 
                    'description': 'LINE Channel Access Token for sending messages'
                },
                
                # API Settings
                {
                    'key': 'thunder_api_token', 
                    'value': os.environ.get('THUNDER_API_TOKEN', ''), 
                    'value_type': 'string', 
                    'description': 'Thunder API Token for slip verification'
                },
                {
                    'key': 'openai_api_key', 
                    'value': os.environ.get('OPENAI_API_KEY', ''), 
                    'value_type': 'string', 
                    'description': 'OpenAI API Key for AI chatbot'
                },
                
                # System Settings
                {
                    'key': 'ai_enabled', 
                    'value': os.environ.get('AI_ENABLED', 'true'), 
                    'value_type': 'boolean', 
                    'description': 'Enable/disable AI chatbot'
                },
                {
                    'key': 'slip_enabled', 
                    'value': os.environ.get('SLIP_ENABLED', 'true'), 
                    'value_type': 'boolean', 
                    'description': 'Enable/disable slip verification system'
                },
                {
                    'key': 'thunder_enabled', 
                    'value': os.environ.get('THUNDER_ENABLED', 'true'), 
                    'value_type': 'boolean', 
                    'description': 'Enable/disable Thunder API'
                },
                
                # AI Settings
                {
                    'key': 'ai_model', 
                    'value': os.environ.get('AI_MODEL', 'gpt-3.5-turbo'), 
                    'value_type': 'string', 
                    'description': 'OpenAI model to use'
                },
                {
                    'key': 'ai_prompt', 
                    'value': os.environ.get('AI_PROMPT', 'คุณเป็นผู้ช่วยระบบชำระเงินที่เชี่ยวชาญเรื่องการโอนเงินและตรวจสอบสลิป ตอบเฉพาะเรื่องที่เกี่ยวข้องกับธุรกิจเท่านั้น กรุณาตอบด้วยภาษาไทยที่สุภาพและเป็นกันเอง'), 
                    'value_type': 'string', 
                    'description': 'AI chatbot system prompt'
                },
                {
                    'key': 'ai_max_tokens', 
                    'value': '150', 
                    'value_type': 'string', 
                    'description': 'Maximum tokens for AI response'
                },
                {
                    'key': 'ai_temperature', 
                    'value': '0.7', 
                    'value_type': 'string', 
                    'description': 'AI response creativity (0.0-1.0)'
                },
                
                # System Settings
                {
                    'key': 'system_name', 
                    'value': 'LINE OA Middleware', 
                    'value_type': 'string', 
                    'description': 'System display name'
                },
                {
                    'key': 'default_language', 
                    'value': 'th', 
                    'value_type': 'string', 
                    'description': 'Default system language'
                },
                {
                    'key': 'timezone', 
                    'value': 'Asia/Bangkok', 
                    'value_type': 'string', 
                    'description': 'System timezone'
                },
                {
                    'key': 'auto_reply_enabled', 
                    'value': 'true', 
                    'value_type': 'boolean', 
                    'description': 'Enable automatic replies'
                },
                {
                    'key': 'welcome_message', 
                    'value': 'สวัสดีครับ ยินดีต้อนรับสู่ระบบ LINE OA Middleware', 
                    'value_type': 'string', 
                    'description': 'Welcome message for new users'
                },
                
                # Storage and Cleanup Settings  
                {
                    'key': 'chat_history_retention_days', 
                    'value': '90', 
                    'value_type': 'string', 
                    'description': 'Number of days to keep chat history'
                },
                {
                    'key': 'api_log_retention_days', 
                    'value': '30', 
                    'value_type': 'string', 
                    'description': 'Number of days to keep API logs'
                },
                {
                    'key': 'auto_cleanup_enabled', 
                    'value': 'true', 
                    'value_type': 'boolean', 
                    'description': 'Enable automatic data cleanup'
                },
            ]
            
            # เพิ่มข้อมูลลงฐาน
            config_count = 0
            for config_data in default_configs:
                db_config = ConfigModel(**config_data)
                db.add(db_config)
                config_count += 1
            
            db.commit()
            logger.info(f"✅ Initialized {config_count} default configurations")
            
            # ถ้ามี environment variables ให้ log การ import
            env_imported = sum(1 for config in default_configs if config['value'])
            if env_imported > 0:
                logger.info(f"📥 Imported {env_imported} values from environment variables")
            
            # สร้าง system event สำหรับการ setup ครั้งแรก
            try:
                setup_event = SystemEventModel(
                    event_type='system_setup',
                    severity='info',
                    title='System First Setup',
                    description=f'Database initialized with {config_count} configurations',
                    metadata={'config_count': config_count, 'env_imported': env_imported}
                )
                db.add(setup_event)
                db.commit()
            except Exception as e:
                logger.warning(f"⚠️ Could not create setup event: {e}")
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize default data: {e}")
            if 'db' in locals():
                db.rollback()
        finally:
            if 'db' in locals():
                db.close()
    
    def get_session(self) -> Session:
        """สร้าง database session ใหม่"""
        return self.SessionLocal()
    
    def test_connection(self) -> bool:
        """ทดสอบการเชื่อมต่อฐานข้อมูล"""
        try:
            db = self.get_session()
            # ทดสอบ query ง่าย ๆ
            db.execute("SELECT 1")
            db.close()
            return True
        except Exception as e:
            logger.error(f"❌ Database connection test failed: {e}")
            if 'db' in locals():
                db.close()
            return False
    
    def get_database_info(self) -> Dict[str, Any]:
        """ดึงข้อมูลเกี่ยวกับฐานข้อมูล"""
        try:
            db = self.get_session()
            
            # ข้อมูลพื้นฐาน
            info = {
                'engine_url': str(self.engine.url).replace(self.engine.url.password or '', '***') if self.engine.url.password else str(self.engine.url),
                'driver': self.engine.dialect.name,
                'pool_size': getattr(self.engine.pool, 'size', lambda: 'N/A')(),
                'pool_checked_out': getattr(self.engine.pool, 'checkedout', lambda: 'N/A')(),
                'connected': True
            }
            
            # นับจำนวน records ในแต่ละตาราง
            tables = {
                'users': db.query(UserModel).count(),
                'chat_history': db.query(ChatHistoryModel).count(),
                'system_config': db.query(ConfigModel).count(),
                'api_logs': db.query(APILogModel).count(),
                'virtual_channels': db.query(VirtualChannelModel).count(),
                'system_events': db.query(SystemEventModel).count(),
                'notifications': db.query(NotificationModel).count(),
            }
            
            info['tables'] = tables
            info['total_records'] = sum(tables.values())
            
            db.close()
            return info
            
        except Exception as e:
            logger.error(f"❌ Error getting database info: {e}")
            if 'db' in locals():
                db.close()
            return {
                'connected': False,
                'error': str(e),
                'engine_url': 'Unknown',
                'driver': 'Unknown'
            }
    
    def cleanup_old_data(self, days: int = 30) -> Dict[str, int]:
        """ทำความสะอาดข้อมูลเก่า"""
        try:
            db = self.get_session()
            
            from datetime import timedelta
            cutoff_date = datetime.utcnow() - timedelta(days=days)
            
            # นับก่อนลบ
            old_chats = db.query(ChatHistoryModel).filter(ChatHistoryModel.created_at < cutoff_date).count()
            old_logs = db.query(APILogModel).filter(APILogModel.created_at < cutoff_date).count()
            old_events = db.query(SystemEventModel).filter(SystemEventModel.created_at < cutoff_date).count()
            
            # ลบข้อมูลเก่า
            deleted_chats = db.query(ChatHistoryModel).filter(ChatHistoryModel.created_at < cutoff_date).delete()
            deleted_logs = db.query(APILogModel).filter(APILogModel.created_at < cutoff_date).delete()
            deleted_events = db.query(SystemEventModel).filter(SystemEventModel.created_at < cutoff_date).delete()
            
            # ลบการแจ้งเตือนที่หมดอายุ
            expired_notifications = db.query(NotificationModel).filter(
                NotificationModel.expires_at < datetime.utcnow()
            ).delete()
            
            db.commit()
            
            result = {
                'deleted_chats': deleted_chats,
                'deleted_logs': deleted_logs,
                'deleted_events': deleted_events,
                'deleted_notifications': expired_notifications,
                'days': days,
                'cutoff_date': cutoff_date.isoformat()
            }
            
            # บันทึก cleanup event
            cleanup_event = SystemEventModel(
                event_type='data_cleanup',
                severity='info',
                title='Automated Data Cleanup',
                description=f'Cleaned up data older than {days} days',
                metadata=result
            )
            db.add(cleanup_event)
            db.commit()
            
            logger.info(f"🧹 Cleanup completed: {deleted_chats} chats, {deleted_logs} logs, {deleted_events} events, {expired_notifications} notifications")
            db.close()
            return result
            
        except Exception as e:
            logger.error(f"❌ Error during cleanup: {e}")
            if 'db' in locals():
                db.rollback()
                db.close()
            return {'error': str(e)}
    
    def backup_database(self) -> Dict[str, Any]:
        """สำรองข้อมูลฐานข้อมูล (สำหรับ PostgreSQL)"""
        try:
            if "postgresql" not in str(self.engine.url):
                return {'status': 'error', 'message': 'Backup only supported for PostgreSQL'}
            
            import subprocess
            import tempfile
            from urllib.parse import urlparse
            
            # Parse database URL
            url = urlparse(str(self.engine.url))
            
            # สร้างไฟล์ backup
            backup_file = f"backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.sql"
            backup_path = os.path.join(tempfile.gettempdir(), backup_file)
            
            # คำสั่ง pg_dump
            cmd = [
                'pg_dump',
                '-h', url.hostname,
                '-p', str(url.port or 5432),
                '-U', url.username,
                '-d', url.path[1:],  # Remove leading slash
                '-f', backup_path,
                '--no-password'
            ]
            
            # Set password via environment
            env = os.environ.copy()
            env['PGPASSWORD'] = url.password or ''
            
            # รัน pg_dump
            result = subprocess.run(cmd, env=env, capture_output=True, text=True)
            
            if result.returncode == 0:
                file_size = os.path.getsize(backup_path)
                return {
                    'status': 'success',
                    'backup_file': backup_path,
                    'file_size': file_size,
                    'created_at': datetime.now().isoformat()
                }
            else:
                return {
                    'status': 'error',
                    'message': f'pg_dump failed: {result.stderr}'
                }
                
        except Exception as e:
            logger.error(f"❌ Backup error: {e}")
            return {'status': 'error', 'message': str(e)}
    
    def close(self):
        """ปิดการเชื่อมต่อ database"""
        if self.engine:
            self.engine.dispose()
            logger.info("🔌 Database connection closed")

# สร้าง instance เดียวใช้ทั่วระบบ
db_manager = DatabaseManager()

# สร้างตารางเมื่อ import module
try:
    db_manager.create_tables()
except Exception as e:
    logger.error(f"❌ Failed to create tables on import: {e}")

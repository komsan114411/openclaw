# models/postgres_models.py
import os
from datetime import datetime
from typing import Optional, Dict, Any
from sqlalchemy import create_engine, Column, Integer, String, Text, Boolean, DateTime, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
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

class ChatHistoryModel(Base):
    """Model สำหรับเก็บประวัติแชท"""
    __tablename__ = 'chat_history'
    
    id = Column(Integer, primary_key=True)
    user_id = Column(String(100), nullable=False, index=True)
    direction = Column(String(10), nullable=False)  # 'in' หรือ 'out'
    message_type = Column(String(20), default='text')
    message_text = Column(Text)
    message_data = Column(JSON)  # สำหรับเก็บข้อมูล JSON
    sender = Column(String(50), default='unknown')
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

class APILogModel(Base):
    """Model สำหรับเก็บ log การใช้งาน API"""
    __tablename__ = 'api_logs'
    
    id = Column(Integer, primary_key=True)
    api_name = Column(String(50), nullable=False, index=True)
    endpoint = Column(String(200))
    method = Column(String(10))
    status_code = Column(Integer)
    response_time = Column(Integer)  # milliseconds
    error_message = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

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
            self.engine = create_engine(
                database_url,
                pool_pre_ping=True,
                pool_recycle=300,
                connect_args={"sslmode": "require"} if "postgresql://" in database_url else {}
            )
            
            # Create session factory
            self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
            
            logger.info("✅ Database connection established")
            
        except Exception as e:
            logger.error(f"❌ Database connection failed: {e}")
            # Fallback to SQLite
            self.engine = create_engine("sqlite:///./emergency_fallback.db")
            self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
    
    def create_tables(self):
        """สร้างตารางทั้งหมด"""
        try:
            Base.metadata.create_all(bind=self.engine)
            logger.info("✅ Database tables created/verified")
            
            # เพิ่มข้อมูลเริ่มต้น
            self._initialize_default_config()
            
        except Exception as e:
            logger.error(f"❌ Failed to create tables: {e}")
    
    def _initialize_default_config(self):
        """เพิ่มการตั้งค่าเริ่มต้น"""
        try:
            db = self.get_session()
            
            # ตรวจสอบว่ามีข้อมูลแล้วหรือไม่
            existing_count = db.query(ConfigModel).count()
            if existing_count > 0:
                logger.info(f"📊 Found {existing_count} existing config entries")
                db.close()
                return
            
            # Default configurations
            default_configs = [
                # LINE Settings
                {'key': 'line_channel_secret', 'value': os.environ.get('LINE_CHANNEL_SECRET', ''), 'value_type': 'string', 'description': 'LINE Channel Secret for webhook verification'},
                {'key': 'line_channel_access_token', 'value': os.environ.get('LINE_CHANNEL_ACCESS_TOKEN', ''), 'value_type': 'string', 'description': 'LINE Channel Access Token for sending messages'},
                
                # API Settings
                {'key': 'thunder_api_token', 'value': os.environ.get('THUNDER_API_TOKEN', ''), 'value_type': 'string', 'description': 'Thunder API Token for slip verification'},
                {'key': 'openai_api_key', 'value': os.environ.get('OPENAI_API_KEY', ''), 'value_type': 'string', 'description': 'OpenAI API Key for AI chatbot'},
                {'key': 'kbank_consumer_id', 'value': os.environ.get('KBANK_CONSUMER_ID', ''), 'value_type': 'string', 'description': 'KBank Consumer ID for slip verification'},
                {'key': 'kbank_consumer_secret', 'value': os.environ.get('KBANK_CONSUMER_SECRET', ''), 'value_type': 'string', 'description': 'KBank Consumer Secret for slip verification'},
                
                # System Settings
                {'key': 'ai_enabled', 'value': 'true', 'value_type': 'boolean', 'description': 'Enable/disable AI chatbot'},
                {'key': 'slip_enabled', 'value': 'true', 'value_type': 'boolean', 'description': 'Enable/disable slip verification system'},
                {'key': 'thunder_enabled', 'value': 'true', 'value_type': 'boolean', 'description': 'Enable/disable Thunder API'},
                {'key': 'kbank_enabled', 'value': 'false', 'value_type': 'boolean', 'description': 'Enable/disable KBank API'},
                {'key': 'kbank_sandbox_mode', 'value': 'true', 'value_type': 'boolean', 'description': 'Use KBank sandbox environment'},
                
                # AI Settings
                {'key': 'ai_model', 'value': 'gpt-3.5-turbo', 'value_type': 'string', 'description': 'OpenAI model to use'},
                {'key': 'ai_prompt', 'value': 'คุณเป็นผู้ช่วยระบบชำระเงินที่เชี่ยวชาญเรื่องการโอนเงินและตรวจสอบสลิป ตอบเฉพาะเรื่องที่เกี่ยวข้องกับธุรกิจเท่านั้น กรุณาตอบด้วยภาษาไทยที่สุภาพและเป็นกันเอง', 'value_type': 'string', 'description': 'AI chatbot system prompt'},
                
                # Other Settings
                {'key': 'wallet_phone_number', 'value': os.environ.get('WALLET_PHONE_NUMBER', ''), 'value_type': 'string', 'description': 'Wallet phone number'},
            ]
            
            # เพิ่มข้อมูลลงฐาน
            for config in default_configs:
                db_config = ConfigModel(**config)
                db.add(db_config)
            
            db.commit()
            logger.info(f"✅ Initialized {len(default_configs)} default configurations")
            
            # ถ้ามี environment variables ให้ copy ไปยัง database
            env_imported = 0
            for config in default_configs:
                if config['value']:  # ถ้ามีค่าจาก environment
                    env_imported += 1
            
            if env_imported > 0:
                logger.info(f"📥 Imported {env_imported} values from environment variables")
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize default config: {e}")
            if 'db' in locals():
                db.rollback()
        finally:
            if 'db' in locals():
                db.close()
    
    def get_session(self) -> Session:
        """สร้าง database session ใหม่"""
        return self.SessionLocal()
    
    def close(self):
        """ปิดการเชื่อมต่อ database"""
        if self.engine:
            self.engine.dispose()

# สร้าง instance เดียวใช้ทั่วระบบ
db_manager = DatabaseManager()
db_manager.create_tables()

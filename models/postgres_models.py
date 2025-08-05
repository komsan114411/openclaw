# models/postgres_models.py
import os
from datetime import datetime
from typing import Optional
from sqlalchemy import create_engine, Column, Integer, String, Text, Boolean, DateTime, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
import logging

logger = logging.getLogger("postgres_models")

Base = declarative_base()

class UserModel(Base):
    """Model สำหรับเก็บข้อมูลผู้ใช้"""
    __tablename__ = 'users'
    
    id = Column(Integer, primary_key=True)
    user_id = Column(String(100), unique=True, nullable=False, index=True)
    display_name = Column(String(255))
    first_name = Column(String(100))
    last_name = Column(String(100))
    profile_picture_url = Column(Text)
    is_blocked = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_active = Column(DateTime, default=datetime.utcnow)
    chat_history = []  # Placeholder for compatibility

class ConfigModel(Base):
    """Model สำหรับเก็บการตั้งค่าระบบ"""
    __tablename__ = 'system_config'
    
    id = Column(Integer, primary_key=True)
    key = Column(String(100), unique=True, nullable=False, index=True)
    value = Column(Text)
    value_type = Column(String(20), default='string')
    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class ChatHistoryModel(Base):
    """Model สำหรับเก็บประวัติการสนทนา"""
    __tablename__ = 'chat_history'

    id = Column(Integer, primary_key=True)
    user_id = Column(String(100), nullable=False, index=True)
    direction = Column(String(10), nullable=False) # 'in' or 'out'
    message_type = Column(String(20), nullable=False, default='text')
    message_text = Column(Text, nullable=True)
    message_data = Column(JSON, nullable=True) # For storing raw JSON
    sender = Column(String(50), nullable=False)
    read_status = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class APILogModel(Base):
    """Model สำหรับเก็บ log การเรียกใช้ API"""
    __tablename__ = 'api_logs'

    id = Column(Integer, primary_key=True)
    api_name = Column(String(50), nullable=False, index=True)
    endpoint = Column(String(255), nullable=True)
    method = Column(String(10), nullable=True)
    status_code = Column(Integer, nullable=True)
    response_time = Column(Integer, nullable=True) # in ms
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class DatabaseManager:
    """จัดการ Database operations"""
    
    def __init__(self):
        self.engine = None
        self.SessionLocal = None
        self._initialize_connection()
    
    def _initialize_connection(self):
        """เชื่อมต่อกับ PostgreSQL หรือ SQLite"""
        try:
            database_url = os.environ.get('DATABASE_URL')
            
            if database_url:
                # PostgreSQL
                if database_url.startswith("postgres://"):
                    database_url = database_url.replace("postgres://", "postgresql://", 1)
                
                self.engine = create_engine(
                    database_url,
                    pool_pre_ping=True,
                    pool_recycle=300,
                    echo=False
                )
                logger.info("✅ PostgreSQL connection established")
            else:
                # SQLite fallback
                self.engine = create_engine(
                    "sqlite:///storage.db",
                    connect_args={"check_same_thread": False},
                    echo=False
                )
                logger.info("✅ SQLite connection established")
            
            self.SessionLocal = sessionmaker(
                autocommit=False, 
                autoflush=False, 
                bind=self.engine
            )
            
        except Exception as e:
            logger.error(f"❌ Database connection failed: {e}")
            # SQLite as final fallback
            self.engine = create_engine("sqlite:///storage.db")
            self.SessionLocal = sessionmaker(bind=self.engine)
    
    def create_tables(self):
        """สร้างตารางทั้งหมด"""
        try:
            Base.metadata.create_all(bind=self.engine)
            logger.info("✅ Database tables created/verified")
        except Exception as e:
            logger.error(f"❌ Failed to create tables: {e}")
    
    def get_session(self) -> Session:
        """สร้าง database session"""
        return self.SessionLocal()

# สร้าง instance เดียว
db_manager = DatabaseManager()

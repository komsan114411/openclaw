# models/stable_db_manager.py - Production-Ready PostgreSQL Manager
import os
import time
import logging
from datetime import datetime
from typing import Optional, Dict, Any
from contextlib import contextmanager
from sqlalchemy import create_engine, Column, Integer, String, Text, Boolean, DateTime, JSON, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import QueuePool
from sqlalchemy.exc import SQLAlchemyError, DisconnectionError

logger = logging.getLogger("stable_db_manager")

Base = declarative_base()

class ConfigModel(Base):
    """Enhanced Config Model"""
    __tablename__ = 'system_config'
    
    id = Column(Integer, primary_key=True)
    key = Column(String(100), unique=True, nullable=False, index=True)
    value = Column(Text)
    value_type = Column(String(20), default='string')
    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class ChatHistoryModel(Base):
    """Enhanced Chat History Model"""
    __tablename__ = 'chat_history'

    id = Column(Integer, primary_key=True)
    user_id = Column(String(100), nullable=False, index=True)
    direction = Column(String(10), nullable=False)
    message_type = Column(String(20), nullable=False, default='text')
    message_text = Column(Text, nullable=True)
    message_data = Column(JSON, nullable=True)
    sender = Column(String(50), nullable=False)
    read_status = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

class UserModel(Base):
    """Enhanced User Model"""
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

class APILogModel(Base):
    """API Log Model"""
    __tablename__ = 'api_logs'

    id = Column(Integer, primary_key=True)
    api_name = Column(String(50), nullable=False, index=True)
    endpoint = Column(String(255), nullable=True)
    method = Column(String(10), nullable=True)
    status_code = Column(Integer, nullable=True)
    response_time = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

class ProductionDatabaseManager:
    """Production-Ready PostgreSQL Database Manager"""
    
    def __init__(self):
        self.engine = None
        self.SessionLocal = None
        self._is_connected = False
        self._connection_string = None
        self._initialize()
    
    def _initialize(self):
        """Initialize database connection with comprehensive error handling"""
        max_retries = 5
        retry_delay = 1
        
        for attempt in range(max_retries):
            try:
                # Get and validate DATABASE_URL
                database_url = os.environ.get('DATABASE_URL')
                if not database_url:
                    raise Exception("DATABASE_URL environment variable not found")
                
                # Fix Heroku PostgreSQL URL format
                if database_url.startswith("postgres://"):
                    database_url = database_url.replace("postgres://", "postgresql://", 1)
                    logger.info("🔧 Fixed Heroku DATABASE_URL format")
                
                self._connection_string = database_url
                
                # Enhanced engine configuration for production
                self.engine = create_engine(
                    database_url,
                    # Connection Pool Settings
                    poolclass=QueuePool,
                    pool_size=5,                    # Base connections
                    max_overflow=10,                # Additional connections when needed
                    pool_timeout=30,                # Wait time for connection
                    pool_recycle=3600,              # Recycle connections every hour
                    pool_pre_ping=True,             # Validate connections before use
                    
                    # Connection Settings
                    connect_args={
                        "sslmode": "require",
                        "connect_timeout": 15,
                        "application_name": "line_oa_middleware",
                        "options": "-c timezone=UTC"
                    },
                    
                    # Other Settings
                    echo=False,
                    echo_pool=False,
                    future=True
                )
                
                # Create sessionmaker
                self.SessionLocal = sessionmaker(
                    bind=self.engine,
                    autocommit=False,
                    autoflush=False,
                    expire_on_commit=False
                )
                
                # Test connection
                self._test_connection()
                self._is_connected = True
                
                logger.info(f"✅ PostgreSQL connected successfully (attempt {attempt + 1})")
                break
                
            except Exception as e:
                logger.error(f"❌ Database connection failed (attempt {attempt + 1}): {e}")
                self._is_connected = False
                
                if attempt < max_retries - 1:
                    time.sleep(retry_delay)
                    retry_delay *= 2  # Exponential backoff
                else:
                    logger.critical("❌ All database connection attempts failed")
                    raise Exception(f"Failed to connect to database after {max_retries} attempts: {e}")
    
    def _test_connection(self):
        """Test database connectivity"""
        try:
            with self.engine.connect() as conn:
                result = conn.execute(text("SELECT 1 as test"))
                row = result.fetchone()
                if row[0] != 1:
                    raise Exception("Connection test failed")
            logger.info("✅ Database connection test passed")
        except Exception as e:
            logger.error(f"❌ Database connection test failed: {e}")
            raise
    
    @contextmanager
    def get_session(self):
        """Context manager for database sessions with automatic cleanup"""
        session = None
        try:
            if not self._is_connected:
                logger.warning("⚠️ Database not connected, attempting reconnection...")
                self._initialize()
            
            session = self.SessionLocal()
            yield session
            session.commit()
            
        except Exception as e:
            if session:
                session.rollback()
            logger.error(f"❌ Database session error: {e}")
            raise
        finally:
            if session:
                session.close()
    
    def create_tables(self):
        """Create all tables and initialize default data"""
        try:
            Base.metadata.create_all(bind=self.engine)
            logger.info("✅ Database tables created/verified")
            
            # Initialize default configurations
            self._initialize_default_configs()
            
        except Exception as e:
            logger.error(f"❌ Failed to create tables: {e}")
            raise
    
    def _initialize_default_configs(self):
        """Initialize default system configurations from environment"""
        try:
            with self.get_session() as session:
                # Check if configs already exist
                config_count = session.query(ConfigModel).count()
                
                if config_count == 0:
                    logger.info("🔧 Initializing default configurations...")
                    
                    default_configs = [
                        # LINE Configuration
                        ('line_channel_secret', os.getenv('LINE_CHANNEL_SECRET', ''), 'string', 'LINE Channel Secret'),
                        ('line_channel_access_token', os.getenv('LINE_CHANNEL_ACCESS_TOKEN', ''), 'string', 'LINE Channel Access Token'),
                        
                        # Thunder API Configuration
                        ('thunder_api_token', os.getenv('THUNDER_API_TOKEN', ''), 'string', 'Thunder API Token'),
                        ('thunder_enabled', os.getenv('THUNDER_ENABLED', 'true'), 'boolean', 'Enable Thunder API'),
                        
                        # OpenAI Configuration
                        ('openai_api_key', os.getenv('OPENAI_API_KEY', ''), 'string', 'OpenAI API Key'),
                        ('ai_enabled', os.getenv('AI_ENABLED', 'true'), 'boolean', 'Enable AI Chat'),
                        ('ai_prompt', os.getenv('AI_PROMPT', 'คุณเป็นผู้ช่วยระบบชำระเงินที่เชี่ยวชาญ'), 'string', 'AI System Prompt'),
                        
                        # System Configuration
                        ('slip_enabled', os.getenv('SLIP_ENABLED', 'true'), 'boolean', 'Enable Slip Verification'),
                        ('system_name', 'LINE OA Middleware', 'string', 'System Name'),
                        ('timezone', 'Asia/Bangkok', 'string', 'System Timezone'),
                    ]
                    
                    for key, value, value_type, description in default_configs:
                        config = ConfigModel(
                            key=key,
                            value=value,
                            value_type=value_type,
                            description=description
                        )
                        session.add(config)
                    
                    session.commit()
                    logger.info(f"✅ Created {len(default_configs)} default configurations")
                
        except Exception as e:
            logger.error(f"❌ Failed to initialize default configs: {e}")
    
    def health_check(self) -> Dict[str, Any]:
        """Comprehensive database health check"""
        try:
            if not self._is_connected:
                return {"status": "error", "message": "Database not connected"}
            
            start_time = time.time()
            
            with self.engine.connect() as conn:
                # Test basic connectivity
                conn.execute(text("SELECT 1"))
                
                # Get database information
                db_version = conn.execute(text("SELECT version()")).fetchone()[0]
                
                # Get table count
                table_count = conn.execute(text("""
                    SELECT COUNT(*) FROM information_schema.tables 
                    WHERE table_schema = 'public'
                """)).fetchone()[0]
                
                # Get connection info
                connection_info = conn.execute(text("""
                    SELECT count(*) as active_connections 
                    FROM pg_stat_activity 
                    WHERE state = 'active'
                """)).fetchone()[0]
            
            response_time = int((time.time() - start_time) * 1000)
            
            return {
                "status": "healthy",
                "response_time_ms": response_time,
                "database_version": db_version.split()[1] if len(db_version.split()) > 1 else "Unknown",
                "table_count": table_count,
                "active_connections": connection_info,
                "pool_status": {
                    "size": self.engine.pool.size() if hasattr(self.engine.pool, 'size') else 0,
                    "checked_out": self.engine.pool.checkedout() if hasattr(self.engine.pool, 'checkedout') else 0,
                    "overflow": self.engine.pool.overflow() if hasattr(self.engine.pool, 'overflow') else 0,
                    "checked_in": self.engine.pool.checkedin() if hasattr(self.engine.pool, 'checkedin') else 0
                }
            }
            
        except Exception as e:
            logger.error(f"❌ Database health check failed: {e}")
            self._is_connected = False
            return {"status": "error", "message": str(e)}
    
    def close(self):
        """Close database connection cleanly"""
        if self.engine:
            self.engine.dispose()
            self._is_connected = False
            logger.info("🔌 Database connection closed")
    
    @property
    def is_connected(self) -> bool:
        """Check connection status"""
        return self._is_connected

# Global instance
db_manager = ProductionDatabaseManager()

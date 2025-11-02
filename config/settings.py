"""
Application Configuration Settings
"""
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class Settings:
    """Application Settings"""
    
    # MongoDB Configuration
    MONGODB_URI: str = os.getenv('MONGODB_URI', '')
    MONGODB_DATABASE: str = os.getenv('MONGODB_DATABASE', 'lineoa_system')
    
    # Server Configuration
    HOST: str = os.getenv('HOST', '0.0.0.0')
    PORT: int = int(os.getenv('PORT', 8000))
    DEBUG: bool = os.getenv('DEBUG', 'False').lower() == 'true'
    
    # LINE Configuration (Optional)
    LINE_CHANNEL_SECRET: str = os.getenv('LINE_CHANNEL_SECRET', '')
    LINE_CHANNEL_ACCESS_TOKEN: str = os.getenv('LINE_CHANNEL_ACCESS_TOKEN', '')
    
    # OpenAI Configuration (Optional)
    OPENAI_API_KEY: str = os.getenv('OPENAI_API_KEY', '')
    
    # Slip Verification (Optional)
    SLIP_API_KEY: str = os.getenv('SLIP_API_KEY', '')
    SLIP_API_PROVIDER: str = os.getenv('SLIP_API_PROVIDER', 'thunder')
    
    # Security
    SECRET_KEY: str = os.getenv('SECRET_KEY', 'your-secret-key-change-this')
    SESSION_EXPIRE_HOURS: int = int(os.getenv('SESSION_EXPIRE_HOURS', 24))
    
    # Logging
    LOG_LEVEL: str = os.getenv('LOG_LEVEL', 'INFO')
    
    @classmethod
    def validate(cls) -> bool:
        """Validate required settings"""
        if not cls.MONGODB_URI:
            raise ValueError("MONGODB_URI is required")
        return True

# Create settings instance
settings = Settings()


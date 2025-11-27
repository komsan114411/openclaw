"""
Security Utilities for API Key Encryption
Fixes Bug #16: Encrypt API keys in database
"""
import os
import logging
from cryptography.fernet import Fernet
from typing import Optional

logger = logging.getLogger("security")

class SecureStorage:
    """Encrypt and decrypt sensitive data like API keys"""
    
    def __init__(self):
        # Get encryption key from environment or generate new one
        encryption_key = os.getenv("ENCRYPTION_KEY")
        
        if not encryption_key:
            # Generate new key and warn user
            encryption_key = Fernet.generate_key().decode()
            logger.warning("⚠️ No ENCRYPTION_KEY found in environment variables")
            logger.warning(f"📝 Generated new key. Add this to your .env file:")
            logger.warning(f"ENCRYPTION_KEY={encryption_key}")
            
        try:
            self.cipher = Fernet(encryption_key.encode() if isinstance(encryption_key, str) else encryption_key)
            logger.info("✅ Encryption initialized")
        except Exception as e:
            logger.error(f"❌ Failed to initialize encryption: {e}")
            # Fallback to base64 encoding (not secure, but better than plain text)
            self.cipher = None
    
    def encrypt(self, plaintext: str) -> Optional[str]:
        """
        Encrypt sensitive data
        
        Args:
            plaintext: The plain text to encrypt
            
        Returns:
            Encrypted string or None if encryption fails
        """
        if not plaintext:
            return None
            
        try:
            if self.cipher:
                encrypted = self.cipher.encrypt(plaintext.encode())
                return encrypted.decode()
            else:
                # Fallback to base64 (not secure!)
                import base64
                return base64.b64encode(plaintext.encode()).decode()
        except Exception as e:
            logger.error(f"❌ Encryption failed: {e}")
            return None
    
    def decrypt(self, ciphertext: str) -> Optional[str]:
        """
        Decrypt sensitive data
        
        Args:
            ciphertext: The encrypted text
            
        Returns:
            Decrypted string or None if decryption fails
        """
        if not ciphertext:
            return None
            
        try:
            if self.cipher:
                decrypted = self.cipher.decrypt(ciphertext.encode())
                return decrypted.decode()
            else:
                # Fallback from base64
                import base64
                return base64.b64decode(ciphertext.encode()).decode()
        except Exception as e:
            logger.error(f"❌ Decryption failed: {e}")
            return None
    
    def is_encrypted(self, value: str) -> bool:
        """Check if a value appears to be encrypted"""
        if not value:
            return False
        
        # Fernet encrypted strings start with 'gAAAAA'
        # Base64 strings are alphanumeric with +/=
        try:
            # Try to decrypt to verify
            result = self.decrypt(value)
            return result is not None
        except:
            return False

# Global instance
_secure_storage = None

def get_secure_storage() -> SecureStorage:
    """Get or create global SecureStorage instance"""
    global _secure_storage
    if _secure_storage is None:
        _secure_storage = SecureStorage()
    return _secure_storage

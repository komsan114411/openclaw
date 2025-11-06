from mongoengine import Document, StringField, BooleanField, DateTimeField
from datetime import datetime

class Bank(Document):
    """
    Model สำหรับเก็บข้อมูลธนาคาร
    """
    meta = {'collection': 'banks'}
    
    code = StringField(required=True, unique=True, max_length=50)  # e.g., "KBANK", "BBL"
    name = StringField(required=True, max_length=200)  # e.g., "ธนาคารกสิกรไทย"
    logo_base64 = StringField()  # base64 encoded image
    is_active = BooleanField(default=True)
    created_at = DateTimeField(default=datetime.utcnow)
    updated_at = DateTimeField(default=datetime.utcnow)
    
    def to_dict(self):
        """แปลง object เป็น dictionary"""
        return {
            'id': str(self.id),
            'code': self.code,
            'name': self.name,
            'logo_base64': self.logo_base64,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
    
    def __str__(self):
        return f"{self.name} ({self.code})"

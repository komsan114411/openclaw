"""
Slip Template Model
สำหรับจัดการ templates ตอบกลับสลิป
"""
from datetime import datetime
from bson import ObjectId
from typing import List, Dict, Any, Optional


class SlipTemplate:
    def __init__(self, db):
        self.db = db
        self.collection = db.slip_templates
        self._init_collection()
    
    def _init_collection(self):
        """Initialize collection with indexes"""
        try:
            self.collection.create_index("channel_id")
            self.collection.create_index("template_id")
        except:
            pass
    
    def create_template(self, channel_id: str, template_name: str, template_text: str = "", 
                       template_flex: dict = None, template_type: str = "text",
                       preview_image: str = "", description: str = "", is_default: bool = False) -> Optional[str]:
        """Create a new slip response template"""
        try:
            template_data = {
                "channel_id": channel_id,
                "template_id": f"template_{int(datetime.utcnow().timestamp() * 1000)}",
                "template_name": template_name,
                "template_text": template_text,
                "template_flex": template_flex,
                "template_type": template_type,
                "preview_image": preview_image,
                "description": description,
                "is_default": is_default,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
                "usage_count": 0
            }
            
            result = self.collection.insert_one(template_data)
            return str(result.inserted_id)
        except Exception as e:
            print(f"Error creating template: {e}")
            return None
    
    def get_template_by_id(self, template_id: str) -> Optional[Dict[str, Any]]:
        """Get template by ID"""
        try:
            return self.collection.find_one({"_id": ObjectId(template_id)})
        except:
            return None
    
    def get_templates_by_channel(self, channel_id: str) -> List[Dict[str, Any]]:
        """Get all templates for a channel"""
        try:
            return list(self.collection.find({"channel_id": channel_id}).sort("created_at", -1))
        except:
            return []
    
    def get_default_template(self, channel_id: str) -> Optional[Dict[str, Any]]:
        """Get default template for a channel"""
        try:
            return self.collection.find_one({"channel_id": channel_id, "is_default": True})
        except:
            return None
    
    def update_template(self, template_id: str, template_name: str = None, 
                       template_text: str = None, template_flex: dict = None,
                       template_type: str = None, preview_image: str = None,
                       description: str = None, is_default: bool = None) -> bool:
        """Update template"""
        try:
            update_data = {"updated_at": datetime.utcnow()}
            
            if template_name is not None:
                update_data["template_name"] = template_name
            if template_text is not None:
                update_data["template_text"] = template_text
            if template_flex is not None:
                update_data["template_flex"] = template_flex
            if template_type is not None:
                update_data["template_type"] = template_type
            if preview_image is not None:
                update_data["preview_image"] = preview_image
            if description is not None:
                update_data["description"] = description
            if is_default is not None:
                update_data["is_default"] = is_default
            
            result = self.collection.update_one(
                {"_id": ObjectId(template_id)},
                {"$set": update_data}
            )
            
            return result.modified_count > 0
        except Exception as e:
            print(f"Error updating template: {e}")
            return False
    
    def delete_template(self, template_id: str) -> bool:
        """Delete template"""
        try:
            result = self.collection.delete_one({"_id": ObjectId(template_id)})
            return result.deleted_count > 0
        except Exception as e:
            print(f"Error deleting template: {e}")
            return False
    
    def increment_usage_count(self, template_id: str) -> bool:
        """Increment usage count"""
        try:
            result = self.collection.update_one(
                {"_id": ObjectId(template_id)},
                {"$inc": {"usage_count": 1}}
            )
            return result.modified_count > 0
        except Exception as e:
            print(f"Error incrementing usage count: {e}")
            return False
    
    def set_default_template(self, channel_id: str, template_id: str) -> bool:
        """Set template as default for channel"""
        try:
            # Remove default from all templates
            self.collection.update_many(
                {"channel_id": channel_id},
                {"$set": {"is_default": False}}
            )
            
            # Set new default
            result = self.collection.update_one(
                {"_id": ObjectId(template_id)},
                {"$set": {"is_default": True}}
            )
            
            return result.modified_count > 0
        except Exception as e:
            print(f"Error setting default template: {e}")
            return False
    
    def init_default_templates(self, channel_id: str) -> bool:
        """Initialize default templates for new channel"""
        try:
            # Check if templates already exist
            existing = self.collection.find_one({"channel_id": channel_id})
            if existing:
                return True
            
            # Load Flex templates from JSON file
            import json
            import os
            
            # Load beautiful slip template
            beautiful_template_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates_data", "beautiful_slip_template.json")
            beautiful_template = None
            try:
                with open(beautiful_template_path, 'r', encoding='utf-8') as f:
                    beautiful_template = json.load(f)
            except Exception as e:
                print(f"Warning: Could not load beautiful template: {e}")
            
            # Load other flex templates
            flex_templates_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates_data", "flex_templates.json")
            flex_templates = {}
            try:
                with open(flex_templates_path, 'r', encoding='utf-8') as f:
                    flex_templates = json.load(f)
            except Exception as e:
                print(f"Warning: Could not load flex templates: {e}")
            
            # Template 1: Success with details (Flex Message)
            template1 = {
                "channel_id": channel_id,
                "template_id": f"template_success_{int(datetime.utcnow().timestamp() * 1000)}",
                "template_name": "สลิปสำเร็จ - แสดงรายละเอียด (Flex)",
                "template_text": "",
                "template_flex": beautiful_template if beautiful_template else flex_templates.get("slip_success_detailed"),
                "template_type": "flex",
                "preview_image": "/static/images/templates/template_example_1.png",
                "description": "Template สำหรับแสดงรายละเอียดสลิปที่ตรวจสอบสำเร็จแบบ Flex Message",
                "is_default": True,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
                "usage_count": 0
            }
            
            # Template 2: Simple confirmation (Text)
            template2 = {
                "channel_id": channel_id,
                "template_id": f"template_simple_{int(datetime.utcnow().timestamp() * 1000)}",
                "template_name": "สลิปสำเร็จ - ยืนยันอย่างง่าย (Text)",
                "template_text": "✅ ตรวจสอบสลิปสำเร็จ\n\n💰 จำนวนเงิน: {amount} บาท\n👤 ผู้โอน: {sender}\n📅 วันที่: {date}\n⏰ เวลา: {time}\n\nขอบคุณที่ใช้บริการ!",
                "template_flex": None,
                "template_type": "text",
                "preview_image": "/static/images/templates/template_example_2.png",
                "description": "Template แบบข้อความธรรมดา สำหรับยืนยันการรับเงิน",
                "is_default": False,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
                "usage_count": 0
            }
            
            self.collection.insert_many([template1, template2])
            return True
        except Exception as e:
            print(f"Error initializing default templates: {e}")
            return False
    
    def render_template(self, template_text: str, data: Dict[str, Any]) -> str:
        """Render template with data"""
        try:
            result = template_text
            for key, value in data.items():
                result = result.replace(f"{{{key}}}", str(value))
            return result
        except Exception as e:
            print(f"Error rendering template: {e}")
            return template_text

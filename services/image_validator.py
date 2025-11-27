# services/image_validator.py
"""
Image Validator Service - Pre-screening for slip images
ตรวจสอบไฟล์รูปภาพก่อนส่งไปยัง API เพื่อประหยัดโควต้า
"""
import logging
import io
from typing import Dict, Any, Optional, Tuple

logger = logging.getLogger("image_validator_service")

# Default settings
DEFAULT_MAX_SIZE_MB = 10
DEFAULT_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/jpg"]
DEFAULT_MIN_SIZE_BYTES = 1024  # Minimum 1KB


class ImageValidationError(Exception):
    """Custom exception for image validation errors"""
    def __init__(self, message: str, error_code: str):
        self.message = message
        self.error_code = error_code
        super().__init__(self.message)


def validate_slip_image(
    image_data: bytes,
    settings: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Validate slip image before sending to verification API
    
    Pre-screening checks:
    1. Check if data is not empty
    2. Check file size (not too large or too small)
    3. Check image format (JPEG/PNG)
    4. Check if image is valid and can be decoded
    
    Args:
        image_data: Raw image bytes
        settings: Optional settings dict with:
            - max_image_size_mb: Maximum file size in MB (default: 10)
            - allowed_image_types: List of allowed MIME types
            - min_image_size_bytes: Minimum file size in bytes
    
    Returns:
        {
            "valid": bool,
            "error_code": str or None,
            "error_message": str or None,
            "image_info": {
                "size_bytes": int,
                "size_mb": float,
                "format": str,
                "width": int,
                "height": int
            }
        }
    """
    settings = settings or {}
    max_size_mb = settings.get("max_image_size_mb", DEFAULT_MAX_SIZE_MB)
    allowed_types = settings.get("allowed_image_types", DEFAULT_ALLOWED_TYPES)
    min_size_bytes = settings.get("min_image_size_bytes", DEFAULT_MIN_SIZE_BYTES)
    
    result = {
        "valid": False,
        "error_code": None,
        "error_message": None,
        "image_info": {}
    }
    
    try:
        # 1. Check if data exists
        if not image_data:
            result["error_code"] = "empty_data"
            result["error_message"] = "ไม่พบข้อมูลรูปภาพ"
            logger.warning("❌ Pre-screening failed: empty image data")
            return result
        
        size_bytes = len(image_data)
        size_mb = size_bytes / (1024 * 1024)
        
        result["image_info"]["size_bytes"] = size_bytes
        result["image_info"]["size_mb"] = round(size_mb, 2)
        
        # 2. Check minimum size
        if size_bytes < min_size_bytes:
            result["error_code"] = "file_too_small"
            result["error_message"] = f"ไฟล์รูปภาพเล็กเกินไป (ต้องมีขนาดอย่างน้อย {min_size_bytes} bytes)"
            logger.warning(f"❌ Pre-screening failed: file too small ({size_bytes} bytes)")
            return result
        
        # 3. Check maximum size
        max_size_bytes = max_size_mb * 1024 * 1024
        if size_bytes > max_size_bytes:
            result["error_code"] = "file_too_large"
            result["error_message"] = f"ไฟล์รูปภาพใหญ่เกินไป (สูงสุด {max_size_mb}MB, ขนาดปัจจุบัน {size_mb:.2f}MB)"
            logger.warning(f"❌ Pre-screening failed: file too large ({size_mb:.2f}MB > {max_size_mb}MB)")
            return result
        
        # 4. Check image format by magic bytes
        image_format = detect_image_format(image_data)
        result["image_info"]["format"] = image_format
        
        if not image_format:
            result["error_code"] = "invalid_format"
            result["error_message"] = "ไม่สามารถระบุรูปแบบไฟล์ได้ กรุณาส่งไฟล์ JPEG หรือ PNG"
            logger.warning("❌ Pre-screening failed: unknown image format")
            return result
        
        mime_type = f"image/{image_format.lower()}"
        if mime_type not in allowed_types and f"image/{image_format}" not in allowed_types:
            result["error_code"] = "unsupported_format"
            result["error_message"] = f"ไม่รองรับรูปแบบไฟล์ {image_format} กรุณาส่งไฟล์ JPEG หรือ PNG"
            logger.warning(f"❌ Pre-screening failed: unsupported format ({image_format})")
            return result
        
        # 5. Try to get image dimensions (optional but useful)
        try:
            width, height = get_image_dimensions(image_data, image_format)
            if width and height:
                result["image_info"]["width"] = width
                result["image_info"]["height"] = height
                
                # Check minimum dimensions
                if width < 100 or height < 100:
                    result["error_code"] = "image_too_small"
                    result["error_message"] = "รูปภาพมีขนาดเล็กเกินไป กรุณาถ่ายรูปที่มีความละเอียดสูงกว่านี้"
                    logger.warning(f"❌ Pre-screening failed: image dimensions too small ({width}x{height})")
                    return result
        except Exception as dim_error:
            logger.warning(f"⚠️ Could not get image dimensions: {dim_error}")
        
        # All checks passed
        result["valid"] = True
        logger.info(f"✅ Pre-screening passed: {image_format}, {size_mb:.2f}MB")
        return result
        
    except Exception as e:
        result["error_code"] = "validation_error"
        result["error_message"] = f"เกิดข้อผิดพลาดในการตรวจสอบรูปภาพ: {str(e)}"
        logger.error(f"❌ Pre-screening error: {e}")
        return result


def detect_image_format(data: bytes) -> Optional[str]:
    """
    Detect image format by magic bytes
    
    Magic bytes:
    - JPEG: FF D8 FF
    - PNG: 89 50 4E 47 0D 0A 1A 0A
    - GIF: 47 49 46 38
    - WebP: 52 49 46 46 ... 57 45 42 50
    """
    if len(data) < 12:
        return None
    
    # JPEG
    if data[:3] == b'\xff\xd8\xff':
        return "jpeg"
    
    # PNG
    if data[:8] == b'\x89PNG\r\n\x1a\n':
        return "png"
    
    # GIF
    if data[:6] in (b'GIF87a', b'GIF89a'):
        return "gif"
    
    # WebP
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        return "webp"
    
    # BMP
    if data[:2] == b'BM':
        return "bmp"
    
    return None


def get_image_dimensions(data: bytes, format_hint: Optional[str] = None) -> Tuple[Optional[int], Optional[int]]:
    """
    Get image dimensions without loading full image
    
    Returns:
        (width, height) or (None, None) if cannot determine
    """
    try:
        # Try using PIL if available
        try:
            from PIL import Image
            img = Image.open(io.BytesIO(data))
            return img.size
        except ImportError:
            pass
        
        # Fallback: parse headers manually
        fmt = format_hint or detect_image_format(data)
        
        if fmt == "png":
            # PNG: width and height at bytes 16-23
            if len(data) >= 24:
                width = int.from_bytes(data[16:20], 'big')
                height = int.from_bytes(data[20:24], 'big')
                return width, height
        
        elif fmt == "jpeg":
            # JPEG: need to parse markers
            return _parse_jpeg_dimensions(data)
        
        elif fmt == "gif":
            # GIF: width at bytes 6-7, height at 8-9 (little endian)
            if len(data) >= 10:
                width = int.from_bytes(data[6:8], 'little')
                height = int.from_bytes(data[8:10], 'little')
                return width, height
        
        return None, None
        
    except Exception as e:
        logger.warning(f"Could not get image dimensions: {e}")
        return None, None


def _parse_jpeg_dimensions(data: bytes) -> Tuple[Optional[int], Optional[int]]:
    """Parse JPEG to find dimensions in SOF marker"""
    try:
        i = 0
        while i < len(data) - 1:
            if data[i] != 0xFF:
                i += 1
                continue
            
            marker = data[i + 1]
            
            # Skip padding
            if marker == 0xFF:
                i += 1
                continue
            
            # SOF markers (Start of Frame)
            if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
                         0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                if i + 9 < len(data):
                    height = int.from_bytes(data[i + 5:i + 7], 'big')
                    width = int.from_bytes(data[i + 7:i + 9], 'big')
                    return width, height
            
            # Skip marker
            if marker in (0xD0, 0xD1, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0xD8, 0xD9, 0x01):
                i += 2
                continue
            
            # Read length and skip
            if i + 4 < len(data):
                length = int.from_bytes(data[i + 2:i + 4], 'big')
                i += 2 + length
            else:
                break
        
        return None, None
    except Exception:
        return None, None


def get_error_template(error_code: str, settings: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Get appropriate error template based on error code
    
    Returns template dict with type and message
    """
    templates = {
        "empty_data": {
            "type": "text",
            "message": "❌ ไม่พบข้อมูลรูปภาพ กรุณาลองส่งใหม่อีกครั้ง"
        },
        "file_too_small": {
            "type": "text",
            "message": "📷 ไฟล์รูปภาพเล็กเกินไป กรุณาถ่ายรูปใหม่ที่มีความชัดเจน"
        },
        "file_too_large": {
            "type": "text",
            "message": "📏 ไฟล์รูปภาพใหญ่เกินไป (สูงสุด 10MB) กรุณาลดขนาดรูปแล้วลองใหม่"
        },
        "invalid_format": {
            "type": "text",
            "message": "🖼️ รูปแบบไฟล์ไม่ถูกต้อง กรุณาส่งไฟล์ JPEG หรือ PNG"
        },
        "unsupported_format": {
            "type": "text",
            "message": "🖼️ ไม่รองรับรูปแบบไฟล์นี้ กรุณาส่งไฟล์ JPEG หรือ PNG"
        },
        "image_too_small": {
            "type": "text",
            "message": "📷 รูปภาพมีความละเอียดต่ำเกินไป กรุณาถ่ายรูปใหม่ให้ชัดเจนขึ้น"
        },
        "validation_error": {
            "type": "text",
            "message": "❌ เกิดข้อผิดพลาดในการตรวจสอบรูปภาพ กรุณาลองใหม่อีกครั้ง"
        }
    }
    
    # Check for custom templates in settings
    if settings and "templates" in settings:
        custom_templates = settings["templates"]
        if error_code in custom_templates:
            return custom_templates[error_code]
    
    return templates.get(error_code, templates["validation_error"])

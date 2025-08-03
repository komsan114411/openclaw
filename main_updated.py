# แก้ไข import
from utils.config_manager import config_manager

# แก้ไข route admin home
@app.get("/admin", response_class=HTMLResponse)
async def admin_home(request: Request):
    """หน้า dashboard แสดงภาพรวม"""
    total_count = get_chat_history_count()
    return templates.TemplateResponse("admin_home.html", {
        "request": request,
        "config": config_manager.config,  # ใช้ config ล่าสุด
        "total_chat_history": total_count,
    })

# แก้ไข route settings
@app.get("/admin/settings", response_class=HTMLResponse)
async def admin_settings(request: Request):
    """หน้า Settings สำหรับปรับ config"""
    return templates.TemplateResponse("settings.html", {
        "request": request,
        "config": config_manager.config,  # ใช้ config ล่าสุด
    })

# แก้ไข route update settings
@app.post("/admin/settings/update")
async def update_settings(request: Request) -> JSONResponse:
    """อัปเดต config และบันทึกลงไฟล์"""
    try:
        data = await request.json()
        
        # เตรียมข้อมูลที่จะอัปเดต
        updates = {}
        
        # รายการ field ที่อนุญาตให้อัปเดต
        allowed_fields = [
            "line_channel_secret",
            "line_channel_access_token", 
            "thunder_api_token",
            "openai_api_key",
            "ai_prompt",
            "wallet_phone_number",
        ]
        
        for key in allowed_fields:
            if key in data:
                updates[key] = data[key].strip()
        
        # จัดการ boolean fields
        updates["ai_enabled"] = bool(data.get("ai_enabled"))
        updates["slip_enabled"] = bool(data.get("slip_enabled"))
        
        # บันทึกการเปลี่ยนแปลง
        if config_manager.update_multiple(updates):
            logger.info(f"Config updated: {list(updates.keys())}")
            return JSONResponse(content={
                "status": "success", 
                "message": "บันทึกการตั้งค่าเรียบร้อยแล้ว (AI Prompt จะใช้งานได้ทันที)"
            })
        else:
            return JSONResponse(content={
                "status": "error", 
                "message": "ไม่สามารถบันทึกการตั้งค่าได้"
            })
            
    except Exception as e:
        logger.error("Error updating settings: %s", e)
        return JSONResponse(content={
            "status": "error", 
            "message": f"เกิดข้อผิดพลาด: {str(e)}"
        })

# เพิ่ม route สำหรับดู config ปัจจุบัน
@app.get("/admin/config/current")
async def get_current_config():
    """ดู config ปัจจุบัน (สำหรับ debug)"""
    return JSONResponse(content={
        "config": config_manager.config,
        "config_file_exists": os.path.exists(config_manager.config_file)
    })

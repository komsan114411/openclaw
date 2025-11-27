#!/usr/bin/env python3
"""
Script สำหรับ seed ข้อมูลธนาคารเริ่มต้น
"""
import os
import mongoengine
from dotenv import load_dotenv
from models.bank import Bank

# Load environment variables
load_dotenv()

def seed_banks():
    """Seed ข้อมูลธนาคารเริ่มต้น"""
    
    banks_data = [
        {"code": "KBANK", "name": "ธนาคารกสิกรไทย"},
        {"code": "BBL", "name": "ธนาคารกรุงเทพ"},
        {"code": "SCB", "name": "ธนาคารไทยพาณิชย์"},
        {"code": "KTB", "name": "ธนาคารกรุงไทย"},
        {"code": "BAY", "name": "ธนาคารกรุงศรีอยุธยา"},
        {"code": "TTB", "name": "ธนาคารทหารไทยธนชาต"},
        {"code": "GSB", "name": "ธนาคารออมสิน"},
        {"code": "BAAC", "name": "ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร"},
        {"code": "KKP", "name": "ธนาคารเกียรตินาคินภัทร"},
        {"code": "CIMB", "name": "ธนาคารซีไอเอ็มบีไทย"},
        {"code": "TISCO", "name": "ธนาคารทิสโก้"},
        {"code": "UOB", "name": "ธนาคารยูโอบี"},
        {"code": "LHBANK", "name": "ธนาคารแลนด์ แอนด์ เฮ้าส์"},
        {"code": "ICBC", "name": "ธนาคารไอซีบีซี (ไทย)"},
        {"code": "SME", "name": "ธนาคารพัฒนาวิสาหกิจขนาดกลางและขนาดย่อม"},
        {"code": "TRUEMONEY", "name": "TrueMoney Wallet"},
        {"code": "RABBIT", "name": "Rabbit LINE Pay"},
        {"code": "SHOPEE", "name": "ShopeePay"},
        {"code": "PROMPTPAY", "name": "PromptPay"},
    ]
    
    print("กำลัง seed ข้อมูลธนาคาร...")
    
    for bank_data in banks_data:
        try:
            # ตรวจสอบว่ามีอยู่แล้วหรือไม่
            existing = Bank.objects(code=bank_data['code']).first()
            if existing:
                print(f"  - {bank_data['name']} ({bank_data['code']}) มีอยู่แล้ว")
                continue
            
            # สร้างใหม่
            bank = Bank(
                code=bank_data['code'],
                name=bank_data['name'],
                is_active=True
            )
            bank.save()
            print(f"  ✓ เพิ่ม {bank_data['name']} ({bank_data['code']})")
        except Exception as e:
            print(f"  ✗ เกิดข้อผิดพลาดกับ {bank_data['name']}: {str(e)}")
    
    print(f"\nเสร็จสิ้น! มีธนาคารทั้งหมด {Bank.objects.count()} รายการ")

if __name__ == "__main__":
    # เชื่อมต่อ database
    mongodb_uri = os.getenv('MONGODB_URI')
    if not mongodb_uri:
        print("❗ MONGODB_URI not found in .env")
        exit(1)
    
    # Extract database name from URI
    db_name = mongodb_uri.split('/')[-1].split('?')[0]
    
    # Connect to MongoDB using mongoengine
    mongoengine.connect(host=mongodb_uri, db=db_name)
    print(f"✅ Connected to MongoDB: {db_name}")
    
    # Seed ข้อมูล
    seed_banks()

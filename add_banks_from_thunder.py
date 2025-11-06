#!/usr/bin/env python3
"""
สคริปต์เพิ่มข้อมูลธนาคารจาก Thunder API Bank Codes ลง database
"""

import os
from pymongo import MongoClient

# Bank data from Thunder API
BANKS = [
    {"code": "002", "abbr": "BBL", "name": "ธนาคารกรุงเทพ"},
    {"code": "004", "abbr": "KBANK", "name": "ธนาคารกสิกรไทย"},
    {"code": "006", "abbr": "KTB", "name": "ธนาคารกรุงไทย"},
    {"code": "011", "abbr": "TTB", "name": "ธนาคารทหารไทยธนชาต"},
    {"code": "014", "abbr": "SCB", "name": "ธนาคารไทยพาณิชย์"},
    {"code": "022", "abbr": "CIMBT", "name": "ธนาคารซีไอเอ็มบีไทย"},
    {"code": "024", "abbr": "UOBT", "name": "ธนาคารยูโอบี"},
    {"code": "025", "abbr": "BAY", "name": "ธนาคารกรุงศรีอยุธยา"},
    {"code": "030", "abbr": "GSB", "name": "ธนาคารออมสิน"},
    {"code": "033", "abbr": "GHB", "name": "ธนาคารอาคารสงเคราะห์"},
    {"code": "034", "abbr": "BAAC", "name": "ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร"},
    {"code": "035", "abbr": "EXIM", "name": "ธนาคารเพื่อการส่งออกและนำเข้าแห่งประเทศไทย"},
    {"code": "067", "abbr": "TISCO", "name": "ธนาคารทิสโก้"},
    {"code": "069", "abbr": "KKP", "name": "ธนาคารเกียรตินาคินภัทร"},
    {"code": "070", "abbr": "ICBCT", "name": "ธนาคารไอซีบีซี (ไทย)"},
    {"code": "071", "abbr": "TCD", "name": "ธนาคารไทยเครดิตเพื่อรายย่อย"},
    {"code": "073", "abbr": "LHFG", "name": "ธนาคารแลนด์ แอนด์ เฮ้าส์"},
    {"code": "098", "abbr": "SME", "name": "ธนาคารพัฒนาวิสาหกิจขนาดกลางและขนาดย่อมแห่งประเทศไทย"},
]

def main():
    # Connect to MongoDB
    mongodb_uri = os.getenv('MONGODB_URI', 'mongodb://localhost:27017/lineoa')
    client = MongoClient(mongodb_uri)
    
    # Get database name from URI
    if '/' in mongodb_uri.split('://')[-1]:
        db_name = mongodb_uri.split('/')[-1].split('?')[0]
    else:
        db_name = 'lineoa'
    
    db = client[db_name]
    banks_collection = db.banks
    
    print(f"Connected to database: {db_name}")
    print(f"Total banks to add: {len(BANKS)}")
    print("-" * 60)
    
    added_count = 0
    updated_count = 0
    skipped_count = 0
    
    for bank_data in BANKS:
        code = bank_data["code"]
        abbr = bank_data["abbr"]
        name = bank_data["name"]
        
        # Check if bank already exists
        existing_bank = banks_collection.find_one({"code": code})
        
        if existing_bank:
            # Update existing bank (keep logo if exists)
            update_data = {
                "name": name,
                "abbreviation": abbr,
                "is_active": True
            }
            
            banks_collection.update_one(
                {"code": code},
                {"$set": update_data}
            )
            
            print(f"✓ Updated: {code} - {name}")
            updated_count += 1
        else:
            # Insert new bank
            new_bank = {
                "code": code,
                "name": name,
                "abbreviation": abbr,
                "logo_base64": None,
                "is_active": True
            }
            
            banks_collection.insert_one(new_bank)
            print(f"+ Added: {code} - {name}")
            added_count += 1
    
    print("-" * 60)
    print(f"Summary:")
    print(f"  - Added: {added_count} banks")
    print(f"  - Updated: {updated_count} banks")
    print(f"  - Total: {added_count + updated_count} banks")
    print(f"\n✅ Done!")
    
    client.close()

if __name__ == "__main__":
    main()

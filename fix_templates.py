#!/usr/bin/env python3
"""
Script to fix slip templates by re-initializing them from template files
This repairs templates that are missing flex/text data
"""

import os
import sys
import json
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from models.database import get_database
from models.slip_template import SlipTemplate

def main():
    """Fix templates by re-initializing"""
    print("=" * 80)
    print("🔧 SLIP TEMPLATE REPAIR TOOL")
    print("=" * 80)
    
    # Get database
    try:
        database = get_database()
        db = database.get_db()
        print(f"✅ Connected to database")
    except Exception as e:
        print(f"❌ Failed to connect to database: {e}")
        return 1
    
    # Get slip template model
    slip_template_model = SlipTemplate(db)
    
    # Get all unique channel IDs
    all_templates = list(db.slip_templates.find({}, {"channel_id": 1}))
    channel_ids = list(set(t.get("channel_id") for t in all_templates if t.get("channel_id")))
    
    print(f"\n📋 Found {len(channel_ids)} unique channels with templates")
    
    if len(channel_ids) == 0:
        print("⚠️ No channels found. Nothing to fix.")
        return 0
    
    for channel_id in channel_ids:
        print(f"\n🔄 Processing channel: {channel_id}")
        
        # Get existing templates for this channel
        existing_templates = list(db.slip_templates.find({"channel_id": channel_id}))
        print(f"   Found {len(existing_templates)} existing templates")
        
        # Check if any templates have issues
        problematic = []
        for template in existing_templates:
            has_flex = bool(template.get("template_flex"))
            has_text = bool(template.get("template_text"))
            template_type = template.get("template_type", "unknown")
            
            if template_type == "flex" and not has_flex:
                problematic.append(template)
            elif template_type == "text" and not has_text:
                problematic.append(template)
            elif not has_flex and not has_text:
                problematic.append(template)
        
        if len(problematic) > 0:
            print(f"   ⚠️ Found {len(problematic)} problematic templates")
            print(f"   🗑️ Deleting problematic templates...")
            
            for template in problematic:
                template_id = str(template.get("_id"))
                template_name = template.get("template_name", "Unnamed")
                print(f"      - Deleting: {template_name} ({template_id})")
                db.slip_templates.delete_one({"_id": template["_id"]})
            
            print(f"   ✅ Deleted {len(problematic)} problematic templates")
        else:
            print(f"   ✅ All templates are healthy")
        
        # Re-initialize templates if channel has no templates or had issues
        remaining_templates = list(db.slip_templates.find({"channel_id": channel_id}))
        
        if len(remaining_templates) < 3:  # Should have at least 3-4 templates
            print(f"   🔄 Re-initializing templates (force=True)...")
            try:
                slip_template_model.init_default_templates(channel_id, force=True)
                print(f"   ✅ Templates re-initialized successfully")
                
                # Verify
                new_templates = list(db.slip_templates.find({"channel_id": channel_id}))
                print(f"   ✅ Now has {len(new_templates)} templates")
            except Exception as e:
                print(f"   ❌ Failed to re-initialize: {e}")
                import traceback
                traceback.print_exc()
    
    # Final summary
    print(f"\n" + "=" * 80)
    print("📊 FINAL STATUS")
    print("=" * 80)
    
    for channel_id in channel_ids:
        templates = list(db.slip_templates.find({"channel_id": channel_id}))
        healthy = sum(1 for t in templates if (t.get("template_flex") or t.get("template_text")))
        print(f"\nChannel: {channel_id}")
        print(f"  Total templates: {len(templates)}")
        print(f"  Healthy templates: {healthy}")
        
        if healthy == len(templates):
            print(f"  ✅ All templates are healthy!")
        else:
            print(f"  ⚠️ Still have {len(templates) - healthy} problematic templates")
    
    print(f"\n✅ Repair complete!")
    print("   Please test the template system in the application.")
    
    return 0

if __name__ == "__main__":
    sys.exit(main())

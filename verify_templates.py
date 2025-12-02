#!/usr/bin/env python3
"""
Script to verify and fix slip templates in the database
This helps diagnose why templates aren't working correctly
"""

import os
import sys
import json
from datetime import datetime
from bson import ObjectId

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from models.database import get_database
from models.slip_template import SlipTemplate

def main():
    """Verify and fix templates"""
    print("=" * 80)
    print("🔍 SLIP TEMPLATE VERIFICATION & REPAIR TOOL")
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
    
    # Get all templates
    all_templates = list(db.slip_templates.find({}))
    print(f"\n📊 Found {len(all_templates)} total templates in database")
    
    if len(all_templates) == 0:
        print("⚠️ No templates found in database!")
        print("   Templates should be auto-initialized when user accesses template selector.")
        return 0
    
    # Group templates by channel
    channels = {}
    for template in all_templates:
        channel_id = template.get("channel_id", "unknown")
        if channel_id not in channels:
            channels[channel_id] = []
        channels[channel_id].append(template)
    
    print(f"\n📋 Templates by channel:")
    for channel_id, templates in channels.items():
        print(f"\n  Channel: {channel_id}")
        print(f"  Total templates: {len(templates)}")
        
        for i, template in enumerate(templates, 1):
            template_id = str(template.get("_id", "unknown"))
            template_name = template.get("template_name", "Unnamed")
            template_type = template.get("template_type", "unknown")
            is_default = template.get("is_default", False)
            usage_count = template.get("usage_count", 0)
            
            # Check data completeness
            has_flex = bool(template.get("template_flex"))
            has_text = bool(template.get("template_text"))
            
            status_icon = "✅" if (has_flex or has_text) else "❌"
            default_icon = "⭐" if is_default else "  "
            
            print(f"    {default_icon}{status_icon} [{i}] {template_name}")
            print(f"        ID: {template_id}")
            print(f"        Type: {template_type}")
            print(f"        Has flex data: {has_flex}")
            print(f"        Has text data: {has_text}")
            print(f"        Usage count: {usage_count}")
            
            # Identify issues
            issues = []
            
            if template_type == "flex" and not has_flex:
                issues.append("⚠️ ISSUE: template_type='flex' but no template_flex data!")
            
            if template_type == "text" and not has_text:
                issues.append("⚠️ ISSUE: template_type='text' but no template_text data!")
            
            if not has_flex and not has_text:
                issues.append("❌ CRITICAL: No template data at all!")
            
            if template_type == "flex" and has_flex:
                # Validate flex structure
                flex_data = template.get("template_flex")
                if not isinstance(flex_data, dict):
                    issues.append(f"❌ CRITICAL: template_flex is not a dict (type: {type(flex_data).__name__})")
                elif "type" not in flex_data:
                    issues.append("⚠️ WARNING: template_flex missing 'type' field")
            
            if issues:
                for issue in issues:
                    print(f"        {issue}")
    
    # Summary
    print(f"\n" + "=" * 80)
    print("📊 SUMMARY")
    print("=" * 80)
    
    total_templates = len(all_templates)
    flex_templates = sum(1 for t in all_templates if t.get("template_type") == "flex")
    text_templates = sum(1 for t in all_templates if t.get("template_type") == "text")
    templates_with_data = sum(1 for t in all_templates if (t.get("template_flex") or t.get("template_text")))
    problematic_templates = total_templates - templates_with_data
    
    print(f"Total templates: {total_templates}")
    print(f"Flex templates: {flex_templates}")
    print(f"Text templates: {text_templates}")
    print(f"Templates with data: {templates_with_data}")
    print(f"Problematic templates: {problematic_templates}")
    
    if problematic_templates > 0:
        print(f"\n⚠️ WARNING: {problematic_templates} templates have issues!")
        print("   This is likely causing the system to respond with plain text instead of templates.")
        print("   Recommendation: Delete these templates and let the system re-initialize them.")
    else:
        print(f"\n✅ All templates have data!")
        print("   If templates still aren't working, check:")
        print("   1. Is the template_id saved correctly in account settings?")
        print("   2. Are there any errors in the logs during template rendering?")
        print("   3. Is the template_flex structure valid for LINE Flex Messages?")
    
    return 0

if __name__ == "__main__":
    sys.exit(main())

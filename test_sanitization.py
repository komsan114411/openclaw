#!/usr/bin/env python3
"""
Test cases for Flex Message sanitization

This script tests the sanitize_flex_message function to ensure:
1. Invalid 'size' properties are removed from box, separator, spacer, button, filler components
2. Pixel values are converted to valid size keywords
3. Deeply nested structures are properly sanitized
"""

import sys
import json
import re
from typing import Any, Dict
import logging

# Setup simple logging
logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)


def sanitize_flex_message(obj: Any) -> Any:
    """
    Sanitize Flex Message to fix invalid properties before sending to LINE API
    - Fixes invalid 'size' values (e.g., '68px' -> 'md') for 'text' components
    - Validates 'size' property for 'image' and 'bubble' components
    - Removes 'size' property from invalid components (box, separator, spacer, button, filler)
    - Recursively processes all nested objects and arrays
    - IMPORTANT: Sanitizes nested structures FIRST, then validates size property
    """
    # Valid text sizes for LINE Flex Message
    VALID_TEXT_SIZES = {'xxs', 'xs', 'sm', 'md', 'lg', 'xl', 'xxl', '3xl', '4xl', '5xl', 'full'}
    # Valid image sizes
    VALID_IMAGE_SIZES = {'xxs', 'xs', 'sm', 'md', 'lg', 'xl', 'xxl', '3xl', '4xl', '5xl', 'full'}
    # Valid bubble sizes
    VALID_BUBBLE_SIZES = {'nano', 'micro', 'kilo', 'mega', 'giga'}
    # Components that CANNOT have 'size' property
    INVALID_SIZE_COMPONENTS = {'box', 'separator', 'spacer', 'button', 'filler'}
    
    # Map pixel values to valid sizes
    def convert_pixel_size(pixel_size: str) -> str:
        """Convert pixel size to valid LINE Flex size keyword"""
        if not pixel_size or not isinstance(pixel_size, str):
            return pixel_size
            
        # Already valid size
        if pixel_size.lower() in VALID_TEXT_SIZES:
            return pixel_size
            
        # Extract number from pixel value (e.g., '68px' -> 68)
        match = re.match(r'^(\d+)(px)?$', pixel_size.strip(), re.IGNORECASE)
        if match:
            px_value = int(match.group(1))
            # Map to approximate size keywords
            if px_value <= 24:
                return 'xxs'
            elif px_value <= 32:
                return 'xs'
            elif px_value <= 48:
                return 'sm'
            elif px_value <= 64:
                return 'md'
            elif px_value <= 80:
                return 'lg'
            elif px_value <= 96:
                return 'xl'
            elif px_value <= 128:
                return 'xxl'
            elif px_value <= 160:
                return '3xl'
            elif px_value <= 200:
                return '4xl'
            elif px_value <= 256:
                return '5xl'
            else:
                return 'full'
        
        return pixel_size
    
    if isinstance(obj, dict):
        # First, recursively sanitize all nested structures (including 'size' in nested objects)
        sanitized_obj = {}
        for key, value in obj.items():
            if key != 'size':  # Process everything except 'size' first
                sanitized_obj[key] = sanitize_flex_message(value)
        
        # Now check and handle 'size' property based on component type
        # IMPORTANT: Only text, image, and bubble components can have 'size' property
        if 'size' in obj:
            component_type = sanitized_obj.get('type', '').lower()
            size_value = obj['size']
            
            # Check if component type explicitly cannot have 'size'
            if component_type in INVALID_SIZE_COMPONENTS:
                logger.warning(f"⚠️ Removing invalid 'size' property from {component_type} component")
                # Don't add 'size' to sanitized_obj - it's invalid for this component type
            elif component_type == 'text' and isinstance(size_value, str):
                # Fix invalid size values for text components
                converted = convert_pixel_size(size_value)
                if converted.lower() in VALID_TEXT_SIZES:
                    sanitized_obj['size'] = converted
                else:
                    logger.warning(f"⚠️ Invalid text size: {size_value}, removing it")
                    # Don't add invalid size
            elif component_type == 'image' and isinstance(size_value, str):
                # Validate image size
                if size_value.lower() in VALID_IMAGE_SIZES:
                    sanitized_obj['size'] = size_value
                else:
                    # Try to convert pixel values
                    converted = convert_pixel_size(size_value)
                    if converted.lower() in VALID_IMAGE_SIZES:
                        sanitized_obj['size'] = converted
                    else:
                        logger.warning(f"⚠️ Invalid image size: {size_value}, removing it")
                        # Don't add invalid size
            elif component_type == 'bubble' and isinstance(size_value, str):
                # Validate bubble size
                if size_value.lower() in VALID_BUBBLE_SIZES:
                    sanitized_obj['size'] = size_value
                else:
                    # Use default if invalid
                    logger.warning(f"⚠️ Invalid bubble size: {size_value}, using 'mega' as default")
                    sanitized_obj['size'] = 'mega'
            elif not component_type:
                # Component without type - remove size
                logger.warning(f"⚠️ Removing 'size' property from component without type")
                # Don't add 'size' to sanitized_obj
            else:
                # Unknown component type - remove size to be safe
                logger.warning(f"⚠️ Removing 'size' property from unknown component type: {component_type}")
                # Don't add 'size' to sanitized_obj
        
        return sanitized_obj
    elif isinstance(obj, list):
        # Process each item in the list
        return [sanitize_flex_message(item) for item in obj]
    else:
        # Return primitive values as-is
        return obj


def test_remove_size_from_box():
    """Test that 'size' is removed from box components"""
    print("\n📋 Test 1: Remove 'size' from box component")
    
    test_message = {
        "type": "box",
        "layout": "vertical",
        "size": "md",  # Invalid - should be removed
        "contents": [
            {
                "type": "text",
                "text": "Hello",
                "size": "lg"  # Valid - should remain
            }
        ]
    }
    
    result = sanitize_flex_message(test_message)
    
    # Check that size was removed from box
    assert "size" not in result, "❌ 'size' should be removed from box component"
    
    # Check that size remains in text
    assert result["contents"][0].get("size") == "lg", "❌ 'size' should remain in text component"
    
    print("✅ Test passed: 'size' removed from box, kept in text")
    return True


def test_remove_size_from_separator():
    """Test that 'size' is removed from separator components"""
    print("\n📋 Test 2: Remove 'size' from separator component")
    
    test_message = {
        "type": "separator",
        "size": "68px"  # Invalid - should be removed
    }
    
    result = sanitize_flex_message(test_message)
    
    assert "size" not in result, "❌ 'size' should be removed from separator component"
    
    print("✅ Test passed: 'size' removed from separator")
    return True


def test_remove_size_from_button():
    """Test that 'size' is removed from button components"""
    print("\n📋 Test 3: Remove 'size' from button component")
    
    test_message = {
        "type": "button",
        "action": {
            "type": "uri",
            "uri": "https://example.com"
        },
        "size": "72px"  # Invalid - should be removed
    }
    
    result = sanitize_flex_message(test_message)
    
    assert "size" not in result, "❌ 'size' should be removed from button component"
    
    print("✅ Test passed: 'size' removed from button")
    return True


def test_convert_pixel_to_keyword():
    """Test that pixel values are converted to valid keywords for text"""
    print("\n📋 Test 4: Convert pixel values to keywords")
    
    test_cases = [
        ("20px", "xxs"),
        ("30px", "xs"),
        ("40px", "sm"),
        ("60px", "md"),
        ("70px", "lg"),
        ("90px", "xl"),
        ("120px", "xxl"),
        ("150px", "3xl"),
        ("180px", "4xl"),
        ("250px", "5xl"),
    ]
    
    for pixel_value, expected_keyword in test_cases:
        test_message = {
            "type": "text",
            "text": "Test",
            "size": pixel_value
        }
        
        result = sanitize_flex_message(test_message)
        
        assert result["size"] == expected_keyword, f"❌ '{pixel_value}' should convert to '{expected_keyword}', got '{result['size']}'"
        print(f"  ✓ {pixel_value} → {expected_keyword}")
    
    print("✅ Test passed: All pixel values converted correctly")
    return True


def test_deeply_nested_structure():
    """Test that deeply nested structures are properly sanitized"""
    print("\n📋 Test 5: Sanitize deeply nested structure")
    
    test_message = {
        "type": "bubble",
        "size": "mega",  # Valid for bubble
        "body": {
            "type": "box",
            "layout": "vertical",
            "size": "68px",  # Invalid - should be removed
            "contents": [
                {
                    "type": "box",
                    "layout": "horizontal",
                    "size": "72px",  # Invalid - should be removed
                    "contents": [
                        {
                            "type": "text",
                            "text": "Amount",
                            "size": "80px"  # Should convert to "lg"
                        },
                        {
                            "type": "separator",
                            "size": "md"  # Invalid - should be removed
                        }
                    ]
                }
            ]
        }
    }
    
    result = sanitize_flex_message(test_message)
    
    # Check bubble size is kept
    assert result.get("size") == "mega", "❌ Bubble size should be kept"
    
    # Check first box has no size
    assert "size" not in result["body"], "❌ First box should not have 'size'"
    
    # Check second box has no size
    assert "size" not in result["body"]["contents"][0], "❌ Second box should not have 'size'"
    
    # Check text size is converted
    text_component = result["body"]["contents"][0]["contents"][0]
    assert text_component.get("size") == "lg", f"❌ Text size should be 'lg', got '{text_component.get('size')}'"
    
    # Check separator has no size
    separator_component = result["body"]["contents"][0]["contents"][1]
    assert "size" not in separator_component, "❌ Separator should not have 'size'"
    
    print("✅ Test passed: Deeply nested structure sanitized correctly")
    return True


def test_complex_template():
    """Test a realistic complex flex message template"""
    print("\n📋 Test 6: Sanitize complex realistic template")
    
    # This simulates a real flex message with various invalid size properties
    test_message = {
        "type": "bubble",
        "size": "kilo",
        "header": {
            "type": "box",
            "layout": "vertical",
            "size": "68px",  # Invalid
            "contents": [
                {
                    "type": "text",
                    "text": "Payment Confirmation",
                    "size": "72px",  # Should convert to "lg"
                    "weight": "bold"
                }
            ]
        },
        "body": {
            "type": "box",
            "layout": "vertical",
            "size": "md",  # Invalid
            "contents": [
                {
                    "type": "box",
                    "layout": "horizontal",
                    "size": "sm",  # Invalid
                    "contents": [
                        {
                            "type": "text",
                            "text": "Amount:",
                            "size": "md"  # Valid
                        },
                        {
                            "type": "text",
                            "text": "1,000.00",
                            "size": "xl"  # Valid
                        }
                    ]
                },
                {
                    "type": "separator",
                    "size": "68px"  # Invalid
                },
                {
                    "type": "spacer",
                    "size": "md"  # Invalid
                }
            ]
        },
        "footer": {
            "type": "box",
            "layout": "vertical",
            "size": "lg",  # Invalid
            "contents": [
                {
                    "type": "button",
                    "action": {
                        "type": "uri",
                        "uri": "https://example.com"
                    },
                    "style": "primary",
                    "size": "72px"  # Invalid
                }
            ]
        }
    }
    
    result = sanitize_flex_message(test_message)
    
    # Validate header
    assert "size" not in result["header"], "❌ Header box should not have 'size'"
    assert result["header"]["contents"][0]["size"] == "lg", "❌ Header text should have 'lg'"
    
    # Validate body
    assert "size" not in result["body"], "❌ Body box should not have 'size'"
    assert "size" not in result["body"]["contents"][0], "❌ Inner box should not have 'size'"
    assert result["body"]["contents"][0]["contents"][0]["size"] == "md", "❌ First text should have 'md'"
    assert result["body"]["contents"][0]["contents"][1]["size"] == "xl", "❌ Second text should have 'xl'"
    assert "size" not in result["body"]["contents"][1], "❌ Separator should not have 'size'"
    assert "size" not in result["body"]["contents"][2], "❌ Spacer should not have 'size'"
    
    # Validate footer
    assert "size" not in result["footer"], "❌ Footer box should not have 'size'"
    assert "size" not in result["footer"]["contents"][0], "❌ Button should not have 'size'"
    
    print("✅ Test passed: Complex template sanitized correctly")
    return True


def test_invalid_text_size():
    """Test that invalid text sizes are removed"""
    print("\n📋 Test 7: Remove invalid text sizes")
    
    test_message = {
        "type": "text",
        "text": "Hello",
        "size": "invalid_size"  # Invalid - should be removed
    }
    
    result = sanitize_flex_message(test_message)
    
    # Invalid size should be removed
    assert "size" not in result, "❌ Invalid text size should be removed"
    
    print("✅ Test passed: Invalid text size removed")
    return True


def test_validation_function():
    """Test the validation function"""
    print("\n📋 Test 8: Test validation function")
    
    # Define a simple validation function for testing
    def validate_flex_message_structure(flex_message):
        """Simple validation for testing"""
        issues = []
        
        def check_component(obj, path="root"):
            if isinstance(obj, dict):
                comp_type = obj.get("type", "").lower()
                if "size" in obj:
                    invalid_components = {"box", "separator", "spacer", "button", "filler"}
                    if comp_type in invalid_components:
                        issues.append(f"Invalid 'size' in {comp_type} at {path}")
                for key, value in obj.items():
                    check_component(value, f"{path}.{key}")
            elif isinstance(obj, list):
                for idx, item in enumerate(obj):
                    check_component(item, f"{path}[{idx}]")
        
        if not isinstance(flex_message, dict):
            issues.append("Not a dictionary")
            return False, issues
        
        check_component(flex_message.get("contents", {}))
        return len(issues) == 0, issues
    
    # Test 1: Valid message
    valid_message = {
        "type": "flex",
        "altText": "Test",
        "contents": {
            "type": "bubble",
            "body": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "text",
                        "text": "Hello",
                        "size": "md"
                    }
                ]
            }
        }
    }
    
    is_valid, issues = validate_flex_message_structure(valid_message)
    assert is_valid, f"❌ Valid message should pass validation, issues: {issues}"
    print("  ✓ Valid message passed validation")
    
    # Test 2: Invalid message with size in box
    invalid_message = {
        "type": "flex",
        "altText": "Test",
        "contents": {
            "type": "bubble",
            "body": {
                "type": "box",
                "layout": "vertical",
                "size": "md",  # Invalid
                "contents": []
            }
        }
    }
    
    is_valid, issues = validate_flex_message_structure(invalid_message)
    assert not is_valid, "❌ Invalid message should fail validation"
    assert len(issues) > 0, "❌ Should have at least one issue"
    print(f"  ✓ Invalid message correctly detected ({len(issues)} issue(s))")
    
    # Test 3: Sanitized message should pass validation
    sanitized = sanitize_flex_message(invalid_message)
    is_valid, issues = validate_flex_message_structure(sanitized)
    assert is_valid, f"❌ Sanitized message should pass validation, issues: {issues}"
    print("  ✓ Sanitized message passed validation")
    
    print("✅ Test passed: Validation function works correctly")
    return True


def run_all_tests():
    """Run all test cases"""
    print("=" * 60)
    print("🧪 Running Flex Message Sanitization Tests")
    print("=" * 60)
    
    tests = [
        test_remove_size_from_box,
        test_remove_size_from_separator,
        test_remove_size_from_button,
        test_convert_pixel_to_keyword,
        test_deeply_nested_structure,
        test_complex_template,
        test_invalid_text_size,
        test_validation_function,
    ]
    
    passed = 0
    failed = 0
    
    for test in tests:
        try:
            if test():
                passed += 1
        except AssertionError as e:
            print(f"❌ Test failed: {e}")
            failed += 1
        except Exception as e:
            print(f"❌ Test error: {e}")
            failed += 1
    
    print("\n" + "=" * 60)
    print(f"📊 Test Results: {passed} passed, {failed} failed")
    print("=" * 60)
    
    if failed == 0:
        print("🎉 All tests passed!")
        return 0
    else:
        print(f"⚠️ {failed} test(s) failed")
        return 1


if __name__ == "__main__":
    sys.exit(run_all_tests())

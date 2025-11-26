# -*- coding: utf-8 -*-
"""
Script to remove all emoji from Python source files
"""
import re
import sys

def remove_emojis(text):
    """Remove emoji and other unicode symbols from text"""
    # Common emoji patterns
    emoji_pattern = re.compile(
        "["
        "\U0001F600-\U0001F64F"  # emoticons
        "\U0001F300-\U0001F5FF"  # symbols & pictographs
        "\U0001F680-\U0001F6FF"  # transport & map symbols
        "\U0001F1E0-\U0001F1FF"  # flags (iOS)
        "\U00002702-\U000027B0"
        "\U000024C2-\U0001F251"
        "\u2705"  # white check mark
        "\u274c"  # cross mark
        "\u26a0"  # warning sign
        "\ufe0f"  # variation selector
        "\u2139"  # information
        "\ud83d"  # high surrogate
        "]+", flags=re.UNICODE)
    
    # Replace emojis with text placeholders
    replacements = {
        '\u2705': '[OK]',
        '\u274c': '[ERROR]',
        '\u26a0\ufe0f': '[WARN]',
        '\u26a0': '[WARN]',
        '\ud83d\udd0d': '[DEBUG]',
        '\ud83d\ude80': '[START]',
        '\ud83d\udce3': '[INFO]',
        '\ud83d\udcf1': '[MOBILE]',
        '\ud83d\udeab': '[STOP]',
        '\ud83d\udd27': '[SETUP]',
        '\u2139\ufe0f': '[INFO]',
    }
    
    result = text
    for emoji, replacement in replacements.items():
        result = result.replace(emoji, replacement)
    
    # Remove any remaining emojis
    result = emoji_pattern.sub('', result)
    
    return result

def fix_file(filepath):
    """Fix emoji in a file"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Remove emojis
        fixed_content = remove_emojis(content)
        
        # Write back
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(fixed_content)
        
        print(f"[OK] Fixed: {filepath}")
        return True
    except Exception as e:
        print(f"[ERROR] Failed to fix {filepath}: {e}")
        return False

if __name__ == "__main__":
    # Fix main.py
    fix_file("main.py")

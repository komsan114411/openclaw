"""
Models package for LINE OA application
Contains database models and LINE account management
"""

from .database import (
    init_database,
    save_chat_history,
    save_chat_history_with_account,
    get_chat_history_count,
    get_recent_chat_history,
    get_user_chat_history,
    test_connection,
    get_connection_info,
    get_database_status,
)

from .line_account_manager import LineAccountManager

__all__ = [
    'init_database',
    'save_chat_history',
    'save_chat_history_with_account',
    'get_chat_history_count',
    'get_recent_chat_history',
    'get_user_chat_history',
    'test_connection',
    'get_connection_info',
    'get_database_status',
    'LineAccountManager',
]


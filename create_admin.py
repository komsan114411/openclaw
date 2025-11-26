"""
Create Admin User Script
Run this to create the initial admin user
"""
import sys
from models.database import init_database
from models.user import User

def create_admin_user():
    """Create admin user"""
    print("[SETUP] Creating admin user...")
    
    try:
        # Initialize database
        database = init_database()
        db = database.get_db()
        user_model = User(db)
        
        # Check if admin already exists
        existing_admin = user_model.get_user_by_username("admin")
        if existing_admin:
            print("[WARN] Admin user already exists!")
            print(f"Username: admin")
            print("To reset password, delete the user first or use change password function.")
            return
        
        # Create admin user
        admin_username = "admin"
        admin_password = "admin123"  # Default password - CHANGE THIS!
        
        user_id = user_model.create_user(
            username=admin_username,
            password=admin_password,
            role="admin",
            email="admin@system.local",
            full_name="System Administrator",
            force_password_change=False  # Set to True if you want to force password change on first login
        )
        
        if user_id:
            print("[OK] Admin user created successfully!")
            print(f"Username: {admin_username}")
            print(f"Password: {admin_password}")
            print("\n[WARN] IMPORTANT: Please change the password after first login!")
        else:
            print("[ERROR] Failed to create admin user")
            
    except Exception as e:
        print(f"[ERROR] Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    create_admin_user()

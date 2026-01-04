Task: Fix Template Loading, Bot Toggle, and Settings UI Visibility
Context
The user is reporting three specific issues that need immediate resolution:

Templates not showing: The Template list is empty or fails to render.

Bot Toggle broken: Clicking the "On/Off" switch for the Line Bot does nothing.

Settings UI Visibility: The Settings page is "too white," making it hard to distinguish sections or read input fields.

📂 Relevant Files
Templates: frontend/src/app/user/templates/page.tsx

Line Accounts (Bot Toggle): frontend/src/app/user/line-accounts/page.tsx

Settings UI: frontend/src/app/admin/settings/page.tsx (and src/app/user/settings/page.tsx if exists)

🎯 Objectives & Fixes
1. Fix Template Loading Logic
Problem: The API call to fetch templates might be failing, or the data mapping in the UI is incorrect. Action:

Inspect: frontend/src/app/user/templates/page.tsx.

Fix Data Fetching: Ensure the useEffect hook calls the correct endpoint (likely GET /api/slip-templates).

Fix Rendering: Check if the variable being mapped (e.g., templates.map(...)) exists. Add a check if (!templates || templates.length === 0) to show a "No templates found" message instead of a blank screen.

Debug: Add console.log('Fetched Templates:', data) to verify the API response structure.

2. Fix Line Bot Toggle (On/Off)
Problem: The Switch component for enabling/disabling the bot is unresponsive. Action:

Inspect: frontend/src/app/user/line-accounts/page.tsx.

Fix Handler: Ensure the Switch component has an onChange or onClick event handler attached.

API Connection: The handler must call the update endpoint (e.g., PATCH /api/line-accounts/:id) with the payload { is_active: boolean }.

State Update: After the API call succeeds, update the local state immediately so the UI reflects the change (Toggle flips visually).

3. Improve Settings Page UI (Visibility)
Problem: The page is "too white" (Low contrast), making inputs and sections blend into the background. Action:

Inspect: frontend/src/app/admin/settings/page.tsx.

Add Container Contrast: Wrap the main settings form in a Card or a div with these classes:

TypeScript

<div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
  {/* Settings Content */}
</div>
Fix Input Fields: Ensure all <Input /> fields have a visible border (border-gray-300) and distinct background (bg-gray-50 or bg-white).

Add Section Headers: Use clear headings with darker text (text-gray-800) to separate "General Settings", "API Keys", etc.

Background: Ensure the main page background is slightly off-white (bg-gray-50 or bg-gray-100) so the white content cards pop out.

✅ Acceptance Criteria
Templates: The template list loads and displays items from the database.

Bot Toggle: Clicking the toggle updates the status in the database AND visually changes the switch state.

UI: The Settings page has clear borders, shadows, and contrast. It is easy to read.
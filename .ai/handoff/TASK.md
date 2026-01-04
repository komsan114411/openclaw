Master Task: System Overhaul - Logic Integration & UI Redesign
Context
The system requires a comprehensive update to ensure seamless integration between features. Specifically, the Auto-Response System must intelligently handle various scenarios (Quota limits, Invalid slips, Template selection) without conflict. We also need to fix critical bugs and modernize the UI.

🚩 Part 1: Critical Logic & Reliability (Priority: Highest)
Core business logic must be robust and handle all edge cases.

1.1 Centralized Response Logic (The "Brain")
Objective: The system must follow a strict Priority Waterfall when a user sends an image/slip. It must not verify the slip if the quota is already zero.

Required Flow:

Check Subscription/Quota:

IF Quota <= 0 OR Subscription == Expired:

ACTION: Stop processing immediately.

REPLY: Send the "Quota Exceeded" system template.

DO NOT call the external Bank API (save costs).

Verify Slip (External API):

IF Slip == Invalid OR Not Found:

ACTION: Stop processing.

REPLY: Send the "Slip Not Found / Invalid" system template.

Success Processing:

IF Slip == Valid:

ACTION: Deduct Quota (-1).

REPLY: Determine which template to use (User's Custom Template VS System Default) based on the logic defined in previous tasks.

1.2 System Template Management
Requirement: Admin must be able to configure specific messages for these error states in Admin > System Responses:

TEMPLATE_QUOTA_EXCEEDED (e.g., "แพ็กเกจของคุณหมด กรุณาเติมเงิน...")

TEMPLATE_SLIP_INVALID (e.g., "ไม่พบข้อมูลสลิป หรือสลิปซ้ำ...")

TEMPLATE_SYSTEM_ERROR (Fallback when server crashes).

1.3 Fix API & Dashboard Logic
Date Bug: Fix Dashboard logic where expired dates show "0 days left" incorrectly.

Connection Test: Add a "Test Connection" button in Settings to verify API Keys and Webhooks instantly.

🎨 Part 2: UI/UX & Terminology Overhaul (Priority: Medium)
Make the system user-friendly and professional.

2.1 Remove "Sci-Fi" Jargon
Replace all technical terms with business terms:

"Neural Flex" ➡️ "System Status"

"Signal Cipher" ➡️ "API Health"

"Matrix Connectivity" ➡️ "Connection"

2.2 UI Improvements
Settings: Move "Branding/Color Picker" to the top.

Loading States: Add Spinners/Skeletons to all async data tables (Chats, Payments).

Feedback: Implement Global Toast Notifications (Success/Error) for every action.

✨ Part 3: Missing Features & Enhancements (Priority: Low)
Fill the functional gaps.

3.1 Advanced Auto-Response Features
Live Preview: When editing templates, show a "Phone Mockup" side-by-side that updates in real-time.

Fallback Mechanism: If a user's selected template is deleted, the system MUST automatically fallback to the System Default template without crashing.

3.2 Payment & Package Management
Bulk Actions: Allow selecting multiple slips to "Approve" at once.

Comparison: Add a comparison table for Packages.

Slip Modal: Click on a slip thumbnail to view the full image in a popup.

✅ Acceptance Criteria
Flow Test: Sending a slip with 0 Quota triggers the "Quota Message" immediately (no API call to bank).

Error Test: Sending a fake/invalid slip triggers the "Invalid Slip Message".

Integration: Deleting a user's active template causes the system to switch to the Default template automatically on the next message.

UI: No console errors, and all "Sci-Fi" text is removed.
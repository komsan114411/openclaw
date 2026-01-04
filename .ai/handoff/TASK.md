🚩 Part 1: Critical Fixes & Stability (Priority: High)
Must be fixed first to ensure system reliability.

1.1 API & Dashboard Logic
Date Calculation Bug: In Dashboard and Statistics components, expired dates (e.g., Jan 2, 2029) are showing as "0 days left" or incorrect values.

Fix: Refactor date logic to correctly calculate diffs. Past dates must show as "Expired" (Red badge).

API Key Visibility: API Keys in Settings currently show as dots (....).

Fix: Add a "Show/Hide" toggle button.

Fix: Add a "Test Connection" button to ping the API and verify validity immediately.

URL Validation: Add Regex validation for all URL inputs (must start with http:// or https://).

1.2 Admin Chat System
Bug: Messages fail to load or load inconsistently compared to the User chat.

Fix: Refactor frontend/src/app/admin/chat/page.tsx to match the stability of the User chat. Ensure useEffect fetches data reliably.

Empty State: Replace the plain empty state with a helpful prompt (e.g., "Select a user to view conversation").

1.3 Global Error Handling
Issue: Failed API calls result in silent failures or white screens.

Fix: Implement a Global Toast Notification system.

200 OK -> Green Success Toast.

400/500 Errors -> Red Error Toast with a clear message.

🎨 Part 2: UI/UX & Terminology Overhaul (Priority: Medium)
Simplify the interface and make it professional.

2.1 Remove "Sci-Fi" Jargon
Requirement: Replace all technical/fantasy terms with standard SaaS terminology:

"Neural Flex" / "Signal Cipher" ➡️ "System Status" or "Service Health"

"Matrix Connectivity" ➡️ "Connection Status"

"Deployment Format" ➡️ "Settings" or "Configuration"

Goal: The UI must be understandable by a non-technical admin.

2.2 Layout & Navigation Improvements
Settings Page: Move the "Color Picker" / Branding section to the TOP of the page (currently at the bottom).

User Management Table:

Merge Columns: Combine "Name" and "Email" into a "User Profile" column to save space.

Clean Actions: Replace the 4 separate buttons with a single "..." (Meatball Menu) Dropdown.

Statistics Cards: Clarify labels (e.g., change "+3 Active" to "Active Users: 3").

2.3 Visual Feedback
Loading States: Add Spinners or Skeleton Loaders to:

Chat message list.

Payment verification tables.

Dashboard stats.

✨ Part 3: Missing Features & Enhancements (Priority: Low)
Add functionality to make the system usable.

3.1 Payment & Slip Verification
Bulk Actions: Add checkboxes to the Payment Table. Allow "Approve Selected" or "Reject Selected".

Slip Preview: Add a thumbnail column. Clicking it opens a Modal to view the full slip image without leaving the page.

Filters: Add Date Range and Amount filters to the table header.

Status Renaming: Change "VERIFICATION" to "Pending Review" for clarity.

3.2 Package Management
Comparison: Create a "Comparison Table" view to show package features side-by-side.

Price Calculation: Fix the logic: Price / Quantity = Cost per slip. (Currently incorrect).

ROI Info: Add a section showing "Worthiness" or "Save %" to encourage upgrades.

3.3 Auto-Response Templates
Live Preview: Split the screen (Left: Edit Form, Right: Phone Mockup).

As the user types, the Phone Mockup must update in real-time to show exactly what the customer will see.

✅ Acceptance Criteria (Definition of Done)
Zero Console Errors: The browser console must be clean of red errors.

No Sci-Fi Terms: All text is standard English/Thai business terms.

Functional Critical Path: API Keys can be tested, Dates are correct, and Chat loads instantly.

Bulk Operations: Admin can approve at least 5 slips at once using the new bulk action feature.

Responsive Feedback: Every button click triggers a loading state or a toast notification.
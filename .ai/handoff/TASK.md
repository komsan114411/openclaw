 Task: Enable User Template Selection & Improve LINE Account Onboarding

Context

Currently, users cannot assign a specific "Slip Template" to their LINE accounts (the feature exists in the database but not in the UI). Additionally, users are confused when adding a new LINE account because there are no instructions on where to get the "Channel Token" or where to paste the "Webhook URL".🎯 Objectives

1. Fix: User Template Selection (Frontend & Backend)

The Problem: Users can create templates, but they cannot "Apply" them to a specific LINE Account.



Requirement (Frontend):

In the "Add/Edit LINE Account" Modal, add a new field: "Slip Template" (Dropdown).

Dropdown Logic:

Option 1 (Default): "Use System Default" (Value: null).

Other Options: Fetch and list all Active templates created by this user.

Preview: If possible, show a small text preview of the selected template below the dropdown.

Requirement (Backend):

Ensure the CreateLineAccountDto and UpdateLineAccountDto accept an optional template_id.

Validate that the template_id actually belongs to the user (security check).

2. UX Improvement: LINE Account Setup Guide

The Problem: Users don't know where to find "Channel Access Token" or what to do with the Webhook URL.



Requirement: Enhance the "Add LINE Account" form with Helper Text and Links:

Step 1: Get Credentials:

Add a link: "Go to LINE Developers Console to get your Channel Secret & Access Token."

Add a small tooltip/icon next to the inputs explaining where to look.

Step 2: Webhook Setup (Crucial):

Display the Webhook URL: The system must generate and display the callback URL that the user needs (e.g., https://your-domain.com/api/line-webhook/{line_account_id}).

Note: Since the ID might not exist yet during creation, display the base URL and instruct them: "After saving, copy the Webhook URL from the list and paste it into LINE Console."

Instruction Text: "Copy this URL -> Paste in LINE Console -> Enable Webhook."

3. Validation & Feedback

Test Connection: Implement the logic for the "Test Connection" button (if not already working) to verify the token is valid before saving.

✅ Acceptance Criteria

Template Selection: I can open the "Edit LINE Account" modal, select one of my custom templates, save it, and when I re-open the modal, that template is still selected.

Database: The line_accounts table correctly updates the template_id column.

Guidance: The "Add Account" form clearly shows a link to LINE Developers.

Webhook: The user can easily copy the correct Webhook URL from the dashboard to paste into LINE.
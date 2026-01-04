# Task: Fix Admin Chat Loading Issue & Harden Security

## Context
The Admin Chat interface is failing to load messages, while the User Chat works correctly. We need to fix this bug, ensure feature parity between Admin and User chat, and implement strict security measures.

## Relevant Files
Please analyze and edit the following files:
- **Target Frontend (Broken):** `frontend/src/app/admin/chat/page.tsx`
- **Reference Frontend (Working):** `frontend/src/app/user/chat/page.tsx`
- **Backend Controller:** `backend/src/chat-messages/chat-messages.controller.ts`
- **Backend Service:** `backend/src/chat-messages/chat-messages.service.ts`

## Objectives

### 1. Fix Message Loading (Priority)
- Analyze `frontend/src/app/admin/chat/page.tsx`. It likely has state management or API integration errors preventing messages from rendering.
- Compare it with `frontend/src/app/user/chat/page.tsx` to identify missing logic or incorrect hooks.
- Ensure the API endpoint called by the Admin page exists and returns the expected data structure.

### 2. Backend Security & Reliability
- **Endpoint Verification:** Check `chat-messages.controller.ts`. Ensure the endpoint for admin message retrieval handles pagination and filtering correctly.
- **Authorization (Crucial):**
    - Verify that the endpoint is protected by `RolesGuard` and restricted to Admin users only.
    - **Anti-IDOR:** Ensure that even an Admin provides a valid `userId` or `chatId` and that the system validates the existence of that chat session before returning data.
- **Sanitization:** Implement input validation (DTOs) and output sanitization to prevent Stored XSS attacks in the chat.

### 3. Error Handling
- Implement try-catch blocks in the Frontend to handle API failures gracefully (e.g., show a "Retry" button instead of a blank screen).
- Ensure the Backend returns standard HTTP error codes (403 for Forbidden, 404 for Not Found).

## Acceptance Criteria
- [ ] Admin Chat loads historical messages immediately upon opening.
- [ ] No console errors (red text) in the browser Developer Tools.
- [ ] An Admin cannot access a chat session that doesn't exist (returns 404).
- [ ] XSS attempts (e.g., `<script>alert(1)</script>`) are rendered as plain text, not executed.
# CODE_READY.md

## Task Completed
**Task:** Enable User Template Selection & Improve LINE Account Onboarding

## Implementation Summary

### 1. Backend Changes

#### Files Modified:
- `backend/src/line-accounts/dto/create-line-account.dto.ts`
  - Added `slipTemplateId` optional field with `@IsMongoId()` validation

- `backend/src/line-accounts/dto/update-line-account.dto.ts`
  - Added `slipTemplateId` optional field with `@IsMongoId()` validation

- `backend/src/line-accounts/line-accounts.service.ts`
  - Added `validateTemplateOwnership()` method for security check
  - Added `getTemplatesByOwner()` method to get user's templates
  - Updated `create()` to validate and store slipTemplateId in settings
  - Updated `update()` to validate and update slipTemplateId with ownership check

- `backend/src/line-accounts/line-accounts.controller.ts`
  - Added `GET /line-accounts/my/templates` endpoint
  - Added `POST /line-accounts/:id/test-connection` endpoint
  - Added `POST /line-accounts/test-connection` endpoint (with token)

- `backend/src/line-accounts/line-accounts.module.ts`
  - Added SlipTemplate schema import

### 2. Frontend Changes

#### Files Modified:
- `frontend/src/lib/api.ts`
  - Added `getMyTemplates()` API method
  - Added `testConnection()` and `testConnectionWithToken()` API methods
  - Added `regenerateWebhook()` API method
  - Created proper TypeScript interfaces for LINE account data

- `frontend/src/types/index.ts`
  - Added `SlipTemplateListItem` interface

- `frontend/src/app/user/line-accounts/page.tsx`
  - Added templates state and fetch on mount
  - Added `handleTestConnection()` function
  - Updated form to include `slipTemplateId`
  - Added LINE Developers Console guide with link (Step 1)
  - Added Test Connection button after Access Token field
  - Added Slip Template dropdown with template preview
  - Added Webhook URL display with copy button (Step 2)

## Features Implemented

### 1. User Template Selection
- Users can now select a slip template when creating/editing LINE accounts
- Templates are fetched from user's own templates + global templates
- Template preview shows header text when selected
- "Use System Default" option available

### 2. LINE Account Setup Guide
- Step 1: Link to LINE Developers Console with instructions
- Step 2: Webhook URL display with copy button
- New accounts show instruction to copy URL after saving

### 3. Test Connection Button
- Tests LINE channel connectivity before saving
- Shows bot display name on successful connection
- Clear error messages on failure

### 4. Security
- Template ownership validation on both create and update
- Only user's own templates + global templates can be selected
- ForbiddenException thrown for unauthorized template access

## Testing Performed
- TypeScript compilation: PASSED (both frontend and backend)
- No `any` types used
- Proper error handling implemented

## Notes for Tester
1. Create a LINE account and verify:
   - LINE Developers Console link works
   - Test Connection button validates access token
   - Template dropdown shows available templates
   - Webhook URL is displayed with copy button

2. Edit an existing LINE account and verify:
   - Previous template selection is loaded
   - Webhook URL is shown with current slug

3. Security test:
   - Try to set a template ID that doesn't belong to the user (should fail)

---
**Created:** 2026-01-04
**Developer Session:** Claude Code (Opus 4.5)

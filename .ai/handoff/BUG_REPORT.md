# BUG REPORT

## Task
พัฒนาระบบป้องกันการลบเทมเพลต (Safe Delete)

## Status
BLOCKED - Feature Incomplete

## Bugs Found

### BUG 1: Safe Delete endpoints NOT exposed in controller
**Severity:** CRITICAL
**Location:** `backend/src/slip-templates/slip-templates.controller.ts`

**Problem:**
The Safe Delete methods are implemented in the service but NOT exposed via API endpoints:
- `getTemplateUsageCount()` - Service line 347 - NO endpoint
- `checkTemplateUsage()` - Service line 377 - NO endpoint
- `safeDelete()` - Service line 410 - NO endpoint

**Current behavior:**
Controller line 188-197 still uses the old `delete()` method which doesn't check usage or require confirmation.

**Required endpoints:**
```typescript
// Check template usage before delete
GET /line-accounts/:accountId/slip-templates/:templateId/usage

// Safe delete with confirmation
DELETE /line-accounts/:accountId/slip-templates/:templateId/safe
Body: { confirmationText?: string }
```

### BUG 2: Minor TypeScript error (FIXED by Tester)
**Severity:** LOW (Fixed)
**Location:** `backend/src/slip-templates/slip-templates.service.ts:369`

**Problem:** Used `a.name` instead of `a.accountName`
**Fix:** Changed to `a.accountName`

### BUG 3: Temp files left in repo (FIXED by Tester)
**Severity:** LOW (Fixed)
**Location:** `backend/src/slip-templates/`

**Problem:** Leftover temp files causing TypeScript compilation errors
- `safe-delete-methods.ts`
- `temp_service.ts`
- `insert_methods.txt`

**Fix:** Deleted temp files

## What's Missing (Per TASK.md)

### Backend
- [ ] Add `GET /:accountId/slip-templates/:templateId/usage` endpoint
- [ ] Add `DELETE /:accountId/slip-templates/:templateId/safe` endpoint
- [ ] Add `GET /:accountId/slip-templates/:templateId/fallback` endpoint for template with fallback

### Frontend (Not started)
- [ ] Modal สีแดงแจ้งเตือนเมื่อเทมเพลตถูกใช้งาน
- [ ] Input field for typing "DELETE" or template name confirmation
- [ ] Show affected accounts list
- [ ] Template selector dropdown with "Use System Default" option
- [ ] Live preview when selecting template
- [ ] Warning when selected template is deleted

## What Works
- Service methods are correctly implemented
- TypeScript compiles successfully (after fixes)
- Security: `ensureAccountAccess()` is in place
- ObjectId validation is in place

## Recommended Next Steps
1. Developer adds missing endpoints to controller
2. Developer creates frontend UI components
3. Re-test after completion

## Tester Notes
- Fixed 2 minor bugs during testing
- Main feature is blocked due to incomplete implementation
- Service logic looks correct, just needs controller exposure

## Created
2026-01-04

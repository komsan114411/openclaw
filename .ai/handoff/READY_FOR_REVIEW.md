# READY FOR REVIEW

## Task Completed
Safe Delete Templates and Template Selection with Fallback

## What Was Done

### 1. Backend: slip-templates.service.ts

Added 4 new methods:

1. **getTemplateUsageCount(templateId)**
   - Queries LINE accounts to count how many are using the template
   - Checks `settings.slipTemplateId` and `settings.slipTemplateIds.*`
   - Returns count and list of affected accounts

2. **checkTemplateUsage(templateId)**
   - Pre-delete check returning:
     - `canDelete`: boolean (false if isDefault)
     - `isDefault`: boolean
     - `usageCount`: number
     - `accounts`: array of affected accounts
     - `warningMessage`: Thai language warning if in use

3. **safeDelete(templateId, confirmationText?)**
   - If template is default: throws BadRequestException
   - If `usageCount > 0`:
     - Requires confirmation text ("DELETE" or template name)
     - Clears template references from all affected LINE accounts
     - Logs warning for audit
   - Deletes template
   - Returns `{ success: true, affectedAccounts: number }`

4. **getTemplateWithFallback(lineAccountId, type, selectedTemplateId?)**
   - Priority 1: Use selected template if active
   - Priority 2: Fall back to account default
   - Priority 3: Fall back to global default
   - Logs warnings when fallback is used
   - Returns `{ template, usedFallback, reason }`

### 2. Backend: slip-templates.controller.ts

Added endpoints for both Admin and User:

**Admin Controller:**
- `GET /slip-templates/global/:templateId/usage` - Check usage before delete
- `DELETE /slip-templates/global/:templateId/safe-delete` - Safe delete with confirmation

**User Controller:**
- `GET /line-accounts/:accountId/slip-templates/:templateId/usage` - Check usage
- `DELETE /line-accounts/:accountId/slip-templates/:templateId/safe-delete` - Safe delete

### 3. Frontend: api.ts

Added new API methods:
```typescript
slipTemplatesApi.checkUsage(accountId, templateId)
slipTemplatesApi.safeDelete(accountId, templateId, confirmationText?)
```

## Files Modified

- [x] `backend/src/slip-templates/slip-templates.service.ts` - Added 4 new methods
- [x] `backend/src/slip-templates/slip-templates.controller.ts` - Added 4 new endpoints
- [x] `frontend/src/lib/api.ts` - Added 2 new API methods

## Remaining Work (Frontend UI)

The following UI changes are documented but not implemented:

1. **Delete Confirmation Modal**
   - Red warning modal when `usageCount > 0`
   - Input field requiring "DELETE" or template name
   - Show affected accounts list

2. **Template Selector Enhancement**
   - Dropdown with "Use System Default" as first option
   - Preview on selection
   - Warning if selected template was deleted

## How to Test

```bash
# Test TypeScript
cd test/backend
npx tsc --noEmit

# Test API Endpoints
# 1. Create a template
POST /user/line-accounts/{accountId}/slip-templates

# 2. Check usage
GET /user/line-accounts/{accountId}/slip-templates/{templateId}/usage

# 3. Safe delete (no confirmation needed if not in use)
DELETE /user/line-accounts/{accountId}/slip-templates/{templateId}/safe-delete

# 4. Safe delete (with confirmation if in use)
DELETE /user/line-accounts/{accountId}/slip-templates/{templateId}/safe-delete
Body: { "confirmationText": "DELETE" }
```

## Security Considerations

- ensureAccountAccess() verifies owner before any operation
- Admin endpoints require ADMIN role
- Confirmation required for templates in use
- Audit logging when deleting in-use templates

## CLAUDE.md Compliance

- [x] Uses MongoDB + Mongoose only
- [x] No `any` types in new code
- [x] Proper error handling with exceptions
- [x] Thai language messages for user-facing errors
- [x] ObjectId validation before database queries

## Created At
2026-01-04

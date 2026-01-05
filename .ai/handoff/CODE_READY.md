# CODE_READY.md

## Task Completed
**Task:** Update SlipPreview to use real bank logos from API (like Admin page)

## Summary

Updated the SlipPreview component in both Line Accounts and Templates pages to fetch and display real bank logos from the API, matching the Admin page design.

## Changes Made

### File Modified: `frontend/src/app/user/line-accounts/page.tsx`

#### 1. Updated Imports
- Added `banksApi` from `@/lib/api`
- Added `Bank` type from `@/types`

#### 2. Updated SlipPreview Component
- Added `senderBank` and `receiverBank` props
- Uses `bank.logoBase64` or `bank.logoUrl` for real logos
- Falls back to emoji icons when no logo available

#### 3. Added Banks State and Fetch
```typescript
const [banks, setBanks] = useState<Bank[]>([]);

const fetchBanks = async () => {
  const response = await banksApi.getAll();
  setBanks(response.data.banks || []);
};
```

#### 4. Updated Sample Data
```typescript
const SAMPLE_DATA = {
  sender: {
    name: 'นาย ธันเดอร์ มานะ',
    bankId: '004', // KBANK
  },
  receiver: {
    name: 'นาย ธันเดอร์ มานะ',
    bankId: '014', // SCB
  },
};
```

### File Modified: `frontend/src/app/user/templates/page.tsx`

Same changes applied:
- Added `banksApi` and `Bank` imports
- Updated SlipPreview to accept bank props
- Added banks state with useMemo for senderBank/receiverBank
- Updated sample data with bankId references

## Visual Changes

| Before | After |
|--------|-------|
| Colored initials (K, S) | Real bank logos from API |
| Hardcoded colors | Dynamic from bank data |
| Static names | Configurable from Admin |

## Requirements Verification

| Requirement | Status |
|-------------|--------|
| Bank logos from API | COMPLETE |
| Same as Admin page | COMPLETE |
| TypeScript strict mode | VERIFIED |
| No hardcoded URLs | VERIFIED |

## TypeScript Check
- Frontend: PASSED (no errors)
- Backend: PASSED (no errors)

---
**Created:** 2026-01-05
**Developer Session:** Claude Code (Opus 4.5)
**Task Type:** Feature Enhancement

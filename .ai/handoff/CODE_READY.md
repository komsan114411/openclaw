# CODE_READY.md

## Task Completed
**Task:** Add Template Selection with Real-time Preview to Line Accounts Page

## Summary

Added a real-time slip preview feature to the Line Account add/edit modal, allowing users to see how their selected template will look before saving.

## Changes Made

### File Modified: `frontend/src/app/user/line-accounts/page.tsx`

#### 1. Added SlipPreview Component
New Admin-style SlipPreview component with:
- **Phone frame design** with dark background
- **Decorative glow effect** matching template theme color
- **Status header** with dynamic icon and color
- **Amount section** with date/time
- **Sender/Receiver info** with bank logo simulation
- **Transaction details** (reference, fee)

#### 2. Added Supporting Types and Data
```typescript
interface SlipTemplateForPreview {
  _id: string;
  name: string;
  type: 'success' | 'duplicate' | 'error' | 'not_found';
  primaryColor?: string;
  headerText?: string;
  footerText?: string;
  showAmount: boolean;
  // ... other display options
}

const SAMPLE_DATA = {
  amount: '1,500.00',
  sender: { name: 'นาย สมชาย ใจดี', bankShort: 'KBANK', bankColor: '#138f2d' },
  receiver: { name: 'นางสาว สมหญิง รักดี', bankShort: 'SCB', bankColor: '#4e2a82' },
  // ...
};

const DEFAULT_PREVIEW_TEMPLATE: SlipTemplateForPreview = {
  // Default template shown when no template selected
};
```

#### 3. 2-Column Modal Layout
- **Left Column (3/5):** Form inputs (Account Name, Channel ID/Secret, Access Token, Template Dropdown, Description)
- **Right Column (2/5):** Real-time SlipPreview component
- Responsive: Single column on mobile, 2-column on desktop (lg breakpoint)

#### 4. Dynamic Preview Features
- Shows default preview when no template selected with message "กรุณาเลือกรูปแบบสลิปเพื่อดูตัวอย่าง"
- Updates preview in real-time when template is selected from dropdown
- Shows selected template info badge below preview
- Preview color changes based on template type (success=green, duplicate=amber, error=red, not_found=gray)

## Requirements Verification

| Requirement | Status |
|-------------|--------|
| Dynamic Data Fetching (API) | COMPLETE - Uses `fetchTemplates()` API |
| Real-time Preview | COMPLETE - Updates on dropdown change |
| Form Integration (templateId) | COMPLETE - Sends with form submission |
| 2-Column Layout | COMPLETE - lg:grid-cols-5 (3+2) |
| Theme Color Support | COMPLETE - Dynamic based on type |
| TypeScript Strict Mode | VERIFIED - No errors |

## Visual Layout

```
+----------------------------------+
|  Modal Title                      |
+----------------------------------+
|                    |             |
|   [Form]           | [Preview]   |
|                    |             |
|   - Account Name   | +--------+  |
|   - Channel ID     | | Slip   |  |
|   - Access Token   | | Preview|  |
|   - Template       | |        |  |
|   - Description    | +--------+  |
|                    |             |
|   [Cancel] [Save]  | Selected:   |
|                    | Template X  |
+----------------------------------+
```

## TypeScript Check
- Frontend: PASSED (no errors)
- Backend: PASSED (no errors)

---
**Created:** 2026-01-05
**Developer Session:** Claude Code (Opus 4.5)
**Task Type:** Feature Implementation

# CODE_READY.md

## Task Completed
**Task:** Fix Chat Messages Real-time Display

## Problem
หน้าแชทไม่แสดงข้อความเมื่อผู้ใช้ทักมาและตอบกลับ

## Root Cause
1. **WebSocket event name mismatch:**
   - Service ใช้ `'new_message'` และ `'message_sent'`
   - Frontend ฟัง `'message_received'`
   
2. **Data structure mismatch:**
   - Service ส่งข้อมูลแบบ nested (`message: { _id, direction, ... }`)
   - Frontend คาดหวังข้อมูลแบบ flat (`{ _id, direction, ... }`)

## Changes Made

### File: `backend/src/chat-messages/chat-messages.service.ts`

#### 1. Fixed incoming message event (saveIncomingMessage)
**Before:**
```typescript
broadcastToRoom(`chat:${...}`, 'new_message', {
  lineAccountId,
  lineUserId,
  message: { _id, direction, messageType, ... }
});
```

**After:**
```typescript
broadcastToRoom(`chat:${...}`, 'message_received', {
  _id: message._id.toString(),
  lineAccountId,
  lineUserId,
  direction: 'in',
  messageType,
  messageText,
  messageId,
  createdAt,
});
```

#### 2. Fixed outgoing message event (saveOutgoingMessage)
**Before:**
```typescript
broadcastToRoom(`chat:${...}`, 'message_sent', {
  lineAccountId,
  lineUserId,
  message: { _id, direction, messageType, ... }
});
```

**After:**
```typescript
broadcastToRoom(`chat:${...}`, 'message_received', {
  _id: message._id.toString(),
  lineAccountId,
  lineUserId,
  direction: 'out',
  messageType,
  messageText,
  sentBy,
  createdAt,
});
```

## How It Works Now

```
LINE User sends message
    ↓
Webhook Controller saves & emits 'message_received' (flat data) ✅
    ↓
ChatMessagesService saves & emits 'message_received' (flat data) ✅
    ↓
Frontend receives via socket.on('message_received') ✅
    ↓
Messages display in real-time ✅
```

## TypeScript Check
- Backend: `npx tsc --noEmit` - PASSED

## Files Modified
1. `backend/src/chat-messages/chat-messages.service.ts`

---
**Created:** 2026-01-07
**Developer Session:** Claude Code (Opus 4.5)
**Task Type:** Bug Fix - Real-time Chat

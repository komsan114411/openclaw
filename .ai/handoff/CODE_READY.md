# CODE_READY.md

## Task Completed
**Task:** Webhook Rate Limiter for DDoS Protection
**Date:** 2026-01-08

## Problem Solved

Previously, the webhook endpoint had no rate limiting:
- Open to unlimited requests from any source
- Vulnerable to DDoS attacks
- Could exhaust server and database resources
- No per-account or global throttling

## Solution Implemented

Created **WebhookRateLimitGuard** with configurable two-tier rate limiting.

### Architecture

```
Request → WebhookRateLimitGuard → Webhook Handler
              ↓
         ┌────────────────────┐
         │ Check Per-Account  │ (per LINE Account ID)
         │ - Per second limit │
         │ - Per minute limit │
         └────────┬───────────┘
                  ↓
         ┌────────────────────┐
         │ Check Global       │ (all requests)
         │ - Per second limit │
         │ - Per minute limit │
         └────────┬───────────┘
                  ↓
         Pass → Forward to handler
         Fail → Return HTTP 429
```

### Configuration (Admin Panel)

All limits configurable from database (no redeploy needed):

| Setting | Default | Description |
|---------|---------|-------------|
| `webhookRateLimitEnabled` | true | Enable/disable rate limiting |
| `webhookRateLimitPerAccountPerSecond` | 10 | Max requests per LINE account per second |
| `webhookRateLimitPerAccountPerMinute` | 100 | Max requests per LINE account per minute |
| `webhookRateLimitGlobalPerSecond` | 100 | Max total requests per second |
| `webhookRateLimitGlobalPerMinute` | 1000 | Max total requests per minute |
| `webhookRateLimitMessage` | "Too many requests..." | Custom error message |

### Files Created/Modified

| File | Changes |
|------|---------|
| `common/guards/webhook-rate-limit.guard.ts` | **NEW** - Rate limit guard implementation |
| `database/schemas/system-settings.schema.ts` | Added rate limit config fields |
| `line-accounts/line-webhook.controller.ts` | Applied `@UseGuards(WebhookRateLimitGuard)` |
| `line-accounts/line-accounts.module.ts` | Added guard provider, SystemSettingsModule import |

### Key Features

1. **Two-Tier Limiting**
   - Per LINE Account (prevents single account abuse)
   - Global (prevents distributed attacks)

2. **Sliding Window** via Redis/memory
   - Per-second and per-minute windows
   - Uses existing `RedisService.rateLimit()`

3. **Admin Configurable**
   - Settings stored in MongoDB
   - Cached for 1 minute to reduce DB load
   - No redeploy needed to change limits

4. **Proper Response**
   - HTTP 429 (Too Many Requests)
   - Includes limit type and account ID
   - Does NOT trigger business logic when blocked

### TASK.md Requirements

| Requirement | Status |
|-------------|--------|
| Rate limit ต่อ LINE Account | IMPLEMENTED |
| Rate limit ทั้งระบบ (Global) | IMPLEMENTED |
| Return HTTP 429 เมื่อเกิน | IMPLEMENTED |
| ห้าม trigger business logic เมื่อ block | IMPLEMENTED |
| Config จาก Admin Panel | IMPLEMENTED |
| รองรับ concurrent requests | IMPLEMENTED (Redis/memory fallback) |

## TypeScript Check
- Backend: `npx tsc --noEmit` - **PASSED**

---
**Created:** 2026-01-08
**Developer Session:** Claude Code (Opus 4.5)
**Status:** READY FOR TESTING

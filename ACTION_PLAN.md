# 🎯 แผนงานการแก้ไขระบบ LINE OA Management

> **สร้างเมื่อ**: 5 กุมภาพันธ์ 2569  
> **ระยะเวลาโดยประมาณ**: 5 สัปดาห์  
> **ทีมที่ต้องการ**: Backend 2 คน, DevOps 1 คน

---

## 📅 สรุป Timeline

```
Week 1    Week 2    Week 3    Week 4    Week 5
|=========|=========|=========|=========|=========|
[Phase 1 ][   Phase 2      ][Phase 3  ][Phase 4  ]
 Critical   High Priority    Medium     Low
```

---

## 📋 Phase 1: Critical Fixes (สัปดาห์ที่ 1)

### 🎯 เป้าหมาย: แก้ไขปัญหาที่กระทบการทำงานหลักของระบบ

### Day 1-2: Redis Connection & Monitoring

#### งานที่ 1.1: ตรวจสอบและแก้ไข Redis Connection
**ผู้รับผิดชอบ**: DevOps  
**ระยะเวลา**: 4 ชั่วโมง  
**Priority**: 🔴 Critical

**ขั้นตอน**:
1. ตรวจสอบ Redis connection string ใน `.env`
   ```bash
   REDIS_URL=redis://localhost:6379
   # หรือสำหรับ Railway
   REDIS_URL=${{Redis.REDIS_URL}}
   ```

2. ตรวจสอบ Redis status
   ```bash
   redis-cli ping
   # ควรได้ PONG
   ```

3. ตรวจสอบ logs
   ```bash
   docker-compose logs -f redis
   # หรือ
   systemctl status redis
   ```

**Checklist**:
- [ ] Redis service กำลังทำงาน
- [ ] Connection string ถูกต้อง
- [ ] Network ระหว่าง backend กับ Redis ปกติ
- [ ] ไม่มี firewall บล็อก

---

#### งานที่ 1.2: เพิ่ม Redis Connection Retry Logic
**ผู้รับผิดชอบ**: Backend  
**ระยะเวลา**: 4 ชั่วโมง  
**Priority**: 🔴 Critical

**ไฟล์ที่แก้ไข**: `backend/src/redis/redis.module.ts`

```typescript
// เพิ่ม retry logic
const redisClient = new Redis(redisUrl, {
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    console.log(`Redis retry attempt ${times}, delay ${delay}ms`);
    return delay;
  },
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  reconnectOnError: (err) => {
    console.error('Redis error:', err);
    return true;
  },
});
```

---

### Day 3-4: USDT Transaction Hash Unique Index

#### งานที่ 1.3: เพิ่ม Unique Index สำหรับ USDT Transaction Hash
**ผู้รับผิดชอบ**: Backend  
**ระยะเวลา**: 6 ชั่วโมง  
**Priority**: 🔴 Critical

**ไฟล์ที่แก้ไข**: `backend/src/database/schemas/payment.schema.ts`

```typescript
// เพิ่มที่บรรทัดหลัง index ที่มีอยู่
PaymentSchema.index(
  { transactionHash: 1 },
  {
    unique: true,
    partialFilterExpression: {
      transactionHash: { $exists: true, $ne: null },
      paymentType: 'usdt',
      status: { $in: [PaymentStatus.VERIFIED, PaymentStatus.PROCESSING] }
    },
    name: 'unique_usdt_transaction_hash'
  }
);
```

**Migration Script**:
```typescript
// scripts/migrate-usdt-index.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { getConnectionToken } from '@nestjs/mongoose';

async function migrate() {
  const app = await NestFactory.create(AppModule);
  const connection = app.get(getConnectionToken());
  
  // ตรวจสอบ duplicate ก่อน
  const duplicates = await connection.collection('payments').aggregate([
    {
      $match: {
        transactionHash: { $exists: true, $ne: null },
        paymentType: 'usdt'
      }
    },
    {
      $group: {
        _id: '$transactionHash',
        count: { $sum: 1 },
        docs: { $push: '$_id' }
      }
    },
    {
      $match: { count: { $gt: 1 } }
    }
  ]).toArray();
  
  if (duplicates.length > 0) {
    console.error('Found duplicates:', duplicates);
    throw new Error('Cannot create unique index - duplicates found');
  }
  
  // สร้าง index
  await connection.collection('payments').createIndex(
    { transactionHash: 1 },
    {
      unique: true,
      partialFilterExpression: {
        transactionHash: { $exists: true, $ne: null },
        paymentType: 'usdt',
        status: { $in: ['verified', 'processing'] }
      }
    }
  );
  
  console.log('Migration complete');
  await app.close();
}

migrate();
```

---

### Day 5-7: PIN Store & JWT Validation

#### งานที่ 1.4: เพิ่ม PIN Store Cleanup Mechanism
**ผู้รับผิดชอบ**: Backend  
**ระยะเวลา**: 6 ชั่วโมง  
**Priority**: 🔴 Critical

**ไฟล์ที่แก้ไข**: `backend/src/line-session/services/enhanced-automation.service.ts`

**โค้ดที่ต้องเพิ่ม**:
```typescript
export class EnhancedAutomationService implements OnModuleDestroy {
  private pinCleanupInterval: NodeJS.Timeout;

  constructor(...) {
    // ... existing code ...
    
    // 🔴 FIX: Start cleanup interval
    this.pinCleanupInterval = setInterval(() => {
      this.cleanupExpiredPins();
    }, 60000); // ทุก 1 นาที
  }

  private cleanupExpiredPins() {
    const now = Date.now();
    const expiryMs = this.PIN_EXPIRY_MINUTES * 60 * 1000;
    let cleaned = 0;
    
    for (const [key, value] of this.pinStore.entries()) {
      if (now - value.createdAt.getTime() > expiryMs) {
        this.pinStore.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      this.logger.log(`[PIN Cleanup] Cleaned up ${cleaned} expired PINs`);
    }
  }

  onModuleDestroy() {
    if (this.pinCleanupInterval) {
      clearInterval(this.pinCleanupInterval);
    }
  }
}
```

**Unit Test**:
```typescript
// enhanced-automation.service.spec.ts
it('should cleanup expired PINs', async () => {
  const service = module.get<EnhancedAutomationService>(EnhancedAutomationService);
  
  // Add expired PIN
  service['pinStore'].set('test-account', {
    pinCode: '1234',
    createdAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
    updatedAt: new Date(Date.now() - 10 * 60 * 1000),
  });
  
  // Trigger cleanup
  service['cleanupExpiredPins']();
  
  // Verify cleaned
  expect(service['pinStore'].has('test-account')).toBe(false);
});
```

---

#### งานที่ 1.5: เพิ่ม User Status Validation ใน JWT Strategy
**ผู้รับผิดชอบ**: Backend  
**ระยะเวลา**: 4 ชั่วโมง  
**Priority**: 🔴 Critical

**ไฟล์ที่แก้ไข**: `backend/src/auth/strategies/jwt.strategy.ts`

**โค้ดที่ต้องแก้ไข**:
```typescript
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {
    // ... existing code ...
  }

  async validate(payload: JwtPayload) {
    // 🔴 FIX: Validate user exists and is active
    const user = await this.userModel.findById(payload.sub);
    
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    
    if (!user.isActive) {
      throw new UnauthorizedException('User account is inactive');
    }
    
    if (user.isBlocked) {
      throw new UnauthorizedException('User account is blocked');
    }
    
    return {
      userId: payload.sub,
      username: payload.username,
      role: payload.role,
      forcePasswordChange: user.forcePasswordChange,
    };
  }
}
```

---

## 📋 Phase 2: High Priority Fixes (สัปดาห์ที่ 2-3)

### Week 2: Memory & Performance

#### งานที่ 2.1: ลด Memory Usage
**ระยะเวลา**: 3 วัน  
**Priority**: 🟠 High

**ไฟล์ที่แก้ไข**: `backend/src/redis/redis.service.ts`

```typescript
const MEMORY_CACHE_CONFIG = {
  MAX_CACHE_ENTRIES: 5000,        // ลดจาก 10000
  MAX_RATE_LIMIT_ENTRIES: 2500,   // ลดจาก 5000
  MAX_SLIDING_LOG_ENTRIES: 2500,  // ลดจาก 5000
  CLEANUP_INTERVAL_MS: 15000,     // เพิ่มความถี่จาก 30000
  STRICT_MODE_ON_REDIS_DOWN: true,
};
```

---

#### งานที่ 2.2: แก้ไข Keys Validation Logic
**ระยะเวลา**: 2 วัน  
**Priority**: 🟠 High

**ไฟล์ที่แก้ไข**: `backend/src/line-session/services/enhanced-automation.service.ts`

**รายละเอียด**: แยก error code 10005 (temporary error) จาก expired เพื่อไม่ให้ trigger relogin ซ้ำซ้อน

---

#### งานที่ 2.3: แก้ไข Worker Recovery Logic
**ระยะเวลา**: 2 วัน  
**Priority**: 🟠 High

**ไฟล์ที่แก้ไข**: `backend/src/line-session/services/worker-pool.service.ts`

**โค้ดที่ต้องเพิ่ม**:
```typescript
private async recoverWorker(lineAccountId: string, attempt: number) {
  // Exponential backoff
  const delay = Math.min(5000 * Math.pow(2, attempt), 60000);
  this.logger.log(`[Recovery] Waiting ${delay}ms before attempt ${attempt}`);
  await this.sleep(delay);
  
  // Recovery logic...
}
```

---

### Week 3: WebSocket & Rate Limiting

#### งานที่ 2.4: แก้ไข WebSocket Throttle
**ระยะเวลา**: 2 วัน  
**Priority**: 🟠 High

**ไฟล์ที่แก้ไข**: `backend/src/websocket/websocket.gateway.ts`

---

#### งานที่ 2.5: เพิ่ม Rate Limiting ใน Slip Verification
**ระยะเวลา**: 3 วัน  
**Priority**: 🟠 High

**ไฟล์ที่แก้ไข**: `backend/src/slip-verification/slip-verification.service.ts`

**โค้ดที่ต้องเพิ่ม**:
```typescript
async verifySlip(...) {
  // Rate limit check
  const rateLimitKey = `slip:verify:${userId}`;
  const allowed = await this.redisService.rateLimit(rateLimitKey, 5, 60); // 5 ครั้งต่อนาที
  
  if (!allowed) {
    return {
      status: 'error',
      message: 'กรุณารอสักครู่ก่อนตรวจสอบสลิปอีกครั้ง',
    };
  }
  
  // ... existing logic
}
```

---

#### งานที่ 2.6: ลด Orchestrator Broadcast Frequency
**ระยะเวลา**: 1 วัน  
**Priority**: 🟠 High

**ไฟล์ที่แก้ไข**: `backend/src/line-session/services/orchestrator.service.ts`

**โค้ดที่ต้องแก้ไข**:
```typescript
private async broadcastStatus() {
  // Only broadcast if there are connected clients
  if (!this.websocketGateway.hasConnectedClients()) {
    return;
  }
  // ... broadcast logic
}
```

---

## 📋 Phase 3: Medium Priority (สัปดาห์ที่ 4)

### งานที่ 3.1: แก้ไข Sliding Window LRU
**ระยะเวลา**: 2 วัน  
**Priority**: 🟡 Medium

**ไฟล์ที่แก้ไข**: `backend/src/redis/redis.service.ts`

**โค้ดที่ต้องแก้ไข**:
```typescript
// เพิ่ม lastAccessTime tracking
interface SlidingWindowLog {
  entries: number[];
  lastAccessTime: number;
}

private memorySlidingLogs: Map<string, SlidingWindowLog> = new Map();

private evictSlidingLogs() {
  const sorted = Array.from(this.memorySlidingLogs.entries())
    .sort((a, b) => a[1].lastAccessTime - b[1].lastAccessTime);
  // Evict oldest accessed first
}
```

---

### งานที่ 3.2: ปรับ Health Check Interval
**ระยะเวลา**: 1 วัน  
**Priority**: 🟡 Medium

**ไฟล์ที่แก้ไข**: `backend/src/tasks/tasks.service.ts`

```typescript
@Cron(CronExpression.EVERY_30_MINUTES)  // ปรับจาก EVERY_5_MINUTES
async handleHealthCheck() {
  // ...
}
```

---

### งานที่ 3.3: เพิ่ม Transaction Rollback ที่ขาดหาย
**ระยะเวลา**: 2 วัน  
**Priority**: 🟡 Medium

**ไฟล์ที่แก้ไข**: `backend/src/payments/payments.service.ts`, `wallet.service.ts`

---

## 📋 Phase 4: Low Priority (สัปดาห์ที่ 5)

### งานที่ 4.1: แก้ไข Throttle Logic
**ระยะเวลา**: 1 วัน  
**Priority**: 🟢 Low

---

### งานที่ 4.2: เพิ่ม Monitoring Alerts
**ระยะเวลา**: 3 วัน  
**Priority**: 🟢 Low

**รายละเอียด**:
- Alert เมื่อ Redis down > 5 นาที
- Alert เมื่อ Memory > 80%
- Alert เมื่อ Worker recovery ซ้ำซ้อน
- Alert เมื่อ PIN timeout เกิน 50%

**โค้ดที่ต้องเพิ่ม**:
```typescript
// monitoring.service.ts
@Injectable()
export class MonitoringService {
  async checkSystemHealth() {
    const redisStatus = this.redisService.getStatus();
    const memoryUsage = process.memoryUsage();
    
    if (redisStatus.downSince && Date.now() - redisStatus.downSince > 300000) {
      await this.sendAlert('Redis down for > 5 minutes');
    }
    
    if (memoryUsage.heapUsed / memoryUsage.heapTotal > 0.8) {
      await this.sendAlert('Memory usage > 80%');
    }
  }
}
```

---

## 📊 Checklist สรุป

### Phase 1 (Week 1)
- [ ] 1.1 Redis Connection แก้ไขแล้ว
- [ ] 1.2 Retry Logic เพิ่มแล้ว
- [ ] 1.3 USDT Unique Index สร้างแล้ว
- [ ] 1.4 PIN Cleanup เพิ่มแล้ว
- [ ] 1.5 JWT Validation แก้ไขแล้ว

### Phase 2 (Week 2-3)
- [ ] 2.1 Memory Limits ปรับแล้ว
- [ ] 2.2 Keys Validation แก้ไขแล้ว
- [ ] 2.3 Worker Recovery แก้ไขแล้ว
- [ ] 2.4 WebSocket Throttle แก้ไขแล้ว
- [ ] 2.5 Rate Limiting เพิ่มแล้ว
- [ ] 2.6 Orchestrator Broadcast ปรับแล้ว

### Phase 3 (Week 4)
- [ ] 3.1 Sliding Window LRU แก้ไขแล้ว
- [ ] 3.2 Health Check Interval ปรับแล้ว
- [ ] 3.3 Transaction Rollback เพิ่มแล้ว

### Phase 4 (Week 5)
- [ ] 4.1 Throttle Logic แก้ไขแล้ว
- [ ] 4.2 Monitoring Alerts เพิ่มแล้ว

---

## 🔄 Testing Plan

### Unit Tests
```bash
cd backend
npm test -- auth.service.spec.ts
npm test -- enhanced-automation.service.spec.ts
npm test -- redis.service.spec.ts
```

### Integration Tests
```bash
# Test Redis fallback
npm run test:integration -- redis-fallback

# Test WebSocket broadcast
npm run test:integration -- websocket

# Test payment flow
npm run test:integration -- payment-flow
```

### Load Tests
```bash
# Test rate limiting
artillery quick --count 100 --num 10 http://localhost:4000/api/liff/verify-slip

# Test concurrent logins
artillery quick --count 50 --num 5 http://localhost:4000/api/admin/line-session/login
```

---

## 📈 Success Metrics

| Metric | Before | Target After |
|--------|--------|--------------|
| Redis Downtime | 8+ ชั่วโมง | < 1 นาที |
| Memory Usage | 89-91% | < 70% |
| WebSocket Broadcast Success | ~70% | > 95% |
| PIN Store Memory Leak | ไม่มี cleanup | Cleanup ทุกนาที |
| Duplicate USDT Detection | ไม่มี | 100% block |
| Worker Recovery Loop | ไม่มี backoff | Exponential backoff |

---

## 🚨 Rollback Plan

หากเกิดปัญหาหลัง deploy:

1. **Immediate Rollback** (< 5 นาที)
   ```bash
   # Revert to previous version
   git revert HEAD
   docker-compose up -d --build
   ```

2. **Database Migration Rollback**
   ```bash
   # Remove USDT index if causing issues
   mongo "db.payments.dropIndex('unique_usdt_transaction_hash')"
   ```

3. **Feature Flags**
   ```bash
   # Disable new features
   export ENABLE_JWT_VALIDATION=false
   export ENABLE_PIN_CLEANUP=false
   ```

---

*แผนงานนี้สร้างโดย AI System Analyzer*  
*อัปเดตล่าสุด: 5 กุมภาพันธ์ 2569*

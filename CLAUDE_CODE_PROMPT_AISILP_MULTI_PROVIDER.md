# AISILP: Multi-Provider Slip Verification System

## ภารกิจ

พัฒนาระบบ Multi-Provider สำหรับตรวจสอบสลิปโอนเงิน โดยเพิ่ม **SlipMate API** เป็น Provider สำรอง พร้อมระบบ **Auto-Failover** เมื่อ Thunder API ล้มเหลว

---

## ขั้นตอนที่ 1: วิเคราะห์โปรเจกต์

สำรวจโครงสร้างโปรเจกต์เพื่อค้นหา:

```bash
# หาไฟล์ที่เกี่ยวข้องกับ slip verification
find . -type f -name "*.ts" | xargs grep -l -i "thunder\|slip\|verify" 2>/dev/null

# ดูโครงสร้าง backend
ls -la backend/src/

# หา system settings schema
cat backend/src/database/schemas/system-settings.schema.ts

# หา payment หรือ slip service
find backend/src -name "*.service.ts" | head -20
```

**สิ่งที่ต้องระบุ:**
- ไฟล์ที่มี Thunder API integration อยู่ตรงไหน
- Response format ที่ใช้ส่งกลับ webhook/frontend
- Environment variables ที่เกี่ยวข้อง

---

## ขั้นตอนที่ 2: ศึกษา SlipMate API

**Base URL:** `https://api.slipmate.ai/open-api`

**Endpoints ที่มี:**
| Endpoint | วิธีการ |
|----------|--------|
| `/v1/verify` | verify by QR Data |
| `/v1/verify/base64` | verify by Base64 Image |
| `/v1/verify/file` | verify by Upload File ⭐ |
| `/v1/verify/url` | verify by Image URL |
| `/v1/verify/ref` | verify by Transaction Reference |

**Authentication:**
```
Header: X-API-KEY: {your_api_key}
```

**สำหรับ Upload File (แนะนำ):**
```
POST https://api.slipmate.ai/open-api/v1/verify/file
Content-Type: multipart/form-data
X-API-KEY: {api_key}

Body: file = <image_buffer>
```

**Response Schema (SlipData):**
```typescript
interface SlipData {
  transRef: string;
  date: string;
  countryCode: string;
  amount: {
    amount: number;
    local?: { amount: number; currency: string; };
  };
  sender: {
    bank: { id: string; name: string; short: string; };
    account: {
      name: { th?: string; en?: string; };
      bank?: { type: string; account: string; };
      proxy?: { type: string; account: string; };
    };
  };
  receiver: {
    bank: { id: string; name: string; short: string; };
    account: {
      name: { th?: string; en?: string; };
      bank?: { type: string; account: string; };
      proxy?: { type: string; account: string; };
    };
  };
}
```

**Error Cases:**
| HTTP Status | ความหมาย | Action |
|-------------|----------|--------|
| 200 + status: 200 | สำเร็จ | Return success |
| 200 + status: 400 + "duplicate_slip" | สลิปซ้ำ | Return duplicate |
| 401 | API Key ผิด | Failover |
| 403 | เครดิตหมด | Failover |
| 5xx | Server error | Failover |

---

## ขั้นตอนที่ 3: เปรียบเทียบกับ Thunder API

| คุณสมบัติ | Thunder API | SlipMate API |
|-----------|-------------|--------------|
| Base URL | `https://api.thunder.in.th` | `https://api.slipmate.ai/open-api` |
| Endpoint | `/v1/verify` | `/v1/verify/file` |
| Auth | `Authorization: Bearer {token}` | `X-API-KEY: {token}` |
| Success | `{ status: 200, data: {...} }` | `{ status: 200, data: {...} }` |
| Duplicate | `{ status: 400, message: "duplicate_slip" }` | `{ status: 400, message: "duplicate_slip" }` |
| No Credits | HTTP 402 | HTTP 403 |

---

## ขั้นตอนที่ 4: สร้างโครงสร้างไฟล์

```
backend/src/slip-verification/
├── strategy/
│   ├── slip-verification.strategy.ts   # Interface + Types
│   ├── thunder.strategy.ts             # Thunder implementation
│   └── slipmate.strategy.ts            # SlipMate implementation
├── slip-verification.manager.ts        # Failover logic
└── slip-verification.module.ts         # Module registration
```

---

## ขั้นตอนที่ 5: Implementation

### 5.1 Interface และ Types

```typescript
// slip-verification.strategy.ts
export enum SlipProvider {
  THUNDER = 'thunder',
  SLIPMATE = 'slipmate',
}

export interface NormalizedVerificationResult {
  status: 'success' | 'duplicate' | 'not_found' | 'failed';
  provider: SlipProvider;
  message: string;
  data?: {
    transRef: string;
    amount: number;
    senderBank?: string;
    senderName?: string;
    senderAccount?: string;
    receiverBank?: string;
    receiverName?: string;
    receiverAccount?: string;
    transferDate?: string;
  };
  rawResponse?: any;
  error?: any;
}

export interface SlipVerificationStrategy {
  readonly providerName: SlipProvider;
  verify(imageData: Buffer): Promise<NormalizedVerificationResult>;
}

export class ProviderUnavailableError extends Error {
  constructor(
    public readonly provider: SlipProvider,
    public readonly reason: string,
    public readonly originalError?: any
  ) {
    super(`Provider ${provider} unavailable: ${reason}`);
  }
}
```

### 5.2 SlipMate Strategy

```typescript
// slipmate.strategy.ts
@Injectable()
export class SlipMateStrategy implements SlipVerificationStrategy {
  readonly providerName = SlipProvider.SLIPMATE;
  private readonly logger = new Logger(SlipMateStrategy.name);
  private readonly BASE_URL = 'https://api.slipmate.ai/open-api';

  constructor(private readonly configService: ConfigService) {}

  async verify(imageData: Buffer): Promise<NormalizedVerificationResult> {
    const apiKey = this.configService.get<string>('SLIPMATE_API_KEY');
    
    if (!apiKey) {
      throw new ProviderUnavailableError(SlipProvider.SLIPMATE, 'API key not configured');
    }

    const formData = new FormData();
    formData.append('file', imageData, { filename: 'slip.jpg', contentType: 'image/jpeg' });

    try {
      const response = await axios.post(
        `${this.BASE_URL}/v1/verify/file`,
        formData,
        {
          headers: { 'X-API-KEY': apiKey, ...formData.getHeaders() },
          timeout: 30000,
        }
      );
      
      return this.normalizeResponse(response.data);
    } catch (error) {
      return this.handleError(error);
    }
  }

  private normalizeResponse(data: any): NormalizedVerificationResult {
    if (data.status === 200 && data.data) {
      const slip = data.data;
      return {
        status: 'success',
        provider: SlipProvider.SLIPMATE,
        message: 'ตรวจสอบสลิปสำเร็จ',
        data: {
          transRef: slip.transRef,
          amount: slip.amount?.amount,
          senderBank: slip.sender?.bank?.name,
          senderName: slip.sender?.account?.name?.th,
          senderAccount: slip.sender?.account?.bank?.account,
          receiverBank: slip.receiver?.bank?.name,
          receiverName: slip.receiver?.account?.name?.th,
          receiverAccount: slip.receiver?.account?.bank?.account,
          transferDate: slip.date,
        },
        rawResponse: data,
      };
    }

    if (data.status === 400 && data.message === 'duplicate_slip') {
      return {
        status: 'duplicate',
        provider: SlipProvider.SLIPMATE,
        message: 'สลิปนี้เคยถูกใช้แล้ว',
        rawResponse: data,
      };
    }

    return {
      status: 'not_found',
      provider: SlipProvider.SLIPMATE,
      message: data.message || 'ไม่พบข้อมูลสลิป',
      rawResponse: data,
    };
  }

  private handleError(error: any): NormalizedVerificationResult {
    const status = error.response?.status;
    
    // Errors that should trigger failover
    if (status === 401 || status === 403 || !error.response || status >= 500) {
      throw new ProviderUnavailableError(
        SlipProvider.SLIPMATE,
        status === 401 ? 'Invalid API key' :
        status === 403 ? 'Insufficient credits' : 'Server unavailable',
        error
      );
    }

    // Non-failover errors
    return {
      status: 'failed',
      provider: SlipProvider.SLIPMATE,
      message: error.response?.data?.message || 'เกิดข้อผิดพลาด',
      error,
    };
  }
}
```

### 5.3 Failover Manager

```typescript
// slip-verification.manager.ts
@Injectable()
export class SlipVerificationManager {
  private readonly logger = new Logger(SlipVerificationManager.name);
  private readonly strategies: Map<SlipProvider, SlipVerificationStrategy>;

  constructor(
    private readonly systemSettingsService: SystemSettingsService,
    private readonly thunderStrategy: ThunderStrategy,
    private readonly slipMateStrategy: SlipMateStrategy,
  ) {
    this.strategies = new Map([
      [SlipProvider.THUNDER, this.thunderStrategy],
      [SlipProvider.SLIPMATE, this.slipMateStrategy],
    ]);
  }

  async verifySlip(imageData: Buffer): Promise<NormalizedVerificationResult> {
    const settings = await this.systemSettingsService.getSettings();
    const failoverOrder = settings.slipProviderFailoverOrder || [SlipProvider.THUNDER];

    for (const provider of failoverOrder) {
      const strategy = this.strategies.get(provider);
      if (!strategy) continue;

      this.logger.log(`Trying provider: ${provider}`);

      try {
        const result = await strategy.verify(imageData);
        
        if (['success', 'duplicate', 'not_found'].includes(result.status)) {
          return result;
        }
        
        return result; // 'failed' but not unavailable - don't failover
      } catch (error) {
        if (error instanceof ProviderUnavailableError) {
          this.logger.warn(`${provider} unavailable: ${error.reason}, trying next...`);
          continue;
        }
        throw error;
      }
    }

    return {
      status: 'failed',
      provider: failoverOrder[failoverOrder.length - 1],
      message: 'ไม่สามารถตรวจสอบสลิปได้',
    };
  }
}
```

---

## ขั้นตอนที่ 6: อัปเดต Schema

เพิ่มใน `system-settings.schema.ts`:

```typescript
@Prop({ type: String, enum: SlipProvider, default: SlipProvider.THUNDER })
primarySlipProvider: SlipProvider;

@Prop({ type: [String], default: ['thunder', 'slipmate'] })
slipProviderFailoverOrder: string[];

@Prop({ type: String })
slipApiKeySlipMate?: string;

@Prop({ type: Boolean, default: true })
slipAutoFailoverEnabled: boolean;
```

---

## ขั้นตอนที่ 7: Environment Variables

เพิ่มใน `.env`:
```
SLIPMATE_API_KEY=your_api_key_here
```

---

## ขั้นตอนที่ 8: Integration

หา service ที่เรียกใช้ Thunder API โดยตรง แล้วเปลี่ยนให้เรียก `SlipVerificationManager.verifySlip()` แทน

---

## Testing Checklist

- [ ] TypeScript compile: `cd backend && npx tsc --noEmit`
- [ ] Thunder success → return success
- [ ] Thunder duplicate → return duplicate (no failover)
- [ ] Thunder 402 → failover to SlipMate
- [ ] SlipMate success
- [ ] Both fail → return error

---

## กฎ AISILP (ต้องปฏิบัติตาม)

1. **API Paths:** ต้องเป็น `/api/...` เสมอ
2. **MongoDB:** ใช้ Mongoose เท่านั้น, validate ObjectId ก่อน query
3. **TypeScript:** ห้ามใช้ `any`, ต้อง define type ทุกที่
4. **Auth:** ใช้ `@UseGuards(SessionAuthGuard)` สำหรับ protected routes

---

## เริ่มต้น

1. วิเคราะห์โปรเจกต์ตามขั้นตอนที่ 1
2. ระบุไฟล์ที่ต้องแก้ไข
3. ดำเนินการตามขั้นตอนที่ 4-8
4. ทดสอบตาม Checklist

**ปรับแผนตามโครงสร้างจริงของโปรเจกต์**

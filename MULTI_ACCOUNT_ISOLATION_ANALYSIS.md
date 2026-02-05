# การวิเคราะห์ปัญหาหลายบัญชี LINE ไม่แยกกัน

## สถานการณ์ปัญหา

เมื่อผู้ใช้มีหลายบัญชี LINE:
- บัญชี A: ใส่ PIN ผิด → ล้มเหลว
- บัญชี B: ใส่ PIN ถูก → ดึง Keys สำเร็จ
- **ปัญหา**: ระบบบอกว่าต้อง login ใหม่ทั้งคู่

## สาเหตุของปัญหา

### 1. Frontend ใช้ Single State

```typescript
// frontend/src/app/user/line-session/page.tsx
const [loginStatus, setLoginStatus] = useState<LoginStatus | null>(null);
const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null);
```

**ปัญหา**: State เดียวใช้สำหรับทุกบัญชี เมื่อเปลี่ยนบัญชี state ถูก clear

### 2. State ถูก Clear เมื่อเปลี่ยนบัญชี

```typescript
// frontend/src/app/user/line-session/page.tsx:225-232
useEffect(() => {
  if (selectedSession) {
    fetchSessionStatus(selectedSession._id);
    setLoginStatus(null);  // ← Clear login status เมื่อเปลี่ยนบัญชี
    setLoginSuccess({ show: false });
  }
}, [selectedSession, fetchSessionStatus]);
```

**ปัญหา**: เมื่อเปลี่ยนจากบัญชี A ไป B แล้วกลับมา A, status ของ A หายไป

### 3. Backend Broadcast ไปทุกคน

```typescript
// backend/src/line-session/services/login-notification.service.ts:86-92
const criticalStatuses = [EnhancedLoginStatus.SUCCESS, EnhancedLoginStatus.PIN_DISPLAYED, EnhancedLoginStatus.FAILED];
if (criticalStatuses.includes(payload.status)) {
  this.websocketGateway.broadcastToAll('line-session:login-status', eventData);
}
```

**ปัญหา**: Event ของบัญชี A ถูกส่งไปทุกคน รวมถึงคนที่กำลังดูบัญชี B

### 4. WebSocket Subscribe เฉพาะบัญชีที่เลือก

```typescript
// frontend/src/app/user/line-session/page.tsx:124-126
useLoginNotifications({
  lineAccountId: selectedSession?._id,  // ← Subscribe เฉพาะบัญชีที่เลือก
  ...
});
```

**ปัญหา**: ถ้าเปลี่ยนบัญชี จะไม่ได้รับ event ของบัญชีเก่า

## แนวทางแก้ไข

### แนวทาง 1: Track Status แยกตามบัญชี (แนะนำ)

```typescript
// frontend/src/app/user/line-session/page.tsx

// แทนที่ single state
// const [loginStatus, setLoginStatus] = useState<LoginStatus | null>(null);

// ใช้ Map เก็บ status แยกตามบัญชี
const [loginStatusMap, setLoginStatusMap] = useState<Map<string, LoginStatus>>(new Map());
const [sessionStatusMap, setSessionStatusMap] = useState<Map<string, SessionStatus>>(new Map());

// Helper functions
const getLoginStatus = (accountId: string) => loginStatusMap.get(accountId) || null;
const setLoginStatusForAccount = (accountId: string, status: LoginStatus | null) => {
  setLoginStatusMap(prev => {
    const newMap = new Map(prev);
    if (status) {
      newMap.set(accountId, status);
    } else {
      newMap.delete(accountId);
    }
    return newMap;
  });
};

// ใช้ใน WebSocket callback
useLoginNotifications({
  lineAccountId: selectedSession?._id,
  onStatusChange: (event) => {
    // อัพเดท status สำหรับบัญชีที่ event มาจาก (ไม่ใช่บัญชีที่เลือก)
    setLoginStatusForAccount(event.lineAccountId, {
      success: event.status !== 'failed',
      status: event.status,
      pin: event.pinCode,
      message: event.message,
      stage: event.status,
      error: event.error,
    });
  },
});

// แสดง status ของบัญชีที่เลือก
const currentLoginStatus = selectedSession ? getLoginStatus(selectedSession._id) : null;
```

### แนวทาง 2: Subscribe หลายบัญชีพร้อมกัน

```typescript
// frontend/src/hooks/useLoginNotifications.ts

// แทนที่ single lineAccountId
interface UseLoginNotificationsOptions {
  lineAccountIds?: string[];  // ← รับหลาย account IDs
  ...
}

// Subscribe ทุกบัญชีของ user
useEffect(() => {
  if (socketRef.current?.connected && lineAccountIds?.length) {
    lineAccountIds.forEach(accountId => {
      socketRef.current.emit('subscribe', { channel: `line-account:${accountId}` });
    });
  }
}, [lineAccountIds]);
```

### แนวทาง 3: ลบ broadcastToAll (Backend)

```typescript
// backend/src/line-session/services/login-notification.service.ts

// ลบ broadcastToAll สำหรับ critical events
// เพราะทำให้ event ไปกระทบบัญชีอื่น

// แทนที่:
// this.websocketGateway.broadcastToAll('line-session:login-status', eventData);

// ใช้:
// ส่งเฉพาะไปยัง room ของบัญชีนั้น + admins
this.websocketGateway.broadcastToRoom(
  `line-account:${payload.lineAccountId}`,
  'line-session:login-status',
  eventData,
);
this.websocketGateway.broadcastToAdmins('line-session:login-status', eventData);
```

### แนวทาง 4: เพิ่ม Account Badge ในรายการ

```typescript
// frontend/src/app/user/line-session/page.tsx

// แสดง status badge ในรายการบัญชี
{lineSessions.map((session) => {
  const status = getLoginStatus(session._id);
  const sessionInfo = getSessionStatus(session._id);
  
  return (
    <div key={session._id} className="...">
      <span>{session.name}</span>
      
      {/* แสดง status badge */}
      {status?.status === 'pin_displayed' && (
        <Badge color="warning">รอ PIN</Badge>
      )}
      {status?.status === 'success' && (
        <Badge color="success">สำเร็จ</Badge>
      )}
      {status?.status === 'failed' && (
        <Badge color="error">ล้มเหลว</Badge>
      )}
      {sessionInfo?.hasKeys && (
        <Badge color="success">มี Keys</Badge>
      )}
    </div>
  );
})}
```

## สรุปการแก้ไขที่แนะนำ

| ลำดับ | การแก้ไข | ไฟล์ | ความสำคัญ |
|-------|---------|------|----------|
| 1 | Track status แยกตามบัญชี | `page.tsx` | สูง |
| 2 | ลบ broadcastToAll | `login-notification.service.ts` | สูง |
| 3 | Subscribe หลายบัญชี | `useLoginNotifications.ts` | ปานกลาง |
| 4 | เพิ่ม status badge | `page.tsx` | ปานกลาง |

## ตัวอย่าง Code แก้ไข

### 1. Frontend: Track Status แยกตามบัญชี

```typescript
// frontend/src/app/user/line-session/page.tsx

// เพิ่ม type สำหรับ Map
type LoginStatusMap = Map<string, LoginStatus>;
type SessionStatusMap = Map<string, SessionStatus>;

// แทนที่ single state
const [loginStatusMap, setLoginStatusMap] = useState<LoginStatusMap>(new Map());
const [sessionStatusMap, setSessionStatusMap] = useState<SessionStatusMap>(new Map());

// Helper functions
const updateLoginStatus = useCallback((accountId: string, status: LoginStatus | null) => {
  setLoginStatusMap(prev => {
    const newMap = new Map(prev);
    if (status) {
      newMap.set(accountId, status);
    } else {
      newMap.delete(accountId);
    }
    return newMap;
  });
}, []);

// ใน WebSocket callback
onStatusChange: (event) => {
  // อัพเดท status สำหรับบัญชีที่ event มาจาก
  updateLoginStatus(event.lineAccountId, {
    success: event.status !== 'failed',
    status: event.status,
    pin: event.pinCode,
    message: event.message,
    stage: event.status,
    error: event.error,
  });
  
  // แสดง toast เฉพาะบัญชีที่เลือก
  if (event.lineAccountId === selectedSession?._id) {
    if (event.pinCode) {
      toast.success(`PIN: ${event.pinCode}`, { duration: 60000, icon: '🔑' });
    }
    // ... other toasts
  }
},

// ใช้ status ของบัญชีที่เลือก
const currentLoginStatus = selectedSession 
  ? loginStatusMap.get(selectedSession._id) || null 
  : null;
```

### 2. Backend: ลบ broadcastToAll

```typescript
// backend/src/line-session/services/login-notification.service.ts

@OnEvent('enhanced-login.status')
handleEnhancedLoginStatus(payload: {...}) {
  // ... existing code ...

  // ส่งไปยัง room ของบัญชีนั้น
  this.websocketGateway.broadcastToRoom(
    `line-account:${payload.lineAccountId}`,
    'line-session:login-status',
    eventData,
  );

  // ส่งไปยัง admins
  this.websocketGateway.broadcastToAdmins('line-session:login-status', eventData);

  // ลบ broadcastToAll - ไม่ต้องส่งไปทุกคน
  // const criticalStatuses = [...];
  // if (criticalStatuses.includes(payload.status)) {
  //   this.websocketGateway.broadcastToAll('line-session:login-status', eventData);
  // }
}
```

## ผลลัพธ์ที่คาดหวัง

หลังแก้ไข:
- บัญชี A ล้มเหลว → แสดง "ล้มเหลว" เฉพาะบัญชี A
- บัญชี B สำเร็จ → แสดง "สำเร็จ" และ Keys เฉพาะบัญชี B
- เปลี่ยนไปดูบัญชี A → ยังแสดง "ล้มเหลว"
- เปลี่ยนไปดูบัญชี B → ยังแสดง "สำเร็จ" และ Keys

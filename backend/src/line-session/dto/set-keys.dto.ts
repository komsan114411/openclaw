import { IsString, IsOptional, IsBoolean } from 'class-validator';

/**
 * DTO สำหรับตั้งค่า keys แบบ manual
 * ใช้เมื่อ user ต้องการใส่ keys เอง (เช่น copy จาก browser devtools)
 */
export class SetKeysDto {
  @IsString()
  xLineAccess: string;

  @IsString()
  xHmac: string;

  @IsOptional()
  @IsString()
  userAgent?: string;

  @IsOptional()
  @IsString()
  lineVersion?: string;
}

/**
 * DTO สำหรับ parse cURL command
 */
export class ParseCurlDto {
  @IsString()
  curlCommand: string;
}

/**
 * DTO สำหรับ trigger login
 */
export class TriggerLoginDto {
  @IsString()
  email: string;

  @IsString()
  password: string;

  @IsOptional()
  @IsBoolean()
  forceRelogin?: boolean;
}

/**
 * DTO สำหรับ copy keys จาก account อื่น
 */
export class CopyKeysDto {
  @IsString()
  sourceLineAccountId: string;
}

import { IsString, IsNumber, IsOptional, IsArray, IsBoolean, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePackageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  priceUsdt?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  slipQuota?: number;

  @ApiPropertyOptional({ description: 'AI quota for chatbot responses' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  aiQuota?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  durationDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  features?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isFreeStarter?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @ApiPropertyOptional({
    description: 'จำนวนครั้งที่ซื้อได้ต่อผู้ใช้ (null หรือ 0 = ไม่จำกัด)'
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxPurchasesPerUser?: number;
}

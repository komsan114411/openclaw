import { IsString, IsNotEmpty, IsEnum, IsOptional, IsNumber, IsBoolean, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBankAccountDto {
  @ApiProperty({
    description: 'Bank type',
    enum: ['SCB', 'KBANK', 'GSB', 'BBL', 'KTB', 'TMB', 'BAY'],
    example: 'SCB',
  })
  @IsEnum(['SCB', 'KBANK', 'GSB', 'BBL', 'KTB', 'TMB', 'BAY'])
  @IsNotEmpty()
  bankType: string;

  @ApiProperty({
    description: 'Bank code (3-digit)',
    example: '014',
  })
  @IsString()
  @IsNotEmpty()
  bankCode: string;

  @ApiProperty({
    description: 'Bank account number',
    example: '1234567890',
  })
  @IsString()
  @IsNotEmpty()
  accountNumber: string;

  @ApiProperty({
    description: 'Account holder name',
    example: 'นายทดสอบ ระบบ',
  })
  @IsString()
  @IsNotEmpty()
  accountName: string;

  @ApiProperty({
    description: 'LINE account email for login',
    example: 'user@example.com',
  })
  @IsString()
  @IsNotEmpty()
  lineEmail: string;

  @ApiPropertyOptional({
    description: 'LINE account password (will be encrypted)',
  })
  @IsString()
  @IsOptional()
  linePassword?: string;

  @ApiPropertyOptional({
    description: 'Check interval in milliseconds (default: 300000 = 5 min)',
    default: 300000,
  })
  @IsNumber()
  @IsOptional()
  @Min(60000)
  @Max(3600000)
  checkInterval?: number;

  @ApiPropertyOptional({
    description: 'Enable monitoring immediately',
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  monitoringEnabled?: boolean;
}

import { IsString, IsOptional, IsNumber, IsBoolean, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateBankAccountDto {
  @ApiPropertyOptional({
    description: 'Account holder name',
    example: 'นายทดสอบ ระบบ',
  })
  @IsString()
  @IsOptional()
  accountName?: string;

  @ApiPropertyOptional({
    description: 'LINE account email for login',
    example: 'user@example.com',
  })
  @IsString()
  @IsOptional()
  lineEmail?: string;

  @ApiPropertyOptional({
    description: 'LINE account password (will be encrypted)',
  })
  @IsString()
  @IsOptional()
  linePassword?: string;

  @ApiPropertyOptional({
    description: 'Check interval in milliseconds',
  })
  @IsNumber()
  @IsOptional()
  @Min(60000)
  @Max(3600000)
  checkInterval?: number;

  @ApiPropertyOptional({
    description: 'Enable or disable monitoring',
  })
  @IsBoolean()
  @IsOptional()
  monitoringEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Chat MID for the bank LINE OA',
  })
  @IsString()
  @IsOptional()
  chatMid?: string;
}

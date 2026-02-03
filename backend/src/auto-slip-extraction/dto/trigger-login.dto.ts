import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TriggerAutoSlipLoginDto {
  @ApiPropertyOptional({
    description: 'LINE email (overrides stored email)',
  })
  @IsString()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({
    description: 'LINE password (overrides stored password)',
  })
  @IsString()
  @IsOptional()
  password?: string;

  @ApiPropertyOptional({
    description: 'Force browser login (skip key copying)',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  force?: boolean;
}

export class SetAutoSlipKeysDto {
  @ApiProperty({
    description: 'X-Line-Access token',
  })
  @IsString()
  xLineAccess: string;

  @ApiProperty({
    description: 'X-Hmac token',
  })
  @IsString()
  xHmac: string;

  @ApiPropertyOptional({
    description: 'User agent string',
  })
  @IsString()
  @IsOptional()
  userAgent?: string;

  @ApiPropertyOptional({
    description: 'LINE version',
  })
  @IsString()
  @IsOptional()
  lineVersion?: string;

  @ApiPropertyOptional({
    description: 'Chat MID',
  })
  @IsString()
  @IsOptional()
  chatMid?: string;
}

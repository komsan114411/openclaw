import { IsString, IsOptional, IsBoolean, IsMongoId } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateLineAccountDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accountName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  channelSecret?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accessToken?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: '507f1f77bcf86cd799439011', description: 'ID of slip template to use (null = system default)' })
  @IsOptional()
  @IsMongoId()
  slipTemplateId?: string;
}

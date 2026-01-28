import { IsString, IsOptional, IsBoolean, IsMongoId, IsObject, ValidateNested } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { SlipTemplateIdsDto } from './create-line-account.dto';

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

  @ApiPropertyOptional({ example: '507f1f77bcf86cd799439011', description: 'Legacy: ID of slip template to use (deprecated, use slipTemplateIds)' })
  @IsOptional()
  @IsMongoId()
  slipTemplateId?: string;

  @ApiPropertyOptional({ description: 'Template IDs per slip result type' })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => SlipTemplateIdsDto)
  slipTemplateIds?: SlipTemplateIdsDto;
}

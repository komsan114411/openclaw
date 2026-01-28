import { IsString, IsNotEmpty, IsOptional, IsMongoId, IsObject, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class SlipTemplateIdsDto {
  @ApiPropertyOptional({ description: 'Template ID for success slips' })
  @IsOptional()
  @IsMongoId()
  success?: string;

  @ApiPropertyOptional({ description: 'Template ID for duplicate slips' })
  @IsOptional()
  @IsMongoId()
  duplicate?: string;

  @ApiPropertyOptional({ description: 'Template ID for error slips' })
  @IsOptional()
  @IsMongoId()
  error?: string;

  @ApiPropertyOptional({ description: 'Template ID for not found slips' })
  @IsOptional()
  @IsMongoId()
  not_found?: string;
}

export class CreateLineAccountDto {
  @ApiProperty({ example: 'My LINE OA' })
  @IsString()
  @IsNotEmpty()
  accountName: string;

  @ApiProperty({ example: '1234567890' })
  @IsString()
  @IsNotEmpty()
  channelId: string;

  @ApiProperty({ example: 'channel-secret-xxx' })
  @IsString()
  @IsNotEmpty()
  channelSecret: string;

  @ApiProperty({ example: 'channel-access-token-xxx' })
  @IsString()
  @IsNotEmpty()
  accessToken: string;

  @ApiPropertyOptional({ example: 'My business LINE account' })
  @IsOptional()
  @IsString()
  description?: string;

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

import { IsString, IsOptional, IsBoolean, IsDateString, IsNumber, IsArray, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAnnouncementDto {
  @ApiProperty({ example: 'ประกาศสำคัญ' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ example: 'รายละเอียดประกาศ' })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageBase64?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  linkUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  linkText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowDismiss?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowDismissFor7Days?: boolean;

  @ApiPropertyOptional({ enum: ['banner', 'popup', 'slide'] })
  @IsOptional()
  @IsEnum(['banner', 'popup', 'slide'])
  displayType?: string;

  @ApiPropertyOptional({ enum: ['top', 'center', 'bottom'] })
  @IsOptional()
  @IsEnum(['top', 'center', 'bottom'])
  position?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  backgroundColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  textColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  targetPages?: string[];
}

export class UpdateAnnouncementDto extends CreateAnnouncementDto {}

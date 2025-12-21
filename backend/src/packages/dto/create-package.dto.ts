import { IsString, IsNotEmpty, IsNumber, IsOptional, IsArray, IsBoolean, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePackageDto {
  @ApiProperty({ example: 'Basic Package' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 299 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  priceUsdt?: number;

  @ApiProperty({ example: 100 })
  @IsNumber()
  @Min(0)
  slipQuota: number;

  @ApiProperty({ example: 30 })
  @IsNumber()
  @Min(1)
  durationDays: number;

  @ApiPropertyOptional({ example: 'Basic package for small businesses' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: ['100 slips per month', 'Email support'] })
  @IsOptional()
  @IsArray()
  features?: string[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isFreeStarter?: boolean;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

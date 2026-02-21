import { IsOptional, IsString, IsNumberString } from 'class-validator';

export class CustomerDepositsQueryDto {
  @IsOptional()
  @IsString()
  lineAccountId?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  limit?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

export class CustomerSlipHistoryQueryDto {
  @IsOptional()
  @IsString()
  lineAccountId?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}

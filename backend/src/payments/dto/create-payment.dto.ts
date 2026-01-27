import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum PaymentTypeDto {
  BANK_TRANSFER = 'bank_transfer',
  USDT = 'usdt',
}

export class CreatePaymentDto {
  @ApiProperty({ description: 'Package ID to purchase' })
  @IsString()
  @IsNotEmpty({ message: 'กรุณาระบุ packageId' })
  packageId: string;

  @ApiProperty({ enum: PaymentTypeDto, description: 'Payment method' })
  @IsEnum(PaymentTypeDto, { message: 'paymentType ต้องเป็น bank_transfer หรือ usdt' })
  @IsNotEmpty({ message: 'กรุณาระบุ paymentType' })
  paymentType: PaymentTypeDto;
}

export class SubmitSlipDto {
  @ApiProperty({ description: 'Package ID to purchase' })
  @IsString()
  @IsNotEmpty({ message: 'กรุณาระบุ packageId' })
  packageId: string;

  @ApiPropertyOptional({ description: 'Existing payment ID to update' })
  @IsOptional()
  @IsString()
  paymentId?: string;
}

export class SubmitUsdtDto {
  @ApiProperty({ description: 'Package ID to purchase' })
  @IsString()
  @IsNotEmpty({ message: 'กรุณาระบุ packageId' })
  packageId: string;

  @ApiProperty({ description: 'USDT transaction hash' })
  @IsString()
  @IsNotEmpty({ message: 'กรุณาระบุ transactionHash' })
  transactionHash: string;
}

export class RejectPaymentDto {
  @ApiPropertyOptional({ description: 'Rejection notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Req,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth.service';
import { UserRole } from '../database/schemas/user.schema';
import { PaymentStatus, PaymentType } from '../database/schemas/payment.schema';
import { CreatePaymentDto, SubmitSlipDto, SubmitUsdtDto, RejectPaymentDto, PaymentTypeDto } from './dto/create-payment.dto';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';

@ApiTags('Payments')
@ApiBearerAuth()
@Controller('payments')
@UseGuards(SessionAuthGuard)
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Post()
  @ApiOperation({ summary: 'Create payment record' })
  async createPayment(
    @CurrentUser() user: AuthUser,
    @Body() body: CreatePaymentDto,
  ) {
    const paymentType = body.paymentType === PaymentTypeDto.USDT ? PaymentType.USDT : PaymentType.BANK_TRANSFER;
    const payment = await this.paymentsService.createPayment(
      user.userId,
      body.packageId,
      paymentType,
    );

    return {
      success: true,
      message: 'สร้างรายการชำระเงินสำเร็จ',
      paymentId: payment._id.toString(),
    };
  }

  @Post('slip')
  @UseInterceptors(FileInterceptor('slip'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Submit slip payment' })
  async submitSlipPayment(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: SubmitSlipDto,
    @Req() req: any,
  ) {
    if (!file) {
      throw new BadRequestException('กรุณาอัปโหลดรูปสลิป');
    }

    // Enhanced file validation with magic byte checking
    const maxBytes = 5 * 1024 * 1024; // 5MB (reduced from 10MB for slip images)
    const size = file.size ?? file.buffer?.length ?? 0;

    // Basic MIME type check
    if (!file.mimetype?.startsWith('image/') || size <= 0 || size > maxBytes) {
      throw new BadRequestException('ไฟล์สลิปไม่ถูกต้อง (รองรับรูปภาพและต้องไม่เกิน 5MB)');
    }

    // Magic byte validation to prevent MIME type spoofing
    const buffer = file.buffer;
    if (!buffer || buffer.length < 4) {
      throw new BadRequestException('ไฟล์สลิปไม่ถูกต้อง');
    }

    // Check file signatures (magic bytes)
    const isJPEG = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
    const isPNG = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
    const isGIF = buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46;
    const isWEBP = buffer.length >= 12 &&
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;

    if (!isJPEG && !isPNG && !isGIF && !isWEBP) {
      throw new BadRequestException('รองรับเฉพาะไฟล์รูปภาพ JPEG, PNG, GIF, WEBP เท่านั้น');
    }

    // If paymentId is provided, update the existing payment (no new row)
    const payment = await this.paymentsService.upsertSlipPayment(
      user.userId,
      body.packageId,
      file.buffer,
      body.paymentId,
    );

    const result = await this.paymentsService.verifySlipPayment(
      payment._id.toString(),
      file.buffer,
    );

    return {
      success: result.success,
      message: result.message,
      paymentId: payment._id.toString(),
      verificationResult: result.verificationResult,
    };
  }

  @Post('usdt')
  @ApiOperation({ summary: 'Submit USDT payment' })
  async submitUsdtPayment(
    @CurrentUser() user: AuthUser,
    @Body() body: SubmitUsdtDto,
  ) {
    const payment = await this.paymentsService.createPayment(
      user.userId,
      body.packageId,
      PaymentType.USDT,
      undefined,
      body.transactionHash,
    );

    return {
      success: true,
      message: 'รับข้อมูลการชำระเงินแล้ว รอการตรวจสอบ',
      paymentId: payment._id.toString(),
    };
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all payments (Admin only)' })
  async findAll(@Query('status') status?: PaymentStatus) {
    const payments = await this.paymentsService.findAll(status);
    return {
      success: true,
      payments,
    };
  }

  @Get('my')
  @ApiOperation({ summary: 'Get my payments' })
  async getMyPayments(@CurrentUser() user: AuthUser) {
    const payments = await this.paymentsService.findByUser(user.userId);
    return {
      success: true,
      payments,
    };
  }

  @Get('check-eligibility/:packageId')
  @ApiOperation({ summary: 'Check if user can purchase a package' })
  async checkPurchaseEligibility(
    @Param('packageId', ParseObjectIdPipe) packageId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const result = await this.paymentsService.canUserPurchase(user.userId, packageId);
    return {
      success: true,
      ...result,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get payment by ID' })
  async findOne(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const payment = await this.paymentsService.findById(id);
    if (!payment) {
      throw new NotFoundException('ไม่พบรายการชำระเงิน');
    }

    // Check ownership for non-admin
    const paymentUserId = payment.userId?.toString();
    if (user.role !== UserRole.ADMIN && paymentUserId !== user.userId) {
      throw new NotFoundException('ไม่พบรายการชำระเงิน');
    }

    return {
      success: true,
      payment,
    };
  }

  @Post(':id/approve')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Approve payment (Admin only)' })
  async approve(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const payment = await this.paymentsService.findById(id);
    if (!payment) {
      throw new NotFoundException('ไม่พบรายการชำระเงิน');
    }

    const success = await this.paymentsService.approvePayment(id, user.userId);
    if (!success) {
      throw new BadRequestException('ไม่สามารถอนุมัติได้ (สถานะไม่ถูกต้อง)');
    }

    return {
      success: true,
      message: 'อนุมัติการชำระเงินสำเร็จ',
    };
  }

  @Post(':id/reject')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Reject payment (Admin only)' })
  async reject(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() body: RejectPaymentDto,
    @CurrentUser() user: AuthUser,
  ) {
    const payment = await this.paymentsService.findById(id);
    if (!payment) {
      throw new NotFoundException('ไม่พบรายการชำระเงิน');
    }

    const success = await this.paymentsService.rejectPayment(
      id,
      user.userId,
      body.notes,
    );

    if (!success) {
      throw new BadRequestException('ไม่สามารถปฏิเสธได้ (สถานะไม่ถูกต้อง)');
    }

    return {
      success: true,
      message: 'ปฏิเสธการชำระเงินแล้ว',
    };
  }
}

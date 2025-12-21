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
    @Body() body: { packageId: string; paymentType: string; amount: number },
  ) {
    const paymentType = body.paymentType === 'usdt' ? PaymentType.USDT : PaymentType.BANK_TRANSFER;
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
    @Body() body: { packageId: string },
  ) {
    if (!file) {
      return { success: false, message: 'กรุณาอัปโหลดรูปสลิป' };
    }

    const payment = await this.paymentsService.createPayment(
      user.userId,
      body.packageId,
      PaymentType.BANK_TRANSFER,
      file.buffer,
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
    @Body() body: { packageId: string; transactionHash: string },
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

  @Get(':id')
  @ApiOperation({ summary: 'Get payment by ID' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const payment = await this.paymentsService.findById(id);
    if (!payment) {
      return { success: false, message: 'Payment not found' };
    }

    // Check ownership for non-admin
    if (user.role !== UserRole.ADMIN && payment.userId !== user.userId) {
      return { success: false, message: 'Access denied' };
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
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const success = await this.paymentsService.approvePayment(id, user.userId);
    return {
      success,
      message: success ? 'อนุมัติการชำระเงินสำเร็จ' : 'ไม่สามารถอนุมัติได้',
    };
  }

  @Post(':id/reject')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Reject payment (Admin only)' })
  async reject(
    @Param('id') id: string,
    @Body() body: { notes?: string },
    @CurrentUser() user: AuthUser,
  ) {
    const success = await this.paymentsService.rejectPayment(
      id,
      user.userId,
      body.notes,
    );
    return {
      success,
      message: success ? 'ปฏิเสธการชำระเงินแล้ว' : 'ไม่สามารถปฏิเสธได้',
    };
  }
}

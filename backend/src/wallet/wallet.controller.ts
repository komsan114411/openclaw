import { Controller, Get, Post, Body, Query, Param, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../database/schemas/user.schema';
import { CreditTransactionDocument } from '../database/schemas/credit-transaction.schema';

@Controller('wallet')
export class WalletController {
    constructor(private readonly walletService: WalletService) { }

    // ===============================
    // USER ENDPOINTS
    // ===============================

    /**
     * Get my wallet balance
     */
    @Get('balance')
    @UseGuards(SessionAuthGuard)
    async getBalance(@Request() req: any) {
        return this.walletService.getBalance(req.user.userId);
    }

    /**
     * Get my transaction history
     */
    @Get('transactions')
    @UseGuards(SessionAuthGuard)
    async getTransactions(
        @Request() req: any,
        @Query('limit') limit?: string,
        @Query('offset') offset?: string,
    ) {
        const transactions = await this.walletService.getTransactions(
            req.user.userId,
            limit ? parseInt(limit, 10) : 20,
            offset ? parseInt(offset, 10) : 0,
        );

        // Don't send slip image data in response
        return transactions.map((tx: CreditTransactionDocument) => ({
            ...tx.toObject(),
            slipImageData: undefined,
            hasSlipImage: !!tx.slipImageData,
        }));
    }

    /**
     * Deposit credits via slip (User)
     */
    @Post('deposit')
    @UseGuards(SessionAuthGuard)
    @HttpCode(HttpStatus.OK)
    async deposit(
        @Request() req: any,
        @Body() body: { slipImage: string }, // Base64 encoded image
    ) {
        if (!body.slipImage) {
            return { success: false, message: 'กรุณาอัปโหลดรูปสลิป' };
        }

        // Decode base64 image
        const slipImageData = Buffer.from(body.slipImage, 'base64');

        return this.walletService.deposit(req.user.userId, slipImageData);
    }

    // ===============================
    // ADMIN ENDPOINTS
    // ===============================

    /**
     * Admin: Get all transactions (paginated)
     */
    @Get('admin/transactions')
    @UseGuards(SessionAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN)
    async getAllTransactions(
        @Query('limit') limit?: string,
        @Query('offset') offset?: string,
        @Query('type') type?: string,
        @Query('status') status?: string,
    ) {
        const transactions = await this.walletService.getAllTransactions(
            limit ? parseInt(limit, 10) : 50,
            offset ? parseInt(offset, 10) : 0,
            type,
            status,
        );

        return {
            success: true,
            transactions: transactions.map((tx: any) => ({
                ...tx,
                slipImageData: undefined,
                hasSlipImage: !!tx.slipImageData,
            })),
        };
    }

    /**
     * Admin: Get user's wallet balance
     */
    @Get('admin/user/:userId/balance')
    @UseGuards(SessionAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN)
    async getUserBalance(@Param('userId') userId: string) {
        const balance = await this.walletService.getBalance(userId);
        return { success: true, ...balance };
    }

    /**
     * Admin: Get user's transaction history
     */
    @Get('admin/user/:userId/transactions')
    @UseGuards(SessionAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN)
    async getUserTransactions(
        @Param('userId') userId: string,
        @Query('limit') limit?: string,
        @Query('offset') offset?: string,
    ) {
        const transactions = await this.walletService.getTransactions(
            userId,
            limit ? parseInt(limit, 10) : 50,
            offset ? parseInt(offset, 10) : 0,
        );

        return {
            success: true,
            transactions: transactions.map((tx: CreditTransactionDocument) => ({
                ...tx.toObject(),
                slipImageData: undefined,
                hasSlipImage: !!tx.slipImageData,
            })),
        };
    }

    /**
     * Admin: Add credits to user (bonus/adjustment)
     */
    @Post('admin/user/:userId/add-credits')
    @UseGuards(SessionAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN)
    @HttpCode(HttpStatus.OK)
    async addCredits(
        @Request() req: any,
        @Param('userId') userId: string,
        @Body() body: { amount: number; description: string },
    ) {
        if (!body.amount || body.amount <= 0) {
            return { success: false, message: 'จำนวนเครดิตต้องมากกว่า 0' };
        }

        if (!body.description) {
            return { success: false, message: 'กรุณาระบุเหตุผลในการเพิ่มเครดิต' };
        }

        const result = await this.walletService.addBonus(
            userId,
            body.amount,
            body.description,
            req.user.userId,
        );

        return {
            ...result,
            message: `เพิ่มเครดิต ฿${body.amount} สำเร็จ`,
        };
    }

    /**
     * Admin: Deduct credits from user (penalty/correction)
     */
    @Post('admin/user/:userId/deduct-credits')
    @UseGuards(SessionAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN)
    @HttpCode(HttpStatus.OK)
    async deductCredits(
        @Request() req: any,
        @Param('userId') userId: string,
        @Body() body: { amount: number; description: string },
    ) {
        if (!body.amount || body.amount <= 0) {
            return { success: false, message: 'จำนวนเครดิตต้องมากกว่า 0' };
        }

        if (!body.description) {
            return { success: false, message: 'กรุณาระบุเหตุผลในการหักเครดิต' };
        }

        const result = await this.walletService.deductCredits(
            userId,
            body.amount,
            body.description,
            req.user.userId,
        );

        return result;
    }

    /**
     * Admin: Get wallet statistics
     */
    @Get('admin/statistics')
    @UseGuards(SessionAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN)
    async getStatistics() {
        const stats = await this.walletService.getStatistics();
        return { success: true, ...stats };
    }
}

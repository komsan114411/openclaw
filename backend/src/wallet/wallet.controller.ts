import { Controller, Get, Post, Body, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth.service';
import { CreditTransactionDocument } from '../database/schemas/credit-transaction.schema';

@Controller('api/wallet')
@UseGuards(SessionAuthGuard)
export class WalletController {
    constructor(private readonly walletService: WalletService) { }

    /**
     * Get wallet balance
     */
    @Get('balance')
    async getBalance(@CurrentUser() user: AuthUser) {
        return this.walletService.getBalance(user.userId);
    }

    /**
     * Get transaction history
     */
    @Get('transactions')
    async getTransactions(
        @CurrentUser() user: AuthUser,
        @Query('limit') limit?: string,
        @Query('offset') offset?: string,
    ) {
        const transactions = await this.walletService.getTransactions(
            user.userId,
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
     * Deposit credits via slip
     */
    @Post('deposit')
    @HttpCode(HttpStatus.OK)
    async deposit(
        @CurrentUser() user: AuthUser,
        @Body() body: { slipImage: string }, // Base64 encoded image
    ) {
        if (!body.slipImage) {
            return { success: false, message: 'กรุณาอัปโหลดรูปสลิป' };
        }

        // Decode base64 image
        const slipImageData = Buffer.from(body.slipImage, 'base64');

        return this.walletService.deposit(user.userId, slipImageData);
    }
}

import { Controller, Get, Post, Body, Query, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('api/wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
    constructor(private readonly walletService: WalletService) { }

    /**
     * Get wallet balance
     */
    @Get('balance')
    async getBalance(@Request() req: any) {
        const userId = req.user.userId;
        return this.walletService.getBalance(userId);
    }

    /**
     * Get transaction history
     */
    @Get('transactions')
    async getTransactions(
        @Request() req: any,
        @Query('limit') limit?: string,
        @Query('offset') offset?: string,
    ) {
        const userId = req.user.userId;
        const transactions = await this.walletService.getTransactions(
            userId,
            limit ? parseInt(limit, 10) : 20,
            offset ? parseInt(offset, 10) : 0,
        );

        // Don't send slip image data in response
        return transactions.map((tx: any) => ({
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
        @Request() req: any,
        @Body() body: { slipImage: string }, // Base64 encoded image
    ) {
        const userId = req.user.userId;

        if (!body.slipImage) {
            return { success: false, message: 'กรุณาอัปโหลดรูปสลิป' };
        }

        // Decode base64 image
        const slipImageData = Buffer.from(body.slipImage, 'base64');

        return this.walletService.deposit(userId, slipImageData);
    }
}

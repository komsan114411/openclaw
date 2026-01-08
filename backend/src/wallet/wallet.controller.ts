import { Controller, Get, Post, Body, Query, Param, UseGuards, Request, HttpCode, HttpStatus, BadRequestException } from "@nestjs/common";
import { WalletService } from "./wallet.service";
import { UsdtRateService } from "./usdt-rate.service";
import { TronVerificationService } from "./tron-verification.service";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { UserRole } from "../database/schemas/user.schema";
import { CreditTransactionDocument } from "../database/schemas/credit-transaction.schema";
import { Types } from "mongoose";
import { SystemSettingsService } from "../system-settings/system-settings.service";

const MAX_CREDIT_AMOUNT = 1000000;
const MAX_SLIP_SIZE = 5 * 1024 * 1024;
const MAX_PAGINATION_LIMIT = 100;
const MAX_DESCRIPTION_LENGTH = 500;

@Controller("wallet")
export class WalletController {
    constructor(
        private readonly walletService: WalletService,
        private readonly usdtRateService: UsdtRateService,
        private readonly tronVerificationService: TronVerificationService,
    ) { }

    private validateObjectId(id: string, fieldName: string = "ID"): void {
        if (!id || !Types.ObjectId.isValid(id)) {
            throw new BadRequestException("Invalid " + fieldName + " format");
        }
    }

    private sanitizeDescription(description: string): string {
        if (!description) return "";
        return description.slice(0, MAX_DESCRIPTION_LENGTH).replace(/[<>]/g, "").trim();
    }

    private validatePagination(limit: number, offset: number): { limit: number; offset: number } {
        return {
            limit: Math.min(Math.max(1, limit || 20), MAX_PAGINATION_LIMIT),
            offset: Math.max(0, offset || 0),
        };
    }

    private isValidImageHeader(buffer: Buffer): boolean {
        if (buffer.length < 4) return false;
        const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
        const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
        return isPng || isJpeg;
    }

    @Get("balance")
    @UseGuards(SessionAuthGuard)
    async getBalance(@Request() req: any) {
        return this.walletService.getBalance(req.user.userId);
    }

    @Get("transactions")
    @UseGuards(SessionAuthGuard)
    async getTransactions(@Request() req: any, @Query("limit") limit?: string, @Query("offset") offset?: string) {
        const pagination = this.validatePagination(limit ? parseInt(limit, 10) : 20, offset ? parseInt(offset, 10) : 0);
        const transactions = await this.walletService.getTransactions(req.user.userId, pagination.limit, pagination.offset);
        return transactions.map((tx: CreditTransactionDocument) => ({ ...tx.toObject(), slipImageData: undefined, hasSlipImage: !!tx.slipImageData }));
    }

    @Post("deposit")
    @UseGuards(SessionAuthGuard)
    @HttpCode(HttpStatus.OK)
    async deposit(@Request() req: any, @Body() body: { slipImage: string }) {
        if (!body.slipImage) return { success: false, message: "กรุณาอัปโหลดรูปสลิป" };
        if (!/^[A-Za-z0-9+/=]+$/.test(body.slipImage)) return { success: false, message: "รูปแบบรูปภาพไม่ถูกต้อง" };
        const slipImageData = Buffer.from(body.slipImage, "base64");
        if (slipImageData.length > MAX_SLIP_SIZE) return { success: false, message: "ขนาดไฟล์ใหญ่เกินไป (สูงสุด 5MB)" };
        if (!this.isValidImageHeader(slipImageData)) return { success: false, message: "รองรับเฉพาะไฟล์ PNG และ JPEG เท่านั้น" };
        return this.walletService.deposit(req.user.userId, slipImageData);
    }

    @Post("deposit/usdt")
    @UseGuards(SessionAuthGuard)
    @HttpCode(HttpStatus.OK)
    async depositUsdt(@Request() req: any, @Body() body: { amount: number; transactionHash: string }) {
        if (!body.amount || body.amount <= 0) return { success: false, message: "จำนวนเงินไม่ถูกต้อง" };
        if (!body.transactionHash) return { success: false, message: "กรุณาระบุ Transaction Hash" };
        return this.walletService.depositUsdt(req.user.userId, body.amount, body.transactionHash);
    }

    // ==========================================
    // USDT Rate & Verification Endpoints
    // ==========================================

    /**
     * Get current USDT/THB exchange rate from Binance
     */
    @Get("usdt/rate")
    async getUsdtRate() {
        const rateInfo = await this.usdtRateService.getUsdtThbRate();
        return {
            success: true,
            rate: rateInfo.rate,
            source: rateInfo.source,
            updatedAt: rateInfo.updatedAt,
        };
    }

    /**
     * Calculate THB credits from USDT amount
     */
    @Get("usdt/calculate")
    async calculateUsdtCredits(@Query("amount") amount: string) {
        const usdtAmount = parseFloat(amount);
        if (isNaN(usdtAmount) || usdtAmount <= 0) {
            return { success: false, message: "จำนวน USDT ไม่ถูกต้อง" };
        }

        const result = await this.usdtRateService.getCreditsForUsdt(usdtAmount);
        return {
            success: true,
            usdtAmount: result.usdtAmount,
            rate: result.rate,
            thbCredits: result.thbCredits,
            source: result.source,
        };
    }

    /**
     * Verify USDT TRC20 transaction on blockchain
     */
    @Get("usdt/verify/:txHash")
    @UseGuards(SessionAuthGuard)
    async verifyUsdtTransaction(
        @Param("txHash") txHash: string,
        @Query("expectedAmount") expectedAmount?: string,
        @Query("expectedWallet") expectedWallet?: string,
    ) {
        if (!txHash || txHash.length < 10) {
            return { success: false, message: "Transaction Hash ไม่ถูกต้อง" };
        }

        // Default to 0 if no expected amount (just get transaction details)
        const amount = expectedAmount ? parseFloat(expectedAmount) : 0;
        const wallet = expectedWallet || "";

        if (wallet && amount > 0) {
            // Full verification with amount and wallet check
            const result = await this.tronVerificationService.verifyTransaction(txHash, wallet, amount);
            return {
                success: result.verified,
                ...result,
            };
        } else {
            // Just get transaction details
            const details = await this.tronVerificationService.getTransactionDetails(txHash);
            return {
                success: details.found,
                ...details,
            };
        }
    }

    @Get("admin/transactions")
    @UseGuards(SessionAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN)
    async getAllTransactions(@Query("limit") limit?: string, @Query("offset") offset?: string, @Query("type") type?: string, @Query("status") status?: string) {
        const pagination = this.validatePagination(limit ? parseInt(limit, 10) : 50, offset ? parseInt(offset, 10) : 0);
        const validTypes = ["deposit", "purchase", "bonus", "deduction", "refund"];
        const validStatuses = ["pending", "completed", "rejected", "cancelled"];
        const safeType = type && validTypes.includes(type) ? type : undefined;
        const safeStatus = status && validStatuses.includes(status) ? status : undefined;
        const transactions = await this.walletService.getAllTransactions(pagination.limit, pagination.offset, safeType, safeStatus);
        return { success: true, transactions: transactions.map((tx: any) => ({ ...tx, slipImageData: undefined, hasSlipImage: !!tx.slipImageData })) };
    }

    @Get("admin/user/:userId/balance")
    @UseGuards(SessionAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN)
    async getUserBalance(@Param("userId") userId: string) {
        this.validateObjectId(userId, "userId");
        const balance = await this.walletService.getBalance(userId);
        return { success: true, ...balance };
    }

    @Get("admin/user/:userId/transactions")
    @UseGuards(SessionAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN)
    async getUserTransactions(@Param("userId") userId: string, @Query("limit") limit?: string, @Query("offset") offset?: string) {
        this.validateObjectId(userId, "userId");
        const pagination = this.validatePagination(limit ? parseInt(limit, 10) : 50, offset ? parseInt(offset, 10) : 0);
        const transactions = await this.walletService.getTransactions(userId, pagination.limit, pagination.offset);
        return { success: true, transactions: transactions.map((tx: CreditTransactionDocument) => ({ ...tx.toObject(), slipImageData: undefined, hasSlipImage: !!tx.slipImageData })) };
    }

    @Post("admin/user/:userId/add-credits")
    @UseGuards(SessionAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN)
    @HttpCode(HttpStatus.OK)
    async addCredits(@Request() req: any, @Param("userId") userId: string, @Body() body: { amount: number; description: string }) {
        this.validateObjectId(userId, "userId");
        if (!body.amount || typeof body.amount !== "number" || !Number.isFinite(body.amount)) return { success: false, message: "จำนวนเครดิตไม่ถูกต้อง" };
        if (body.amount <= 0) return { success: false, message: "จำนวนเครดิตต้องมากกว่า 0" };
        if (body.amount > MAX_CREDIT_AMOUNT) return { success: false, message: "จำนวนเครดิตต้องไม่เกิน 1,000,000 บาท" };
        if (!body.description || typeof body.description !== "string") return { success: false, message: "กรุณาระบุเหตุผลในการเพิ่มเครดิต" };
        const sanitizedDescription = this.sanitizeDescription(body.description);
        if (sanitizedDescription.length < 3) return { success: false, message: "เหตุผลต้องมีความยาวอย่างน้อย 3 ตัวอักษร" };
        const result = await this.walletService.addBonus(userId, Math.floor(body.amount), sanitizedDescription, req.user.userId);
        return { ...result, message: "เพิ่มเครดิตสำเร็จ" };
    }

    @Post("admin/user/:userId/deduct-credits")
    @UseGuards(SessionAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN)
    @HttpCode(HttpStatus.OK)
    async deductCredits(@Request() req: any, @Param("userId") userId: string, @Body() body: { amount: number; description: string }) {
        this.validateObjectId(userId, "userId");
        if (!body.amount || typeof body.amount !== "number" || !Number.isFinite(body.amount)) return { success: false, message: "จำนวนเครดิตไม่ถูกต้อง" };
        if (body.amount <= 0) return { success: false, message: "จำนวนเครดิตต้องมากกว่า 0" };
        if (body.amount > MAX_CREDIT_AMOUNT) return { success: false, message: "จำนวนเครดิตต้องไม่เกิน 1,000,000 บาท" };
        if (!body.description || typeof body.description !== "string") return { success: false, message: "กรุณาระบุเหตุผลในการหักเครดิต" };
        const sanitizedDescription = this.sanitizeDescription(body.description);
        if (sanitizedDescription.length < 3) return { success: false, message: "เหตุผลต้องมีความยาวอย่างน้อย 3 ตัวอักษร" };
        const result = await this.walletService.deductCredits(userId, Math.floor(body.amount), sanitizedDescription, req.user.userId);
        return result;
    }

    @Get("admin/statistics")
    @UseGuards(SessionAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN)
    async getStatistics() {
        const stats = await this.walletService.getStatistics();
        return { success: true, ...stats };
    }
}

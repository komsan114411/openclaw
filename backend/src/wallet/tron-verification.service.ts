import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

/**
 * TRON Verification Service
 *
 * Verifies USDT TRC20 transactions on the TRON blockchain using TRONSCAN API.
 * Used to validate that users actually sent USDT to the system wallet.
 */
@Injectable()
export class TronVerificationService {
    private readonly logger = new Logger(TronVerificationService.name);

    // USDT TRC20 Contract Address on TRON
    private readonly USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

    /**
     * Verify a USDT TRC20 transaction on the blockchain
     *
     * @param txHash Transaction hash to verify
     * @param expectedWallet Expected recipient wallet address
     * @param expectedAmount Minimum expected USDT amount
     * @returns Verification result
     */
    async verifyTransaction(
        txHash: string,
        expectedWallet: string,
        expectedAmount: number,
    ): Promise<{
        verified: boolean;
        status: 'success' | 'not_found' | 'wrong_recipient' | 'insufficient_amount' | 'wrong_token' | 'error';
        actualAmount?: number;
        fromAddress?: string;
        toAddress?: string;
        blockNumber?: number;
        timestamp?: Date;
        message?: string;
    }> {
        try {
            this.logger.log(`Verifying transaction: ${txHash}`);

            // Fetch transaction info from TRONSCAN
            const response = await axios.get(
                `https://apilist.tronscan.org/api/transaction-info?hash=${txHash}`,
                { timeout: 10000 }
            );

            const tx = response.data;

            // Check if transaction exists
            if (!tx || !tx.contractData) {
                this.logger.warn(`Transaction not found: ${txHash}`);
                return {
                    verified: false,
                    status: 'not_found',
                    message: 'ไม่พบธุรกรรมนี้บน Blockchain',
                };
            }

            // Check if it's USDT TRC20 transfer
            const contractAddress = tx.contractData?.contract_address || tx.toAddress;
            if (contractAddress !== this.USDT_CONTRACT) {
                this.logger.warn(`Wrong token contract: ${contractAddress}`);
                return {
                    verified: false,
                    status: 'wrong_token',
                    message: 'ธุรกรรมนี้ไม่ใช่การโอน USDT TRC20',
                };
            }

            // Parse transaction details
            const toAddress = tx.contractData?.to_address || tx.toAddress;
            const fromAddress = tx.ownerAddress || tx.contractData?.owner_address;

            // USDT has 6 decimals
            const rawAmount = tx.contractData?.amount || tx.trigger_info?.parameter?._value || '0';
            const actualAmount = parseFloat(rawAmount) / 1e6;

            this.logger.debug(`TX Details: from=${fromAddress}, to=${toAddress}, amount=${actualAmount}`);

            // Convert expected wallet to TRON base58 format if needed
            const normalizedExpectedWallet = expectedWallet.toUpperCase();
            const normalizedToAddress = toAddress?.toUpperCase();

            // Verify recipient
            if (normalizedToAddress !== normalizedExpectedWallet) {
                this.logger.warn(`Wrong recipient: expected=${normalizedExpectedWallet}, got=${normalizedToAddress}`);
                return {
                    verified: false,
                    status: 'wrong_recipient',
                    actualAmount,
                    fromAddress,
                    toAddress,
                    message: 'กรุณาโอนไปยังกระเป๋าที่ระบบกำหนดเท่านั้น',
                };
            }

            // Verify amount
            if (actualAmount < expectedAmount) {
                this.logger.warn(`Insufficient amount: expected=${expectedAmount}, got=${actualAmount}`);
                return {
                    verified: false,
                    status: 'insufficient_amount',
                    actualAmount,
                    fromAddress,
                    toAddress,
                    message: `ยอดโอนไม่ตรง: คาดหวัง ${expectedAmount} USDT แต่ได้รับ ${actualAmount} USDT`,
                };
            }

            // All checks passed
            this.logger.log(`Transaction verified: ${txHash}, amount=${actualAmount} USDT`);
            return {
                verified: true,
                status: 'success',
                actualAmount,
                fromAddress,
                toAddress,
                blockNumber: tx.block,
                timestamp: tx.timestamp ? new Date(tx.timestamp) : undefined,
                message: 'ตรวจสอบธุรกรรมสำเร็จ',
            };
        } catch (error: any) {
            this.logger.error(`Failed to verify transaction ${txHash}: ${error.message}`);
            return {
                verified: false,
                status: 'error',
                message: `ไม่สามารถตรวจสอบธุรกรรมได้: ${error.message}`,
            };
        }
    }

    /**
     * Get transaction details without verification (for display purposes)
     */
    async getTransactionDetails(txHash: string): Promise<{
        found: boolean;
        amount?: number;
        from?: string;
        to?: string;
        timestamp?: Date;
        confirmed?: boolean;
    }> {
        try {
            const response = await axios.get(
                `https://apilist.tronscan.org/api/transaction-info?hash=${txHash}`,
                { timeout: 10000 }
            );

            const tx = response.data;

            if (!tx || !tx.contractData) {
                return { found: false };
            }

            const rawAmount = tx.contractData?.amount || '0';
            const amount = parseFloat(rawAmount) / 1e6;

            return {
                found: true,
                amount,
                from: tx.ownerAddress,
                to: tx.contractData?.to_address,
                timestamp: tx.timestamp ? new Date(tx.timestamp) : undefined,
                confirmed: tx.confirmed,
            };
        } catch (error) {
            return { found: false };
        }
    }
}

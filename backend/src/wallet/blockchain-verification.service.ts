import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

/**
 * Multi-Chain USDT Verification Service
 *
 * Verifies USDT transactions on multiple blockchains:
 * - TRC20 (TRON) via TRONSCAN API
 * - ERC20 (Ethereum) via Etherscan API
 * - BEP20 (BSC) via BSCScan API
 */
@Injectable()
export class BlockchainVerificationService {
    private readonly logger = new Logger(BlockchainVerificationService.name);

    // USDT Contract Addresses
    private readonly CONTRACTS = {
        TRC20: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
        ERC20: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        BEP20: '0x55d398326f99059fF775485246999027B3197955',
    };

    // API Endpoints
    private readonly APIS = {
        TRC20: 'https://apilist.tronscan.org/api',
        ERC20: 'https://api.etherscan.io/api',
        BEP20: 'https://api.bscscan.com/api',
    };

    /**
     * Verify USDT transaction on any supported network
     */
    async verifyTransaction(
        txHash: string,
        expectedWallet: string,
        expectedAmount: number,
        network: 'TRC20' | 'ERC20' | 'BEP20' = 'TRC20',
    ): Promise<{
        verified: boolean;
        status: 'success' | 'not_found' | 'wrong_recipient' | 'insufficient_amount' | 'wrong_token' | 'pending' | 'error';
        actualAmount?: number;
        fromAddress?: string;
        toAddress?: string;
        timestamp?: Date;
        message?: string;
    }> {
        try {
            this.logger.log(`Verifying ${network} transaction: ${txHash}`);

            if (network === 'TRC20') {
                return this.verifyTRC20(txHash, expectedWallet, expectedAmount);
            } else if (network === 'ERC20') {
                return this.verifyERC20(txHash, expectedWallet, expectedAmount);
            } else if (network === 'BEP20') {
                return this.verifyBEP20(txHash, expectedWallet, expectedAmount);
            }

            return { verified: false, status: 'error', message: 'Unsupported network' };
        } catch (error: any) {
            this.logger.error(`Verification error: ${error.message}`);
            return { verified: false, status: 'error', message: error.message };
        }
    }

    /**
     * Verify TRC20 (TRON) transaction via TRONSCAN
     */
    private async verifyTRC20(
        txHash: string,
        expectedWallet: string,
        expectedAmount: number,
    ): Promise<any> {
        const response = await axios.get(
            `${this.APIS.TRC20}/transaction-info?hash=${txHash}`,
            { timeout: 10000 }
        );

        const tx = response.data;

        if (!tx || !tx.contractData) {
            return { verified: false, status: 'not_found', message: 'ไม่พบธุรกรรมนี้' };
        }

        // Check USDT contract
        if (tx.contractData?.contract_address !== this.CONTRACTS.TRC20) {
            return { verified: false, status: 'wrong_token', message: 'ไม่ใช่ USDT TRC20' };
        }

        const toAddress = tx.contractData?.to_address?.toUpperCase();
        const actualAmount = parseFloat(tx.contractData?.amount || '0') / 1e6;

        if (toAddress !== expectedWallet.toUpperCase()) {
            return { verified: false, status: 'wrong_recipient', actualAmount, toAddress, message: 'กระเป๋าปลายทางไม่ตรง' };
        }

        if (actualAmount < expectedAmount * 0.99) { // Allow 1% tolerance
            return { verified: false, status: 'insufficient_amount', actualAmount, toAddress, message: `ยอดไม่ตรง: ได้รับ ${actualAmount} USDT` };
        }

        return {
            verified: true,
            status: 'success',
            actualAmount,
            fromAddress: tx.ownerAddress,
            toAddress,
            timestamp: tx.timestamp ? new Date(tx.timestamp) : new Date(),
            message: 'ตรวจสอบสำเร็จ',
        };
    }

    /**
     * Verify ERC20 (Ethereum) transaction via Etherscan
     */
    private async verifyERC20(
        txHash: string,
        expectedWallet: string,
        expectedAmount: number,
    ): Promise<any> {
        const apiKey = process.env.ETHERSCAN_API_KEY || '';

        const response = await axios.get(this.APIS.ERC20, {
            params: {
                module: 'account',
                action: 'tokentx',
                txhash: txHash,
                apikey: apiKey,
            },
            timeout: 10000,
        });

        const result = response.data?.result;

        if (!result || result.length === 0) {
            return { verified: false, status: 'not_found', message: 'ไม่พบธุรกรรมนี้' };
        }

        const tx = result[0];

        // Check USDT contract (case-insensitive)
        if (tx.contractAddress?.toLowerCase() !== this.CONTRACTS.ERC20.toLowerCase()) {
            return { verified: false, status: 'wrong_token', message: 'ไม่ใช่ USDT ERC20' };
        }

        const toAddress = tx.to?.toLowerCase();
        const actualAmount = parseFloat(tx.value) / 1e6; // USDT has 6 decimals

        if (toAddress !== expectedWallet.toLowerCase()) {
            return { verified: false, status: 'wrong_recipient', actualAmount, toAddress: tx.to, message: 'กระเป๋าปลายทางไม่ตรง' };
        }

        if (actualAmount < expectedAmount * 0.99) {
            return { verified: false, status: 'insufficient_amount', actualAmount, toAddress: tx.to, message: `ยอดไม่ตรง: ได้รับ ${actualAmount} USDT` };
        }

        return {
            verified: true,
            status: 'success',
            actualAmount,
            fromAddress: tx.from,
            toAddress: tx.to,
            timestamp: tx.timeStamp ? new Date(parseInt(tx.timeStamp) * 1000) : new Date(),
            message: 'ตรวจสอบสำเร็จ',
        };
    }

    /**
     * Verify BEP20 (BSC) transaction via BSCScan
     */
    private async verifyBEP20(
        txHash: string,
        expectedWallet: string,
        expectedAmount: number,
    ): Promise<any> {
        const apiKey = process.env.BSCSCAN_API_KEY || '';

        const response = await axios.get(this.APIS.BEP20, {
            params: {
                module: 'account',
                action: 'tokentx',
                txhash: txHash,
                apikey: apiKey,
            },
            timeout: 10000,
        });

        const result = response.data?.result;

        if (!result || result.length === 0) {
            return { verified: false, status: 'not_found', message: 'ไม่พบธุรกรรมนี้' };
        }

        const tx = result[0];

        if (tx.contractAddress?.toLowerCase() !== this.CONTRACTS.BEP20.toLowerCase()) {
            return { verified: false, status: 'wrong_token', message: 'ไม่ใช่ USDT BEP20' };
        }

        const toAddress = tx.to?.toLowerCase();
        const actualAmount = parseFloat(tx.value) / 1e18; // BEP20 USDT has 18 decimals

        if (toAddress !== expectedWallet.toLowerCase()) {
            return { verified: false, status: 'wrong_recipient', actualAmount, toAddress: tx.to, message: 'กระเป๋าปลายทางไม่ตรง' };
        }

        if (actualAmount < expectedAmount * 0.99) {
            return { verified: false, status: 'insufficient_amount', actualAmount, toAddress: tx.to, message: `ยอดไม่ตรง: ได้รับ ${actualAmount} USDT` };
        }

        return {
            verified: true,
            status: 'success',
            actualAmount,
            fromAddress: tx.from,
            toAddress: tx.to,
            timestamp: tx.timeStamp ? new Date(parseInt(tx.timeStamp) * 1000) : new Date(),
            message: 'ตรวจสอบสำเร็จ',
        };
    }
}

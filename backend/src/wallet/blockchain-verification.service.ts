import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { SecurityUtil } from '../utils/security.util';

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

    constructor(private securityUtil: SecurityUtil) { }

    // USDT Contract Addresses
    private readonly CONTRACTS = {
        TRC20: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
        ERC20: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        BEP20: '0x55d398326f99059fF775485246999027B3197955',
    };

    // API Endpoints
    private readonly APIS = {
        TRC20: 'https://apilist.tronscan.org/api',
        ERC20: 'https://api.etherscan.io/v2/api',  // V2 API
        BEP20: 'https://api.bscscan.com/api',
    };

    // Chain IDs for Etherscan V2
    private readonly CHAIN_IDS = {
        ERC20: 1,  // Ethereum Mainnet
    };

    /**
     * Check if API key is required and configured for the network
     */
    isApiKeyRequired(network: 'TRC20' | 'ERC20' | 'BEP20'): boolean {
        // TRC20 (TRONSCAN) works without API key
        // ERC20 and BEP20 require API keys for reliable access
        return network === 'ERC20' || network === 'BEP20';
    }



    /**
     * Verify USDT transaction on any supported network
     */
    async verifyTransaction(
        txHash: string,
        expectedWallet: string,
        expectedAmount: number,
        network: 'TRC20' | 'ERC20' | 'BEP20' = 'TRC20',
        apiKeys?: { etherscan?: string; bscscan?: string; tronscan?: string },
    ): Promise<{
        verified: boolean;
        status: 'success' | 'not_found' | 'wrong_recipient' | 'insufficient_amount' | 'wrong_token' | 'pending' | 'no_api_key' | 'error';
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
                let apiKey = apiKeys?.etherscan || process.env.ETHERSCAN_API_KEY || '';
                if (!apiKey) {
                    return { verified: false, status: 'no_api_key', message: 'ยังไม่ได้ตั้งค่า Etherscan API Key' };
                }
                // Decrypt if necessary
                apiKey = this.securityUtil.decrypt(apiKey);
                return this.verifyERC20(txHash, expectedWallet, expectedAmount, apiKey);
            } else if (network === 'BEP20') {
                let apiKey = apiKeys?.bscscan || process.env.BSCSCAN_API_KEY || '';
                if (!apiKey) {
                    return { verified: false, status: 'no_api_key', message: 'ยังไม่ได้ตั้งค่า BSCScan API Key' };
                }
                // Decrypt if necessary
                apiKey = this.securityUtil.decrypt(apiKey);
                return this.verifyBEP20(txHash, expectedWallet, expectedAmount, apiKey);
            }

            return { verified: false, status: 'error', message: 'Unsupported network' };
        } catch (error: any) {
            this.logger.error(`Verification error: ${error.message}`);
            return { verified: false, status: 'error', message: error.message };
        }
    }

    /**
     * Test API key validity
     * Note: Blockchain API keys (etherscan, bscscan, tronscan) are stored as plain text
     */
    async testApiKey(
        network: 'TRC20' | 'ERC20' | 'BEP20',
        apiKey: string,
    ): Promise<{ valid: boolean; message: string }> {
        try {
            // Blockchain keys are stored as plain text - use directly
            const keyToUse = apiKey?.trim() || '';

            this.logger.log(`Testing ${network} API key (length: ${keyToUse?.length || 0})`);

            if (!keyToUse || keyToUse.length < 10) {
                return { valid: false, message: `กรุณาใส่ API Key ที่ถูกต้อง` };
            }

            if (network === 'TRC20') {
                const response = await axios.get(`${this.APIS.TRC20}/system/status`, { timeout: 5000 });
                return { valid: true, message: 'เชื่อมต่อ TRONSCAN สำเร็จ' };
            }

            if (network === 'ERC20') {
                this.logger.log(`Calling Etherscan V2 API...`);
                const response = await axios.get(this.APIS.ERC20, {
                    params: {
                        chainid: this.CHAIN_IDS.ERC20,
                        module: 'stats',
                        action: 'ethsupply',
                        apikey: keyToUse
                    },
                    timeout: 10000,
                });
                this.logger.log(`Etherscan response status: ${response.data?.status}, message: ${response.data?.message}`);
                if (response.data?.status === '1') {
                    return { valid: true, message: 'เชื่อมต่อ Etherscan สำเร็จ' };
                }
                const errorDetail = response.data?.result || response.data?.message || 'API Key ไม่ถูกต้อง';
                return { valid: false, message: `Etherscan: ${errorDetail}` };
            }

            if (network === 'BEP20') {
                this.logger.log(`Calling BSCScan API...`);
                const response = await axios.get(this.APIS.BEP20, {
                    params: { module: 'stats', action: 'bnbsupply', apikey: keyToUse },
                    timeout: 10000,
                });
                this.logger.log(`BSCScan response status: ${response.data?.status}`);
                if (response.data?.status === '1') {
                    return { valid: true, message: 'เชื่อมต่อ BSCScan สำเร็จ' };
                }
                const errorDetail = response.data?.result || response.data?.message || 'API Key ไม่ถูกต้อง';
                return { valid: false, message: `BSCScan: ${errorDetail}` };
            }
            return { valid: false, message: 'Network ไม่รองรับ' };
        } catch (error: any) {
            this.logger.error(`API test failed: ${error.message}`);
            if (error.response) {
                this.logger.error(`Response: ${JSON.stringify(error.response.data)}`);
            }
            return { valid: false, message: `เชื่อมต่อไม่สำเร็จ: ${error.message}` };
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

        if (tx.contractData?.contract_address !== this.CONTRACTS.TRC20) {
            return { verified: false, status: 'wrong_token', message: 'ไม่ใช่ USDT TRC20' };
        }

        const toAddress = tx.contractData?.to_address?.toUpperCase();
        const actualAmount = parseFloat(tx.contractData?.amount || '0') / 1e6;

        if (toAddress !== expectedWallet.toUpperCase()) {
            return { verified: false, status: 'wrong_recipient', actualAmount, toAddress, message: 'กระเป๋าปลายทางไม่ตรง' };
        }

        if (actualAmount < expectedAmount * 0.99) {
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
        apiKey: string,
    ): Promise<any> {
        const response = await axios.get(this.APIS.ERC20, {
            params: {
                chainid: this.CHAIN_IDS.ERC20,  // Required for V2 API
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

        if (tx.contractAddress?.toLowerCase() !== this.CONTRACTS.ERC20.toLowerCase()) {
            return { verified: false, status: 'wrong_token', message: 'ไม่ใช่ USDT ERC20' };
        }

        const toAddress = tx.to?.toLowerCase();
        const actualAmount = parseFloat(tx.value) / 1e6;

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
        apiKey: string,
    ): Promise<any> {
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
        const actualAmount = parseFloat(tx.value) / 1e18;

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


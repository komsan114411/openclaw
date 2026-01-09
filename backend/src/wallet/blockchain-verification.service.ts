import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { SecurityUtil } from '../utils/security.util';

/**
 * Multi-Chain USDT Verification Service
 *
 * Verifies USDT transactions on multiple blockchains:
 * - TRC20 (TRON) via TRONSCAN API
 * - ERC20 (Ethereum) via Etherscan API V2
 * - BEP20 (BSC) via BSCScan API
 * 
 * Security Features:
 * - Transaction hash validation (format & length)
 * - Wallet address validation
 * - Amount validation (positive numbers only)
 * - Rate limiting protection
 * - Duplicate transaction prevention (handled by wallet.service)
 * - Contract address verification
 * - Recipient address verification
 */
@Injectable()
export class BlockchainVerificationService {
    private readonly logger = new Logger(BlockchainVerificationService.name);

    constructor(private securityUtil: SecurityUtil) { }

    // USDT Contract Addresses (Official)
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

    // Chain IDs for Etherscan V2 API
    private readonly CHAIN_IDS = {
        ERC20: '1',  // Ethereum Mainnet
    };

    // Transaction Hash patterns for validation
    private readonly TX_HASH_PATTERNS = {
        TRC20: /^[a-fA-F0-9]{64}$/,  // 64 hex characters
        ERC20: /^0x[a-fA-F0-9]{64}$/,  // 0x + 64 hex characters
        BEP20: /^0x[a-fA-F0-9]{64}$/,  // 0x + 64 hex characters
    };

    // Wallet Address patterns for validation
    private readonly WALLET_PATTERNS = {
        TRC20: /^T[a-zA-Z0-9]{33}$/,  // TRON address starts with T
        ERC20: /^0x[a-fA-F0-9]{40}$/,  // Ethereum address
        BEP20: /^0x[a-fA-F0-9]{40}$/,  // BSC address (same as ETH)
    };

    // Minimum confirmations required
    private readonly MIN_CONFIRMATIONS = {
        TRC20: 19,  // ~1 minute
        ERC20: 12,  // ~3 minutes
        BEP20: 15,  // ~45 seconds
    };

    /**
     * Validate transaction hash format
     * @security Prevents injection attacks and invalid data
     */
    validateTxHash(txHash: string, network: 'TRC20' | 'ERC20' | 'BEP20'): { valid: boolean; message?: string } {
        if (!txHash || typeof txHash !== 'string') {
            return { valid: false, message: 'กรุณาระบุ Transaction Hash' };
        }

        const trimmed = txHash.trim();
        
        // Network-specific length validation
        if (network === 'TRC20') {
            // TRC20: 64 hex characters (no 0x prefix)
            if (trimmed.length !== 64) {
                return { 
                    valid: false, 
                    message: `Transaction Hash ต้องมี 64 ตัวอักษร (ปัจจุบัน: ${trimmed.length} ตัวอักษร)` 
                };
            }
        } else {
            // ERC20/BEP20: 0x + 64 hex characters = 66 total
            if (trimmed.length !== 66) {
                return { 
                    valid: false, 
                    message: `Transaction Hash ต้องมี 66 ตัวอักษร รวม 0x (ปัจจุบัน: ${trimmed.length} ตัวอักษร)` 
                };
            }
            
            // Must start with 0x
            if (!trimmed.startsWith('0x') && !trimmed.startsWith('0X')) {
                return { valid: false, message: 'Transaction Hash ต้องขึ้นต้นด้วย 0x' };
            }
        }

        // Check pattern based on network
        const pattern = this.TX_HASH_PATTERNS[network];
        if (!pattern.test(trimmed)) {
            return { valid: false, message: `รูปแบบ Transaction Hash ไม่ถูกต้อง (ต้องเป็นตัวเลขฐาน 16 เท่านั้น)` };
        }

        return { valid: true };
    }

    /**
     * Validate wallet address format
     * @security Prevents injection attacks and invalid addresses
     */
    validateWalletAddress(address: string, network: 'TRC20' | 'ERC20' | 'BEP20'): { valid: boolean; message?: string } {
        if (!address || typeof address !== 'string') {
            return { valid: false, message: 'Wallet Address ไม่ถูกต้อง' };
        }

        const trimmed = address.trim();
        const pattern = this.WALLET_PATTERNS[network];

        if (!pattern.test(trimmed)) {
            return { valid: false, message: `รูปแบบ Wallet Address ไม่ถูกต้องสำหรับ ${network}` };
        }

        return { valid: true };
    }

    /**
     * Validate amount
     * @security Prevents negative amounts and overflow
     */
    validateAmount(amount: number): { valid: boolean; message?: string } {
        if (typeof amount !== 'number' || isNaN(amount)) {
            return { valid: false, message: 'จำนวนเงินไม่ถูกต้อง' };
        }

        if (amount <= 0) {
            return { valid: false, message: 'จำนวนเงินต้องมากกว่า 0' };
        }

        if (amount > 1000000) {  // Max 1M USDT per transaction
            return { valid: false, message: 'จำนวนเงินเกินขีดจำกัด (สูงสุด 1,000,000 USDT)' };
        }

        if (!Number.isFinite(amount)) {
            return { valid: false, message: 'จำนวนเงินไม่ถูกต้อง' };
        }

        return { valid: true };
    }

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
     * 
     * @security
     * - Validates all inputs before processing
     * - Verifies contract address matches official USDT
     * - Verifies recipient address matches expected wallet
     * - Checks transaction confirmations
     * - API keys are encrypted in database and decrypted before use
     */
    async verifyTransaction(
        txHash: string,
        expectedWallet: string,
        expectedAmount: number,
        network: 'TRC20' | 'ERC20' | 'BEP20' = 'TRC20',
        apiKeys?: { etherscan?: string; bscscan?: string; tronscan?: string },
    ): Promise<{
        verified: boolean;
        status: 'success' | 'not_found' | 'wrong_recipient' | 'insufficient_amount' | 'wrong_token' | 'pending' | 'no_api_key' | 'invalid_input' | 'error';
        actualAmount?: number;
        fromAddress?: string;
        toAddress?: string;
        timestamp?: Date;
        confirmations?: number;
        message?: string;
    }> {
        try {
            // === INPUT VALIDATION ===
            
            // Validate transaction hash
            const txHashValidation = this.validateTxHash(txHash, network);
            if (!txHashValidation.valid) {
                this.logger.warn(`Invalid txHash format: ${txHash}`);
                return { verified: false, status: 'invalid_input', message: txHashValidation.message };
            }

            // Validate wallet address
            const walletValidation = this.validateWalletAddress(expectedWallet, network);
            if (!walletValidation.valid) {
                this.logger.warn(`Invalid wallet address: ${expectedWallet}`);
                return { verified: false, status: 'invalid_input', message: walletValidation.message };
            }

            // Validate amount
            const amountValidation = this.validateAmount(expectedAmount);
            if (!amountValidation.valid) {
                this.logger.warn(`Invalid amount: ${expectedAmount}`);
                return { verified: false, status: 'invalid_input', message: amountValidation.message };
            }

            // Normalize inputs
            const normalizedTxHash = txHash.trim();
            const normalizedWallet = expectedWallet.trim();

            this.logger.log(`Verifying ${network} transaction: ${normalizedTxHash}`);

            if (network === 'TRC20') {
                return this.verifyTRC20(normalizedTxHash, normalizedWallet, expectedAmount);
            } else if (network === 'ERC20') {
                const apiKey = apiKeys?.etherscan || process.env.ETHERSCAN_API_KEY || '';
                if (!apiKey) {
                    return { verified: false, status: 'no_api_key', message: 'ยังไม่ได้ตั้งค่า Etherscan API Key' };
                }
                this.logger.log(`Verifying ERC20 with API key (length: ${apiKey.length})`);
                return this.verifyERC20(normalizedTxHash, normalizedWallet, expectedAmount, apiKey);
            } else if (network === 'BEP20') {
                const apiKey = apiKeys?.bscscan || process.env.BSCSCAN_API_KEY || '';
                if (!apiKey) {
                    return { verified: false, status: 'no_api_key', message: 'ยังไม่ได้ตั้งค่า BSCScan API Key' };
                }
                this.logger.log(`Verifying BEP20 with API key (length: ${apiKey.length})`);
                return this.verifyBEP20(normalizedTxHash, normalizedWallet, expectedAmount, apiKey);
            }

            return { verified: false, status: 'error', message: 'Network ไม่รองรับ' };
        } catch (error: any) {
            this.logger.error(`Verification error: ${error.message}`);
            return { verified: false, status: 'error', message: 'เกิดข้อผิดพลาดในการตรวจสอบ' };
        }
    }

    /**
     * Test API key validity
     * Note: Blockchain API keys are encrypted in database
     */
    async testApiKey(
        network: 'TRC20' | 'ERC20' | 'BEP20',
        apiKey: string,
    ): Promise<{ valid: boolean; message: string }> {
        try {
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
     * @security Verifies contract address, recipient, and amount
     * Returns detailed information for user feedback
     */
    private async verifyTRC20(
        txHash: string,
        expectedWallet: string,
        expectedAmount: number,
    ): Promise<any> {
        try {
            const response = await axios.get(
                `${this.APIS.TRC20}/transaction-info?hash=${encodeURIComponent(txHash)}`,
                { timeout: 15000 }
            );

            const tx = response.data;

            if (!tx || !tx.contractData) {
                return { 
                    verified: false, 
                    status: 'not_found', 
                    message: '❌ ไม่พบธุรกรรมนี้\n\nกรุณาตรวจสอบ:\n• Transaction Hash ถูกต้องหรือไม่\n• ธุรกรรมอาจยังไม่ได้รับการยืนยันบน Blockchain\n• ลองรอ 2-3 นาทีแล้วลองใหม่' 
                };
            }

            // Extract transaction details for detailed feedback
            const fromAddress = tx.ownerAddress || '';
            const toAddress = tx.contractData?.to_address || '';
            const contractAddress = tx.contractData?.contract_address || '';
            const rawAmount = tx.contractData?.amount || '0';
            const actualAmount = parseFloat(rawAmount) / 1e6;

            // Check if transaction is confirmed
            if (!tx.confirmed) {
                return { 
                    verified: false, 
                    status: 'pending',
                    actualAmount,
                    fromAddress,
                    toAddress,
                    message: `⏳ ธุรกรรมยังรอการยืนยัน\n\nรายละเอียดธุรกรรม:\n• จำนวน: ${actualAmount} USDT\n• จาก: ${fromAddress.slice(0, 10)}...${fromAddress.slice(-6)}\n• ไปยัง: ${toAddress.slice(0, 10)}...${toAddress.slice(-6)}\n\nกรุณารอ 1-2 นาทีแล้วลองใหม่` 
                };
            }

            // Verify USDT contract address
            if (contractAddress.toUpperCase() !== this.CONTRACTS.TRC20.toUpperCase()) {
                this.logger.warn(`[TRC20] Contract mismatch! Got: ${contractAddress}, Expected: ${this.CONTRACTS.TRC20}`);
                return { 
                    verified: false, 
                    status: 'wrong_token',
                    actualAmount,
                    fromAddress,
                    toAddress,
                    contractAddress,
                    message: `❌ ไม่ใช่ USDT TRC20!\n\nรายละเอียดธุรกรรม:\n• Token ที่โอน: ${contractAddress}\n• USDT TRC20 ต้องเป็น: ${this.CONTRACTS.TRC20}\n\nกรุณาโอน USDT บนเครือข่าย TRC20 (TRON) เท่านั้น` 
                };
            }

            // Verify recipient address
            if (toAddress.toUpperCase() !== expectedWallet.toUpperCase()) {
                this.logger.warn(`[TRC20] Wallet mismatch! Got: ${toAddress}, Expected: ${expectedWallet}`);
                return { 
                    verified: false, 
                    status: 'wrong_recipient',
                    actualAmount,
                    fromAddress,
                    toAddress,
                    expectedWallet,
                    message: `❌ กระเป๋าปลายทางไม่ตรง!\n\nรายละเอียด:\n• คุณโอนไปที่: ${toAddress}\n• กระเป๋าระบบ: ${expectedWallet}\n\nกรุณาโอนไปยังกระเป๋าที่ระบบกำหนดเท่านั้น` 
                };
            }

            // Check amount - if different, return with suggestion to use actual amount
            if (Math.abs(actualAmount - expectedAmount) > 0.01) {
                // Amount is different but transaction is valid
                if (actualAmount < expectedAmount * 0.99) {
                    return { 
                        verified: false, 
                        status: 'amount_mismatch',
                        actualAmount,
                        expectedAmount,
                        fromAddress,
                        toAddress,
                        suggestedAmount: actualAmount,
                        message: `⚠️ ยอดไม่ตรงกับที่กรอก!\n\nรายละเอียด:\n• ยอดที่คุณกรอก: ${expectedAmount} USDT\n• ยอดจริงในรายการ: ${actualAmount} USDT\n• ส่วนต่าง: ${(expectedAmount - actualAmount).toFixed(2)} USDT\n\nกรุณาแก้ไขยอดเป็น ${actualAmount} USDT แล้วลองใหม่` 
                    };
                }
            }

            this.logger.log(`[TRC20] ✅ Verification SUCCESS! Amount: ${actualAmount} USDT`);
            return {
                verified: true,
                status: 'success',
                actualAmount,
                expectedAmount,
                fromAddress,
                toAddress,
                timestamp: tx.timestamp ? new Date(tx.timestamp) : new Date(),
                message: `✅ ตรวจสอบสำเร็จ!\n\nรายละเอียด:\n• จำนวน: ${actualAmount} USDT\n• จาก: ${fromAddress.slice(0, 10)}...${fromAddress.slice(-6)}\n• ไปยัง: ${toAddress.slice(0, 10)}...${toAddress.slice(-6)}`,
            };
        } catch (error: any) {
            this.logger.error(`[TRC20] Verification error: ${error.message}`);
            return { verified: false, status: 'error', message: '❌ เกิดข้อผิดพลาดในการตรวจสอบ TRC20\n\nกรุณาลองใหม่อีกครั้งหรือติดต่อผู้ดูแลระบบ' };
        }
    }

    /**
     * Verify ERC20 (Ethereum) transaction via Etherscan V2 API
     * @security Verifies contract address, recipient, and amount
     * API Docs: https://docs.etherscan.io/api-reference/endpoint/tokentx
     * Returns detailed information for user feedback
     */
    private async verifyERC20(
        txHash: string,
        expectedWallet: string,
        expectedAmount: number,
        apiKey: string,
    ): Promise<any> {
        try {
            this.logger.log(`[ERC20] Verifying txHash: ${txHash}`);
            this.logger.log(`[ERC20] Expected wallet: ${expectedWallet}, amount: ${expectedAmount}`);

            // Query token transfers to the expected wallet address using V2 API
            const response = await axios.get(this.APIS.ERC20, {
                params: {
                    chainid: this.CHAIN_IDS.ERC20,
                    module: 'account',
                    action: 'tokentx',
                    address: expectedWallet,
                    contractaddress: this.CONTRACTS.ERC20,
                    startblock: 0,
                    endblock: 99999999,
                    page: 1,
                    offset: 100,  // Get last 100 transfers for better coverage
                    sort: 'desc',
                    apikey: apiKey,
                },
                timeout: 20000,
            });

            this.logger.log(`[ERC20] API Response status: ${response.data?.status}, message: ${response.data?.message}`);

            // Check for API error
            if (response.data?.status === '0') {
                const errorMsg = response.data?.result || response.data?.message || 'Unknown error';
                this.logger.error(`[ERC20] API Error: ${errorMsg}`);

                if (errorMsg.includes('No transactions found')) {
                    return { 
                        verified: false, 
                        status: 'not_found', 
                        message: `❌ ไม่พบธุรกรรม USDT มายังกระเป๋านี้\n\nกรุณาตรวจสอบ:\n• คุณโอนไปยังกระเป๋า: ${expectedWallet.slice(0, 10)}...${expectedWallet.slice(-6)} หรือไม่\n• โอนเป็น USDT ERC20 หรือไม่\n\nกรุณาโอน USDT ไปยังกระเป๋าที่ระบบกำหนด` 
                    };
                }
                return { verified: false, status: 'error', message: `❌ Etherscan Error: ${errorMsg}` };
            }

            const results = response.data?.result;

            if (!results || results.length === 0) {
                this.logger.warn(`[ERC20] No USDT transfers found to wallet: ${expectedWallet}`);
                return { 
                    verified: false, 
                    status: 'not_found', 
                    message: `❌ ไม่พบธุรกรรม USDT มายังกระเป๋านี้\n\nกระเป๋าระบบ: ${expectedWallet}\n\nกรุณาตรวจสอบว่าคุณโอนไปยังกระเป๋านี้และเป็น USDT ERC20` 
                };
            }

            // Find the transaction matching the txHash (case-insensitive)
            const normalizedTxHash = txHash.toLowerCase();
            const tx = results.find((t: any) => t.hash?.toLowerCase() === normalizedTxHash);

            if (!tx) {
                this.logger.warn(`[ERC20] TxHash ${txHash} not found in recent transfers`);
                return { 
                    verified: false, 
                    status: 'not_found', 
                    message: `❌ ไม่พบธุรกรรมนี้\n\nกรุณาตรวจสอบ:\n• Transaction Hash ถูกต้องหรือไม่\n• ธุรกรรมอาจยังไม่ได้รับการยืนยัน\n• ลองรอ 2-3 นาทีแล้วลองใหม่` 
                };
            }

            this.logger.log(`[ERC20] Transaction found: hash=${tx.hash}, to=${tx.to}, value=${tx.value}, token=${tx.tokenSymbol}`);

            // Extract transaction details
            const fromAddress = tx.from || '';
            const toAddress = tx.to || '';
            const actualAmount = parseFloat(tx.value) / 1e6;
            const confirmations = parseInt(tx.confirmations || '0');

            // Verify USDT contract address
            if (tx.contractAddress?.toLowerCase() !== this.CONTRACTS.ERC20.toLowerCase()) {
                this.logger.warn(`[ERC20] Contract mismatch! Got: ${tx.contractAddress}`);
                return {
                    verified: false,
                    status: 'wrong_token',
                    actualAmount,
                    fromAddress,
                    toAddress,
                    contractAddress: tx.contractAddress,
                    message: `❌ ไม่ใช่ USDT ERC20!\n\nรายละเอียดธุรกรรม:\n• Token ที่โอน: ${tx.tokenSymbol || 'Unknown'} (${tx.contractAddress})\n• USDT ERC20 ต้องเป็น: ${this.CONTRACTS.ERC20}\n\nกรุณาโอน USDT บนเครือข่าย ERC20 (Ethereum) เท่านั้น`
                };
            }

            // Verify recipient address
            if (toAddress.toLowerCase() !== expectedWallet.toLowerCase()) {
                this.logger.warn(`[ERC20] Wallet mismatch! Got: ${toAddress}, Expected: ${expectedWallet.toLowerCase()}`);
                return { 
                    verified: false, 
                    status: 'wrong_recipient',
                    actualAmount,
                    fromAddress,
                    toAddress,
                    expectedWallet,
                    message: `❌ กระเป๋าปลายทางไม่ตรง!\n\nรายละเอียด:\n• คุณโอนไปที่: ${toAddress}\n• กระเป๋าระบบ: ${expectedWallet}\n\nกรุณาโอนไปยังกระเป๋าที่ระบบกำหนดเท่านั้น` 
                };
            }

            // Check confirmations
            if (confirmations < this.MIN_CONFIRMATIONS.ERC20) {
                return {
                    verified: false,
                    status: 'pending',
                    actualAmount,
                    fromAddress,
                    toAddress,
                    confirmations,
                    message: `⏳ ธุรกรรมยังรอการยืนยัน\n\nรายละเอียดธุรกรรม:\n• จำนวน: ${actualAmount} USDT\n• จาก: ${fromAddress.slice(0, 10)}...${fromAddress.slice(-6)}\n• ไปยัง: ${toAddress.slice(0, 10)}...${toAddress.slice(-6)}\n\nสถานะการยืนยัน: ${confirmations}/${this.MIN_CONFIRMATIONS.ERC20} blocks\n\nกรุณารอ 2-3 นาทีแล้วลองใหม่`
                };
            }

            this.logger.log(`[ERC20] Amount: ${actualAmount} USDT (expected: ${expectedAmount})`);

            // Check amount - if different, return with suggestion to use actual amount
            if (Math.abs(actualAmount - expectedAmount) > 0.01) {
                // Amount is different but transaction is valid
                if (actualAmount < expectedAmount * 0.99) {
                    return {
                        verified: false,
                        status: 'amount_mismatch',
                        actualAmount,
                        expectedAmount,
                        fromAddress,
                        toAddress,
                        confirmations,
                        suggestedAmount: actualAmount,
                        message: `⚠️ ยอดไม่ตรงกับที่กรอก!\n\nรายละเอียด:\n• ยอดที่คุณกรอก: ${expectedAmount} USDT\n• ยอดจริงในรายการ: ${actualAmount} USDT\n• ส่วนต่าง: ${(expectedAmount - actualAmount).toFixed(2)} USDT\n\nกรุณาแก้ไขยอดเป็น ${actualAmount} USDT แล้วลองใหม่`
                    };
                }
            }

            this.logger.log(`[ERC20] ✅ Verification SUCCESS! Amount: ${actualAmount} USDT, Confirmations: ${confirmations}`);
            return {
                verified: true,
                status: 'success',
                actualAmount,
                expectedAmount,
                fromAddress,
                toAddress,
                timestamp: tx.timeStamp ? new Date(parseInt(tx.timeStamp) * 1000) : new Date(),
                confirmations,
                message: `✅ ตรวจสอบสำเร็จ!\n\nรายละเอียด:\n• จำนวน: ${actualAmount} USDT\n• จาก: ${fromAddress.slice(0, 10)}...${fromAddress.slice(-6)}\n• ไปยัง: ${toAddress.slice(0, 10)}...${toAddress.slice(-6)}\n• Confirmations: ${confirmations} blocks`,
            };
        } catch (error: any) {
            this.logger.error(`[ERC20] Verification error: ${error.message}`);
            if (error.response) {
                this.logger.error(`[ERC20] Response: ${JSON.stringify(error.response.data)}`);
            }
            return { verified: false, status: 'error', message: 'เกิดข้อผิดพลาดในการตรวจสอบ ERC20' };
        }
    }

    /**
     * Verify BEP20 (BSC) transaction via BSCScan
     * @security Verifies contract address, recipient, and amount
     */
    private async verifyBEP20(
        txHash: string,
        expectedWallet: string,
        expectedAmount: number,
        apiKey: string,
    ): Promise<any> {
        try {
            this.logger.log(`[BEP20] Verifying txHash: ${txHash}`);

            const response = await axios.get(this.APIS.BEP20, {
                params: {
                    module: 'account',
                    action: 'tokentx',
                    address: expectedWallet,
                    contractaddress: this.CONTRACTS.BEP20,
                    startblock: 0,
                    endblock: 99999999,
                    page: 1,
                    offset: 100,
                    sort: 'desc',
                    apikey: apiKey,
                },
                timeout: 15000,
            });

            if (response.data?.status === '0') {
                const errorMsg = response.data?.result || response.data?.message || 'Unknown error';
                if (errorMsg.includes('No transactions found')) {
                    return { verified: false, status: 'not_found', message: 'ไม่พบธุรกรรม USDT มายังกระเป๋านี้' };
                }
                return { verified: false, status: 'error', message: `BSCScan: ${errorMsg}` };
            }

            const results = response.data?.result;

            if (!results || results.length === 0) {
                return { verified: false, status: 'not_found', message: 'ไม่พบธุรกรรม USDT มายังกระเป๋านี้' };
            }

            // Find matching transaction
            const normalizedTxHash = txHash.toLowerCase();
            const tx = results.find((t: any) => t.hash?.toLowerCase() === normalizedTxHash);

            if (!tx) {
                return { verified: false, status: 'not_found', message: 'ไม่พบธุรกรรมนี้ หรือยังไม่ได้รับการยืนยัน' };
            }

            // Verify contract address
            if (tx.contractAddress?.toLowerCase() !== this.CONTRACTS.BEP20.toLowerCase()) {
                return { verified: false, status: 'wrong_token', message: 'ไม่ใช่ USDT BEP20' };
            }

            // Verify recipient
            const toAddress = tx.to?.toLowerCase();
            if (toAddress !== expectedWallet.toLowerCase()) {
                return { verified: false, status: 'wrong_recipient', message: 'กระเป๋าปลายทางไม่ตรง' };
            }

            // Check confirmations
            const confirmations = parseInt(tx.confirmations || '0');
            if (confirmations < this.MIN_CONFIRMATIONS.BEP20) {
                return {
                    verified: false,
                    status: 'pending',
                    confirmations,
                    message: `ธุรกรรมยังไม่ได้รับการยืนยันเพียงพอ (${confirmations}/${this.MIN_CONFIRMATIONS.BEP20})`
                };
            }

            // Calculate amount (USDT BEP20 has 18 decimals)
            const actualAmount = parseFloat(tx.value) / 1e18;

            if (actualAmount < expectedAmount * 0.99) {
                return { 
                    verified: false, 
                    status: 'insufficient_amount', 
                    actualAmount, 
                    toAddress: tx.to, 
                    message: `ยอดไม่ตรง: ได้รับ ${actualAmount} USDT แต่คาดหวัง ${expectedAmount} USDT` 
                };
            }

            this.logger.log(`[BEP20] ✅ Verification SUCCESS! Amount: ${actualAmount} USDT, Confirmations: ${confirmations}`);
            return {
                verified: true,
                status: 'success',
                actualAmount,
                fromAddress: tx.from,
                toAddress: tx.to,
                timestamp: tx.timeStamp ? new Date(parseInt(tx.timeStamp) * 1000) : new Date(),
                confirmations,
                message: 'ตรวจสอบสำเร็จ',
            };
        } catch (error: any) {
            this.logger.error(`[BEP20] Verification error: ${error.message}`);
            return { verified: false, status: 'error', message: 'เกิดข้อผิดพลาดในการตรวจสอบ BEP20' };
        }
    }
}

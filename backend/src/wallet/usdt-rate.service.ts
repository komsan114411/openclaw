import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

/**
 * USDT Rate Service
 *
 * Fetches live USDT/THB exchange rate from Binance API.
 * Used to calculate THB credits from USDT deposits.
 */
@Injectable()
export class UsdtRateService {
    private readonly logger = new Logger(UsdtRateService.name);

    // Cache rate for 60 seconds to reduce API calls
    private cachedRate: { rate: number; timestamp: number } | null = null;
    private readonly CACHE_TTL_MS = 60 * 1000; // 60 seconds

    /**
     * Get current USDT/THB exchange rate from Binance
     * Uses caching to reduce API calls
     */
    async getUsdtThbRate(): Promise<{ rate: number; source: string; updatedAt: Date }> {
        try {
            // Check cache
            if (this.cachedRate && Date.now() - this.cachedRate.timestamp < this.CACHE_TTL_MS) {
                this.logger.debug(`Using cached USDT/THB rate: ${this.cachedRate.rate}`);
                return {
                    rate: this.cachedRate.rate,
                    source: 'binance (cached)',
                    updatedAt: new Date(this.cachedRate.timestamp),
                };
            }

            // Fetch from Binance
            const response = await axios.get(
                'https://api.binance.com/api/v3/ticker/price?symbol=USDTTHB',
                { timeout: 5000 }
            );

            const rate = parseFloat(response.data.price);

            if (isNaN(rate) || rate <= 0) {
                throw new Error('Invalid rate received from Binance');
            }

            // Update cache
            this.cachedRate = { rate, timestamp: Date.now() };

            this.logger.log(`Fetched USDT/THB rate from Binance: ${rate}`);

            return {
                rate,
                source: 'binance',
                updatedAt: new Date(),
            };
        } catch (error: any) {
            this.logger.error(`Failed to fetch USDT/THB rate: ${error.message}`);

            // Return cached rate if available
            if (this.cachedRate) {
                this.logger.warn(`Using stale cached rate: ${this.cachedRate.rate}`);
                return {
                    rate: this.cachedRate.rate,
                    source: 'binance (stale cache)',
                    updatedAt: new Date(this.cachedRate.timestamp),
                };
            }

            // Fallback to default rate
            const fallbackRate = 35.0;
            this.logger.warn(`Using fallback rate: ${fallbackRate}`);
            return {
                rate: fallbackRate,
                source: 'fallback',
                updatedAt: new Date(),
            };
        }
    }

    /**
     * Calculate THB credits from USDT amount
     */
    calculateThbCredits(usdtAmount: number, rate: number): number {
        if (usdtAmount <= 0 || rate <= 0) {
            return 0;
        }
        // Round down to avoid fractional credits
        return Math.floor(usdtAmount * rate);
    }

    /**
     * Get current rate and calculate credits in one call
     */
    async getCreditsForUsdt(usdtAmount: number): Promise<{
        usdtAmount: number;
        rate: number;
        thbCredits: number;
        source: string;
    }> {
        const rateInfo = await this.getUsdtThbRate();
        const thbCredits = this.calculateThbCredits(usdtAmount, rateInfo.rate);

        return {
            usdtAmount,
            rate: rateInfo.rate,
            thbCredits,
            source: rateInfo.source,
        };
    }
}

import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

/**
 * USDT Rate Service
 *
 * Fetches live USDT/THB exchange rate from CoinGecko API (primary) or Binance (fallback).
 * CoinGecko provides accurate THB rates (~31.45 THB).
 */
@Injectable()
export class UsdtRateService {
    private readonly logger = new Logger(UsdtRateService.name);

    // Cache rate for 60 seconds to reduce API calls
    private cachedRate: { rate: number; timestamp: number; source: string } | null = null;
    private readonly CACHE_TTL_MS = 60 * 1000; // 60 seconds

    /**
     * Get current USDT/THB exchange rate
     * Primary: CoinGecko API (accurate THB rate)
     * Fallback: Binance API
     */
    async getUsdtThbRate(): Promise<{ rate: number; source: string; updatedAt: Date }> {
        try {
            // Check cache
            if (this.cachedRate && Date.now() - this.cachedRate.timestamp < this.CACHE_TTL_MS) {
                this.logger.debug(`Using cached USDT/THB rate: ${this.cachedRate.rate}`);
                return {
                    rate: this.cachedRate.rate,
                    source: `${this.cachedRate.source} (cached)`,
                    updatedAt: new Date(this.cachedRate.timestamp),
                };
            }

            // Try CoinGecko first (more accurate THB rate)
            let rate: number | null = null;
            let source = '';

            try {
                const response = await axios.get(
                    'https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=thb',
                    { timeout: 5000 }
                );

                if (response.data?.tether?.thb) {
                    rate = parseFloat(response.data.tether.thb);
                    source = 'coingecko';
                    this.logger.log(`Fetched USDT/THB rate from CoinGecko: ${rate}`);
                }
            } catch (cgError: any) {
                this.logger.warn(`CoinGecko API failed: ${cgError.message}, trying Binance...`);
            }

            // Fallback to Binance if CoinGecko fails
            if (!rate || rate <= 0) {
                try {
                    const response = await axios.get(
                        'https://api.binance.com/api/v3/ticker/price?symbol=USDTTHB',
                        { timeout: 5000 }
                    );

                    if (response.data?.price) {
                        rate = parseFloat(response.data.price);
                        source = 'binance';
                        this.logger.log(`Fetched USDT/THB rate from Binance: ${rate}`);
                    }
                } catch (binanceError: any) {
                    this.logger.warn(`Binance API also failed: ${binanceError.message}`);
                }
            }

            if (!rate || isNaN(rate) || rate <= 0) {
                throw new Error('Could not fetch rate from any source');
            }

            // Update cache
            this.cachedRate = { rate, timestamp: Date.now(), source };

            return {
                rate,
                source,
                updatedAt: new Date(),
            };
        } catch (error: any) {
            this.logger.error(`Failed to fetch USDT/THB rate: ${error.message}`);

            // Return cached rate if available
            if (this.cachedRate) {
                this.logger.warn(`Using stale cached rate: ${this.cachedRate.rate}`);
                return {
                    rate: this.cachedRate.rate,
                    source: `${this.cachedRate.source} (stale)`,
                    updatedAt: new Date(this.cachedRate.timestamp),
                };
            }

            // Fallback to approximate rate (based on current market ~31.45)
            const fallbackRate = 31.50;
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


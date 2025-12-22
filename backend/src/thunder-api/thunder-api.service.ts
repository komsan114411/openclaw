import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios, { AxiosInstance } from 'axios';
import { SystemSettings, SystemSettingsDocument } from '../database/schemas/system-settings.schema';

export interface ThunderApiQuota {
  application: string;
  usedQuota: number;
  maxQuota: number;
  remainingQuota: number;
  expiredAt: string;
  currentCredit: number;
}

export interface ThunderApiResponse {
  status: number;
  data?: ThunderApiQuota;
  message?: string;
}

export interface QuotaInfo {
  success: boolean;
  data?: {
    application: string;
    usedQuota: number;
    maxQuota: number;
    remainingQuota: number;
    usagePercentage: number;
    expiredAt: Date;
    daysRemaining: number;
    currentCredit: number;
    isExpired: boolean;
    isLowQuota: boolean;
  };
  error?: string;
  tokenSource?: 'database' | 'environment' | 'custom';
}

@Injectable()
export class ThunderApiService {
  private readonly logger = new Logger(ThunderApiService.name);
  private readonly apiClient: AxiosInstance;
  private readonly baseUrl = 'https://api.thunder.in.th/v1';

  constructor(
    private configService: ConfigService,
    @InjectModel(SystemSettings.name)
    private settingsModel: Model<SystemSettingsDocument>,
  ) {
    this.apiClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
    });
  }

  /**
   * ดึง API Token จากฐานข้อมูลหรือ environment variable
   */
  private async getApiToken(): Promise<{ token: string | null; source: 'database' | 'environment' }> {
    // 1. ลองดึงจากฐานข้อมูลก่อน
    try {
      const settings = await this.settingsModel.findOne({ settingsId: 'main' });
      if (settings?.slipApiKey) {
        return { token: settings.slipApiKey, source: 'database' };
      }
    } catch (error) {
      this.logger.warn('Failed to get API token from database, falling back to env');
    }

    // 2. ถ้าไม่มีในฐานข้อมูล ใช้จาก environment variable
    const envToken = this.configService.get<string>('THUNDER_API_TOKEN');
    return { token: envToken || null, source: 'environment' };
  }

  /**
   * ดึงข้อมูลโควต้า API จาก Thunder API
   * @param customToken - Access Token แบบกำหนดเอง (ถ้าไม่ระบุจะดึงจากฐานข้อมูล/env)
   */
  async getQuotaInfo(customToken?: string): Promise<QuotaInfo> {
    let token: string | null = null;
    let tokenSource: 'database' | 'environment' | 'custom' = 'custom';

    if (customToken) {
      token = customToken;
      tokenSource = 'custom';
    } else {
      const tokenInfo = await this.getApiToken();
      token = tokenInfo.token;
      tokenSource = tokenInfo.source;
    }

    if (!token) {
      return {
        success: false,
        error: 'ไม่พบ Thunder API Token กรุณาตั้งค่า Slip API Key ในหน้าตั้งค่าระบบ',
        tokenSource,
      };
    }

    try {
      this.logger.log(`Fetching Thunder API quota with token source: ${tokenSource}`);
      
      const response = await this.apiClient.get<ThunderApiResponse>('/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      this.logger.log(`Thunder API response status: ${response.status}, body status: ${response.data?.status}`);

      // Check HTTP status first (axios returns 200 for successful requests)
      // Then check the API response body status
      const httpSuccess = response.status === 200;
      const apiStatus = response.data?.status;
      const apiData = response.data?.data;

      // Handle successful response - check both HTTP 200 and API status 200
      // API status could be number or string depending on server response
      if (httpSuccess && (apiStatus === 200 || String(apiStatus) === '200') && apiData) {
        const data = apiData;
        const expiredAt = new Date(data.expiredAt);
        const now = new Date();
        const daysRemaining = Math.ceil((expiredAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const usagePercentage = (data.usedQuota / data.maxQuota) * 100;
        const isExpired = expiredAt < now;
        const isLowQuota = data.remainingQuota < (data.maxQuota * 0.1); // น้อยกว่า 10%

        return {
          success: true,
          data: {
            application: data.application,
            usedQuota: data.usedQuota,
            maxQuota: data.maxQuota,
            remainingQuota: data.remainingQuota,
            usagePercentage: Math.round(usagePercentage * 100) / 100,
            expiredAt,
            daysRemaining: Math.max(0, daysRemaining),
            currentCredit: data.currentCredit,
            isExpired,
            isLowQuota,
          },
          tokenSource,
        };
      }

      // If HTTP is 200 but API returns data directly (without wrapper)
      // Try to parse the response.data directly as quota info
      if (httpSuccess && response.data && typeof response.data === 'object') {
        const directData = response.data as any;
        if (directData.application !== undefined && directData.remainingQuota !== undefined) {
          const expiredAt = new Date(directData.expiredAt);
          const now = new Date();
          const daysRemaining = Math.ceil((expiredAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          const usagePercentage = (directData.usedQuota / directData.maxQuota) * 100;
          const isExpired = expiredAt < now;
          const isLowQuota = directData.remainingQuota < (directData.maxQuota * 0.1);

          return {
            success: true,
            data: {
              application: directData.application,
              usedQuota: directData.usedQuota,
              maxQuota: directData.maxQuota,
              remainingQuota: directData.remainingQuota,
              usagePercentage: Math.round(usagePercentage * 100) / 100,
              expiredAt,
              daysRemaining: Math.max(0, daysRemaining),
              currentCredit: directData.currentCredit,
              isExpired,
              isLowQuota,
            },
            tokenSource,
          };
        }
      }

      this.logger.warn(`Unexpected Thunder API response structure: ${JSON.stringify(response.data)}`);
      return {
        success: false,
        error: response.data?.message || 'ไม่สามารถดึงข้อมูลโควต้าได้ - รูปแบบข้อมูลไม่ถูกต้อง',
        tokenSource,
      };
    } catch (error: any) {
      this.logger.error(`Failed to get Thunder API quota: ${error.message}`);
      
      // Log more details for debugging
      if (error.response) {
        this.logger.error(`Thunder API error response: status=${error.response.status}, data=${JSON.stringify(error.response.data)}`);
      }

      if (error.response) {
        const status = error.response.status;
        const message = error.response.data?.message;

        switch (status) {
          case 401:
            return {
              success: false,
              error: 'Token ไม่ถูกต้องหรือหมดอายุ กรุณาตรวจสอบ Slip API Key ในหน้าตั้งค่าระบบ',
              tokenSource,
            };
          case 403:
            return {
              success: false,
              error: 'ไม่มีสิทธิ์เข้าถึง API กรุณาตรวจสอบสิทธิ์ของ Token',
              tokenSource,
            };
          case 500:
            return {
              success: false,
              error: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์ Thunder กรุณาลองใหม่ภายหลัง',
              tokenSource,
            };
          default:
            return {
              success: false,
              error: message || `เกิดข้อผิดพลาด (HTTP ${status})`,
              tokenSource,
            };
        }
      }

      // Handle network errors
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return {
          success: false,
          error: 'การเชื่อมต่อ Thunder API หมดเวลา กรุณาลองใหม่อีกครั้ง',
          tokenSource,
        };
      }

      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        return {
          success: false,
          error: 'ไม่สามารถเชื่อมต่อ Thunder API ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต',
          tokenSource,
        };
      }

      return {
        success: false,
        error: 'ไม่สามารถเชื่อมต่อกับ Thunder API ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต',
        tokenSource,
      };
    }
  }

  /**
   * ตรวจสอบว่า API ยังใช้งานได้หรือไม่
   */
  async checkApiHealth(customToken?: string): Promise<{ healthy: boolean; message: string; tokenSource?: string }> {
    const quotaInfo = await this.getQuotaInfo(customToken);

    if (!quotaInfo.success) {
      return {
        healthy: false,
        message: quotaInfo.error || 'ไม่สามารถตรวจสอบสถานะ API ได้',
        tokenSource: quotaInfo.tokenSource,
      };
    }

    if (quotaInfo.data?.isExpired) {
      return {
        healthy: false,
        message: 'API Token หมดอายุแล้ว กรุณาต่ออายุ',
        tokenSource: quotaInfo.tokenSource,
      };
    }

    if (quotaInfo.data?.remainingQuota === 0) {
      return {
        healthy: false,
        message: 'โควต้าหมดแล้ว กรุณาซื้อเพิ่ม',
        tokenSource: quotaInfo.tokenSource,
      };
    }

    if (quotaInfo.data?.isLowQuota) {
      return {
        healthy: true,
        message: `โควต้าเหลือน้อย (${quotaInfo.data.remainingQuota} ครั้ง) กรุณาพิจารณาซื้อเพิ่ม`,
        tokenSource: quotaInfo.tokenSource,
      };
    }

    return {
      healthy: true,
      message: 'API พร้อมใช้งาน',
      tokenSource: quotaInfo.tokenSource,
    };
  }
}

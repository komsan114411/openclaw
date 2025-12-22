import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

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
}

@Injectable()
export class ThunderApiService {
  private readonly logger = new Logger(ThunderApiService.name);
  private readonly apiClient: AxiosInstance;
  private readonly baseUrl = 'https://api.thunder.in.th/v1';

  constructor(private configService: ConfigService) {
    this.apiClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
    });
  }

  /**
   * ดึงข้อมูลโควต้า API จาก Thunder API
   * @param accessToken - Access Token สำหรับเรียก API
   */
  async getQuotaInfo(accessToken?: string): Promise<QuotaInfo> {
    const token = accessToken || this.configService.get<string>('THUNDER_API_TOKEN');

    if (!token) {
      return {
        success: false,
        error: 'ไม่พบ Thunder API Token กรุณาตั้งค่า THUNDER_API_TOKEN ใน environment variables',
      };
    }

    try {
      const response = await this.apiClient.get<ThunderApiResponse>('/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.data.status === 200 && response.data.data) {
        const data = response.data.data;
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
        };
      }

      return {
        success: false,
        error: response.data.message || 'ไม่สามารถดึงข้อมูลโควต้าได้',
      };
    } catch (error: any) {
      this.logger.error(`Failed to get Thunder API quota: ${error.message}`);

      if (error.response) {
        const status = error.response.status;
        const message = error.response.data?.message;

        switch (status) {
          case 401:
            return {
              success: false,
              error: 'Token ไม่ถูกต้องหรือหมดอายุ กรุณาตรวจสอบ THUNDER_API_TOKEN',
            };
          case 403:
            return {
              success: false,
              error: 'ไม่มีสิทธิ์เข้าถึง API กรุณาตรวจสอบสิทธิ์ของ Token',
            };
          case 500:
            return {
              success: false,
              error: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์ Thunder กรุณาลองใหม่ภายหลัง',
            };
          default:
            return {
              success: false,
              error: message || `เกิดข้อผิดพลาด (HTTP ${status})`,
            };
        }
      }

      return {
        success: false,
        error: 'ไม่สามารถเชื่อมต่อกับ Thunder API ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต',
      };
    }
  }

  /**
   * ตรวจสอบว่า API ยังใช้งานได้หรือไม่
   */
  async checkApiHealth(accessToken?: string): Promise<{ healthy: boolean; message: string }> {
    const quotaInfo = await this.getQuotaInfo(accessToken);

    if (!quotaInfo.success) {
      return {
        healthy: false,
        message: quotaInfo.error || 'ไม่สามารถตรวจสอบสถานะ API ได้',
      };
    }

    if (quotaInfo.data?.isExpired) {
      return {
        healthy: false,
        message: 'API Token หมดอายุแล้ว กรุณาต่ออายุ',
      };
    }

    if (quotaInfo.data?.remainingQuota === 0) {
      return {
        healthy: false,
        message: 'โควต้าหมดแล้ว กรุณาซื้อเพิ่ม',
      };
    }

    if (quotaInfo.data?.isLowQuota) {
      return {
        healthy: true,
        message: `โควต้าเหลือน้อย (${quotaInfo.data.remainingQuota} ครั้ง) กรุณาพิจารณาซื้อเพิ่ม`,
      };
    }

    return {
      healthy: true,
      message: 'API พร้อมใช้งาน',
    };
  }
}

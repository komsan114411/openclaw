import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { Bank, BankDocument } from '../database/schemas/bank.schema';
import { SystemSettingsService } from '../system-settings/system-settings.service';

// Default Thai banks data
const DEFAULT_BANKS = [
  { code: 'KBANK', bankId: '004', name: 'ธนาคารกสิกรไทย', shortName: 'กสิกร', color: '#138f2d' },
  { code: 'SCB', bankId: '014', name: 'ธนาคารไทยพาณิชย์', shortName: 'ไทยพาณิชย์', color: '#4e2e7f' },
  { code: 'KTB', bankId: '006', name: 'ธนาคารกรุงไทย', shortName: 'กรุงไทย', color: '#1ba5e0' },
  { code: 'BBL', bankId: '002', name: 'ธนาคารกรุงเทพ', shortName: 'กรุงเทพ', color: '#1e4598' },
  { code: 'BAY', bankId: '025', name: 'ธนาคารกรุงศรีอยุธยา', shortName: 'กรุงศรี', color: '#fec43b' },
  { code: 'TTB', bankId: '011', name: 'ธนาคารทหารไทยธนชาต', shortName: 'TTB', color: '#1279be' },
  { code: 'GSB', bankId: '030', name: 'ธนาคารออมสิน', shortName: 'ออมสิน', color: '#eb198d' },
  { code: 'BAAC', bankId: '034', name: 'ธนาคารเพื่อการเกษตรและสหกรณ์', shortName: 'ธ.ก.ส.', color: '#4b9b1d' },
  { code: 'GHB', bankId: '033', name: 'ธนาคารอาคารสงเคราะห์', shortName: 'ธอส.', color: '#f58220' },
  { code: 'CIMB', bankId: '022', name: 'ธนาคารซีไอเอ็มบีไทย', shortName: 'CIMB', color: '#7e2f36' },
  { code: 'UOB', bankId: '024', name: 'ธนาคารยูโอบี', shortName: 'UOB', color: '#0b3979' },
  { code: 'LHBANK', bankId: '073', name: 'ธนาคารแลนด์แอนด์เฮ้าส์', shortName: 'LH Bank', color: '#6d6e71' },
  { code: 'KKP', bankId: '069', name: 'ธนาคารเกียรตินาคินภัทร', shortName: 'KKP', color: '#199cc5' },
  { code: 'ICBC', bankId: '070', name: 'ธนาคารไอซีบีซี (ไทย)', shortName: 'ICBC', color: '#c50f1c' },
  { code: 'TISCO', bankId: '067', name: 'ธนาคารทิสโก้', shortName: 'TISCO', color: '#12549f' },
  { code: 'TCD', bankId: '071', name: 'ธนาคารไทยเครดิตเพื่อรายย่อย', shortName: 'TCD', color: '#00a859' },
  { code: 'EXIM', bankId: '035', name: 'ธนาคารเพื่อการส่งออกและนำเข้า', shortName: 'EXIM', color: '#0066b3' },
  { code: 'SME', bankId: '098', name: 'ธนาคารพัฒนาวิสาหกิจขนาดกลางและขนาดย่อม', shortName: 'SME', color: '#003c71' },
  { code: 'PROMPTPAY', bankId: 'PROMPTPAY', name: 'พร้อมเพย์', shortName: 'พร้อมเพย์', color: '#1e4e8c' },
  { code: 'TRUEMONEY', bankId: 'TRUEMONEY', name: 'ทรูมันนี่', shortName: 'TrueMoney', color: '#ff6600' },
];

// Thunder API Bank ID to Database Code mapping
const THUNDER_BANK_ID_MAP: Record<string, string> = {
  '002': 'BBL',      // กรุงเทพ
  '004': 'KBANK',    // กสิกรไทย  
  '006': 'KTB',      // กรุงไทย
  '011': 'TTB',      // ทหารไทยธนชาต
  '014': 'SCB',      // ไทยพาณิชย์
  '022': 'CIMB',     // ซีไอเอ็มบีไทย
  '024': 'UOB',      // ยูโอบี
  '025': 'BAY',      // กรุงศรีอยุธยา
  '030': 'GSB',      // ออมสิน
  '033': 'GHB',      // อาคารสงเคราะห์
  '034': 'BAAC',     // ธ.ก.ส.
  '035': 'EXIM',     // ธนาคารเพื่อการส่งออกและนำเข้า
  '067': 'TISCO',    // ทิสโก้
  '069': 'KKP',      // เกียรตินาคินภัทร
  '070': 'ICBC',     // ไอซีบีซี
  '071': 'TCD',      // ไทยเครดิตเพื่อรายย่อย
  '073': 'LHBANK',   // แลนด์แอนด์เฮ้าส์
  '098': 'SME',      // พัฒนาวิสาหกิจ
};

@Injectable()
export class BanksService {
  private readonly logger = new Logger(BanksService.name);

  constructor(
    @InjectModel(Bank.name) private bankModel: Model<BankDocument>,
    private systemSettingsService: SystemSettingsService,
  ) { }

  /**
   * Get all banks (active only)
   */
  async getAll(): Promise<BankDocument[]> {
    return this.bankModel
      .find({ isActive: true })
      .sort({ sortOrder: 1, name: 1 })
      .exec();
  }

  /**
   * Get all banks for admin (including inactive)
   */
  async getAllForAdmin(): Promise<BankDocument[]> {
    return this.bankModel
      .find({})
      .sort({ sortOrder: 1, name: 1 })
      .exec();
  }

  /**
   * Get bank by code (supports both numeric Thunder ID and short code)
   */
  async getByCode(code: string): Promise<BankDocument | null> {
    const normalizedCode = code.toUpperCase().trim();

    // Check if input is a numeric Thunder API bank ID
    const mappedCode = THUNDER_BANK_ID_MAP[normalizedCode] || normalizedCode;

    // Try to find by code
    let bank = await this.bankModel.findOne({ code: mappedCode.toUpperCase() });

    // If not found and input looks like a short name, try to find by shortName
    if (!bank) {
      bank = await this.bankModel.findOne({
        $or: [
          { code: normalizedCode },
          { shortName: { $regex: new RegExp(`^${normalizedCode}$`, 'i') } },
        ]
      });
    }

    return bank;
  }

  /**
   * Get bank by ID
   */
  async getById(id: string): Promise<BankDocument> {
    const bank = await this.bankModel.findById(id);
    if (!bank) {
      throw new NotFoundException('Bank not found');
    }
    return bank;
  }

  /**
   * Create bank
   */
  async create(data: {
    code: string;
    name: string;
    nameTh?: string;
    nameEn?: string;
    shortName?: string;
    color?: string;
    logoUrl?: string;
  }): Promise<BankDocument> {
    return this.bankModel.create({
      ...data,
      code: data.code.toUpperCase(),
    });
  }

  /**
   * Update bank
   */
  async update(
    id: string,
    data: Partial<{
      name: string;
      nameTh?: string;
      nameEn?: string;
      shortName?: string;
      color?: string;
      logoUrl?: string;
      isActive?: boolean;
      sortOrder?: number;
    }>,
  ): Promise<BankDocument> {
    const bank = await this.bankModel.findByIdAndUpdate(id, data, { new: true });
    if (!bank) {
      throw new NotFoundException('Bank not found');
    }
    return bank;
  }

  /**
   * Deactivate bank (soft delete) - banks cannot be hard deleted
   */
  async deactivate(id: string): Promise<BankDocument> {
    const bank = await this.bankModel.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    );
    if (!bank) {
      throw new NotFoundException('Bank not found');
    }
    return bank;
  }

  /**
   * Validate and normalize bank code
   * @returns normalized bank code or null if invalid
   */
  private validateAndNormalizeBankCode(code: any): string | null {
    if (!code || typeof code !== 'string') {
      return null;
    }
    const normalized = code.toUpperCase().trim();
    return normalized || null;
  }

  /**
   * Process bank data from Thunder API
   */
  private async processBankData(
    bankData: any,
    errors: string[],
  ): Promise<{ imported: boolean; updated: boolean }> {
    try {
      const bankCode = this.validateAndNormalizeBankCode(bankData.code);
      if (!bankCode) {
        errors.push('Skipped bank with empty code');
        return { imported: false, updated: false };
      }

      const bankInfo = {
        name: bankData.name?.th || bankData.name,
        nameTh: bankData.name?.th,
        nameEn: bankData.name?.en,
        shortName: bankData.short,
        color: bankData.color,
        logoUrl: bankData.logo,
      };

      const existing = await this.bankModel.findOne({ code: bankCode });
      if (existing) {
        await this.bankModel.updateOne(
          { code: bankCode },
          { ...bankInfo, isActive: true },
        );
        return { imported: false, updated: true };
      } else {
        await this.bankModel.create({
          code: bankCode,
          ...bankInfo,
        });
        return { imported: true, updated: false };
      }
    } catch (err: any) {
      const bankCode = bankData.code || 'unknown';
      // Log detailed error for debugging
      this.logger.error(`Failed to process bank ${bankCode}:`, err);
      // Add generic error message to response
      errors.push(`Failed to process bank ${bankCode}`);
      return { imported: false, updated: false };
    }
  }

  /**
   * Initialize default banks
   */
  async initDefaultBanks(): Promise<{ created: number; skipped: number }> {
    let created = 0;
    let skipped = 0;

    for (const bank of DEFAULT_BANKS) {
      const existing = await this.bankModel.findOne({ code: bank.code });
      if (existing) {
        skipped++;
        continue;
      }

      await this.bankModel.create({
        ...bank,
        nameTh: bank.name,
        sortOrder: DEFAULT_BANKS.indexOf(bank),
      });
      created++;
    }

    return { created, skipped };
  }

  /**
   * Import banks from Thunder API
   */
  async importFromThunderApi(apiKey: string): Promise<{ imported: number; errors: string[] }> {
    const errors: string[] = [];
    let imported = 0;

    try {
      const response = await axios.get('https://api.thunder.in.th/v1/banks', {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 30000,
      });

      if (response.data?.data) {
        for (const bankData of response.data.data) {
          const result = await this.processBankData(bankData, errors);
          if (result.imported) {
            imported++;
          }
        }
      }
    } catch (error: any) {
      errors.push(`API Error: ${error.message}`);
    }

    return { imported, errors };
  }

  /**
   * Sync banks from Thunder API using system API key
   */
  async syncFromThunderUsingSystemKey(): Promise<{ imported: number; updated: number; errors: string[] }> {
    const settings = await this.systemSettingsService.getSettings();
    const apiKey = settings?.slipApiKey;

    if (!apiKey) {
      throw new BadRequestException('Slip API Key ยังไม่ได้ตั้งค่า กรุณาตั้งค่าใน System Settings');
    }

    const errors: string[] = [];
    let imported = 0;
    let updated = 0;

    try {
      const response = await axios.get('https://api.thunder.in.th/v1/banks', {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 30000,
      });

      if (response.data?.data) {
        for (const bankData of response.data.data) {
          const result = await this.processBankData(bankData, errors);
          if (result.imported) {
            imported++;
          } else if (result.updated) {
            updated++;
          }
        }
      }
    } catch (error: any) {
      if (error.response?.status === 401) {
        throw new BadRequestException('API Key ไม่ถูกต้อง กรุณาตรวจสอบ Slip API Key');
      }
      errors.push(`API Error: ${error.message}`);
    }

    this.logger.log(`Thunder sync completed: ${imported} imported, ${updated} updated, ${errors.length} errors`);
    return { imported, updated, errors };
  }


  /**
   * Get bank logo
   */
  async getBankLogo(code: string): Promise<{ contentType: string; data: Buffer } | null> {
    // Use getByCode to handle both numeric IDs and short codes
    const bank = await this.getByCode(code);

    if (!bank) {
      this.logger.warn(`[BANK LOGO] Bank not found for code: ${code}`);
      return null;
    }

    // If we have base64 logo stored
    if (bank.logoBase64) {
      const matches = bank.logoBase64.match(/^data:(.+);base64,(.+)$/);
      if (matches) {
        return {
          contentType: matches[1],
          data: Buffer.from(matches[2], 'base64'),
        };
      }
    }

    // If we have logo URL, fetch it
    if (bank.logoUrl) {
      try {
        const response = await axios.get(bank.logoUrl, {
          responseType: 'arraybuffer',
          timeout: 10000,
        });

        const contentType = response.headers['content-type'] || 'image/png';
        const data = Buffer.from(response.data);

        // Cache the logo
        const base64 = `data:${contentType};base64,${data.toString('base64')}`;
        await this.bankModel.updateOne({ _id: bank._id }, { logoBase64: base64 });

        return { contentType, data };
      } catch (error) {
        this.logger.error(`Failed to fetch bank logo for ${code}:`, error);
      }
    }

    return null;
  }

  /**
   * Upload bank logo
   */
  async uploadLogo(id: string, buffer: Buffer, mimeType: string): Promise<BankDocument> {
    const bank = await this.bankModel.findById(id);
    if (!bank) {
      throw new NotFoundException('Bank not found');
    }

    const base64 = `data:${mimeType};base64,${buffer.toString('base64')}`;
    bank.logoBase64 = base64;
    bank.logoUrl = ''; // Clear URL when uploading file
    await bank.save();

    return bank;
  }


  /**
   * Escape special regex characters to prevent ReDoS attacks
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Search banks (with ReDoS protection)
   */
  async search(query: string): Promise<BankDocument[]> {
    // Validate and sanitize input
    if (!query || typeof query !== 'string') {
      return [];
    }

    // Limit query length to prevent abuse
    const sanitizedQuery = query.trim().slice(0, 50);
    if (!sanitizedQuery) {
      return [];
    }

    // Escape special regex characters to prevent ReDoS
    const escapedQuery = this.escapeRegex(sanitizedQuery);
    const regex = new RegExp(escapedQuery, 'i');

    return this.bankModel
      .find({
        isActive: true,
        $or: [
          { code: regex },
          { name: regex },
          { nameTh: regex },
          { nameEn: regex },
          { shortName: regex },
        ],
      })
      .sort({ sortOrder: 1 })
      .limit(20)
      .exec();
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { BankCode } from '../constants/bank-codes';
import { ParsedMessage, THAI_MONTHS, convertThaiYear, parseThaiMonth } from '../interfaces/parsed-message.interface';

/**
 * Message Parser Service
 *
 * Parses Thai bank notification messages to extract transaction data.
 * Supports SCB, KBANK, GSB, and other Thai banks.
 */
@Injectable()
export class MessageParserService {
  private readonly logger = new Logger(MessageParserService.name);

  /**
   * Parse a bank message and extract transaction data
   */
  parseMessage(rawMessage: string, bankCode: string): ParsedMessage {
    const result: ParsedMessage = {
      type: 'unknown',
      amount: 0,
      bankCode,
      rawMessage,
      success: false,
    };

    if (!rawMessage || rawMessage.trim().length === 0) {
      result.error = 'Empty message';
      return result;
    }

    try {
      switch (bankCode) {
        case BankCode.SCB:
          return this.parseSCBMessage(rawMessage, bankCode);
        case BankCode.KBANK:
          return this.parseKBANKMessage(rawMessage, bankCode);
        case BankCode.GSB:
          return this.parseGSBMessage(rawMessage, bankCode);
        default:
          return this.parseGenericMessage(rawMessage, bankCode);
      }
    } catch (error: any) {
      result.error = error.message;
      this.logger.warn(`[Parser] Failed to parse message for ${bankCode}: ${error.message}`);
      return result;
    }
  }

  /**
   * Parse SCB (Siam Commercial Bank) messages
   * Format: "เงินเข้า 1,234.56 บาท ยอดเงินที่ใช้ได้ 5,000.00 บาท 12/01/2024 @10:30"
   */
  private parseSCBMessage(rawMessage: string, bankCode: string): ParsedMessage {
    const result: ParsedMessage = {
      type: 'unknown',
      amount: 0,
      bankCode,
      rawMessage,
      success: false,
    };

    // Detect transaction type
    const typeMatch = rawMessage.match(/(เงินเข้า|เงินออก|โอนเงิน)/);
    if (typeMatch) {
      if (typeMatch[1] === 'เงินเข้า') {
        result.type = 'deposit';
      } else if (typeMatch[1] === 'เงินออก' || typeMatch[1] === 'โอนเงิน') {
        result.type = 'withdraw';
      }
    }

    // Extract amount
    const amountMatch = rawMessage.match(/([\d,]+\.\d{2})\s*บาท/);
    if (amountMatch) {
      result.amount = this.parseThaiAmount(amountMatch[1]);
    }

    // Extract balance
    const balanceMatch = rawMessage.match(/ยอดเงินที่ใช้ได้\s*([\d,]+\.\d{2})\s*บาท/);
    if (balanceMatch) {
      result.balance = this.parseThaiAmount(balanceMatch[1]);
    }

    // Extract date and time - format: "12/01/2024 @10:30" or "12/01/67 @10:30"
    const dateTimeMatch = rawMessage.match(/(\d{2})\/(\d{2})\/(\d{2,4})\s*@?\s*(\d{2}:\d{2})/);
    if (dateTimeMatch) {
      result.transactionDate = this.parseThaiDate(
        dateTimeMatch[1],
        dateTimeMatch[2],
        dateTimeMatch[3],
      );
      result.transactionTime = dateTimeMatch[4];
    }

    // Extract counterparty (if available)
    const counterpartyMatch = rawMessage.match(/จาก\s*(.+?)(?:\s|$)/);
    if (counterpartyMatch) {
      result.counterparty = counterpartyMatch[1].trim();
    }

    result.success = result.type !== 'unknown' && result.amount > 0;
    return result;
  }

  /**
   * Parse KBANK (Kasikorn Bank) messages
   * Format: "เงินเข้า จำนวนเงิน 1,000.00 บาท ยอดเงินคงเหลือ 50,000.00 บาท วันที่ 27 เม.ย. 2568"
   */
  private parseKBANKMessage(rawMessage: string, bankCode: string): ParsedMessage {
    const result: ParsedMessage = {
      type: 'unknown',
      amount: 0,
      bankCode,
      rawMessage,
      success: false,
    };

    // Detect transaction type
    const typeMatch = rawMessage.match(/(เงินเข้า|โอน\/ถอน|ถอนเงิน|โอนเงิน)/);
    if (typeMatch) {
      if (typeMatch[1] === 'เงินเข้า') {
        result.type = 'deposit';
      } else {
        result.type = 'withdraw';
      }
    }

    // Extract amount - KBANK format: "จำนวนเงิน 1,000.00 บาท" or "-1,000.00 บาท"
    const amountMatch = rawMessage.match(/จำนวนเงิน\s*-?([\d,]+\.\d{2})\s*บาท/);
    if (amountMatch) {
      result.amount = this.parseThaiAmount(amountMatch[1]);
    } else {
      // Fallback pattern
      const fallbackMatch = rawMessage.match(/-?([\d,]+\.\d{2})\s*บาท/);
      if (fallbackMatch) {
        result.amount = this.parseThaiAmount(fallbackMatch[1]);
      }
    }

    // Extract balance
    const balanceMatch = rawMessage.match(/ยอดเงินคงเหลือ\s*([\d,]+\.\d{2})\s*บาท/);
    if (balanceMatch) {
      result.balance = this.parseThaiAmount(balanceMatch[1]);
    }

    // Extract Thai date - format: "27 เม.ย. 2568"
    const thaiDateMatch = rawMessage.match(/วันที่\s*(\d{1,2})\s*(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)\s*(\d{4})/);
    if (thaiDateMatch) {
      const day = parseInt(thaiDateMatch[1], 10);
      const month = parseThaiMonth(thaiDateMatch[2]);
      const year = convertThaiYear(parseInt(thaiDateMatch[3], 10));
      if (month) {
        result.transactionDate = new Date(year, month - 1, day);
      }
    }

    result.success = result.type !== 'unknown' && result.amount > 0;
    return result;
  }

  /**
   * Parse GSB (Government Savings Bank) messages
   * Format: "เงินเข้า 500.00 บาท คงเหลือ 10,000.00 บาท วันที่ 27 เม.ย. 2568 เวลา 10:22 น."
   */
  private parseGSBMessage(rawMessage: string, bankCode: string): ParsedMessage {
    const result: ParsedMessage = {
      type: 'unknown',
      amount: 0,
      bankCode,
      rawMessage,
      success: false,
    };

    // Detect transaction type
    const typeMatch = rawMessage.match(/(เงินเข้า|เงินออก|โอนเงิน)/);
    if (typeMatch) {
      if (typeMatch[1] === 'เงินเข้า') {
        result.type = 'deposit';
      } else {
        result.type = 'withdraw';
      }
    }

    // Extract amount - first amount in message
    const amountMatch = rawMessage.match(/(เงินเข้า|เงินออก)\s*([\d,]+\.\d{2})\s*บาท/);
    if (amountMatch) {
      result.amount = this.parseThaiAmount(amountMatch[2]);
    } else {
      const fallbackMatch = rawMessage.match(/([\d,]+\.\d{2})\s*บาท/);
      if (fallbackMatch) {
        result.amount = this.parseThaiAmount(fallbackMatch[1]);
      }
    }

    // Extract balance - "คงเหลือ" pattern
    const balanceMatch = rawMessage.match(/คงเหลือ\s*([\d,]+\.\d{2})\s*บาท/);
    if (balanceMatch) {
      result.balance = this.parseThaiAmount(balanceMatch[1]);
    }

    // Extract Thai date - format: "27 เม.ย. 2568"
    const thaiDateMatch = rawMessage.match(/วันที่\s*(\d{1,2})\s*(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)\s*(\d{4})/);
    if (thaiDateMatch) {
      const day = parseInt(thaiDateMatch[1], 10);
      const month = parseThaiMonth(thaiDateMatch[2]);
      const year = convertThaiYear(parseInt(thaiDateMatch[3], 10));
      if (month) {
        result.transactionDate = new Date(year, month - 1, day);
      }
    }

    // Extract time - "เวลา 10:22 น."
    const timeMatch = rawMessage.match(/เวลา\s*(\d{2}:\d{2})\s*น\./);
    if (timeMatch) {
      result.transactionTime = timeMatch[1];
    }

    result.success = result.type !== 'unknown' && result.amount > 0;
    return result;
  }

  /**
   * Generic parser for other banks
   */
  private parseGenericMessage(rawMessage: string, bankCode: string): ParsedMessage {
    const result: ParsedMessage = {
      type: 'unknown',
      amount: 0,
      bankCode,
      rawMessage,
      success: false,
    };

    // Generic deposit detection
    if (rawMessage.includes('เงินเข้า') || rawMessage.includes('รับโอน') || rawMessage.includes('รับเงิน')) {
      result.type = 'deposit';
    } else if (rawMessage.includes('เงินออก') || rawMessage.includes('โอนออก') || rawMessage.includes('จ่ายเงิน') || rawMessage.includes('ถอนเงิน')) {
      result.type = 'withdraw';
    }

    // Generic amount extraction
    const amountMatch = rawMessage.match(/([\d,]+\.\d{2})\s*บาท/);
    if (amountMatch) {
      result.amount = this.parseThaiAmount(amountMatch[1]);
    }

    // Generic balance extraction
    const balancePatterns = [
      /ยอดเงินที่ใช้ได้\s*([\d,]+\.\d{2})/,
      /ยอดเงินคงเหลือ\s*([\d,]+\.\d{2})/,
      /คงเหลือ\s*([\d,]+\.\d{2})/,
      /ยอดคงเหลือ\s*([\d,]+\.\d{2})/,
    ];

    for (const pattern of balancePatterns) {
      const match = rawMessage.match(pattern);
      if (match) {
        result.balance = this.parseThaiAmount(match[1]);
        break;
      }
    }

    result.success = result.type !== 'unknown' && result.amount > 0;
    return result;
  }

  /**
   * Parse Thai formatted amount string to number
   * "1,234.56" -> 1234.56
   */
  private parseThaiAmount(amountStr: string): number {
    if (!amountStr) return 0;
    const cleaned = amountStr.replace(/,/g, '');
    return parseFloat(cleaned) || 0;
  }

  /**
   * Parse Thai date components to Date object
   */
  private parseThaiDate(day: string, month: string, year: string): Date {
    let yearNum = parseInt(year, 10);

    // Handle 2-digit year (e.g., "67" -> 2567 -> 2024)
    if (yearNum < 100) {
      yearNum += 2500; // Assume Buddhist era
    }

    // Convert Buddhist year to Christian year if needed
    if (yearNum > 2500) {
      yearNum = convertThaiYear(yearNum);
    }

    const monthNum = parseInt(month, 10) - 1; // JavaScript months are 0-indexed
    const dayNum = parseInt(day, 10);

    return new Date(yearNum, monthNum, dayNum);
  }

  /**
   * Batch parse multiple messages
   */
  parseMessages(messages: Array<{ rawMessage: string; bankCode: string }>): ParsedMessage[] {
    return messages.map(({ rawMessage, bankCode }) => this.parseMessage(rawMessage, bankCode));
  }

  /**
   * Validate if a message is a valid bank notification
   */
  isValidBankMessage(rawMessage: string): boolean {
    // Check for common Thai bank notification patterns
    const patterns = [
      /เงินเข้า/,
      /เงินออก/,
      /โอนเงิน/,
      /ถอนเงิน/,
      /รับโอน/,
      /บาท/,
    ];

    return patterns.some(pattern => pattern.test(rawMessage));
  }
}

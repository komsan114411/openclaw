import { Types } from 'mongoose';
import { BadRequestException } from '@nestjs/common';

/**
 * Validate MongoDB ObjectId format
 */
export function isValidObjectId(id: string): boolean {
  return Types.ObjectId.isValid(id) && new Types.ObjectId(id).toString() === id;
}

/**
 * Validate and throw if ObjectId is invalid
 */
export function validateObjectId(id: string, fieldName: string = 'ID'): void {
  if (!isValidObjectId(id)) {
    throw new BadRequestException(`Invalid ${fieldName} format`);
  }
}

/**
 * Sanitize string input to prevent injection
 */
export function sanitizeString(input: string, maxLength: number = 1000): string {
  if (!input || typeof input !== 'string') {
    return '';
  }
  // Remove null bytes and trim
  return input.replace(/\0/g, '').trim().slice(0, maxLength);
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone number format (Thai)
 */
export function isValidThaiPhone(phone: string): boolean {
  const phoneRegex = /^(0[689]\d{8}|0[23457]\d{7})$/;
  return phoneRegex.test(phone.replace(/[-\s]/g, ''));
}

/**
 * Validate amount is positive number
 */
export function isValidAmount(amount: number): boolean {
  return typeof amount === 'number' && !isNaN(amount) && amount > 0 && isFinite(amount);
}

/**
 * Validate LINE User ID format
 */
export function isValidLineUserId(userId: string): boolean {
  // LINE User IDs start with 'U' and are 33 characters long
  return /^U[a-f0-9]{32}$/.test(userId);
}

/**
 * Validate LINE Channel ID format
 */
export function isValidLineChannelId(channelId: string): boolean {
  // LINE Channel IDs are numeric strings
  return /^\d{10}$/.test(channelId);
}

/**
 * Escape special characters for use in regex
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parse and validate pagination parameters
 */
export function parsePagination(
  page?: string | number,
  limit?: string | number,
  maxLimit: number = 100,
): { page: number; limit: number; skip: number } {
  const parsedPage = Math.max(1, parseInt(String(page || 1), 10) || 1);
  const parsedLimit = Math.min(maxLimit, Math.max(1, parseInt(String(limit || 20), 10) || 20));
  
  return {
    page: parsedPage,
    limit: parsedLimit,
    skip: (parsedPage - 1) * parsedLimit,
  };
}

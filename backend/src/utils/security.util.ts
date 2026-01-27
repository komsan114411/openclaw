
import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class SecurityUtil {
    private readonly logger = new Logger(SecurityUtil.name);
    private readonly algorithm = 'aes-256-gcm';
    private readonly secretKey: Buffer;

    constructor() {
        const secret = process.env.APP_SECRET;

        // CRITICAL: Require APP_SECRET in production
        if (!secret) {
            if (process.env.NODE_ENV === 'production') {
                this.logger.error('❌ CRITICAL: APP_SECRET environment variable is required in production!');
                throw new Error('APP_SECRET is required in production');
            }
            // Development fallback with warning
            this.logger.warn('⚠️ WARNING: Using development encryption key. Set APP_SECRET for production!');
            // Use a deterministic dev key (NOT for production)
            this.secretKey = crypto.scryptSync('dev-only-insecure-key-change-me!', 'dev-salt', 32);
        } else {
            // Use proper key derivation with unique salt per-app
            const salt = crypto.createHash('sha256').update(secret + '-salt').digest();
            this.secretKey = crypto.scryptSync(secret, salt, 32);
        }
    }

    encrypt(text: string): string {
        if (!text) return text;
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(this.algorithm, this.secretKey, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag().toString('hex');
        // Format: iv:authTag:encrypted
        return `${iv.toString('hex')}:${authTag}:${encrypted}`;
    }

    decrypt(text: string): string {
        if (!text || !text.includes(':')) return text; // return as-is if not in our format
        try {
            const [ivHex, authTagHex, encryptedHex] = text.split(':');
            if (!ivHex || !authTagHex || !encryptedHex) return text;

            const iv = Buffer.from(ivHex, 'hex');
            const authTag = Buffer.from(authTagHex, 'hex');
            const decipher = crypto.createDecipheriv(this.algorithm, this.secretKey, iv);

            decipher.setAuthTag(authTag);
            let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        } catch (error) {
            // If decryption fails (e.g. key changed or invalid format), return original or empty
            return text;
        }
    }

    mask(text: string): string {
        if (!text || text.length < 8) return '********';
        const start = text.slice(0, 4);
        const end = text.slice(-4);
        return `${start}....${end}`;
    }
}

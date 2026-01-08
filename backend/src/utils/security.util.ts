
import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class SecurityUtil {
    private readonly algorithm = 'aes-256-gcm';
    // Use a fixed key derived from app secret or a secure env var in production.
    // For this context, we'll derive it from a default or env.
    private readonly secretKey: Buffer;

    constructor() {
        const secret = process.env.APP_SECRET || 'default-secure-key-32-chars-long!!';
        // Ensure key is 32 bytes
        this.secretKey = crypto.scryptSync(secret, 'salt', 32);
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

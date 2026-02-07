import * as crypto from 'crypto';

const ENCRYPTION_IV_LENGTH = 16;
const ENCRYPTION_SALT_LENGTH = 16;
const ENCRYPTION_KEY_LENGTH = 32;
const ENCRYPTION_ALGORITHM = 'aes-256-cbc';

// Legacy static salt — only used for decrypting old 2-part format data
const LEGACY_STATIC_SALT = 'salt';

/**
 * Encrypt a password using AES-256-CBC with a random salt per encryption.
 *
 * @param password - The plain text password to encrypt
 * @param encryptionKey - The encryption key (will be derived using scrypt)
 * @returns The encrypted password in format: iv:salt:encryptedData (all hex encoded)
 */
export function encryptPassword(password: string, encryptionKey: string): string {
  const iv = crypto.randomBytes(ENCRYPTION_IV_LENGTH);
  const salt = crypto.randomBytes(ENCRYPTION_SALT_LENGTH);
  const key = crypto.scryptSync(encryptionKey, salt, ENCRYPTION_KEY_LENGTH);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

  let encrypted = cipher.update(password, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return iv.toString('hex') + ':' + salt.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt a password that was encrypted using encryptPassword.
 * Supports both legacy (iv:encrypted) and new (iv:salt:encrypted) formats.
 *
 * @param encryptedPassword - The encrypted password
 * @param encryptionKey - The same encryption key used for encryption
 * @returns The decrypted plain text password
 * @throws Error if the encrypted password format is invalid
 */
export function decryptPassword(encryptedPassword: string, encryptionKey: string): string {
  const parts = encryptedPassword.split(':');

  let iv: Buffer;
  let salt: Buffer | string;
  let encrypted: string;

  if (parts.length === 3) {
    // New format: iv:salt:encrypted
    iv = Buffer.from(parts[0], 'hex');
    salt = Buffer.from(parts[1], 'hex');
    encrypted = parts[2];
  } else if (parts.length === 2) {
    // Legacy format: iv:encrypted (static salt)
    iv = Buffer.from(parts[0], 'hex');
    salt = LEGACY_STATIC_SALT;
    encrypted = parts[1];
  } else {
    throw new Error('Invalid encrypted password format');
  }

  const key = crypto.scryptSync(encryptionKey, salt, ENCRYPTION_KEY_LENGTH);
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

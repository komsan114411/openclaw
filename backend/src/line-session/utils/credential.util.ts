import * as crypto from 'crypto';

const ENCRYPTION_IV_LENGTH = 16;
const ENCRYPTION_KEY_LENGTH = 32;
const ENCRYPTION_ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_SALT = 'salt';

/**
 * Encrypt a password using AES-256-CBC
 *
 * @param password - The plain text password to encrypt
 * @param encryptionKey - The encryption key (will be derived using scrypt)
 * @returns The encrypted password in format: iv:encryptedData (both hex encoded)
 *
 * @example
 * const encrypted = encryptPassword('myPassword', 'my-secret-key');
 * // Returns: "a1b2c3d4...:e5f6g7h8..."
 */
export function encryptPassword(password: string, encryptionKey: string): string {
  const iv = crypto.randomBytes(ENCRYPTION_IV_LENGTH);
  const key = crypto.scryptSync(encryptionKey, ENCRYPTION_SALT, ENCRYPTION_KEY_LENGTH);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

  let encrypted = cipher.update(password, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt a password that was encrypted using encryptPassword
 *
 * @param encryptedPassword - The encrypted password in format: iv:encryptedData
 * @param encryptionKey - The same encryption key used for encryption
 * @returns The decrypted plain text password
 * @throws Error if the encrypted password format is invalid
 *
 * @example
 * const decrypted = decryptPassword('a1b2c3d4...:e5f6g7h8...', 'my-secret-key');
 * // Returns: "myPassword"
 */
export function decryptPassword(encryptedPassword: string, encryptionKey: string): string {
  const parts = encryptedPassword.split(':');

  if (parts.length !== 2) {
    throw new Error('Invalid encrypted password format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const key = crypto.scryptSync(encryptionKey, ENCRYPTION_SALT, ENCRYPTION_KEY_LENGTH);
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

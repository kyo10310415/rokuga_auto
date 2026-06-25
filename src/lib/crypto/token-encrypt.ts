import crypto from 'crypto'
import { env } from '@/lib/env'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

/**
 * 文字列を暗号化して返す
 * 形式: iv:authTag:encryptedData (すべてhex)
 */
export function encrypt(plaintext: string): string {
  const key = Buffer.from(env.ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32))
  const iv = crypto.randomBytes(IV_LENGTH)
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  
  const authTag = cipher.getAuthTag()
  
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
}

/**
 * 暗号化された文字列を復号して返す
 */
export function decrypt(ciphertext: string): string {
  const key = Buffer.from(env.ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32))
  
  const parts = ciphertext.split(':')
  if (parts.length !== 3) {
    throw new Error('不正な暗号化データ形式です')
  }
  
  const [ivHex, authTagHex, encryptedHex] = parts
  
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  
  return decrypted
}

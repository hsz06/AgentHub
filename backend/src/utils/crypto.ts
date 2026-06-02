import crypto from 'crypto'

interface EncryptedValue {
  iv: string
  tag: string
  value: string
}

function getEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET
  if (!secret) {
    throw new Error('ENCRYPTION_KEY is not configured')
  }
  return crypto.createHash('sha256').update(secret).digest()
}

export function encryptSecret(value: string): EncryptedValue {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    value: encrypted.toString('base64')
  }
}

export function decryptSecret(payload: EncryptedValue): string {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    Buffer.from(payload.iv, 'base64')
  )
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(payload.value, 'base64')),
    decipher.final()
  ]).toString('utf8')
}


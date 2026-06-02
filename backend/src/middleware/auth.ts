import { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'

export interface AuthenticatedRequest extends Request {
  userId?: string
}

interface TokenPayload {
  sub: string
  email: string
}

interface PreviewTokenPayload {
  sub: string
  deploymentId: string
  purpose: 'preview'
}

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is not configured')
  return secret
}

export function issueToken(userId: string, email: string): string {
  return jwt.sign({ sub: userId, email }, jwtSecret(), { expiresIn: '7d' })
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, jwtSecret()) as TokenPayload
}

export function issuePreviewToken(userId: string, deploymentId: string) {
  return jwt.sign({ sub: userId, deploymentId, purpose: 'preview' }, jwtSecret(), { expiresIn: '1h' })
}

export function verifyPreviewToken(token: string): PreviewTokenPayload {
  const payload = jwt.verify(token, jwtSecret()) as PreviewTokenPayload
  if (payload.purpose !== 'preview') throw new Error('Invalid preview token')
  return payload
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' })
  }
  try {
    req.userId = verifyToken(token).sub
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

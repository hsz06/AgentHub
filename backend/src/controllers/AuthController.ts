import { Response } from 'express'
import bcrypt from 'bcryptjs'
import prisma from '../utils/prisma'
import { AuthenticatedRequest, issueToken } from '../middleware/auth'

function publicUser(user: { id: string; name: string; email: string; createdAt: Date }) {
  return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt }
}

export async function register(req: AuthenticatedRequest, res: Response) {
  const { name, email, password } = req.body
  if (!name || !email || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'name, email and password of at least 8 characters are required' })
  }
  const normalizedEmail = String(email).trim().toLowerCase()
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } })
  if (existing) return res.status(409).json({ error: 'Email already registered' })

  const user = await prisma.user.create({
    data: {
      name: String(name).trim(),
      email: normalizedEmail,
      passwordHash: await bcrypt.hash(password, 12)
    }
  })
  res.status(201).json({ token: issueToken(user.id, user.email), user: publicUser(user) })
}

export async function login(req: AuthenticatedRequest, res: Response) {
  const email = String(req.body.email || '').trim().toLowerCase()
  const password = String(req.body.password || '')
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid email or password' })
  }
  res.json({ token: issueToken(user.id, user.email), user: publicUser(user) })
}

export async function me(req: AuthenticatedRequest, res: Response) {
  const user = await prisma.user.findUnique({
    where: { id: req.userId! },
    select: { id: true, name: true, email: true, createdAt: true }
  })
  if (!user) return res.status(404).json({ error: 'User not found' })
  res.json(user)
}

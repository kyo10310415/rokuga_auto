import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const MAX_AGE = 10 * 60
const CALLBACK_PATH = '/api/google/callback'

function signingKey() {
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET
  if (!secret || secret.length < 32) throw new Error('OAuth flow signing key is unavailable')
  return secret
}

export function flowCookieOptions() {
  const secure = new URL(process.env.NEXTAUTH_URL!).protocol === 'https:'
  return {
    name: secure ? '__Secure-rokuga-google-flow' : 'rokuga-google-flow',
    httpOnly: true, secure, sameSite: 'lax' as const, path: CALLBACK_PATH, maxAge: MAX_AGE,
  }
}

export function issueOAuthFlow(userId: string, now = Date.now()) {
  const state = randomBytes(32).toString('base64url')
  const verifier = randomBytes(32).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ userId, state, verifier, issuedAt: now })).toString('base64url')
  const signature = createHmac('sha256', signingKey()).update('rokuga-google-flow.v1.').update(payload).digest('base64url')
  return {
    state, cookie: `${payload}.${signature}`,
    challenge: createHash('sha256').update(verifier).digest('base64url'),
  }
}

export function verifyOAuthFlow(cookie: string | undefined, state: string | null, userId: string, now = Date.now()) {
  if (!cookie || cookie.length > 2048 || !state || !/^[\w-]{43}$/.test(state)) return null
  try {
    const parts = cookie.split('.')
    if (parts.length !== 2 || !/^[\w-]+$/.test(parts[0]) || !/^[\w-]{43}$/.test(parts[1])) return null
    const expected = createHmac('sha256', signingKey()).update('rokuga-google-flow.v1.').update(parts[0]).digest()
    const signature = Buffer.from(parts[1], 'base64url')
    if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) return null
    const flow = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'))
    if (flow.userId !== userId || flow.state !== state || typeof flow.verifier !== 'string' ||
        !/^[\w-]{43}$/.test(flow.verifier) || !Number.isSafeInteger(flow.issuedAt) ||
        flow.issuedAt > now || now - flow.issuedAt > MAX_AGE * 1000) return null
    return { verifier: flow.verifier }
  } catch { return null }
}

import { createHash, randomBytes } from 'crypto'

// Single agent credential: `chm_<64 hex>` returned once at register, sha256 at rest.
export function generateAgentToken(): string {
  return `chm_${randomBytes(32).toString('hex')}`
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

import { createHmac } from 'crypto'

export function buildMentionWebhookHeaders(input: {
  tokenHash: string
  body: string
  messageId: string
  now?: Date
}): Record<string, string> {
  const timestamp = Math.floor((input.now ?? new Date()).getTime() / 1000).toString()
  const chamberSignature = createHmac('sha256', input.tokenHash)
    .update(input.body)
    .digest('hex')
  const hermesSignature = createHmac('sha256', input.tokenHash)
    .update(`${timestamp}.${input.body}`)
    .digest('hex')

  return {
    'Content-Type': 'application/json',
    'X-Chamber-Signature': chamberSignature,
    'X-Webhook-Signature-V2': hermesSignature,
    'X-Webhook-Timestamp': timestamp,
    'X-Request-ID': input.messageId,
  }
}

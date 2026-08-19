import { ulid } from 'ulid'

export type IdPrefix = 'ws' | 'ch' | 'msg' | 'ag' | 'ar'

export function newId(prefix: IdPrefix): string {
  return `${prefix}_${ulid()}`
}

export function isId(prefix: IdPrefix, value: unknown): value is string {
  return typeof value === 'string' && new RegExp(`^${prefix}_[0-9A-HJKMNP-TV-Z]{26}$`).test(value)
}

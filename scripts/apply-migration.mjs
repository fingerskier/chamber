// Usage: node scripts/apply-migration.mjs <migration.sql> [database override, e.g. chamber_test]
import { readFileSync } from 'fs'
import { neon } from '@neondatabase/serverless'
import { config } from 'dotenv'

config({ path: '.env.local' })

const [file, dbOverride] = process.argv.slice(2)
let url = process.env.DATABASE_URL
if (dbOverride) url = url.replace(/\/neondb(\?|$)/, `/${dbOverride}$1`)

const sql = neon(url)
const statements = readFileSync(file, 'utf8')
  .split('--> statement-breakpoint')
  .map((s) => s.trim())
  .filter(Boolean)

for (const stmt of statements) {
  await sql.query(stmt)
}
console.log(`applied ${statements.length} statements to ${new URL(url).pathname.slice(1)}`)

import { config } from 'dotenv'

config({ path: '.env.local' })

// Point the app's db client at the dedicated test database.
const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL missing')
process.env.DATABASE_URL = url.replace(/\/neondb(\?|$)/, '/chamber_test$1')

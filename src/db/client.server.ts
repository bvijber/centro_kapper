import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'

import * as schema from './schema'

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for server-side database access.')
}

const sql = neon(databaseUrl)

export const db = drizzle(sql, { schema })
export type Database = typeof db

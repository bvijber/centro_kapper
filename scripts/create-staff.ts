import fs from 'node:fs'

function loadLocalEnvironment(): void {
  const envPath = '.env.local'
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    if (separator < 1) continue
    const key = trimmed.slice(0, separator)
    const value = trimmed.slice(separator + 1).trim().replace(/^(["'])|(["'])$/g, '')
    if (!process.env[key]) process.env[key] = value
  }
}

loadLocalEnvironment()

const { STAFF_EMAIL, STAFF_PASSWORD, STAFF_NAME, STAFF_PHONE } = process.env
if (!STAFF_EMAIL || !STAFF_PASSWORD || !STAFF_NAME || !STAFF_PHONE) {
  throw new Error('Set STAFF_EMAIL, STAFF_PASSWORD, STAFF_NAME, and STAFF_PHONE in protected .env.local.')
}

const { createInitialStaffAccount } = await import('../src/auth/auth.service.server')
const user = await createInitialStaffAccount({ email: STAFF_EMAIL, password: STAFF_PASSWORD, displayName: STAFF_NAME, phone: STAFF_PHONE })
console.log(`Initial staff account created for ${user.email}. The password was not logged.`)

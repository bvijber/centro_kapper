import fs from 'node:fs'

function loadLocalEnvironment(): void {
  if (!fs.existsSync('.env.local')) return
  for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    if (separator < 1) continue
    const key = trimmed.slice(0, separator)
    const value = trimmed.slice(separator + 1).trim().replace(/^("')|("')$/g, '')
    if (!process.env[key]) process.env[key] = value
  }
}

loadLocalEnvironment()

const { OWNER_EMAIL, OWNER_PASSWORD, OWNER_NAME, OWNER_PHONE } = process.env
if (!OWNER_EMAIL || !OWNER_PASSWORD || !OWNER_NAME || !OWNER_PHONE) {
  throw new Error('Set OWNER_EMAIL, OWNER_PASSWORD, OWNER_NAME, and OWNER_PHONE in protected .env.local.')
}

const { createInitialOwnerAccount } = await import('../src/auth/auth.service.server')
const user = await createInitialOwnerAccount({ email: OWNER_EMAIL, password: OWNER_PASSWORD, displayName: OWNER_NAME, phone: OWNER_PHONE })
console.log(`Initial owner account created for ${user.email}. The password was not logged.`)

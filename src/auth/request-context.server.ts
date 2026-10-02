import { getRequestHeader, getRequestIP } from '@tanstack/react-start/server'

export function getClientIP(): string | undefined {
  return getRequestIP({ xForwardedFor: process.env.TRUSTED_PROXY === 'true' })
}

export function getRequestAuditContext() {
  return { ip: getClientIP(), userAgent: getRequestHeader('user-agent') }
}

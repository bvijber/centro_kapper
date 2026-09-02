export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_TAKEN'
  | 'VALIDATION_FAILED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'SETUP_FAILED'

export class AuthError extends Error {
  constructor(
    message: string,
    readonly code: AuthErrorCode,
  ) {
    super(message)
    this.name = 'AuthError'
  }
}

export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError
}

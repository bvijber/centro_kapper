import { describe, expect, it } from 'vitest'

import { registerServiceWorker } from './register-sw'

describe('service worker registration', () => {
  it('is a safe no-op outside supported browsers', () => {
    expect(registerServiceWorker()).toBeUndefined()
  })

  it('does not throw when service workers are unavailable', () => {
    expect(() => registerServiceWorker()).not.toThrow()
  })
})

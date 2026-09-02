import { createCsrfMiddleware, createStart } from '@tanstack/react-start'

const csrfMiddleware = createCsrfMiddleware({
  filter: ({ handlerType, request }) => handlerType === 'serverFn' && request.method === 'POST',
})

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware],
}))

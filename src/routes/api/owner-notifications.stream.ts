import { createFileRoute } from '@tanstack/react-router'

import { handleOwnerNotificationStream } from '../../notifications/owner-notification.stream.server'

/**
 * SSE-route voor interne eigenaar-notificaties.
 *
 * De route is alleen toegankelijk voor de ingelogde eigenaar; de identiteit
 * volgt uit het sessiecookie. De stroom bezorgt uitsluitend een signaal dat er
 * een nieuwe melding beschikbaar is; de meldingen zelf worden opgehaald via
 * de beveiligde Server Functions.
 */
export const Route = createFileRoute('/api/owner-notifications/stream')({
  server: {
    handlers: {
      GET: async ({ request }) => handleOwnerNotificationStream(request),
    },
  },
})

import { db } from './client.server'
import { bookingSettings, businessProfile, openingHours } from './schema/business'
import { services } from './schema/services'

// DEVELOPMENT SEED DATA ONLY.
// The address, owner name, phone number, hours, services, and prices below are
// neutral placeholders and must be replaced with confirmed data before production.
// The owner account is intentionally not seeded: the owner is created once through
// `npm run auth:create-owner` and the database enforces a single owner account.

const developmentServices = [
  { name: 'Knippen', description: 'Ontwikkelservice voor knippen en styling.', durationMinutes: 35, priceCents: 3000 },
  { name: 'Baard trimmen', description: 'Ontwikkelservice voor vormgeven en trimmen.', durationMinutes: 25, priceCents: 2000 },
  { name: 'Knippen + baard', description: 'Ontwikkelservice voor complete verzorging.', durationMinutes: 45, priceCents: 4000 },
]

async function seed() {
  await db.insert(businessProfile).values({
      id: 1,
      name: 'Centro Kapper (ontwikkeling)',
      address: 'Ontwikkeladres, Nederland',
      phone: '+31 00 000 00 00',
      timezone: 'Europe/Amsterdam',
  }).onConflictDoNothing()

  await db.insert(openingHours).values(
      Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        isOpen: weekday < 6,
        openingTime: weekday < 6 ? '09:00' : null,
        closingTime: weekday < 6 ? '18:00' : null,
      })),
  ).onConflictDoNothing()

  await db.insert(bookingSettings).values({ id: 1 }).onConflictDoNothing()

  await db.insert(services).values(developmentServices).onConflictDoNothing()
}

seed().catch((error: unknown) => {
  console.error('Development seed failed:', error)
  process.exitCode = 1
})

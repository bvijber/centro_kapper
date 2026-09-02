import { db } from './client.server'
import { businessProfile, openingHours } from './schema/business'
import { services } from './schema/services'
import { staffProfiles } from './schema/profiles'
import { users } from './schema/users'

// DEVELOPMENT SEED DATA ONLY.
// The address, staff name, phone number, hours, services, and prices below are
// neutral placeholders and must be replaced with confirmed data before production.
const placeholderStaffId = '00000000-0000-4000-8000-000000000001'

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

  await db.insert(users).values({
      id: placeholderStaffId,
      email: 'staff.placeholder@example.test',
      passwordHash: null,
      role: 'staff',
  }).onConflictDoNothing()

  await db.insert(staffProfiles).values({
      userId: placeholderStaffId,
      displayName: 'Medewerker (ontwikkeling)',
      phone: '+31 00 000 00 01',
      active: false,
  }).onConflictDoNothing()

  await db.insert(services).values(developmentServices).onConflictDoNothing()
}

seed().catch((error: unknown) => {
  console.error('Development seed failed:', error)
  process.exitCode = 1
})

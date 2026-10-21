// Test-only database routing.
//
// Wanneer TEST_DATABASE_URL is gezet, gebruiken alle tests die database als
// DATABASE_URL. Zonder TEST_DATABASE_URL verandert er niets: bestaande
// `skipIf(!databaseAvailable)`-tests blijven overgeslagen en de applicatie-
// configuratie (.env.local, drizzle.config.ts, client.server.ts) is ongewijzigd.
//
// TEST_DATABASE_URL mag uitsluitend verwijzen naar een expliciet als
// niet-productie aangewezen testdatabase. De naam alleen bewijst niets;
// een productiedatabase mag hier nooit worden ingevuld.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
}

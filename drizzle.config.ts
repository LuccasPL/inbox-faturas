import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';

// drizzle-kit CLI não carrega .env.local automaticamente
config({ path: '.env.local' });

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});

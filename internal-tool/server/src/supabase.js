import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load server/.env by ABSOLUTE path so creds resolve regardless of launch cwd
// (`npm run server` runs from server/, `npm run start` from internal-tool/).
// In production the file doesn't exist and Cloud Run injects env vars directly,
// so dotenv just no-ops. This is the first module to load env, before the
// Supabase client below and before qa-runner reads E2E_* / PREPROD vars.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn(
    '[internal-tool] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set. API routes will not work.'
  );
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    headers: { 'x-connection-timeout': '30000' },
  },
});

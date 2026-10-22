const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  });
}

const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const ROYAL_BAKER_ID = 'e99fb445-d15e-4208-a8e6-0108ffdbe32a';

async function clear() {
  console.log(`[CLEAR] Resetting Royal Baker business data (${ROYAL_BAKER_ID})...`);

  // Clear daily_expenses
  const { error: expErr } = await sb.from('daily_expenses').delete().eq('business_id', ROYAL_BAKER_ID);
  if (!expErr) {
    console.log('[CLEAR] Cleared daily_expenses from Supabase.');
  }

  // Reset _b2b_clients in business record
  const { data: biz } = await sb.from('businesses').select('*').eq('id', ROYAL_BAKER_ID).single();
  if (biz) {
    const cleanModules = { ...(biz.enabled_modules || {}) };
    delete cleanModules._b2b_clients;
    await sb.from('businesses').update({ enabled_modules: cleanModules }).eq('id', ROYAL_BAKER_ID);
    console.log('[CLEAR] Reset partner clients in Supabase.');
  }

  console.log('[CLEAR] Royal Baker server records reset successfully.');
  console.log('To clear client-side localStorage in the browser, simply run localStorage.clear() in the browser console.');
}

clear();

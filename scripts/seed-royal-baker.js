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

const DEMO_STORES = [
  {
    id: "store-chai",
    name: "Chai Galli Cafe",
    phone: "+91 91234 56789",
    address: "Plot 14, OMR Service Road, Thoraipakkam, Chennai - 600097",
  },
  {
    id: "store-bloom",
    name: "Brew & Bloom Cafe",
    phone: "+91 97890 12345",
    address: "4th Main Road, Besant Nagar, Chennai - 600090",
  },
  {
    id: "store-kumba",
    name: "Kumbakonam Degree Coffee Partner",
    phone: "+91 94441 23456",
    address: "PTC Quarters, Karapakkam, OMR, Chennai - 600097",
  },
  {
    id: "store-corner",
    name: "The Corner Roast",
    phone: "+91 99887 76655",
    address: "No. 88, IT Expressway, Sholinganallur, Chennai - 600119",
  },
  {
    id: "store-madras",
    name: "Madras Chai Co",
    phone: "+91 98840 55667",
    address: "Kandanchavadi Industrial Estate, Perungudi, Chennai - 600096",
  },
  {
    id: "store-mambakkam",
    name: "BFT Mambakkam",
    phone: "+91 81483 21018",
    address: "Medavakkam - Mambakkam Main Rd, Mambakkam, Chennai - 600127",
  },
  {
    id: "store-urban",
    name: "Urban Bean Roasters",
    phone: "+91 98402 33445",
    address: "Lattice Bridge Road, Adyar, Chennai - 600020",
  },
  {
    id: "store-navalur",
    name: "Brown Fening Tea - Navalur",
    phone: "+91 81483 21017",
    address: "255, Rajiv Gandhi Salai (OMR), Navalur, Chennai - 600130",
    business_id: "a0000000-0000-0000-0000-000000000001",
  },
  {
    id: "store-french",
    name: "The French Loaf Partner Cafe",
    phone: "+91 98842 11223",
    address: "100 Feet Bypass Road, Velachery, Chennai - 600042",
  },
];

async function seed() {
  console.log(`[SEED] Fetching Royal Baker business (${ROYAL_BAKER_ID})...`);
  const { data: biz, error: bizErr } = await sb
    .from('businesses')
    .select('*')
    .eq('id', ROYAL_BAKER_ID)
    .single();

  if (bizErr) {
    console.error('[SEED] Failed to fetch Royal Baker:', bizErr);
    process.exit(1);
  }

  console.log('[SEED] Business columns:', Object.keys(biz));

  const updatedModules = {
    ...(biz.enabled_modules || {}),
    baker_mode: true,
    b2b_bridge: true,
    invoices: true,
    expenses: true,
    sales: true,
    stock: true,
    contacts: true,
    upi_id: "royalbaker@okaxis",
    _b2b_clients: DEMO_STORES,
  };

  const updatePayload = {
    name: "Royal Baker",
    slug: "royal-baker",
    enabled_modules: updatedModules,
    is_active: true,
  };

  if ("phone" in biz) updatePayload.phone = "+91 98765 43210";
  if ("address" in biz) updatePayload.address = "Plot 42, Central Bakery Lane, Guindy Industrial Estate, Chennai, Tamil Nadu - 600032";
  if ("gstin" in biz) updatePayload.gstin = "33AABCR1234F1Z5";
  if ("upi_id" in biz) updatePayload.upi_id = "royalbaker@okaxis";

  console.log('[SEED] Updating Royal Baker business profile and partner clients...');
  const { data: updated, error: updErr } = await sb
    .from('businesses')
    .update(updatePayload)
    .eq('id', ROYAL_BAKER_ID)
    .select()
    .single();

  if (updErr) {
    console.error('[SEED] Update error:', updErr);
    process.exit(1);
  }

  console.log('[SEED] Successfully updated Royal Baker in Supabase:');
  console.log(`- Name: ${updated.name}`);
  console.log(`- Slug: ${updated.slug}`);
  console.log(`- Address: ${updated.address}`);
  console.log(`- Phone: ${updated.phone}`);
  console.log(`- UPI ID: ${updated.upi_id}`);
  console.log(`- Partner Clients count: ${updated.enabled_modules._b2b_clients.length}`);

  // Seed daily_expenses if table is active
  try {
    const today = new Date().toISOString().split('T')[0];
    const sampleExpenses = [
      { business_id: ROYAL_BAKER_ID, expense_date: today, item_name: "Amul Pasteurised Butter (20kg Crate)", quantity: 1, price_cents: 1040000 },
      { business_id: ROYAL_BAKER_ID, expense_date: today, item_name: "Callebaut 54.5% Dark Chocolate (10kg)", quantity: 1, price_cents: 850000 },
      { business_id: ROYAL_BAKER_ID, expense_date: today, item_name: "500 Pcs Kraft Window Brownie Boxes", quantity: 1, price_cents: 375000 },
    ];
    await sb.from('daily_expenses').delete().eq('business_id', ROYAL_BAKER_ID);
    const { error: expErr } = await sb.from('daily_expenses').insert(sampleExpenses);
    if (!expErr) {
      console.log('[SEED] Seeded sample daily_expenses in Supabase.');
    }
  } catch (e) {
    console.log('[SEED] Note: daily_expenses table bypass (handled via localStorage cache):', e.message);
  }

  console.log('[SEED] Royal Baker server seeding complete!');
}

seed();

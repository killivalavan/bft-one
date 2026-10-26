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

  // Build complete B2B data payload
  const DEMO_PRODUCTS = [
    { id: "rb-prod-1", name: "Belgian Dark Chocolate Fudgy Brownie (Pack of 6)", category: "Brownies", rate: 380, selling_price: 380, making_cost: 160, unit_profit: 220, profit_margin_pct: 57.9, unit: "Pack", is_active: true, min_order_qty: 3, stock_available: 45 },
    { id: "rb-prod-2", name: "Salted Caramel Brownie Bites (Pack of 12)", category: "Brownies", rate: 420, selling_price: 420, making_cost: 175, unit_profit: 245, profit_margin_pct: 58.3, unit: "Pack", is_active: true, min_order_qty: 2, stock_available: 30 },
    { id: "rb-prod-3", name: "Nutella Walnut Stuffed Brownie Bar", category: "Brownies", rate: 460, selling_price: 460, making_cost: 190, unit_profit: 270, profit_margin_pct: 58.7, unit: "Pack", is_active: true, min_order_qty: 2, stock_available: 25 },
    { id: "rb-prod-4", name: "Lotus Biscoff Crumble Blondie", category: "Brownies", rate: 440, selling_price: 440, making_cost: 180, unit_profit: 260, profit_margin_pct: 59.1, unit: "Pack", is_active: true, min_order_qty: 3, stock_available: 35 },
    { id: "rb-prod-5", name: "Classic New York Baked Cheesecake Slice", category: "Cakes", rate: 160, selling_price: 160, making_cost: 65, unit_profit: 95, profit_margin_pct: 59.4, unit: "Slice", is_active: true, min_order_qty: 6, stock_available: 24 },
    { id: "rb-prod-6", name: "San Sebastian Burnt Basque Cheesecake (Whole 1kg)", category: "Cakes", rate: 1150, selling_price: 1150, making_cost: 480, unit_profit: 670, profit_margin_pct: 58.3, unit: "Unit", is_active: true, min_order_qty: 1, stock_available: 10 },
    { id: "rb-prod-7", name: "Dutch Truffle Gateau (Whole 1kg)", category: "Cakes", rate: 950, selling_price: 950, making_cost: 390, unit_profit: 560, profit_margin_pct: 58.9, unit: "Unit", is_active: true, min_order_qty: 1, stock_available: 12 },
    { id: "rb-prod-8", name: "Artisanal Country Sourdough Loaf (800g)", category: "Artisan Breads", rate: 210, selling_price: 210, making_cost: 80, unit_profit: 130, profit_margin_pct: 61.9, unit: "Loaf", is_active: true, min_order_qty: 4, stock_available: 18 },
    { id: "rb-prod-9", name: "Rosemary & Roasted Garlic Focaccia Slab", category: "Artisan Breads", rate: 240, selling_price: 240, making_cost: 95, unit_profit: 145, profit_margin_pct: 60.4, unit: "Unit", is_active: true, min_order_qty: 2, stock_available: 15 },
    { id: "rb-prod-10", name: "Multi-Grain High Fiber Sliced Sandwich Bread", category: "Artisan Breads", rate: 90, selling_price: 90, making_cost: 35, unit_profit: 55, profit_margin_pct: 61.1, unit: "Loaf", is_active: true, min_order_qty: 5, stock_available: 40 },
    { id: "rb-prod-11", name: "French Butter Brioche Slider Buns (Pack of 6)", category: "Buns & Rolls", rate: 140, selling_price: 140, making_cost: 55, unit_profit: 85, profit_margin_pct: 60.7, unit: "Pack", is_active: true, min_order_qty: 4, stock_available: 50 },
    { id: "rb-prod-12", name: "Japanese Hokkaido Milk Bread (Pain de Mie)", category: "Buns & Rolls", rate: 130, selling_price: 130, making_cost: 50, unit_profit: 80, profit_margin_pct: 61.5, unit: "Loaf", is_active: true, min_order_qty: 3, stock_available: 20 },
    { id: "rb-prod-13", name: "Pure French Butter Croissant (Extra Flaky)", category: "Pastries", rate: 95, selling_price: 95, making_cost: 38, unit_profit: 57, profit_margin_pct: 60.0, unit: "Unit", is_active: true, min_order_qty: 8, stock_available: 60 },
    { id: "rb-prod-14", name: "Pain au Chocolat (Double Callebaut Baton)", category: "Pastries", rate: 120, selling_price: 120, making_cost: 48, unit_profit: 72, profit_margin_pct: 60.0, unit: "Unit", is_active: true, min_order_qty: 6, stock_available: 40 },
    { id: "rb-prod-15", name: "Almond Frangipane Flaky Danish", category: "Pastries", rate: 135, selling_price: 135, making_cost: 54, unit_profit: 81, profit_margin_pct: 60.0, unit: "Unit", is_active: true, min_order_qty: 4, stock_available: 25 },
    { id: "rb-prod-16", name: "South Indian Spicy Chicken Tikka Puff", category: "Savories", rate: 75, selling_price: 75, making_cost: 30, unit_profit: 45, profit_margin_pct: 60.0, unit: "Unit", is_active: true, min_order_qty: 10, stock_available: 50 },
    { id: "rb-prod-17", name: "Gourmet Paneer Butter Masala Puff", category: "Savories", rate: 65, selling_price: 65, making_cost: 26, unit_profit: 39, profit_margin_pct: 60.0, unit: "Unit", is_active: true, min_order_qty: 10, stock_available: 50 },
    { id: "rb-prod-18", name: "Red Velvet Cream Cheese Jar Cake", category: "Cakes", rate: 120, selling_price: 120, making_cost: 48, unit_profit: 72, profit_margin_pct: 60.0, unit: "Unit", is_active: true, min_order_qty: 6, stock_available: 30 },
    { id: "rb-prod-19", name: "Double Choc-Chip Soft Baked Cookie (Pack of 4)", category: "Brownies", rate: 180, selling_price: 180, making_cost: 72, unit_profit: 108, profit_margin_pct: 60.0, unit: "Pack", is_active: true, min_order_qty: 5, stock_available: 40 },
  ];

  // Helper date generator
  function dOffset(daysAgo) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().split('T')[0];
  }

  // 59 realistic itemized delivery slips across 60 days
  const DEMO_INVOICES = [
    // Today
    { id: "disp-101", invoiceNumber: "SLIP-8401", date: dOffset(0), customerName: "Chai Galli Cafe", customerPhone: "+91 91234 56789", totalAmount: 4800, paidAmount: 0, balanceDue: 4800, status: "pending", delivery_status: "dispatched", vehicle_no: "TN-09-BK-4091", dispatch_driver: "Murugan S", items: [{ id: "1", name: "Belgian Dark Chocolate Fudgy Brownie (Pack of 6)", qty: 5, rate: 380, amount: 1900 }, { id: "2", name: "South Indian Spicy Chicken Tikka Puff", qty: 20, rate: 75, amount: 1500 }, { id: "3", name: "French Butter Brioche Slider Buns (Pack of 6)", qty: 10, rate: 140, amount: 1400 }] },
    { id: "disp-102", invoiceNumber: "SLIP-8402", date: dOffset(0), customerName: "Brew & Bloom Cafe", customerPhone: "+91 97890 12345", totalAmount: 6250, paidAmount: 6250, balanceDue: 0, status: "paid", delivery_status: "delivered", vehicle_no: "TN-11-CF-2210", dispatch_driver: "Rajesh K", items: [{ id: "1", name: "Pure French Butter Croissant (Extra Flaky)", qty: 30, rate: 95, amount: 2850 }, { id: "2", name: "Pain au Chocolat (Double Callebaut Baton)", qty: 15, rate: 120, amount: 1800 }, { id: "3", name: "Classic New York Baked Cheesecake Slice", qty: 10, rate: 160, amount: 1600 }] },
    { id: "disp-103", invoiceNumber: "SLIP-8403", date: dOffset(0), customerName: "The Corner Roast", customerPhone: "+91 99887 76655", totalAmount: 7370, paidAmount: 0, balanceDue: 7370, status: "pending", delivery_status: "dispatched", vehicle_no: "TN-09-BK-4091", dispatch_driver: "Murugan S", items: [{ id: "1", name: "San Sebastian Burnt Basque Cheesecake (Whole 1kg)", qty: 2, rate: 1150, amount: 2300 }, { id: "2", name: "Artisanal Country Sourdough Loaf (800g)", qty: 15, rate: 210, amount: 3150 }, { id: "3", name: "Rosemary & Roasted Garlic Focaccia Slab", qty: 8, rate: 240, amount: 1920 }] },
    // 1 day ago
    { id: "disp-104", invoiceNumber: "SLIP-8395", date: dOffset(1), customerName: "Kumbakonam Degree Coffee Partner", customerPhone: "+91 94441 23456", totalAmount: 3450, paidAmount: 3450, balanceDue: 0, status: "paid", delivery_status: "delivered", items: [{ id: "1", name: "Gourmet Paneer Butter Masala Puff", qty: 30, rate: 65, amount: 1950 }, { id: "2", name: "South Indian Spicy Chicken Tikka Puff", qty: 20, rate: 75, amount: 1500 }] },
    { id: "disp-105", invoiceNumber: "SLIP-8396", date: dOffset(1), customerName: "Madras Chai Co", customerPhone: "+91 98840 55667", totalAmount: 5150, paidAmount: 0, balanceDue: 5150, status: "pending", delivery_status: "delivered", items: [{ id: "1", name: "Belgian Dark Chocolate Fudgy Brownie (Pack of 6)", qty: 10, rate: 380, amount: 3800 }, { id: "2", name: "Multi-Grain High Fiber Sliced Sandwich Bread", qty: 15, rate: 90, amount: 1350 }] },
    // 2 days ago: Anomaly Volume Drop Stores (Navalur & French Loaf)
    { id: "disp-106", invoiceNumber: "SLIP-8388", date: dOffset(2), customerName: "Brown Fening Tea - Navalur", customerPhone: "+91 81483 21017", totalAmount: 2280, paidAmount: 2280, balanceDue: 0, status: "paid", delivery_status: "delivered", items: [{ id: "1", name: "Belgian Dark Chocolate Fudgy Brownie (Pack of 6)", qty: 6, rate: 380, amount: 2280 }] },
    { id: "disp-107", invoiceNumber: "SLIP-8389", date: dOffset(2), customerName: "The French Loaf Partner Cafe", customerPhone: "+91 98842 11223", totalAmount: 2850, paidAmount: 2850, balanceDue: 0, status: "paid", delivery_status: "delivered", items: [{ id: "1", name: "Pure French Butter Croissant (Extra Flaky)", qty: 30, rate: 95, amount: 2850 }] },
    // 3 days ago
    { id: "disp-108", invoiceNumber: "SLIP-8380", date: dOffset(3), customerName: "Chai Galli Cafe", customerPhone: "+91 91234 56789", totalAmount: 4625, paidAmount: 4625, balanceDue: 0, status: "paid", delivery_status: "delivered", items: [{ id: "1", name: "South Indian Spicy Chicken Tikka Puff", qty: 40, rate: 75, amount: 3000 }, { id: "2", name: "Gourmet Paneer Butter Masala Puff", qty: 25, rate: 65, amount: 1625 }] },
    { id: "disp-109", invoiceNumber: "SLIP-8381", date: dOffset(3), customerName: "Brew & Bloom Cafe", customerPhone: "+91 97890 12345", totalAmount: 6840, paidAmount: 6840, balanceDue: 0, status: "paid", delivery_status: "delivered", items: [{ id: "1", name: "Belgian Dark Chocolate Fudgy Brownie (Pack of 6)", qty: 18, rate: 380, amount: 6840 }] },
    // 5 days ago: Return slip
    { id: "disp-110", invoiceNumber: "RET-101", date: dOffset(5), customerName: "The Corner Roast", customerPhone: "+91 99887 76655", totalAmount: -1140, paidAmount: 0, balanceDue: -1140, status: "paid", delivery_status: "returned", notes: "Return intake: 3 packs stale brownies returned for credit note adjustment.", items: [{ id: "1", name: "Belgian Dark Chocolate Fudgy Brownie (Pack of 6) [Damaged/Return]", qty: -3, rate: 380, amount: -1140 }] },
    // 6 days ago
    { id: "disp-111", invoiceNumber: "SLIP-8360", date: dOffset(6), customerName: "Chai Galli Cafe", customerPhone: "+91 91234 56789", totalAmount: 4560, paidAmount: 4560, balanceDue: 0, status: "paid", delivery_status: "delivered", items: [{ id: "1", name: "Belgian Dark Chocolate Fudgy Brownie (Pack of 6)", qty: 12, rate: 380, amount: 4560 }] },
    // 7 days ago: Prior baseline for Navalur & French Loaf (double normal volume)
    { id: "disp-112", invoiceNumber: "SLIP-8350", date: dOffset(7), customerName: "Brown Fening Tea - Navalur", customerPhone: "+91 81483 21017", totalAmount: 4560, paidAmount: 4560, balanceDue: 0, status: "paid", delivery_status: "delivered", items: [{ id: "1", name: "Belgian Dark Chocolate Fudgy Brownie (Pack of 6)", qty: 12, rate: 380, amount: 4560 }] },
    { id: "disp-113", invoiceNumber: "SLIP-8351", date: dOffset(7), customerName: "The French Loaf Partner Cafe", customerPhone: "+91 98842 11223", totalAmount: 5700, paidAmount: 5700, balanceDue: 0, status: "paid", delivery_status: "delivered", items: [{ id: "1", name: "Pure French Butter Croissant (Extra Flaky)", qty: 60, rate: 95, amount: 5700 }] },
    // 12 days ago: Urban Bean Roasters (Reorder Cadence Overdue Trigger)
    { id: "disp-114", invoiceNumber: "SLIP-8310", date: dOffset(12), customerName: "Urban Bean Roasters", customerPhone: "+91 98402 33445", totalAmount: 5600, paidAmount: 5600, balanceDue: 0, status: "paid", delivery_status: "delivered", items: [{ id: "1", name: "Classic New York Baked Cheesecake Slice", qty: 20, rate: 160, amount: 3200 }, { id: "2", name: "Rosemary & Roasted Garlic Focaccia Slab", qty: 10, rate: 240, amount: 2400 }] },
    // 15 days ago: BFT Mambakkam (Reorder Cadence Overdue Trigger)
    { id: "disp-115", invoiceNumber: "SLIP-8280", date: dOffset(15), customerName: "BFT Mambakkam", customerPhone: "+91 81483 21018", totalAmount: 6460, paidAmount: 6460, balanceDue: 0, status: "paid", delivery_status: "delivered", items: [{ id: "1", name: "Belgian Dark Chocolate Fudgy Brownie (Pack of 6)", qty: 17, rate: 380, amount: 6460 }] },
  ];

  // 18 operational expenses
  const DEMO_EXPENSES = [
    { id: "exp-1", date: dOffset(0), name: "Amul Pasteurised Butter (20kg Crate)", category: "Dairy & Fats", amount: 10400 },
    { id: "exp-2", date: dOffset(0), name: "Callebaut 54.5% Dark Chocolate (10kg)", category: "Chocolate & Cocoa", amount: 8500 },
    { id: "exp-3", date: dOffset(0), name: "Kraft Brownie Window Delivery Boxes (500 Pcs)", category: "Packaging", amount: 3750 },
    { id: "exp-4", date: dOffset(1), name: "Commercial Baking Oven LPG Refill (2 Cylinders)", category: "Utilities & Gas", amount: 4800 },
    { id: "exp-5", date: dOffset(2), name: "King Arthur Special Sourdough Bread Flour (50kg)", category: "Flour & Grains", amount: 5200 },
    { id: "exp-6", date: dOffset(3), name: "Delivery Van Diesel (TN-09-BK-4091)", category: "Logistics & Fuel", amount: 2200 },
    { id: "exp-7", date: dOffset(4), name: "Farm Fresh Grade-A Eggs (10 Trays / 300 Nos)", category: "Eggs & Fresh", amount: 2100 },
    { id: "exp-8", date: dOffset(5), name: "D’lecta Cream Cheese Blocks (8kg)", category: "Dairy & Fats", amount: 4600 },
    { id: "exp-9", date: dOffset(7), name: "Kitchen Helper & Dishwashing Weekly Wages", category: "Labor & Wages", amount: 4500 },
    { id: "exp-10", date: dOffset(10), name: "Biodegradable Croissant Pouches & Greaseproof Paper", category: "Packaging", amount: 2900 },
  ];

  // 24 payment transactions
  const DEMO_PAYMENTS = [
    { id: "pay-1", date: dOffset(0), client_id: "store-bloom", client_name: "Brew & Bloom Cafe", amount: 6200, payment_method: "UPI", reference_no: "UPI/390192831/AXIS", recorded_by: "accounts@royalbaker.com" },
    { id: "pay-2", date: dOffset(1), client_id: "store-kumba", client_name: "Kumbakonam Degree Coffee Partner", amount: 3950, payment_method: "UPI", reference_no: "UPI/489102938/HDFC", recorded_by: "accounts@royalbaker.com" },
    { id: "pay-3", date: dOffset(2), client_id: "store-navalur", client_name: "Brown Fening Tea - Navalur", amount: 2280, payment_method: "UPI", reference_no: "UPI/559102931/ICICI", recorded_by: "accounts@royalbaker.com" },
    { id: "pay-4", date: dOffset(2), client_id: "store-french", client_name: "The French Loaf Partner Cafe", amount: 2850, payment_method: "NEFT", reference_no: "NEFT/88492019/SBI", recorded_by: "accounts@royalbaker.com" },
    { id: "pay-5", date: dOffset(3), client_id: "store-chai", client_name: "Chai Galli Cafe", amount: 5100, payment_method: "UPI", reference_no: "UPI/109283746/GPAY", recorded_by: "accounts@royalbaker.com" },
    { id: "pay-6", date: dOffset(3), client_id: "store-bloom", client_name: "Brew & Bloom Cafe", amount: 6840, payment_method: "UPI", reference_no: "UPI/998127364/AXIS", recorded_by: "accounts@royalbaker.com" },
  ];

  // 3 broadcast advisories
  const DEMO_BROADCASTS = [
    { id: "bc-1", title: "Weekend Supply Cutoff: 4:00 PM Friday", message: "To maintain fresh batch sourdough fermentation, all weekend breakfast orders must be submitted by Friday 4 PM.", category: "Production", priority: "normal", target_stores: ["All Active Stores"], created_at: dOffset(1) },
    { id: "bc-2", title: "New Product Arrival: Lotus Biscoff Blondies", message: "Available for sample dispatch starting Monday. Contact delivery desk for free tasting boxes.", category: "Product Launch", priority: "normal", target_stores: ["All Active Stores"], created_at: dOffset(4) },
    { id: "bc-3", title: "Festival Pre-Booking Advisory", message: "Diwali gifting hampers and wholesale bulk brownie orders open next week. Early-bird discount applies on 50+ units.", category: "Advisory", priority: "urgent", target_stores: ["All Active Stores"], created_at: dOffset(8) },
  ];

  const fullB2BPayload = {
    invoices: DEMO_INVOICES,
    products: DEMO_PRODUCTS,
    expenses: DEMO_EXPENSES,
    payments: DEMO_PAYMENTS,
    broadcasts: DEMO_BROADCASTS,
    lastSeeded: new Date().toISOString(),
  };

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
    _b2b_data: fullB2BPayload,
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

  console.log('[SEED] Writing full B2B payload (slips, products, expenses, payments, broadcasts) to Supabase...');
  await sb.from('businesses').update(updatePayload).eq('id', ROYAL_BAKER_ID);

  // Also update default business so mobile visitors without account switch receive the dataset
  try {
    const { data: defBiz } = await sb.from('businesses').select('enabled_modules').eq('id', 'a0000000-0000-0000-0000-000000000001').single();
    if (defBiz) {
      const defModules = {
        ...(defBiz.enabled_modules || {}),
        baker_mode: true,
        b2b_bridge: true,
        _b2b_clients: DEMO_STORES,
        _b2b_data: fullB2BPayload,
      };
      await sb.from('businesses').update({ enabled_modules: defModules }).eq('id', 'a0000000-0000-0000-0000-000000000001');
      console.log('[SEED] Populated full B2B dataset on default business for seamless mobile preview.');
    }
  } catch (e) {
    console.warn('[SEED] Note on default business update:', e.message);
  }

  console.log('[SEED] Royal Baker server seeding complete!');
}

seed();

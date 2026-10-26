import { format, subDays } from "date-fns";
import { BakerProduct } from "@/app/(protected)/b2b/products/page";
import { BakerCustomerStore } from "@/lib/utils/bakerUtils";
import { InvoiceRecord, ExpenseRecord } from "@/app/(protected)/b2b/page";
import { BakerPaymentRecord } from "@/app/(protected)/b2b/payments/page";
import { BakerBroadcast } from "@/app/(protected)/b2b/broadcasts/page";
import { B2B_CUSTOMERS_UPDATED_EVENT } from "@/lib/services/b2bClients";

export const ROYAL_BAKER_BIZ_ID = "e99fb445-d15e-4208-a8e6-0108ffdbe32a";

export const ROYAL_BAKER_STORES: BakerCustomerStore[] = [
  // 1. Healthy / Active High-Volume Stores
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

  // 2. High Dues / Credit Risk Alert Stores
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

  // 3. Reorder Overdue / Predictive Churn Alert Stores
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

  // 4. Volume Drop / Reduced Order Volume Alert Stores
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

export const ROYAL_BAKER_PRODUCTS: BakerProduct[] = [
  // Brownies & Bars
  { id: "bp-1", name: "Choco Walnut Brownie", selling_price: 45, making_cost: 20, unit_profit: 25, profit_margin_pct: 55.6, unit: "Pcs", is_active: true },
  { id: "bp-2", name: "Salted Caramel Fudge Brownie", selling_price: 50, making_cost: 22, unit_profit: 28, profit_margin_pct: 56.0, unit: "Pcs", is_active: true },

  // Tea Cakes & Breads
  { id: "bp-3", name: "Classic Tea Cake", selling_price: 30, making_cost: 12, unit_profit: 18, profit_margin_pct: 60.0, unit: "Pcs", is_active: true },
  { id: "bp-4", name: "Rich Jam Cake", selling_price: 35, making_cost: 14, unit_profit: 21, profit_margin_pct: 60.0, unit: "Pcs", is_active: true },
  { id: "bp-5", name: "Banana Walnut Bread", selling_price: 50, making_cost: 22, unit_profit: 28, profit_margin_pct: 56.0, unit: "Pcs", is_active: true },
  { id: "bp-6", name: "Lemon Drizzle Loaf Cake", selling_price: 40, making_cost: 16, unit_profit: 24, profit_margin_pct: 60.0, unit: "Pcs", is_active: true },

  // Pastries & Slices
  { id: "bp-7", name: "Red Velvet Slice", selling_price: 65, making_cost: 28, unit_profit: 37, profit_margin_pct: 56.9, unit: "Pcs", is_active: true },
  { id: "bp-8", name: "Dutch Truffle Pastry", selling_price: 70, making_cost: 30, unit_profit: 40, profit_margin_pct: 57.1, unit: "Pcs", is_active: true },
  { id: "bp-9", name: "Vanilla Cupcake", selling_price: 30, making_cost: 11, unit_profit: 19, profit_margin_pct: 63.3, unit: "Pcs", is_active: true },
  { id: "bp-10", name: "Blueberry Muffin", selling_price: 40, making_cost: 16, unit_profit: 24, profit_margin_pct: 60.0, unit: "Pcs", is_active: true },
  { id: "bp-11", name: "Double Chocolate Muffin", selling_price: 45, making_cost: 18, unit_profit: 27, profit_margin_pct: 60.0, unit: "Pcs", is_active: true },

  // Viennoiserie & Artisanal Breads
  { id: "bp-12", name: "Butter Croissant", selling_price: 55, making_cost: 24, unit_profit: 31, profit_margin_pct: 56.4, unit: "Pcs", is_active: true },
  { id: "bp-13", name: "Pain au Chocolat", selling_price: 65, making_cost: 28, unit_profit: 37, profit_margin_pct: 56.9, unit: "Pcs", is_active: true },
  { id: "bp-14", name: "Sourdough Artisan Loaf", selling_price: 80, making_cost: 32, unit_profit: 48, profit_margin_pct: 60.0, unit: "Loaf", is_active: true },
  { id: "bp-15", name: "Garlic Herb Focaccia", selling_price: 60, making_cost: 24, unit_profit: 36, profit_margin_pct: 60.0, unit: "Pcs", is_active: true },

  // Cookies & Jar Packs
  { id: "bp-16", name: "Choco Chip Cookies (Box)", selling_price: 60, making_cost: 25, unit_profit: 35, profit_margin_pct: 58.3, unit: "Box", is_active: true },
  { id: "bp-17", name: "Almond Biscotti (Jar)", selling_price: 85, making_cost: 38, unit_profit: 47, profit_margin_pct: 55.3, unit: "Jar", is_active: true },

  // Savory Bakery Snacks
  { id: "bp-18", name: "Golden Paneer Puff", selling_price: 35, making_cost: 14, unit_profit: 21, profit_margin_pct: 60.0, unit: "Pcs", is_active: true },
  { id: "bp-19", name: "Crispy Veg Samosa (Box 10)", selling_price: 120, making_cost: 50, unit_profit: 70, profit_margin_pct: 58.3, unit: "Box", is_active: true },
];

/**
 * Generates fresh, dynamically dated demo data anchored to today's date.
 * Guarantees that ALL AI detection algorithms trigger with textbook accuracy:
 * - Reorder Overdue / Not Ordering:
 *     1) BFT Mambakkam (cadence 3 days; inactive 15 days)
 *     2) Urban Bean Roasters (cadence 4 days; inactive 12 days)
 * - Volume Drop / Reduced Orders:
 *     1) Brown Fening Tea - Navalur (ordered 2d ago; volume down -60%)
 *     2) The French Loaf Partner Cafe (ordered 3d ago; volume down -63%)
 * - High Dues Alerts:
 *     1) The Corner Roast (₹18,450 unpaid, 3 slips)
 *     2) Madras Chai Co (₹12,600 unpaid, 2 slips)
 * - Normal / Healthy:
 *     1) Chai Galli Cafe (regular 2-day interval)
 *     2) Brew & Bloom Cafe (active 3-day interval)
 *     3) Kumbakonam Degree Coffee Partner (active)
 */
export function getRoyalBakerDemoData() {
  const now = new Date();

  const fmtDate = (daysAgo: number) => {
    const d = subDays(now, daysAgo);
    return format(d, "MMM dd, yyyy");
  };

  const fmtIso = (daysAgo: number, hour = 9, minute = 30) => {
    const d = subDays(now, daysAgo);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
  };

  const invoices: InvoiceRecord[] = [
    // =========================================================================
    // 1. CHAI GALLI CAFE (Healthy / Active / Regular 2-day cadence / Zero dues)
    // =========================================================================
    {
      id: "slip-cg-1",
      invoiceNumber: "DISP-1065",
      customerName: "Chai Galli Cafe",
      customerPhone: "+91 91234 56789",
      totalAmount: 4950,
      status: "paid",
      date: fmtDate(1),
      createdAt: fmtIso(1, 8, 45),
      title: "DISPATCH SLIP",
      items: [
        { name: "Choco Walnut Brownie", qty: 40, unit: "Pcs", rate: 45, amount: 1800 },
        { name: "Classic Tea Cake", qty: 40, unit: "Pcs", rate: 30, amount: 1200 },
        { name: "Butter Croissant", qty: 25, unit: "Pcs", rate: 55, amount: 1375 },
        { name: "Golden Paneer Puff", qty: 15, unit: "Pcs", rate: 35, amount: 525 },
        { name: "Vanilla Cupcake", qty: 10, unit: "Pcs", rate: 30, amount: 300 },
      ],
    },
    {
      id: "slip-cg-2",
      invoiceNumber: "DISP-1058",
      customerName: "Chai Galli Cafe",
      customerPhone: "+91 91234 56789",
      totalAmount: 4350,
      status: "paid",
      date: fmtDate(3),
      createdAt: fmtIso(3, 9, 15),
      title: "DISPATCH SLIP",
      items: [
        { name: "Salted Caramel Fudge Brownie", qty: 30, unit: "Pcs", rate: 50, amount: 1500 },
        { name: "Banana Walnut Bread", qty: 25, unit: "Pcs", rate: 50, amount: 1250 },
        { name: "Blueberry Muffin", qty: 25, unit: "Pcs", rate: 40, amount: 1000 },
        { name: "Rich Jam Cake", qty: 20, unit: "Pcs", rate: 35, amount: 700 },
      ],
    },
    {
      id: "slip-cg-3",
      invoiceNumber: "DISP-1051",
      customerName: "Chai Galli Cafe",
      customerPhone: "+91 91234 56789",
      totalAmount: 4800,
      status: "paid",
      date: fmtDate(5),
      createdAt: fmtIso(5, 8, 30),
      title: "DISPATCH SLIP",
      items: [
        { name: "Choco Walnut Brownie", qty: 50, unit: "Pcs", rate: 45, amount: 2250 },
        { name: "Classic Tea Cake", qty: 45, unit: "Pcs", rate: 30, amount: 1350 },
        { name: "Pain au Chocolat", qty: 20, unit: "Pcs", rate: 65, amount: 1300 },
      ],
    },
    {
      id: "slip-cg-4",
      invoiceNumber: "DISP-1043",
      customerName: "Chai Galli Cafe",
      customerPhone: "+91 91234 56789",
      totalAmount: 4100,
      status: "paid",
      date: fmtDate(7),
      createdAt: fmtIso(7, 9, 0),
      title: "DISPATCH SLIP",
      items: [
        { name: "Red Velvet Slice", qty: 20, unit: "Pcs", rate: 65, amount: 1300 },
        { name: "Banana Walnut Bread", qty: 30, unit: "Pcs", rate: 50, amount: 1500 },
        { name: "Double Chocolate Muffin", qty: 30, unit: "Pcs", rate: 45, amount: 1350 },
      ],
    },
    {
      id: "slip-cg-5",
      invoiceNumber: "DISP-1036",
      customerName: "Chai Galli Cafe",
      customerPhone: "+91 91234 56789",
      totalAmount: 4600,
      status: "paid",
      date: fmtDate(10),
      createdAt: fmtIso(10, 8, 45),
      title: "DISPATCH SLIP",
      items: [
        { name: "Choco Walnut Brownie", qty: 45, unit: "Pcs", rate: 45, amount: 2025 },
        { name: "Classic Tea Cake", qty: 45, unit: "Pcs", rate: 30, amount: 1350 },
        { name: "Butter Croissant", qty: 25, unit: "Pcs", rate: 55, amount: 1375 },
      ],
    },
    {
      id: "slip-cg-ret",
      invoiceNumber: "RET-102",
      customerName: "Chai Galli Cafe",
      customerPhone: "+91 91234 56789",
      totalAmount: -300,
      status: "paid",
      date: fmtDate(12),
      createdAt: fmtIso(12, 16, 20),
      title: "RETURN SLIP (UNSOLD TEA CAKE CREDIT)",
      items: [{ name: "Classic Tea Cake", qty: 10, unit: "Pcs", rate: 30, amount: -300 }],
    },
    {
      id: "slip-cg-6",
      invoiceNumber: "DISP-1028",
      customerName: "Chai Galli Cafe",
      customerPhone: "+91 91234 56789",
      totalAmount: 4300,
      status: "paid",
      date: fmtDate(14),
      createdAt: fmtIso(14, 9, 10),
      title: "DISPATCH SLIP",
      items: [
        { name: "Choco Walnut Brownie", qty: 40, unit: "Pcs", rate: 45, amount: 1800 },
        { name: "Lemon Drizzle Loaf Cake", qty: 30, unit: "Pcs", rate: 40, amount: 1200 },
        { name: "Choco Chip Cookies (Box)", qty: 25, unit: "Box", rate: 60, amount: 1500 },
      ],
    },
    {
      id: "slip-cg-7",
      invoiceNumber: "DISP-1018",
      customerName: "Chai Galli Cafe",
      customerPhone: "+91 91234 56789",
      totalAmount: 4900,
      status: "paid",
      date: fmtDate(18),
      createdAt: fmtIso(18, 9, 0),
      title: "DISPATCH SLIP",
      items: [
        { name: "Dutch Truffle Pastry", qty: 25, unit: "Pcs", rate: 70, amount: 1750 },
        { name: "Butter Croissant", qty: 30, unit: "Pcs", rate: 55, amount: 1650 },
        { name: "Banana Walnut Bread", qty: 30, unit: "Pcs", rate: 50, amount: 1500 },
      ],
    },
    {
      id: "slip-cg-8",
      invoiceNumber: "DISP-1008",
      customerName: "Chai Galli Cafe",
      customerPhone: "+91 91234 56789",
      totalAmount: 4200,
      status: "paid",
      date: fmtDate(22),
      createdAt: fmtIso(22, 9, 30),
      title: "DISPATCH SLIP",
      items: [
        { name: "Classic Tea Cake", qty: 50, unit: "Pcs", rate: 30, amount: 1500 },
        { name: "Blueberry Muffin", qty: 35, unit: "Pcs", rate: 40, amount: 1400 },
        { name: "Golden Paneer Puff", qty: 35, unit: "Pcs", rate: 35, amount: 1225 },
      ],
    },
    // Chai Galli Prior period slips (days 31-60)
    {
      id: "slip-cg-p1",
      invoiceNumber: "DISP-0985",
      customerName: "Chai Galli Cafe",
      customerPhone: "+91 91234 56789",
      totalAmount: 4500,
      status: "paid",
      date: fmtDate(35),
      createdAt: fmtIso(35, 9, 0),
      title: "DISPATCH SLIP",
      items: [{ name: "Choco Walnut Brownie", qty: 50, unit: "Pcs", rate: 45, amount: 2250 }, { name: "Classic Tea Cake", qty: 45, unit: "Pcs", rate: 30, amount: 1350 }],
    },
    {
      id: "slip-cg-p2",
      invoiceNumber: "DISP-0974",
      customerName: "Chai Galli Cafe",
      customerPhone: "+91 91234 56789",
      totalAmount: 4200,
      status: "paid",
      date: fmtDate(42),
      createdAt: fmtIso(42, 8, 45),
      title: "DISPATCH SLIP",
      items: [{ name: "Choco Walnut Brownie", qty: 40, unit: "Pcs", rate: 45, amount: 1800 }, { name: "Choco Chip Cookies (Box)", qty: 40, unit: "Box", rate: 60, amount: 2400 }],
    },
    {
      id: "slip-cg-p3",
      invoiceNumber: "DISP-0960",
      customerName: "Chai Galli Cafe",
      customerPhone: "+91 91234 56789",
      totalAmount: 4900,
      status: "paid",
      date: fmtDate(52),
      createdAt: fmtIso(52, 9, 15),
      title: "DISPATCH SLIP",
      items: [{ name: "Choco Walnut Brownie", qty: 55, unit: "Pcs", rate: 45, amount: 2475 }, { name: "Butter Croissant", qty: 30, unit: "Pcs", rate: 55, amount: 1650 }],
    },

    // =========================================================================
    // 2. THE CORNER ROAST (High Dues Alert: ₹18,450 unpaid balance across 3 slips)
    // =========================================================================
    {
      id: "slip-cr-1",
      invoiceNumber: "DISP-1064",
      customerName: "The Corner Roast",
      customerPhone: "+91 99887 76655",
      totalAmount: 6450,
      status: "unpaid",
      date: fmtDate(2),
      createdAt: fmtIso(2, 10, 15),
      title: "DISPATCH SLIP",
      items: [
        { name: "Choco Walnut Brownie", qty: 50, unit: "Pcs", rate: 45, amount: 2250 },
        { name: "Butter Croissant", qty: 40, unit: "Pcs", rate: 55, amount: 2200 },
        { name: "Blueberry Muffin", qty: 50, unit: "Pcs", rate: 40, amount: 2000 },
      ],
    },
    {
      id: "slip-cr-2",
      invoiceNumber: "DISP-1045",
      customerName: "The Corner Roast",
      customerPhone: "+91 99887 76655",
      totalAmount: 5850,
      status: "unpaid",
      date: fmtDate(8),
      createdAt: fmtIso(8, 10, 0),
      title: "DISPATCH SLIP",
      items: [
        { name: "Banana Walnut Bread", qty: 45, unit: "Pcs", rate: 50, amount: 2250 },
        { name: "Choco Chip Cookies (Box)", qty: 35, unit: "Box", rate: 60, amount: 2100 },
        { name: "Rich Jam Cake", qty: 40, unit: "Pcs", rate: 35, amount: 1400 },
      ],
    },
    {
      id: "slip-cr-3",
      invoiceNumber: "DISP-1025",
      customerName: "The Corner Roast",
      customerPhone: "+91 99887 76655",
      totalAmount: 6150,
      status: "unpaid",
      date: fmtDate(14),
      createdAt: fmtIso(14, 9, 30),
      title: "DISPATCH SLIP",
      items: [
        { name: "Choco Walnut Brownie", qty: 60, unit: "Pcs", rate: 45, amount: 2700 },
        { name: "Classic Tea Cake", qty: 50, unit: "Pcs", rate: 30, amount: 1500 },
        { name: "Butter Croissant", qty: 35, unit: "Pcs", rate: 55, amount: 1925 },
      ],
    },
    {
      id: "slip-cr-ret",
      invoiceNumber: "RET-101",
      customerName: "The Corner Roast",
      customerPhone: "+91 99887 76655",
      totalAmount: -240,
      status: "paid",
      date: fmtDate(16),
      createdAt: fmtIso(16, 17, 0),
      title: "RETURN SLIP (TRANSIT DAMAGED CUPCAKES)",
      items: [{ name: "Vanilla Cupcake", qty: 8, unit: "Pcs", rate: 30, amount: -240 }],
    },
    {
      id: "slip-cr-4",
      invoiceNumber: "DISP-1012",
      customerName: "The Corner Roast",
      customerPhone: "+91 99887 76655",
      totalAmount: 5200,
      status: "paid",
      date: fmtDate(20),
      createdAt: fmtIso(20, 10, 0),
      title: "DISPATCH SLIP",
      items: [
        { name: "Red Velvet Slice", qty: 30, unit: "Pcs", rate: 65, amount: 1950 },
        { name: "Dutch Truffle Pastry", qty: 25, unit: "Pcs", rate: 70, amount: 1750 },
        { name: "Blueberry Muffin", qty: 35, unit: "Pcs", rate: 40, amount: 1400 },
      ],
    },
    {
      id: "slip-cr-p1",
      invoiceNumber: "DISP-0988",
      customerName: "The Corner Roast",
      customerPhone: "+91 99887 76655",
      totalAmount: 5500,
      status: "paid",
      date: fmtDate(34),
      createdAt: fmtIso(34, 10, 15),
      title: "DISPATCH SLIP",
      items: [{ name: "Choco Walnut Brownie", qty: 50, unit: "Pcs", rate: 45, amount: 2250 }, { name: "Banana Walnut Bread", qty: 40, unit: "Pcs", rate: 50, amount: 2000 }],
    },

    // =========================================================================
    // 3. MADRAS CHAI CO (High Dues Alert: ₹12,600 unpaid across 2 slips)
    // =========================================================================
    {
      id: "slip-mc-1",
      invoiceNumber: "DISP-1061",
      customerName: "Madras Chai Co",
      customerPhone: "+91 98840 55667",
      totalAmount: 6800,
      status: "unpaid",
      date: fmtDate(4),
      createdAt: fmtIso(4, 9, 30),
      title: "DISPATCH SLIP",
      items: [
        { name: "Classic Tea Cake", qty: 60, unit: "Pcs", rate: 30, amount: 1800 },
        { name: "Golden Paneer Puff", qty: 60, unit: "Pcs", rate: 35, amount: 2100 },
        { name: "Crispy Veg Samosa (Box 10)", qty: 20, unit: "Box", rate: 120, amount: 2400 },
        { name: "Rich Jam Cake", qty: 15, unit: "Pcs", rate: 35, amount: 525 },
      ],
    },
    {
      id: "slip-mc-2",
      invoiceNumber: "DISP-1038",
      customerName: "Madras Chai Co",
      customerPhone: "+91 98840 55667",
      totalAmount: 5800,
      status: "unpaid",
      date: fmtDate(10),
      createdAt: fmtIso(10, 9, 15),
      title: "DISPATCH SLIP",
      items: [
        { name: "Choco Walnut Brownie", qty: 40, unit: "Pcs", rate: 45, amount: 1800 },
        { name: "Classic Tea Cake", qty: 50, unit: "Pcs", rate: 30, amount: 1500 },
        { name: "Golden Paneer Puff", qty: 50, unit: "Pcs", rate: 35, amount: 1750 },
        { name: "Vanilla Cupcake", qty: 25, unit: "Pcs", rate: 30, amount: 750 },
      ],
    },
    {
      id: "slip-mc-3",
      invoiceNumber: "DISP-1016",
      customerName: "Madras Chai Co",
      customerPhone: "+91 98840 55667",
      totalAmount: 5200,
      status: "paid",
      date: fmtDate(17),
      createdAt: fmtIso(17, 9, 45),
      title: "DISPATCH SLIP",
      items: [
        { name: "Crispy Veg Samosa (Box 10)", qty: 25, unit: "Box", rate: 120, amount: 3000 },
        { name: "Classic Tea Cake", qty: 50, unit: "Pcs", rate: 30, amount: 1500 },
        { name: "Rich Jam Cake", qty: 20, unit: "Pcs", rate: 35, amount: 700 },
      ],
    },

    // =========================================================================
    // 4. BFT MAMBAKKAM (AI Reorder Overdue: interval was 3 days, now silent 15d)
    // =========================================================================
    {
      id: "slip-mb-1",
      invoiceNumber: "DISP-1022",
      customerName: "BFT Mambakkam",
      customerPhone: "+91 81483 21018",
      totalAmount: 3450,
      status: "paid",
      date: fmtDate(15),
      createdAt: fmtIso(15, 11, 0),
      title: "DISPATCH SLIP",
      items: [
        { name: "Classic Tea Cake", qty: 45, unit: "Pcs", rate: 30, amount: 1350 },
        { name: "Rich Jam Cake", qty: 30, unit: "Pcs", rate: 35, amount: 1050 },
        { name: "Golden Paneer Puff", qty: 30, unit: "Pcs", rate: 35, amount: 1050 },
      ],
    },
    {
      id: "slip-mb-2",
      invoiceNumber: "DISP-1014",
      customerName: "BFT Mambakkam",
      customerPhone: "+91 81483 21018",
      totalAmount: 3350,
      status: "paid",
      date: fmtDate(18),
      createdAt: fmtIso(18, 10, 45),
      title: "DISPATCH SLIP",
      items: [
        { name: "Choco Walnut Brownie", qty: 30, unit: "Pcs", rate: 45, amount: 1350 },
        { name: "Classic Tea Cake", qty: 40, unit: "Pcs", rate: 30, amount: 1200 },
        { name: "Blueberry Muffin", qty: 20, unit: "Pcs", rate: 40, amount: 800 },
      ],
    },
    {
      id: "slip-mb-3",
      invoiceNumber: "DISP-1007",
      customerName: "BFT Mambakkam",
      customerPhone: "+91 81483 21018",
      totalAmount: 2900,
      status: "paid",
      date: fmtDate(21),
      createdAt: fmtIso(21, 11, 15),
      title: "DISPATCH SLIP",
      items: [
        { name: "Banana Walnut Bread", qty: 30, unit: "Pcs", rate: 50, amount: 1500 },
        { name: "Rich Jam Cake", qty: 40, unit: "Pcs", rate: 35, amount: 1400 },
      ],
    },
    {
      id: "slip-mb-4",
      invoiceNumber: "DISP-0999",
      customerName: "BFT Mambakkam",
      customerPhone: "+91 81483 21018",
      totalAmount: 3200,
      status: "paid",
      date: fmtDate(24),
      createdAt: fmtIso(24, 10, 30),
      title: "DISPATCH SLIP",
      items: [
        { name: "Classic Tea Cake", qty: 50, unit: "Pcs", rate: 30, amount: 1500 },
        { name: "Golden Paneer Puff", qty: 45, unit: "Pcs", rate: 35, amount: 1575 },
      ],
    },
    {
      id: "slip-mb-p1",
      invoiceNumber: "DISP-0993",
      customerName: "BFT Mambakkam",
      customerPhone: "+91 81483 21018",
      totalAmount: 3100,
      status: "paid",
      date: fmtDate(27),
      createdAt: fmtIso(27, 11, 0),
      title: "DISPATCH SLIP",
      items: [{ name: "Classic Tea Cake", qty: 40, unit: "Pcs", rate: 30, amount: 1200 }, { name: "Banana Walnut Bread", qty: 35, unit: "Pcs", rate: 50, amount: 1750 }],
    },
    {
      id: "slip-mb-p2",
      invoiceNumber: "DISP-0987",
      customerName: "BFT Mambakkam",
      customerPhone: "+91 81483 21018",
      totalAmount: 3400,
      status: "paid",
      date: fmtDate(30),
      createdAt: fmtIso(30, 10, 45),
      title: "DISPATCH SLIP",
      items: [{ name: "Choco Walnut Brownie", qty: 40, unit: "Pcs", rate: 45, amount: 1800 }, { name: "Rich Jam Cake", qty: 45, unit: "Pcs", rate: 35, amount: 1575 }],
    },

    // =========================================================================
    // 5. URBAN BEAN ROASTERS (AI Reorder Overdue: cadence was 4 days, silent 12d)
    // =========================================================================
    {
      id: "slip-ub-1",
      invoiceNumber: "DISP-1033",
      customerName: "Urban Bean Roasters",
      customerPhone: "+91 98402 33445",
      totalAmount: 4250,
      status: "paid",
      date: fmtDate(12),
      createdAt: fmtIso(12, 10, 30),
      title: "DISPATCH SLIP",
      items: [
        { name: "Sourdough Artisan Loaf", qty: 25, unit: "Loaf", rate: 80, amount: 2000 },
        { name: "Butter Croissant", qty: 25, unit: "Pcs", rate: 55, amount: 1375 },
        { name: "Pain au Chocolat", qty: 15, unit: "Pcs", rate: 65, amount: 975 },
      ],
    },
    {
      id: "slip-ub-2",
      invoiceNumber: "DISP-1021",
      customerName: "Urban Bean Roasters",
      customerPhone: "+91 98402 33445",
      totalAmount: 3950,
      status: "paid",
      date: fmtDate(16),
      createdAt: fmtIso(16, 10, 0),
      title: "DISPATCH SLIP",
      items: [
        { name: "Garlic Herb Focaccia", qty: 30, unit: "Pcs", rate: 60, amount: 1800 },
        { name: "Almond Biscotti (Jar)", qty: 20, unit: "Jar", rate: 85, amount: 1700 },
        { name: "Double Chocolate Muffin", qty: 10, unit: "Pcs", rate: 45, amount: 450 },
      ],
    },
    {
      id: "slip-ub-3",
      invoiceNumber: "DISP-1011",
      customerName: "Urban Bean Roasters",
      customerPhone: "+91 98402 33445",
      totalAmount: 4100,
      status: "paid",
      date: fmtDate(20),
      createdAt: fmtIso(20, 10, 15),
      title: "DISPATCH SLIP",
      items: [
        { name: "Sourdough Artisan Loaf", qty: 25, unit: "Loaf", rate: 80, amount: 2000 },
        { name: "Butter Croissant", qty: 25, unit: "Pcs", rate: 55, amount: 1375 },
        { name: "Salted Caramel Fudge Brownie", qty: 15, unit: "Pcs", rate: 50, amount: 750 },
      ],
    },
    {
      id: "slip-ub-4",
      invoiceNumber: "DISP-1001",
      customerName: "Urban Bean Roasters",
      customerPhone: "+91 98402 33445",
      totalAmount: 3800,
      status: "paid",
      date: fmtDate(24),
      createdAt: fmtIso(24, 10, 0),
      title: "DISPATCH SLIP",
      items: [
        { name: "Pain au Chocolat", qty: 30, unit: "Pcs", rate: 65, amount: 1950 },
        { name: "Almond Biscotti (Jar)", qty: 20, unit: "Jar", rate: 85, amount: 1700 },
      ],
    },

    // =========================================================================
    // 6. BROWN FENING TEA - NAVALUR (AI Volume Drop: dropped from 10 orders to 4)
    // =========================================================================
    {
      id: "slip-nv-1",
      invoiceNumber: "DISP-1062",
      customerName: "Brown Fening Tea - Navalur",
      customerPhone: "+91 81483 21017",
      totalAmount: 2600,
      status: "unpaid",
      date: fmtDate(2),
      createdAt: fmtIso(2, 8, 30),
      title: "DISPATCH SLIP",
      items: [
        { name: "Classic Tea Cake", qty: 40, unit: "Pcs", rate: 30, amount: 1200 },
        { name: "Rich Jam Cake", qty: 40, unit: "Pcs", rate: 35, amount: 1400 },
      ],
    },
    {
      id: "slip-nv-2",
      invoiceNumber: "DISP-1037",
      customerName: "Brown Fening Tea - Navalur",
      customerPhone: "+91 81483 21017",
      totalAmount: 2950,
      status: "paid",
      date: fmtDate(11),
      createdAt: fmtIso(11, 8, 30),
      title: "DISPATCH SLIP",
      items: [
        { name: "Choco Walnut Brownie", qty: 30, unit: "Pcs", rate: 45, amount: 1350 },
        { name: "Banana Walnut Bread", qty: 25, unit: "Pcs", rate: 50, amount: 1250 },
      ],
    },
    {
      id: "slip-nv-3",
      invoiceNumber: "DISP-1019",
      customerName: "Brown Fening Tea - Navalur",
      customerPhone: "+91 81483 21017",
      totalAmount: 2700,
      status: "paid",
      date: fmtDate(19),
      createdAt: fmtIso(19, 9, 0),
      title: "DISPATCH SLIP",
      items: [
        { name: "Classic Tea Cake", qty: 50, unit: "Pcs", rate: 30, amount: 1500 },
        { name: "Vanilla Cupcake", qty: 40, unit: "Pcs", rate: 30, amount: 1200 },
      ],
    },
    {
      id: "slip-nv-4",
      invoiceNumber: "DISP-1005",
      customerName: "Brown Fening Tea - Navalur",
      customerPhone: "+91 81483 21017",
      totalAmount: 2850,
      status: "paid",
      date: fmtDate(26),
      createdAt: fmtIso(26, 8, 45),
      title: "DISPATCH SLIP",
      items: [
        { name: "Choco Walnut Brownie", qty: 30, unit: "Pcs", rate: 45, amount: 1350 },
        { name: "Blueberry Muffin", qty: 35, unit: "Pcs", rate: 40, amount: 1400 },
      ],
    },
    // Heavy prior month orders (days 31-60): 10 orders -> AI calculates -60% drop
    {
      id: "slip-nv-p1",
      invoiceNumber: "DISP-0997",
      customerName: "Brown Fening Tea - Navalur",
      customerPhone: "+91 81483 21017",
      totalAmount: 3800,
      status: "paid",
      date: fmtDate(31),
      createdAt: fmtIso(31, 8, 30),
      title: "DISPATCH SLIP",
      items: [{ name: "Choco Walnut Brownie", qty: 40, unit: "Pcs", rate: 45, amount: 1800 }, { name: "Classic Tea Cake", qty: 50, unit: "Pcs", rate: 30, amount: 1500 }],
    },
    {
      id: "slip-nv-p2",
      invoiceNumber: "DISP-0992",
      customerName: "Brown Fening Tea - Navalur",
      customerPhone: "+91 81483 21017",
      totalAmount: 3600,
      status: "paid",
      date: fmtDate(34),
      createdAt: fmtIso(34, 8, 30),
      title: "DISPATCH SLIP",
      items: [{ name: "Rich Jam Cake", qty: 50, unit: "Pcs", rate: 35, amount: 1750 }, { name: "Butter Croissant", qty: 30, unit: "Pcs", rate: 55, amount: 1650 }],
    },
    {
      id: "slip-nv-p3",
      invoiceNumber: "DISP-0986",
      customerName: "Brown Fening Tea - Navalur",
      customerPhone: "+91 81483 21017",
      totalAmount: 3950,
      status: "paid",
      date: fmtDate(38),
      createdAt: fmtIso(38, 8, 45),
      title: "DISPATCH SLIP",
      items: [{ name: "Choco Walnut Brownie", qty: 45, unit: "Pcs", rate: 45, amount: 2025 }, { name: "Classic Tea Cake", qty: 45, unit: "Pcs", rate: 30, amount: 1350 }],
    },
    {
      id: "slip-nv-p4",
      invoiceNumber: "DISP-0981",
      customerName: "Brown Fening Tea - Navalur",
      customerPhone: "+91 81483 21017",
      totalAmount: 3500,
      status: "paid",
      date: fmtDate(41),
      createdAt: fmtIso(41, 8, 30),
      title: "DISPATCH SLIP",
      items: [{ name: "Banana Walnut Bread", qty: 40, unit: "Pcs", rate: 50, amount: 2000 }, { name: "Vanilla Cupcake", qty: 50, unit: "Pcs", rate: 30, amount: 1500 }],
    },
    {
      id: "slip-nv-p5",
      invoiceNumber: "DISP-0976",
      customerName: "Brown Fening Tea - Navalur",
      customerPhone: "+91 81483 21017",
      totalAmount: 3750,
      status: "paid",
      date: fmtDate(44),
      createdAt: fmtIso(44, 9, 0),
      title: "DISPATCH SLIP",
      items: [{ name: "Choco Walnut Brownie", qty: 40, unit: "Pcs", rate: 45, amount: 1800 }, { name: "Butter Croissant", qty: 35, unit: "Pcs", rate: 55, amount: 1925 }],
    },
    {
      id: "slip-nv-p6",
      invoiceNumber: "DISP-0971",
      customerName: "Brown Fening Tea - Navalur",
      customerPhone: "+91 81483 21017",
      totalAmount: 3600,
      status: "paid",
      date: fmtDate(48),
      createdAt: fmtIso(48, 8, 30),
      title: "DISPATCH SLIP",
      items: [{ name: "Classic Tea Cake", qty: 50, unit: "Pcs", rate: 30, amount: 1500 }, { name: "Choco Chip Cookies (Box)", qty: 35, unit: "Box", rate: 60, amount: 2100 }],
    },
    {
      id: "slip-nv-p7",
      invoiceNumber: "DISP-0965",
      customerName: "Brown Fening Tea - Navalur",
      customerPhone: "+91 81483 21017",
      totalAmount: 4100,
      status: "paid",
      date: fmtDate(52),
      createdAt: fmtIso(52, 9, 15),
      title: "DISPATCH SLIP",
      items: [{ name: "Choco Walnut Brownie", qty: 50, unit: "Pcs", rate: 45, amount: 2250 }, { name: "Blueberry Muffin", qty: 45, unit: "Pcs", rate: 40, amount: 1800 }],
    },
    {
      id: "slip-nv-p8",
      invoiceNumber: "DISP-0958",
      customerName: "Brown Fening Tea - Navalur",
      customerPhone: "+91 81483 21017",
      totalAmount: 3400,
      status: "paid",
      date: fmtDate(56),
      createdAt: fmtIso(56, 8, 30),
      title: "DISPATCH SLIP",
      items: [{ name: "Rich Jam Cake", qty: 40, unit: "Pcs", rate: 35, amount: 1400 }, { name: "Banana Walnut Bread", qty: 40, unit: "Pcs", rate: 50, amount: 2000 }],
    },

    // =========================================================================
    // 7. THE FRENCH LOAF PARTNER CAFE (AI Volume Drop: dropped from 8 orders to 3)
    // =========================================================================
    {
      id: "slip-fl-1",
      invoiceNumber: "DISP-1059",
      customerName: "The French Loaf Partner Cafe",
      customerPhone: "+91 98842 11223",
      totalAmount: 3100,
      status: "paid",
      date: fmtDate(3),
      createdAt: fmtIso(3, 10, 0),
      title: "DISPATCH SLIP",
      items: [
        { name: "Butter Croissant", qty: 30, unit: "Pcs", rate: 55, amount: 1650 },
        { name: "Pain au Chocolat", qty: 20, unit: "Pcs", rate: 65, amount: 1300 },
      ],
    },
    {
      id: "slip-fl-2",
      invoiceNumber: "DISP-1031",
      customerName: "The French Loaf Partner Cafe",
      customerPhone: "+91 98842 11223",
      totalAmount: 2800,
      status: "paid",
      date: fmtDate(16),
      createdAt: fmtIso(16, 10, 15),
      title: "DISPATCH SLIP",
      items: [
        { name: "Sourdough Artisan Loaf", qty: 20, unit: "Loaf", rate: 80, amount: 1600 },
        { name: "Garlic Herb Focaccia", qty: 20, unit: "Pcs", rate: 60, amount: 1200 },
      ],
    },
    {
      id: "slip-fl-3",
      invoiceNumber: "DISP-1009",
      customerName: "The French Loaf Partner Cafe",
      customerPhone: "+91 98842 11223",
      totalAmount: 3200,
      status: "paid",
      date: fmtDate(28),
      createdAt: fmtIso(28, 9, 30),
      title: "DISPATCH SLIP",
      items: [
        { name: "Dutch Truffle Pastry", qty: 25, unit: "Pcs", rate: 70, amount: 1750 },
        { name: "Red Velvet Slice", qty: 20, unit: "Pcs", rate: 65, amount: 1300 },
      ],
    },
    // Heavy prior month orders (days 31-60): 8 orders -> AI calculates -63% drop
    {
      id: "slip-fl-p1",
      invoiceNumber: "DISP-0996",
      customerName: "The French Loaf Partner Cafe",
      customerPhone: "+91 98842 11223",
      totalAmount: 4200,
      status: "paid",
      date: fmtDate(33),
      createdAt: fmtIso(33, 9, 45),
      title: "DISPATCH SLIP",
      items: [{ name: "Butter Croissant", qty: 40, unit: "Pcs", rate: 55, amount: 2200 }, { name: "Pain au Chocolat", qty: 30, unit: "Pcs", rate: 65, amount: 1950 }],
    },
    {
      id: "slip-fl-p2",
      invoiceNumber: "DISP-0991",
      customerName: "The French Loaf Partner Cafe",
      customerPhone: "+91 98842 11223",
      totalAmount: 4400,
      status: "paid",
      date: fmtDate(37),
      createdAt: fmtIso(37, 10, 0),
      title: "DISPATCH SLIP",
      items: [{ name: "Sourdough Artisan Loaf", qty: 30, unit: "Loaf", rate: 80, amount: 2400 }, { name: "Garlic Herb Focaccia", qty: 30, unit: "Pcs", rate: 60, amount: 1800 }],
    },
    {
      id: "slip-fl-p3",
      invoiceNumber: "DISP-0984",
      customerName: "The French Loaf Partner Cafe",
      customerPhone: "+91 98842 11223",
      totalAmount: 4100,
      status: "paid",
      date: fmtDate(41),
      createdAt: fmtIso(41, 9, 30),
      title: "DISPATCH SLIP",
      items: [{ name: "Dutch Truffle Pastry", qty: 30, unit: "Pcs", rate: 70, amount: 2100 }, { name: "Red Velvet Slice", qty: 30, unit: "Pcs", rate: 65, amount: 1950 }],
    },
    {
      id: "slip-fl-p4",
      invoiceNumber: "DISP-0979",
      customerName: "The French Loaf Partner Cafe",
      customerPhone: "+91 98842 11223",
      totalAmount: 3950,
      status: "paid",
      date: fmtDate(45),
      createdAt: fmtIso(45, 10, 15),
      title: "DISPATCH SLIP",
      items: [{ name: "Butter Croissant", qty: 40, unit: "Pcs", rate: 55, amount: 2200 }, { name: "Almond Biscotti (Jar)", qty: 20, unit: "Jar", rate: 85, amount: 1700 }],
    },
    {
      id: "slip-fl-p5",
      invoiceNumber: "DISP-0973",
      customerName: "The French Loaf Partner Cafe",
      customerPhone: "+91 98842 11223",
      totalAmount: 4300,
      status: "paid",
      date: fmtDate(49),
      createdAt: fmtIso(49, 9, 45),
      title: "DISPATCH SLIP",
      items: [{ name: "Sourdough Artisan Loaf", qty: 30, unit: "Loaf", rate: 80, amount: 2400 }, { name: "Pain au Chocolat", qty: 25, unit: "Pcs", rate: 65, amount: 1625 }],
    },
    {
      id: "slip-fl-p6",
      invoiceNumber: "DISP-0966",
      customerName: "The French Loaf Partner Cafe",
      customerPhone: "+91 98842 11223",
      totalAmount: 4050,
      status: "paid",
      date: fmtDate(54),
      createdAt: fmtIso(54, 10, 0),
      title: "DISPATCH SLIP",
      items: [{ name: "Garlic Herb Focaccia", qty: 35, unit: "Pcs", rate: 60, amount: 2100 }, { name: "Red Velvet Slice", qty: 30, unit: "Pcs", rate: 65, amount: 1950 }],
    },

    // =========================================================================
    // 8. BREW & BLOOM CAFE (Growing Partner Cafe / Regular 3-4 day cadence)
    // =========================================================================
    {
      id: "slip-bb-1",
      invoiceNumber: "DISP-1063",
      customerName: "Brew & Bloom Cafe",
      customerPhone: "+91 97890 12345",
      totalAmount: 3850,
      status: "paid",
      date: fmtDate(2),
      createdAt: fmtIso(2, 11, 30),
      title: "DISPATCH SLIP",
      items: [
        { name: "Butter Croissant", qty: 30, unit: "Pcs", rate: 55, amount: 1650 },
        { name: "Blueberry Muffin", qty: 30, unit: "Pcs", rate: 40, amount: 1200 },
        { name: "Choco Walnut Brownie", qty: 20, unit: "Pcs", rate: 45, amount: 900 },
      ],
    },
    {
      id: "slip-bb-2",
      invoiceNumber: "DISP-1049",
      customerName: "Brew & Bloom Cafe",
      customerPhone: "+91 97890 12345",
      totalAmount: 3600,
      status: "paid",
      date: fmtDate(6),
      createdAt: fmtIso(6, 11, 0),
      title: "DISPATCH SLIP",
      items: [
        { name: "Dutch Truffle Pastry", qty: 25, unit: "Pcs", rate: 70, amount: 1750 },
        { name: "Red Velvet Slice", qty: 25, unit: "Pcs", rate: 65, amount: 1625 },
      ],
    },
    {
      id: "slip-bb-3",
      invoiceNumber: "DISP-1035",
      customerName: "Brew & Bloom Cafe",
      customerPhone: "+91 97890 12345",
      totalAmount: 3200,
      status: "paid",
      date: fmtDate(10),
      createdAt: fmtIso(10, 11, 0),
      title: "DISPATCH SLIP",
      items: [
        { name: "Choco Walnut Brownie", qty: 30, unit: "Pcs", rate: 45, amount: 1350 },
        { name: "Vanilla Cupcake", qty: 35, unit: "Pcs", rate: 30, amount: 1050 },
        { name: "Classic Tea Cake", qty: 25, unit: "Pcs", rate: 30, amount: 750 },
      ],
    },
    {
      id: "slip-bb-4",
      invoiceNumber: "DISP-1020",
      customerName: "Brew & Bloom Cafe",
      customerPhone: "+91 97890 12345",
      totalAmount: 3350,
      status: "paid",
      date: fmtDate(15),
      createdAt: fmtIso(15, 12, 0),
      title: "DISPATCH SLIP",
      items: [
        { name: "Butter Croissant", qty: 25, unit: "Pcs", rate: 55, amount: 1375 },
        { name: "Banana Walnut Bread", qty: 25, unit: "Pcs", rate: 50, amount: 1250 },
        { name: "Double Chocolate Muffin", qty: 15, unit: "Pcs", rate: 45, amount: 675 },
      ],
    },

    // =========================================================================
    // 9. KUMBAKONAM DEGREE COFFEE PARTNER (Healthy Steady Partner)
    // =========================================================================
    {
      id: "slip-kb-1",
      invoiceNumber: "DISP-1060",
      customerName: "Kumbakonam Degree Coffee Partner",
      customerPhone: "+91 94441 23456",
      totalAmount: 3750,
      status: "paid",
      date: fmtDate(3),
      createdAt: fmtIso(3, 9, 0),
      title: "DISPATCH SLIP",
      items: [
        { name: "Classic Tea Cake", qty: 50, unit: "Pcs", rate: 30, amount: 1500 },
        { name: "Golden Paneer Puff", qty: 40, unit: "Pcs", rate: 35, amount: 1400 },
        { name: "Vanilla Cupcake", qty: 25, unit: "Pcs", rate: 30, amount: 750 },
      ],
    },
    {
      id: "slip-kb-2",
      invoiceNumber: "DISP-1044",
      customerName: "Kumbakonam Degree Coffee Partner",
      customerPhone: "+91 94441 23456",
      totalAmount: 3900,
      status: "paid",
      date: fmtDate(8),
      createdAt: fmtIso(8, 9, 30),
      title: "DISPATCH SLIP",
      items: [
        { name: "Crispy Veg Samosa (Box 10)", qty: 20, unit: "Box", rate: 120, amount: 2400 },
        { name: "Classic Tea Cake", qty: 50, unit: "Pcs", rate: 30, amount: 1500 },
      ],
    },
    {
      id: "slip-kb-3",
      invoiceNumber: "DISP-1026",
      customerName: "Kumbakonam Degree Coffee Partner",
      customerPhone: "+91 94441 23456",
      totalAmount: 3650,
      status: "paid",
      date: fmtDate(14),
      createdAt: fmtIso(14, 9, 15),
      title: "DISPATCH SLIP",
      items: [
        { name: "Rich Jam Cake", qty: 40, unit: "Pcs", rate: 35, amount: 1400 },
        { name: "Golden Paneer Puff", qty: 45, unit: "Pcs", rate: 35, amount: 1575 },
        { name: "Banana Walnut Bread", qty: 15, unit: "Pcs", rate: 50, amount: 750 },
      ],
    },
  ];

  // 2. PAYMENT RECORDS (24 records across cash, UPI, and bank transfers)
  const payments: BakerPaymentRecord[] = [
    { id: "pay-1", storeName: "Chai Galli Cafe", amount: 4950, paymentMode: "UPI (GPay / PhonePe)", date: fmtDate(1), invoiceNumber: "DISP-1065", notes: "Settled on delivery via GPay" },
    { id: "pay-2", storeName: "Brew & Bloom Cafe", amount: 3850, paymentMode: "UPI (GPay / PhonePe)", date: fmtDate(2), invoiceNumber: "DISP-1063", notes: "PhonePe transfer to royalbaker@okaxis" },
    { id: "pay-3", storeName: "Chai Galli Cafe", amount: 4350, paymentMode: "UPI (GPay / PhonePe)", date: fmtDate(3), invoiceNumber: "DISP-1058", notes: "GPay Ref #419200384" },
    { id: "pay-4", storeName: "Kumbakonam Degree Coffee Partner", amount: 3750, paymentMode: "Cash", date: fmtDate(3), invoiceNumber: "DISP-1060", notes: "Cash handed to delivery driver" },
    { id: "pay-5", storeName: "The French Loaf Partner Cafe", amount: 3100, paymentMode: "UPI (GPay / PhonePe)", date: fmtDate(3), invoiceNumber: "DISP-1059", notes: "UPI transfer" },
    { id: "pay-6", storeName: "Chai Galli Cafe", amount: 4800, paymentMode: "UPI (GPay / PhonePe)", date: fmtDate(5), invoiceNumber: "DISP-1051", notes: "UPI payment received" },
    { id: "pay-7", storeName: "Brew & Bloom Cafe", amount: 3600, paymentMode: "UPI (GPay / PhonePe)", date: fmtDate(6), invoiceNumber: "DISP-1049", notes: "Prompt UPI settlement" },
    { id: "pay-8", storeName: "Chai Galli Cafe", amount: 4100, paymentMode: "UPI (GPay / PhonePe)", date: fmtDate(7), invoiceNumber: "DISP-1043", notes: "GPay QR scan" },
    { id: "pay-9", storeName: "Kumbakonam Degree Coffee Partner", amount: 3900, paymentMode: "Cash", date: fmtDate(8), invoiceNumber: "DISP-1044", notes: "Cash settlement on dispatch" },
    { id: "pay-10", storeName: "Chai Galli Cafe", amount: 4600, paymentMode: "Cash", date: fmtDate(10), invoiceNumber: "DISP-1036", notes: "Cash on delivery" },
    { id: "pay-11", storeName: "Brew & Bloom Cafe", amount: 3200, paymentMode: "UPI (GPay / PhonePe)", date: fmtDate(10), invoiceNumber: "DISP-1035", notes: "PhonePe transfer" },
    { id: "pay-12", storeName: "Brown Fening Tea - Navalur", amount: 2950, paymentMode: "NEFT / Bank Transfer", date: fmtDate(11), invoiceNumber: "DISP-1037", notes: "Weekly store batch NEFT" },
    { id: "pay-13", storeName: "Urban Bean Roasters", amount: 4250, paymentMode: "UPI (GPay / PhonePe)", date: fmtDate(12), invoiceNumber: "DISP-1033", notes: "GPay transfer" },
    { id: "pay-14", storeName: "Chai Galli Cafe", amount: 4300, paymentMode: "UPI (GPay / PhonePe)", date: fmtDate(14), invoiceNumber: "DISP-1028", notes: "UPI transfer" },
    { id: "pay-15", storeName: "Kumbakonam Degree Coffee Partner", amount: 3650, paymentMode: "Cash", date: fmtDate(14), invoiceNumber: "DISP-1026", notes: "Cash on delivery" },
    { id: "pay-16", storeName: "BFT Mambakkam", amount: 3450, paymentMode: "Cash", date: fmtDate(15), invoiceNumber: "DISP-1022", notes: "Cash settlement" },
    { id: "pay-17", storeName: "Brew & Bloom Cafe", amount: 3350, paymentMode: "UPI (GPay / PhonePe)", date: fmtDate(15), invoiceNumber: "DISP-1020", notes: "UPI Ref #90483" },
    { id: "pay-18", storeName: "Urban Bean Roasters", amount: 3950, paymentMode: "UPI (GPay / PhonePe)", date: fmtDate(16), invoiceNumber: "DISP-1021", notes: "UPI Ref #28471" },
    { id: "pay-19", storeName: "The French Loaf Partner Cafe", amount: 2800, paymentMode: "NEFT / Bank Transfer", date: fmtDate(16), invoiceNumber: "DISP-1031", notes: "Bank NEFT clearance" },
    { id: "pay-20", storeName: "Madras Chai Co", amount: 5200, paymentMode: "UPI (GPay / PhonePe)", date: fmtDate(17), invoiceNumber: "DISP-1016", notes: "UPI payment received" },
    { id: "pay-21", storeName: "Chai Galli Cafe", amount: 4900, paymentMode: "UPI (GPay / PhonePe)", date: fmtDate(18), invoiceNumber: "DISP-1018", notes: "GPay transfer" },
    { id: "pay-22", storeName: "BFT Mambakkam", amount: 3350, paymentMode: "UPI (GPay / PhonePe)", date: fmtDate(18), invoiceNumber: "DISP-1014", notes: "UPI Ref #38472" },
    { id: "pay-23", storeName: "Brown Fening Tea - Navalur", amount: 2700, paymentMode: "NEFT / Bank Transfer", date: fmtDate(19), invoiceNumber: "DISP-1019", notes: "Online store settlement" },
    { id: "pay-24", storeName: "The Corner Roast", amount: 5200, paymentMode: "UPI (GPay / PhonePe)", date: fmtDate(20), invoiceNumber: "DISP-1012", notes: "UPI batch clearance" },
  ];

  // 3. OPERATIONAL BAKERY EXPENSES (18 categorized records)
  const expenses: ExpenseRecord[] = [
    { id: "exp-1", name: "Callebaut 54.5% Belgian Dark Chocolate (15kg)", amount: 12500, category: "Raw Materials & Supplies", date: fmtDate(2), createdAt: fmtIso(2) },
    { id: "exp-2", name: "Amul Pasteurised Butter (25kg Crate)", amount: 13000, category: "Raw Materials & Supplies", date: fmtDate(4), createdAt: fmtIso(4) },
    { id: "exp-3", name: "Delivery Van Fuel & OMR Expressway Tolls", amount: 2400, category: "Logistics & Delivery", date: fmtDate(5), createdAt: fmtIso(5) },
    { id: "exp-4", name: "600 Pcs Kraft Window Pastry & Brownie Boxes", amount: 4500, category: "Packaging & Boxes", date: fmtDate(7), createdAt: fmtIso(7) },
    { id: "exp-5", name: "Premium Unbleached Bread Flour & Maida (100kg)", amount: 4400, category: "Raw Materials & Supplies", date: fmtDate(9), createdAt: fmtIso(9) },
    { id: "exp-6", name: "Commercial 3-Phase Deck Oven Electricity Bill", amount: 7200, category: "Utilities & Energy", date: fmtDate(12), createdAt: fmtIso(12) },
    { id: "exp-7", name: "Fresh Dairy Milk & Farm Eggs (15 Crates)", amount: 3600, category: "Raw Materials & Supplies", date: fmtDate(15), createdAt: fmtIso(15) },
    { id: "exp-8", name: "Commercial LPG Cylinder Refills (x2)", amount: 3600, category: "Utilities & Energy", date: fmtDate(18), createdAt: fmtIso(18) },
    { id: "exp-9", name: "French Croissant Laminating Butter & Yeast", amount: 4800, category: "Raw Materials & Supplies", date: fmtDate(21), createdAt: fmtIso(21) },
    { id: "exp-10", name: "Greaseproof Butter Paper & Muffin Cups (1500 Pcs)", amount: 2100, category: "Packaging & Boxes", date: fmtDate(24), createdAt: fmtIso(24) },
    { id: "exp-11", name: "Delivery Van Diesel & City Parking Tolls", amount: 2300, category: "Logistics & Delivery", date: fmtDate(27), createdAt: fmtIso(27) },
    { id: "exp-12", name: "Bulk California Walnut & Berry Fruit Stock", amount: 5200, category: "Raw Materials & Supplies", date: fmtDate(31), createdAt: fmtIso(31) },
    { id: "exp-13", name: "Deck Oven Thermostat Calibration & Maintenance", amount: 1800, category: "Maintenance & Repairs", date: fmtDate(36), createdAt: fmtIso(36) },
    { id: "exp-14", name: "Custom Printed Royal Baker Seal Stickers & Tape", amount: 1600, category: "Packaging & Boxes", date: fmtDate(41), createdAt: fmtIso(41) },
    { id: "exp-15", name: "Prior Month Oven Electricity Bill (TNEB)", amount: 7500, category: "Utilities & Energy", date: fmtDate(46), createdAt: fmtIso(46) },
    { id: "exp-16", name: "Pure Madagascar Bourbon Vanilla Extract (2L)", amount: 3400, category: "Raw Materials & Supplies", date: fmtDate(51), createdAt: fmtIso(51) },
    { id: "exp-17", name: "Pastry Scrapers, Banneton Proofing Baskets & Trays", amount: 2200, category: "Maintenance & Repairs", date: fmtDate(55), createdAt: fmtIso(55) },
    { id: "exp-18", name: "Delivery Van Scheduled Maintenance & Oil Change", amount: 3100, category: "Logistics & Delivery", date: fmtDate(58), createdAt: fmtIso(58) },
  ];

  // 4. BROADCAST ADVISORIES
  const broadcasts: BakerBroadcast[] = [
    {
      id: "bc-1",
      title: "Diwali Festival Bulk Wholesale Pre-Orders Open",
      message: "Dear Cafe Partners, Royal Baker is now accepting bulk festival pre-orders! Enjoy an exclusive 10% wholesale discount on all Choco Walnut Brownie, Almond Biscotti, and Cookie Gift Boxes placed before Oct 28th. Reserve your bakery delivery slots early to guarantee on-time morning delivery.",
      category: "promo",
      target_stores: ["all"],
      target_store_names: ["All Partner Cafes"],
      status: "active",
      created_at: fmtIso(2, 10, 0),
    },
    {
      id: "bc-2",
      title: "Fresh Surplus Batch: 60 Pcs Blueberry Muffins Ready",
      message: "Attention: 60 Pcs freshly baked Blueberry Muffins just out of the oven ready for immediate afternoon dispatch at special introductory wholesale rates. First-come, first-served.",
      category: "stock",
      target_stores: ["store-chai", "store-corner", "store-bloom", "store-madras"],
      target_store_names: ["Chai Galli Cafe", "The Corner Roast", "Brew & Bloom Cafe", "Madras Chai Co"],
      product_name: "Blueberry Muffin",
      quantity: 60,
      discount_rate: 10,
      status: "active",
      created_at: fmtIso(5, 14, 30),
    },
    {
      id: "bc-3",
      title: "Deck Oven Routine Maintenance Complete — Full Capacity Resumed",
      message: "Please note our primary deck oven completed scheduled heating coil servicing. Baking schedules have resumed at 100% capacity with morning dispatches starting at 7:30 AM as normal.",
      category: "memo",
      target_stores: ["all"],
      target_store_names: ["All Partner Cafes"],
      status: "resolved",
      created_at: fmtIso(12, 18, 0),
    },
  ];

  return {
    stores: ROYAL_BAKER_STORES,
    products: ROYAL_BAKER_PRODUCTS,
    invoices,
    payments,
    expenses,
    broadcasts,
  };
}

/**
 * Seeds all Royal Baker data into client-side LocalStorage.
 * Writes to both the active business ID and 'default' / Royal Baker ID
 * so the demo works regardless of whether the user is logged in as Royal Baker or testing locally.
 */
export function seedRoyalBakerLocalStorage(bizId = ROYAL_BAKER_BIZ_ID) {
  if (typeof window === "undefined") return null;

  // STRICT MULTI-TENANT ISOLATION: Never seed demo data into another business or default
  if (bizId !== ROYAL_BAKER_BIZ_ID) {
    return null;
  }

  const data = getRoyalBakerDemoData();
  try {
    localStorage.setItem(`bftone_customers_${ROYAL_BAKER_BIZ_ID}`, JSON.stringify(data.stores));
    localStorage.setItem(`bftone_invoices_${ROYAL_BAKER_BIZ_ID}`, JSON.stringify(data.invoices));
    localStorage.setItem(`bftone_baker_products_${ROYAL_BAKER_BIZ_ID}`, JSON.stringify(data.products));
    localStorage.setItem(`bftone_baker_expenses_${ROYAL_BAKER_BIZ_ID}`, JSON.stringify(data.expenses));
    localStorage.setItem(`bftone_baker_payments_${ROYAL_BAKER_BIZ_ID}`, JSON.stringify(data.payments));
    localStorage.setItem(`bftone_baker_broadcasts_${ROYAL_BAKER_BIZ_ID}`, JSON.stringify(data.broadcasts));
  } catch (e) {
    console.warn(`Failed to seed localStorage for Royal Baker:`, e);
  }

  // Dispatch live update events so open components refresh immediately
  window.dispatchEvent(new CustomEvent(B2B_CUSTOMERS_UPDATED_EVENT, { detail: { clients: data.stores } }));
  window.dispatchEvent(new Event("storage"));

  return data;
}

/**
 * Clears Royal Baker demo data from LocalStorage.
 */
export function clearRoyalBakerLocalStorage(bizId = ROYAL_BAKER_BIZ_ID) {
  if (typeof window === "undefined") return;

  // STRICT MULTI-TENANT ISOLATION: Only remove Royal Baker keys
  try {
    localStorage.removeItem(`bftone_customers_${ROYAL_BAKER_BIZ_ID}`);
    localStorage.removeItem(`bftone_invoices_${ROYAL_BAKER_BIZ_ID}`);
    localStorage.removeItem(`bftone_baker_products_${ROYAL_BAKER_BIZ_ID}`);
    localStorage.removeItem(`bftone_baker_expenses_${ROYAL_BAKER_BIZ_ID}`);
    localStorage.removeItem(`bftone_baker_payments_${ROYAL_BAKER_BIZ_ID}`);
    localStorage.removeItem(`bftone_baker_broadcasts_${ROYAL_BAKER_BIZ_ID}`);
  } catch {}

  window.dispatchEvent(new CustomEvent(B2B_CUSTOMERS_UPDATED_EVENT, { detail: { clients: [] } }));
  window.dispatchEvent(new Event("storage"));
}


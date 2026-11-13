/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from "zod";

export type ImportEntityType =
  | "invoices"
  | "invoice_items"
  | "customers"
  | "products"
  | "payments"
  | "expenses"
  | "returns"
  | "inventory"
  | "purchases"
  | "suppliers";

export type SourceSoftwareType =
  | "excel_sheets"
  | "billing_software"
  | "business_dashboard"
  | "multiple_spreadsheets"
  | "not_sure";

export type DuplicateHandlingStrategy = "skip" | "merge" | "import_as_new";

export type ConfidenceLevel = "high" | "medium" | "low" | "unmapped";

export type DetectedDataType =
  | "string"
  | "number"
  | "currency"
  | "date"
  | "phone"
  | "gstin"
  | "status"
  | "empty";

export interface SeyalProFieldDefinition {
  key: string;
  label: string;
  entity: ImportEntityType;
  required: boolean;
  dataType: DetectedDataType;
  description: string;
  aliases: string[];
}

export const ENTITY_META: Record<
  ImportEntityType,
  { label: string; description: string; badgeColor: string }
> = {
  invoices: {
    label: "Invoices & Bills",
    description: "Sales invoices, tax bills, delivery slips, and customer orders",
    badgeColor: "blue",
  },
  invoice_items: {
    label: "Invoice Line Items",
    description: "Individual product lines belonging to invoices or bills",
    badgeColor: "indigo",
  },
  customers: {
    label: "Customers & Clients",
    description: "Customer directory, partner stores, contact numbers, and GSTINs",
    badgeColor: "purple",
  },
  products: {
    label: "Products & Catalog Items",
    description: "Product catalog, selling prices, making/unit costs, and units",
    badgeColor: "emerald",
  },
  payments: {
    label: "Payments & Collections",
    description: "Customer payment receipts, UPI/bank transfers, and bill settlements",
    badgeColor: "cyan",
  },
  expenses: {
    label: "Operating Expenses",
    description: "Daily and monthly store expenses, raw materials, rent, and utilities",
    badgeColor: "amber",
  },
  returns: {
    label: "Refunds & Returns",
    description: "Credit notes, sales returns, and damaged/expired item adjustments",
    badgeColor: "rose",
  },
  inventory: {
    label: "Inventory & Raw Stock",
    description: "Stock items, SKUs, current stock quantities, and unit costs",
    badgeColor: "purple",
  },
  purchases: {
    label: "Purchase Orders",
    description: "Vendor purchase bills and inward stock orders",
    badgeColor: "slate",
  },
  suppliers: {
    label: "Suppliers & Vendors",
    description: "Vendor directory, contact persons, payment terms, and lead times",
    badgeColor: "slate",
  },
};

export const SEYALPRO_ENTITY_FIELDS: Record<ImportEntityType, SeyalProFieldDefinition[]> = {
  invoices: [
    {
      key: "invoice_number",
      label: "Invoice / Bill Number",
      entity: "invoices",
      required: true,
      dataType: "string",
      description: "Unique invoice, bill, or slip identifier (e.g. INV-101)",
      aliases: [
        "invoice no", "invoice number", "inv no", "inv #", "bill no", "bill number",
        "slip no", "slip number", "ref id", "reference id", "voucher no", "order id",
        "order no", "receipt no", "doc no", "challan no",
      ],
    },
    {
      key: "date",
      label: "Invoice Date",
      entity: "invoices",
      required: true,
      dataType: "date",
      description: "Billing or transaction date",
      aliases: [
        "invoice date", "bill date", "date", "txn date", "transaction date",
        "slip date", "order date", "voucher date", "created date", "dated",
      ],
    },
    {
      key: "customer_name",
      label: "Customer / Client Name",
      entity: "invoices",
      required: true,
      dataType: "string",
      description: "Name of the customer, buyer, or client store",
      aliases: [
        "customer", "customer name", "client", "client name", "buyer", "buyer name",
        "party", "party name", "store", "store name", "account name", "billed to",
        "shop name", "cafe name", "business name",
      ],
    },
    {
      key: "total_amount",
      label: "Invoice Total Amount",
      entity: "invoices",
      required: true,
      dataType: "currency",
      description: "Final billed amount for the invoice",
      aliases: [
        "invoice total", "total amount", "grand total", "grand amt", "total value",
        "net amount", "net payable", "bill amount", "bill value", "amount", "total",
        "invoice value", "gross total", "billed amount",
      ],
    },
    {
      key: "paid_amount",
      label: "Amount Paid / Received",
      entity: "invoices",
      required: false,
      dataType: "currency",
      description: "Amount already collected against this invoice",
      aliases: [
        "amount paid", "paid amount", "received", "amount received", "collected",
        "paid", "settled amount", "payment received", "advance paid", "cash received",
      ],
    },
    {
      key: "balance_due",
      label: "Balance Due / Pending",
      entity: "invoices",
      required: false,
      dataType: "currency",
      description: "Remaining unpaid balance on this invoice",
      aliases: [
        "balance due", "balance", "pending", "pending amount", "due", "due amount",
        "outstanding", "unpaid", "arrear", "os amount", "remaining",
      ],
    },
    {
      key: "item_name",
      label: "Product / Item Name (Line Item)",
      entity: "invoices",
      required: false,
      dataType: "string",
      description: "Product or service name when invoice rows contain item details",
      aliases: [
        "item", "item name", "product", "product name", "description", "particulars",
        "item description", "sku name", "goods",
      ],
    },
    {
      key: "quantity",
      label: "Quantity",
      entity: "invoices",
      required: false,
      dataType: "number",
      description: "Item quantity sold",
      aliases: ["qty", "quantity", "pcs", "units", "count", "nos", "billed qty"],
    },
    {
      key: "unit_price",
      label: "Unit Price / Rate",
      entity: "invoices",
      required: false,
      dataType: "currency",
      description: "Selling rate per unit",
      aliases: ["rate", "unit price", "price", "selling price", "mrp", "item rate", "unit rate"],
    },
    {
      key: "unit_cost",
      label: "Unit Making / Cost Price",
      entity: "invoices",
      required: false,
      dataType: "currency",
      description: "Historical cost per unit for accurate profit calculation",
      aliases: ["cost", "unit cost", "making cost", "cost price", "cogs", "purchase rate"],
    },
    {
      key: "tax_amount",
      label: "Tax / GST Amount",
      entity: "invoices",
      required: false,
      dataType: "currency",
      description: "Total tax or GST charged on the invoice",
      aliases: ["tax", "tax amount", "gst", "gst amount", "igst", "cgst", "sgst", "vat"],
    },
    {
      key: "discount_amount",
      label: "Discount Amount",
      entity: "invoices",
      required: false,
      dataType: "currency",
      description: "Discount deducted from the invoice",
      aliases: ["discount", "discount amount", "disc", "rebate", "less discount"],
    },
    {
      key: "due_date",
      label: "Due Date",
      entity: "invoices",
      required: false,
      dataType: "date",
      description: "Payment due date",
      aliases: ["due date", "payment due", "maturity date", "expiry date"],
    },
    {
      key: "customer_phone",
      label: "Customer Phone",
      entity: "invoices",
      required: false,
      dataType: "phone",
      description: "Customer mobile or phone number",
      aliases: ["phone", "mobile", "contact", "customer phone", "client phone", "whatsapp"],
    },
    {
      key: "customer_address",
      label: "Customer Address",
      entity: "invoices",
      required: false,
      dataType: "string",
      description: "Customer billing or delivery address",
      aliases: ["address", "customer address", "billing address", "location", "city"],
    },
    {
      key: "customer_gstin",
      label: "Customer GSTIN / Tax ID",
      entity: "invoices",
      required: false,
      dataType: "gstin",
      description: "Customer GST identification number",
      aliases: ["gstin", "gst no", "gst number", "tax id", "tin", "pan"],
    },
    {
      key: "payment_mode",
      label: "Payment Mode",
      entity: "invoices",
      required: false,
      dataType: "string",
      description: "Payment method (UPI, Cash, Bank Transfer, Card)",
      aliases: ["payment mode", "payment method", "mode", "pay mode", "tender"],
    },
    {
      key: "status",
      label: "Payment Status",
      entity: "invoices",
      required: false,
      dataType: "status",
      description: "Invoice status (Paid, Pending, Partial, Overdue)",
      aliases: ["status", "payment status", "bill status", "state"],
    },
    {
      key: "notes",
      label: "Notes / Remarks",
      entity: "invoices",
      required: false,
      dataType: "string",
      description: "Additional remarks or notes",
      aliases: ["notes", "remarks", "comment", "narration", "memo"],
    },
  ],
  invoice_items: [
    {
      key: "invoice_number",
      label: "Invoice / Bill Number",
      entity: "invoice_items",
      required: true,
      dataType: "string",
      description: "Parent invoice number linking this item",
      aliases: ["invoice no", "invoice number", "inv no", "bill no", "slip no", "ref id", "order id"],
    },
    {
      key: "item_name",
      label: "Product / Item Name",
      entity: "invoice_items",
      required: true,
      dataType: "string",
      description: "Name of the product or service",
      aliases: ["item", "item name", "product", "product name", "particulars", "description"],
    },
    {
      key: "quantity",
      label: "Quantity",
      entity: "invoice_items",
      required: true,
      dataType: "number",
      description: "Quantity billed",
      aliases: ["qty", "quantity", "pcs", "units", "count", "nos"],
    },
    {
      key: "unit_price",
      label: "Unit Price / Rate",
      entity: "invoice_items",
      required: true,
      dataType: "currency",
      description: "Selling price per unit",
      aliases: ["rate", "unit price", "price", "selling price", "item rate"],
    },
    {
      key: "line_total",
      label: "Line Total Amount",
      entity: "invoice_items",
      required: false,
      dataType: "currency",
      description: "Total amount for this line item (Qty * Rate)",
      aliases: ["amount", "line total", "total", "item total", "net amount", "value"],
    },
    {
      key: "unit_cost",
      label: "Unit Cost / Making Cost",
      entity: "invoice_items",
      required: false,
      dataType: "currency",
      description: "Cost per unit for historical profit calculation",
      aliases: ["cost", "unit cost", "making cost", "cost price", "cogs"],
    },
    {
      key: "unit",
      label: "Unit of Measure",
      entity: "invoice_items",
      required: false,
      dataType: "string",
      description: "Unit (Pcs, Kg, Box, Unit)",
      aliases: ["unit", "uom", "measure", "pack"],
    },
  ],
  customers: [
    {
      key: "name",
      label: "Customer / Client Name",
      entity: "customers",
      required: true,
      dataType: "string",
      description: "Customer, client, or business name",
      aliases: [
        "customer name", "client name", "name", "party name", "buyer", "client",
        "customer", "store name", "shop name", "company name", "business name",
      ],
    },
    {
      key: "phone",
      label: "Phone / Mobile Number",
      entity: "customers",
      required: false,
      dataType: "phone",
      description: "Contact phone or WhatsApp number",
      aliases: ["phone", "mobile", "contact", "phone number", "mobile no", "tel", "whatsapp"],
    },
    {
      key: "address",
      label: "Address / Location",
      entity: "customers",
      required: false,
      dataType: "string",
      description: "Street address, area, or city",
      aliases: ["address", "billing address", "shipping address", "location", "city", "area"],
    },
    {
      key: "gstin",
      label: "GSTIN / Tax ID",
      entity: "customers",
      required: false,
      dataType: "gstin",
      description: "Customer GSTIN or tax registration number",
      aliases: ["gstin", "gst no", "gst number", "tax id", "tin", "pan"],
    },
    {
      key: "email",
      label: "Email Address",
      entity: "customers",
      required: false,
      dataType: "string",
      description: "Customer email",
      aliases: ["email", "e-mail", "mail", "email id"],
    },
    {
      key: "opening_balance",
      label: "Opening Balance / Pending Dues",
      entity: "customers",
      required: false,
      dataType: "currency",
      description: "Historical outstanding balance owed by this customer",
      aliases: ["opening balance", "balance", "pending dues", "outstanding", "dues", "receivable"],
    },
  ],
  products: [
    {
      key: "name",
      label: "Product / Item Name",
      entity: "products",
      required: true,
      dataType: "string",
      description: "Name of the product or catalog item",
      aliases: ["product name", "item name", "name", "product", "item", "title", "particulars"],
    },
    {
      key: "selling_price",
      label: "Selling Price / Rate",
      entity: "products",
      required: true,
      dataType: "currency",
      description: "Standard selling price per unit",
      aliases: ["selling price", "rate", "price", "mrp", "unit price", "sale price", "sp"],
    },
    {
      key: "making_cost",
      label: "Making / Cost Price",
      entity: "products",
      required: false,
      dataType: "currency",
      description: "Production or purchase cost per unit (used for accurate profit calculation)",
      aliases: ["making cost", "cost price", "cost", "unit cost", "purchase price", "cp", "cogs"],
    },
    {
      key: "category",
      label: "Category",
      entity: "products",
      required: false,
      dataType: "string",
      description: "Product category or group",
      aliases: ["category", "group", "department", "type", "product group"],
    },
    {
      key: "unit",
      label: "Unit of Measure",
      entity: "products",
      required: false,
      dataType: "string",
      description: "Unit (Pcs, Kg, Box, Unit, Litre)",
      aliases: ["unit", "uom", "measure", "unit label"],
    },
    {
      key: "stock_available",
      label: "Available Stock Quantity",
      entity: "products",
      required: false,
      dataType: "number",
      description: "Current stock on hand",
      aliases: ["stock", "available stock", "qty", "current stock", "opening stock", "inventory"],
    },
    {
      key: "sku",
      label: "SKU / Item Code",
      entity: "products",
      required: false,
      dataType: "string",
      description: "Product code, barcode, or HSN",
      aliases: ["sku", "item code", "product code", "code", "barcode", "hsn"],
    },
  ],
  payments: [
    {
      key: "date",
      label: "Payment Date",
      entity: "payments",
      required: true,
      dataType: "date",
      description: "Date payment was received",
      aliases: ["payment date", "date", "received date", "txn date", "collection date", "voucher date"],
    },
    {
      key: "customer_name",
      label: "Customer / Client Name",
      entity: "payments",
      required: true,
      dataType: "string",
      description: "Customer or store who made the payment",
      aliases: ["customer", "customer name", "client", "client name", "party name", "store name", "payer"],
    },
    {
      key: "amount",
      label: "Payment Amount",
      entity: "payments",
      required: true,
      dataType: "currency",
      description: "Amount received",
      aliases: ["amount", "payment amount", "paid amount", "received", "amount received", "collected", "value"],
    },
    {
      key: "payment_method",
      label: "Payment Method / Mode",
      entity: "payments",
      required: false,
      dataType: "string",
      description: "UPI, Cash, NEFT, Cheque, Card",
      aliases: ["payment method", "payment mode", "mode", "method", "channel", "pay mode"],
    },
    {
      key: "reference_no",
      label: "Invoice / Reference Number",
      entity: "payments",
      required: false,
      dataType: "string",
      description: "Linked invoice number or bank/UPI transaction reference",
      aliases: ["reference no", "ref no", "invoice no", "invoice number", "utr", "txn id", "receipt no", "cheque no"],
    },
    {
      key: "notes",
      label: "Notes / Remarks",
      entity: "payments",
      required: false,
      dataType: "string",
      description: "Payment remarks",
      aliases: ["notes", "remarks", "narration", "description"],
    },
  ],
  expenses: [
    {
      key: "date",
      label: "Expense Date",
      entity: "expenses",
      required: true,
      dataType: "date",
      description: "Date the expense was incurred",
      aliases: ["expense date", "date", "bill date", "txn date", "voucher date"],
    },
    {
      key: "name",
      label: "Expense Item / Description",
      entity: "expenses",
      required: true,
      dataType: "string",
      description: "Expense item name or description",
      aliases: ["expense", "expense name", "item", "item name", "particulars", "description", "narration", "head"],
    },
    {
      key: "amount",
      label: "Expense Amount",
      entity: "expenses",
      required: true,
      dataType: "currency",
      description: "Total amount spent",
      aliases: ["amount", "expense amount", "total", "cost", "paid", "value", "spend"],
    },
    {
      key: "category",
      label: "Expense Category",
      entity: "expenses",
      required: false,
      dataType: "string",
      description: "Category (Raw Materials, Packaging, Rent, Salary, Utilities, Transport)",
      aliases: ["category", "expense category", "type", "group", "account head", "department"],
    },
    {
      key: "quantity",
      label: "Quantity",
      entity: "expenses",
      required: false,
      dataType: "number",
      description: "Quantity purchased",
      aliases: ["qty", "quantity", "units", "count"],
    },
    {
      key: "notes",
      label: "Notes / Vendor",
      entity: "expenses",
      required: false,
      dataType: "string",
      description: "Vendor name or notes",
      aliases: ["notes", "remarks", "vendor", "supplier", "paid to"],
    },
  ],
  returns: [
    {
      key: "invoice_number",
      label: "Return / Credit Note Number",
      entity: "returns",
      required: true,
      dataType: "string",
      description: "Credit note or return slip number",
      aliases: ["return no", "credit note", "cn no", "slip no", "invoice no", "ref id"],
    },
    {
      key: "date",
      label: "Return Date",
      entity: "returns",
      required: true,
      dataType: "date",
      description: "Date of return or credit note",
      aliases: ["return date", "date", "cn date", "credit date"],
    },
    {
      key: "customer_name",
      label: "Customer / Client Name",
      entity: "returns",
      required: true,
      dataType: "string",
      description: "Customer or store returning items",
      aliases: ["customer", "customer name", "client", "client name", "store name", "party name"],
    },
    {
      key: "total_amount",
      label: "Return / Credit Amount",
      entity: "returns",
      required: true,
      dataType: "currency",
      description: "Total value credited or refunded",
      aliases: ["return amount", "credit amount", "refund amount", "amount", "total", "value"],
    },
    {
      key: "item_name",
      label: "Returned Item Name",
      entity: "returns",
      required: false,
      dataType: "string",
      description: "Product returned",
      aliases: ["item", "item name", "product", "product name"],
    },
    {
      key: "quantity",
      label: "Returned Quantity",
      entity: "returns",
      required: false,
      dataType: "number",
      description: "Quantity returned",
      aliases: ["qty", "quantity", "returned qty"],
    },
    {
      key: "notes",
      label: "Reason / Notes",
      entity: "returns",
      required: false,
      dataType: "string",
      description: "Reason for return or refund",
      aliases: ["reason", "notes", "remarks"],
    },
  ],
  inventory: [
    {
      key: "name",
      label: "Inventory Item Name",
      entity: "inventory",
      required: true,
      dataType: "string",
      description: "Raw material or stock item name",
      aliases: ["item name", "inventory item", "material", "name", "product", "raw material"],
    },
    {
      key: "current_stock",
      label: "Current Stock Quantity",
      entity: "inventory",
      required: true,
      dataType: "number",
      description: "Available quantity in stock",
      aliases: ["current stock", "stock", "qty", "quantity", "closing stock", "opening stock", "available"],
    },
    {
      key: "cost_per_unit",
      label: "Cost Per Unit",
      entity: "inventory",
      required: false,
      dataType: "currency",
      description: "Unit purchase cost",
      aliases: ["cost per unit", "unit cost", "rate", "cost", "price", "purchase price"],
    },
    {
      key: "unit",
      label: "Unit of Measure",
      entity: "inventory",
      required: false,
      dataType: "string",
      description: "Kg, Grams, Litre, Pcs, Box",
      aliases: ["unit", "uom", "measure"],
    },
    {
      key: "category",
      label: "Category",
      entity: "inventory",
      required: false,
      dataType: "string",
      description: "Inventory category",
      aliases: ["category", "group", "type"],
    },
    {
      key: "sku",
      label: "SKU / Code",
      entity: "inventory",
      required: false,
      dataType: "string",
      description: "SKU or item code",
      aliases: ["sku", "code", "item code"],
    },
    {
      key: "min_reorder_level",
      label: "Minimum Reorder Level",
      entity: "inventory",
      required: false,
      dataType: "number",
      description: "Low-stock alert threshold",
      aliases: ["reorder level", "min stock", "minimum stock", "alert level"],
    },
  ],
  purchases: [
    {
      key: "po_number",
      label: "Purchase Order / Bill Number",
      entity: "purchases",
      required: true,
      dataType: "string",
      description: "Purchase order or vendor bill number",
      aliases: ["po no", "po number", "purchase no", "bill no", "vendor bill", "ref no"],
    },
    {
      key: "date",
      label: "Purchase Date",
      entity: "purchases",
      required: true,
      dataType: "date",
      description: "Order or inward date",
      aliases: ["date", "po date", "purchase date", "bill date", "order date"],
    },
    {
      key: "supplier_name",
      label: "Supplier / Vendor Name",
      entity: "purchases",
      required: true,
      dataType: "string",
      description: "Supplier or vendor name",
      aliases: ["supplier", "supplier name", "vendor", "vendor name", "party name", "seller"],
    },
    {
      key: "total_amount",
      label: "Total Purchase Amount",
      entity: "purchases",
      required: true,
      dataType: "currency",
      description: "Total purchase order value",
      aliases: ["total amount", "amount", "total", "bill amount", "po value", "net amount"],
    },
    {
      key: "status",
      label: "Order Status",
      entity: "purchases",
      required: false,
      dataType: "status",
      description: "ORDERED, RECEIVED, DRAFT",
      aliases: ["status", "order status", "delivery status"],
    },
  ],
  suppliers: [
    {
      key: "name",
      label: "Supplier / Vendor Name",
      entity: "suppliers",
      required: true,
      dataType: "string",
      description: "Supplier company or vendor name",
      aliases: ["supplier name", "vendor name", "name", "supplier", "vendor", "company", "party name"],
    },
    {
      key: "contact_person",
      label: "Contact Person",
      entity: "suppliers",
      required: false,
      dataType: "string",
      description: "Primary contact person name",
      aliases: ["contact person", "contact name", "representative", "manager", "person"],
    },
    {
      key: "phone",
      label: "Phone / Mobile",
      entity: "suppliers",
      required: false,
      dataType: "phone",
      description: "Supplier phone number",
      aliases: ["phone", "mobile", "contact", "phone no", "tel"],
    },
    {
      key: "email",
      label: "Email",
      entity: "suppliers",
      required: false,
      dataType: "string",
      description: "Supplier email",
      aliases: ["email", "e-mail", "mail"],
    },
    {
      key: "payment_terms",
      label: "Payment Terms",
      entity: "suppliers",
      required: false,
      dataType: "string",
      description: "e.g. Net 15, Net 30, Cash on Delivery",
      aliases: ["payment terms", "terms", "credit period", "credit days"],
    },
  ],
};

export interface ParsedSheet {
  fileId: string;
  fileName: string;
  sheetName: string;
  headers: string[];
  headerRowIndex: number;
  rows: Record<string, string>[];
  totalRawRows: number;
  emptyRowsSkipped: number;
}

export interface ParsedWorkbook {
  fileId: string;
  fileName: string;
  fileSize: number;
  fileType: "xlsx" | "xls" | "csv";
  sheets: ParsedSheet[];
  parseWarnings: string[];
}

export interface ColumnProfile {
  columnName: string;
  inferredType: DetectedDataType;
  sampleValues: string[];
  nonEmptyCount: number;
  emptyCount: number;
  dateFormatHint?: string;
  currencySymbolHint?: string;
}

export interface SheetAnalysis {
  sheetKey: string;
  fileId: string;
  fileName: string;
  sheetName: string;
  rowCount: number;
  emptyRowsSkipped: number;
  detectedEntity: ImportEntityType;
  entityConfidence: number;
  columnProfiles: ColumnProfile[];
  detectedDateFormats: string[];
  detectedCurrencies: string[];
  estimatedDuplicatesCount: number;
  relatedSheetKeys: string[];
  includeInImport: boolean;
}

export interface ColumnMappingEntry {
  sourceColumn: string;
  targetField: string | "__ignore__" | "";
  confidence: number;
  confidenceLevel: ConfidenceLevel;
  inferredType: DetectedDataType;
  isCompatibleType: boolean;
  sampleValues: string[];
  reason?: string;
}

export interface SheetMappingConfig {
  sheetKey: string;
  fileName: string;
  sheetName: string;
  entityType: ImportEntityType;
  includeInImport: boolean;
  mappings: ColumnMappingEntry[];
  missingRequiredFields: string[];
  duplicateTargetFields: string[];
  aiSource?: "gemini" | "groq" | "deterministic";
}

export interface ValidationIssue {
  id: string;
  rowId: string;
  sheetKey: string;
  fileName: string;
  sheetName: string;
  rowNumber: number;
  entityType: ImportEntityType;
  field: string;
  code:
    | "MISSING_REQUIRED"
    | "INVALID_DATE"
    | "INVALID_NUMBER"
    | "NEGATIVE_AMOUNT"
    | "MATH_DISCREPANCY"
    | "BALANCE_MISMATCH"
    | "DUPLICATE_IN_FILE"
    | "DUPLICATE_IN_DB"
    | "MISSING_COST_DATA"
    | "UNLINKED_REFERENCE";
  severity: "error" | "warning";
  message: string;
  originalValue?: string;
  suggestedValue?: string;
}

export interface StagedImportRecord {
  id: string;
  sheetKey: string;
  fileName: string;
  sheetName: string;
  rowNumber: number;
  entityType: ImportEntityType;
  sourceFingerprint: string;
  rawValues: Record<string, string>;
  normalized: Record<string, any>;
  status: "valid" | "warning" | "invalid";
  duplicateStatus: "unique" | "file_duplicate" | "existing_duplicate";
  duplicateMatchInfo?: string;
  action: "import" | "skip" | "merge";
  issues: ValidationIssue[];
}

export interface ValidationSummary {
  totalStaged: number;
  validCount: number;
  warningCount: number;
  invalidCount: number;
  duplicateCount: number;
  missingFieldsCount: number;
  mathDiscrepancyCount: number;
  missingCostCount: number;
  byEntity: Record<
    ImportEntityType,
    {
      total: number;
      toImport: number;
      toMerge: number;
      toSkip: number;
      invalid: number;
    }
  >;
}

// Strict Zod Schema for AI Column Mapping Responses
export const AIColumnMappingResponseSchema = z.object({
  detectedEntity: z
    .enum([
      "invoices",
      "invoice_items",
      "customers",
      "products",
      "payments",
      "expenses",
      "returns",
      "inventory",
      "purchases",
      "suppliers",
    ])
    .optional(),
  mappings: z.array(
    z.object({
      sourceColumn: z.string(),
      targetField: z.string(),
      confidence: z.number().min(0).max(100),
      reason: z.string().optional(),
    })
  ),
});

export type AIColumnMappingResponse = z.infer<typeof AIColumnMappingResponseSchema>;


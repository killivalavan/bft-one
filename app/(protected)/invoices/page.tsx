"use client";

import React, { useState, useEffect, useMemo } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { useTenant } from "@/lib/context/TenantContext";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils/cn";
import { generateBillPdf, BillPdfData } from "@/lib/utils/billPdf";
import { numberToIndianRupeesWords } from "@/lib/utils/numberToWords";
import { ImageCropperModal } from "@/components/ui/ImageCropperModal";
import { useUser } from "@/lib/hooks/useUser";
import { useProfile } from "@/lib/hooks/useProfile";
import {
  FileText, Plus, Search, Download, Edit2, Copy, CheckCircle2,
  Trash2, ArrowLeft, Building2, Store,
  Percent, ShieldCheck, Check, X, Save, Upload, Crop,
  CreditCard, ChevronUp, ChevronDown, ShieldAlert, Loader2, UserCheck, Users,
  Tag, Receipt, PlusCircle, Sparkles
} from "lucide-react";

export type InvoiceRow = {
  id: string;
  name: string;
  qty: number;
  unit: string;
  rate: number;
  amount: number;
};

export type SavedCustomer = {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  gstin?: string;
};

export type CustomAdjustment = {
  id: string;
  key?: "discount" | "tds" | "custom";
  label: string;
  amount: number;
  type: "deduction" | "addition";
};

export type SavedInvoice = {
  id: string;
  invoiceNumber: string;
  title: string;
  date: string;
  dueDate: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerGstin: string;
  items: InvoiceRow[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  tdsAmount: number;
  discountAmount: number;
  additionalCharges: number;
  adjustments?: CustomAdjustment[];
  totalAmount: number;
  status: "paid" | "unpaid";
  paymentMode: string;
  notes?: string;
  bankDetails?: { bankName: string; accountNo: string; ifsc: string; branch: string };
  upiDetails?: { upiId: string; payeeName: string };
  createdAt: string;
};

const DEFAULT_UNITS = ["Unit", "Cups", "Pcs", "Kg", "Grams", "Boxes", "Litre", "Plate", "Sets"];

const INITIAL_DEFAULT_CUSTOMERS: SavedCustomer[] = [
  {
    id: "cust-1",
    name: "Protechsoft Technologies Pvt Ltd",
    address: "PACIFICA TECH PARK, Survey No.76, No.23, 2nd Floor, Block-1, Module No.2E, Core-3, Rajiv Gandhi Salai (OMR), Navalur, Chennai, Tamil Nadu, India - 600130",
    phone: "+91 98765 43210",
    gstin: "33AAAAA0000A1Z5",
  },
  {
    id: "cust-2",
    name: "TCS Siruseri Campus",
    address: "SIPCOT IT Park, Siruseri, Chennai, Tamil Nadu - 603103",
    phone: "+91 98400 12345",
    gstin: "33AAACT1234F1Z8",
  },
  {
    id: "cust-3",
    name: "Cognizant Technology Solutions",
    address: "DLF Cybercity, Manapakkam, Chennai, Tamil Nadu - 600089",
    phone: "+91 98401 98765",
    gstin: "33AAACC5678K1Z2",
  }
];

export default function InvoicesPage() {
  const { user, loading: userLoading } = useUser();
  const { flags, loading: profileLoading } = useProfile();
  const { business } = useTenant();
  const { toast } = useToast();

  // Mode: "list" (history view) or "builder" (editor view)
  const [view, setView] = useState<"list" | "builder">("list");

  // Invoices list state
  const [invoices, setInvoices] = useState<SavedInvoice[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "paid" | "unpaid">("all");
  const [loading, setLoading] = useState(true);

  // Saved Customers Directory
  const [savedCustomers, setSavedCustomers] = useState<SavedCustomer[]>(INITIAL_DEFAULT_CUSTOMERS);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");

  // Shop Products catalog for dropdown autocomplete
  const [catalog, setCatalog] = useState<{ id: string; name: string; price: number }[]>([]);
  const [openCatalogRowId, setOpenCatalogRowId] = useState<string | null>(null);
  const [openUnitRowId, setOpenUnitRowId] = useState<string | null>(null);
  const [openCustomerDropdown, setOpenCustomerDropdown] = useState(false);
  const [openStatusDropdown, setOpenStatusDropdown] = useState(false);
  const [openGstDropdown, setOpenGstDropdown] = useState(false);

  // Builder Form State
  const [currentInvoiceId, setCurrentInvoiceId] = useState<string | null>(null);
  const [invoiceTitle, setInvoiceTitle] = useState("INVOICE AUG 2026");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("A00018");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" }));
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" }));

  // Billed By & Billed To
  const [billedByName, setBilledByName] = useState("Brown fening tea");
  const [billedByAddress, setBilledByAddress] = useState("255, Rajiv Gandhi Salai (OMR), Navalur, Chennai, Tamil Nadu, India - 600130");
  const [billedByPhone, setBilledByPhone] = useState("+91 98765 43210");
  const [billedByGstin, setBilledByGstin] = useState("");
  const [isEditingBilledBy, setIsEditingBilledBy] = useState(false);

  const [billedToName, setBilledToName] = useState("Protechsoft Technologies Pvt Ltd");
  const [billedToAddress, setBilledToAddress] = useState("PACIFICA TECH PARK, Survey No.76, No.23, 2nd Floor, Block-1, Module No.2E, Core-3, Rajiv Gandhi Salai (OMR), Navalur, Chennai, Tamil Nadu, India - 600130");
  const [billedToPhone, setBilledToPhone] = useState("+91 98765 43210");
  const [billedToGstin, setBilledToGstin] = useState("33AAAAA0000A1Z5");
  const [isEditingBilledTo, setIsEditingBilledTo] = useState(false);

  // Logo & Signature
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [signatureUrl, setSignatureUrl] = useState("/default-signature.svg");

  // Items
  const [items, setItems] = useState<InvoiceRow[]>([
    { id: "row-1", name: "Plain Tea", qty: 1920, unit: "Unit", rate: 13, amount: 24960 },
    { id: "row-2", name: "Coffee", qty: 1250, unit: "Unit", rate: 18, amount: 22500 },
    { id: "row-3", name: "Milk", qty: 458, unit: "Unit", rate: 15, amount: 6870 },
    { id: "row-4", name: "Black coffee", qty: 245, unit: "Unit", rate: 10, amount: 2450 },
    { id: "row-5", name: "Lemon tea", qty: 195, unit: "Unit", rate: 15, amount: 2925 },
    { id: "row-6", name: "Green tea bag", qty: 100, unit: "Unit", rate: 7, amount: 700 },
    { id: "row-7", name: "BFT Plain (Small)", qty: 1, unit: "Unit", rate: 10, amount: 10 },
    { id: "row-8", name: "Lemon", qty: 14, unit: "Unit", rate: 3, amount: 42 },
    { id: "row-9", name: "B Sugar", qty: 14, unit: "Unit", rate: 5, amount: 70 },
  ]);

  // Tax & Custom Adjustments (TDS, Discount, Custom text additions/deductions)
  const [enableGst, setEnableGst] = useState(false);
  const [taxRate, setTaxRate] = useState(5);

  const [adjustments, setAdjustments] = useState<CustomAdjustment[]>([]);

  const [invoiceStatus, setInvoiceStatus] = useState<"paid" | "unpaid">("paid");

  // Bank & UPI details
  const [bankDetails, setBankDetails] = useState({ bankName: "", accountNo: "", ifsc: "", branch: "" });
  const [showBankDetails, setShowBankDetails] = useState(false);
  const [upiDetails, setUpiDetails] = useState({ upiId: "", payeeName: "" });
  const [showUpiDetails, setShowUpiDetails] = useState(false);

  // Cropper Modal
  const [cropperState, setCropperState] = useState<{
    isOpen: boolean;
    imageSrc: string;
    cropType: "logo" | "signature";
    aspectRatio: number;
    title: string;
    minSize: number;
  }>({
    isOpen: false,
    imageSrc: "",
    cropType: "logo",
    aspectRatio: 1,
    title: "Crop Shop Logo",
    minSize: 60,
  });

  // 1. Initial Load: Invoices from Local Storage & Supabase + Catalog + Customers
  useEffect(() => {
    const bizId = business?.id || "default";

    // Load saved customers
    try {
      const storedCusts = localStorage.getItem(`bftone_customers_${bizId}`);
      if (storedCusts) {
        setSavedCustomers(JSON.parse(storedCusts));
      }
    } catch {}

    // Load from local storage immediately
    try {
      const stored = localStorage.getItem(`bftone_invoices_${bizId}`);
      if (stored) {
        setInvoices(JSON.parse(stored));
      } else {
        // Mock sample initial invoice if empty
        const sample: SavedInvoice = {
          id: "inv-sample-1",
          invoiceNumber: "A00018",
          title: "INVOICE AUG 2026",
          date: "Aug 31, 2026",
          dueDate: "Sep 15, 2026",
          customerName: "Protechsoft Technologies Pvt Ltd",
          customerPhone: "+91 98765 43210",
          customerAddress: "PACIFICA TECH PARK, Survey No.76, No.23, 2nd Floor, Block-1, Module No.2E, Core-3, Rajiv Gandhi Salai (OMR), Navalur, Chennai, Tamil Nadu, India - 600130",
          customerGstin: "33AAAAA0000A1Z5",
          items: [
            { id: "1", name: "Plain Tea", qty: 1920, unit: "Unit", rate: 13, amount: 24960 },
            { id: "2", name: "Coffee", qty: 1250, unit: "Unit", rate: 18, amount: 22500 },
            { id: "3", name: "Milk", qty: 458, unit: "Unit", rate: 15, amount: 6870 },
            { id: "4", name: "Black coffee", qty: 245, unit: "Unit", rate: 10, amount: 2450 },
            { id: "5", name: "Lemon tea", qty: 195, unit: "Unit", rate: 15, amount: 2925 },
            { id: "6", name: "Green tea bag", qty: 100, unit: "Unit", rate: 7, amount: 700 },
            { id: "7", name: "BFT Plain (Small)", qty: 1, unit: "Unit", rate: 10, amount: 10 },
            { id: "8", name: "Lemon", qty: 14, unit: "Unit", rate: 3, amount: 42 },
            { id: "9", name: "B Sugar", qty: 14, unit: "Unit", rate: 5, amount: 70 },
          ],
          subtotal: 60527,
          taxRate: 0,
          taxAmount: 0,
          tdsAmount: 605,
          discountAmount: 0,
          additionalCharges: 0,
          adjustments: [
            { id: "adj-sample", key: "tds", label: "TDS", amount: 605, type: "deduction" }
          ],
          totalAmount: 59922,
          status: "paid",
          paymentMode: "Bank Transfer",
          createdAt: new Date().toISOString(),
        };
        setInvoices([sample]);
        localStorage.setItem(`bftone_invoices_${bizId}`, JSON.stringify([sample]));
      }
    } catch {}

    // Load Store Profile Branding
    if (business) {
      setBilledByName(business.name || "Brown fening tea");
      setLogoUrl(business.logo_url || null);
      setSignatureUrl((business as any)?.signature_url || "/default-signature.svg");
      setBilledByAddress((business as any)?.address || "255, Rajiv Gandhi Salai (OMR), Navalur, Chennai, Tamil Nadu, India - 600130");
      setBilledByPhone((business as any)?.phone || "+91 98765 43210");
      setBilledByGstin((business as any)?.gstin || "");
    }

    // Fetch product catalog for auto-complete dropdown
    (async () => {
      try {
        let query = supabaseClient.from("products").select("id, name, price_cents").eq("active", true).order("name");
        if (business?.id) query = query.eq("business_id", business.id);
        const { data: prods } = await query;
        if (prods && prods.length > 0) {
          setCatalog(prods.map(p => ({ id: p.id, name: p.name, price: p.price_cents / 100 })));
        } else {
          // Mock standard cafe items
          setCatalog([
            { id: "c1", name: "Plain Tea", price: 13 },
            { id: "c2", name: "Coffee", price: 18 },
            { id: "c3", name: "Milk", price: 15 },
            { id: "c4", name: "Black coffee", price: 10 },
            { id: "c5", name: "Lemon tea", price: 15 },
            { id: "c6", name: "Green tea bag", price: 7 },
            { id: "c7", name: "BFT Plain (Small)", price: 10 },
            { id: "c8", name: "Lemon", price: 3 },
            { id: "c9", name: "B Sugar", price: 5 },
            { id: "c10", name: "Special Dum Chai", price: 25 },
            { id: "c11", name: "Masala Ginger Tea", price: 30 },
          ]);
        }
      } catch {}
      setLoading(false);
    })();
  }, [business?.id]);

  // Persist Invoices
  function persistInvoices(updated: SavedInvoice[]) {
    setInvoices(updated);
    const bizId = business?.id || "default";
    try {
      localStorage.setItem(`bftone_invoices_${bizId}`, JSON.stringify(updated));
    } catch {}
  }

  // Persist & Save Customer
  function saveCustomerToDirectory(name: string, address: string, phone: string, gstin: string) {
    if (!name.trim()) return;
    const bizId = business?.id || "default";
    const existingIndex = savedCustomers.findIndex(c => c.name.toLowerCase().trim() === name.toLowerCase().trim());
    let nextList: SavedCustomer[];
    if (existingIndex >= 0) {
      nextList = savedCustomers.map((c, i) => i === existingIndex ? { ...c, address, phone, gstin } : c);
    } else {
      const newCust: SavedCustomer = {
        id: `cust-${Date.now()}`,
        name: name.trim(),
        address: address.trim(),
        phone: phone.trim(),
        gstin: gstin.trim(),
      };
      nextList = [newCust, ...savedCustomers];
    }
    setSavedCustomers(nextList);
    try {
      localStorage.setItem(`bftone_customers_${bizId}`, JSON.stringify(nextList));
    } catch {}
  }

  // Live Subtotal & Total Calculations
  const totalDeductions = useMemo(() => {
    return adjustments.filter(a => a.type === "deduction").reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
  }, [adjustments]);

  const totalAdditions = useMemo(() => {
    return adjustments.filter(a => a.type === "addition").reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
  }, [adjustments]);

  const calculatedSubtotal = useMemo(() => {
    return items.reduce((sum, it) => sum + (it.qty * it.rate), 0);
  }, [items]);

  const calculatedTax = useMemo(() => {
    return enableGst ? (calculatedSubtotal * (taxRate / 100)) : 0;
  }, [calculatedSubtotal, enableGst, taxRate]);

  const calculatedGrandTotal = useMemo(() => {
    return Math.max(0, calculatedSubtotal + calculatedTax - totalDeductions + totalAdditions);
  }, [calculatedSubtotal, calculatedTax, totalDeductions, totalAdditions]);

  const totalInWords = useMemo(() => {
    return numberToIndianRupeesWords(calculatedGrandTotal);
  }, [calculatedGrandTotal]);

  // Adjustments Helpers
  function addAdjustment(label: string, amount: number, key: "discount" | "tds" | "custom" = "custom", type: "deduction" | "addition" = "deduction") {
    const newAdj: CustomAdjustment = {
      id: `adj-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      key,
      label,
      amount,
      type,
    };
    setAdjustments(prev => [...prev, newAdj]);
  }

  function updateAdjustment(id: string, field: "label" | "amount" | "type", value: any) {
    setAdjustments(prev => prev.map(a => a.id === id ? { ...a, [field]: value } : a));
  }

  function removeAdjustment(id: string) {
    setAdjustments(prev => prev.filter(a => a.id !== id));
  }

  // Handle Item Row Updates with Auto-Rate Population
  function updateRow(id: string, field: keyof InvoiceRow, value: any) {
    setItems(prev => prev.map(row => {
      if (row.id !== id) return row;
      const updated = { ...row, [field]: value };
      
      // If user typed product name, check if price exists in catalog
      if (field === "name") {
        const match = catalog.find(c => c.name.toLowerCase() === String(value).toLowerCase());
        if (match) {
          updated.rate = match.price;
          updated.amount = updated.qty * match.price;
          return updated;
        }
      }

      if (field === "qty" || field === "rate") {
        const q = field === "qty" ? Math.max(0, Number(value) || 0) : row.qty;
        const r = field === "rate" ? Math.max(0, Number(value) || 0) : row.rate;
        updated.amount = q * r;
      }
      return updated;
    }));
  }

  // Select Item from Autocomplete / Catalog (instantly sets Name and Rate)
  function handleSelectCatalogItem(rowId: string, itemName: string, customPrice?: number) {
    const match = catalog.find(c => c.name.toLowerCase() === itemName.toLowerCase());
    const price = customPrice !== undefined ? customPrice : (match ? match.price : 0);
    setItems(prev => prev.map(row => {
      if (row.id !== rowId) return row;
      const finalRate = price > 0 ? price : row.rate;
      return {
        ...row,
        name: itemName,
        rate: finalRate,
        amount: row.qty * finalRate
      };
    }));
  }

  // Add Row
  function addNewRow() {
    const newId = `row-${Date.now()}`;
    setItems(prev => [
      ...prev,
      { id: newId, name: "", qty: 1, unit: "Unit", rate: 0, amount: 0 }
    ]);
  }

  // Move Row
  function moveRow(idx: number, direction: "up" | "down") {
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= items.length) return;
    const next = [...items];
    const temp = next[idx];
    next[idx] = next[targetIdx];
    next[targetIdx] = temp;
    setItems(next);
  }

  // Remove Row
  function removeRow(id: string) {
    if (items.length <= 1) {
      toast({ title: "Cannot delete", description: "Invoice must have at least 1 item", variant: "error" });
      return;
    }
    setItems(prev => prev.filter(r => r.id !== id));
  }

  // Open New Invoice Builder
  function handleCreateNewInvoice() {
    const now = new Date();
    const monthYear = `INVOICE ${now.toLocaleDateString("en-US", { month: "short", year: "numeric" }).toUpperCase()}`;
    const nextNum = `A${String(invoices.length + 18).padStart(5, "0")}`;

    setCurrentInvoiceId(null);
    setInvoiceTitle(monthYear);
    setInvoiceNumber(nextNum);
    setInvoiceDate(now.toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" }));
    setDueDate(new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" }));
    
    // Auto-fill from first saved customer if available
    if (savedCustomers.length > 0) {
      const first = savedCustomers[0];
      setSelectedCustomerId(first.id);
      setBilledToName(first.name);
      setBilledToAddress(first.address || "");
      setBilledToPhone(first.phone || "");
      setBilledToGstin(first.gstin || "");
    } else {
      setSelectedCustomerId("");
      setBilledToName("");
      setBilledToAddress("");
      setBilledToPhone("");
      setBilledToGstin("");
    }

    setItems([
      { id: "row-1", name: "", qty: 1, unit: "Unit", rate: 0, amount: 0 }
    ]);
    setAdjustments([]);
    setEnableGst(false);
    setInvoiceStatus("unpaid");
    setView("builder");
  }

  // Open Existing Invoice for Edit
  function handleEditInvoice(inv: SavedInvoice) {
    setCurrentInvoiceId(inv.id);
    setInvoiceTitle(inv.title);
    setInvoiceNumber(inv.invoiceNumber);
    setInvoiceDate(inv.date);
    setDueDate(inv.dueDate);
    setBilledToName(inv.customerName);
    setBilledToAddress(inv.customerAddress);
    setBilledToPhone(inv.customerPhone);
    setBilledToGstin(inv.customerGstin);
    
    // Match customer ID
    const match = savedCustomers.find(c => c.name.toLowerCase() === inv.customerName.toLowerCase());
    setSelectedCustomerId(match ? match.id : "__custom__");

    setItems(inv.items.map(it => ({ ...it })));
    
    // Adjustments
    if (inv.adjustments && inv.adjustments.length > 0) {
      setAdjustments(inv.adjustments);
    } else {
      const parsedAdjs: CustomAdjustment[] = [];
      if (inv.tdsAmount && inv.tdsAmount > 0) {
        parsedAdjs.push({ id: "adj-tds", label: "TDS Deduction", amount: inv.tdsAmount, type: "deduction" });
      }
      if (inv.discountAmount && inv.discountAmount > 0) {
        parsedAdjs.push({ id: "adj-disc", label: "Discount", amount: inv.discountAmount, type: "deduction" });
      }
      if (inv.additionalCharges && inv.additionalCharges > 0) {
        parsedAdjs.push({ id: "adj-extra", label: "Additional Charges", amount: inv.additionalCharges, type: "addition" });
      }
      setAdjustments(parsedAdjs);
    }

    setEnableGst((inv.taxRate || 0) > 0);
    setTaxRate(inv.taxRate || 5);
    setInvoiceStatus(inv.status);
    if (inv.bankDetails) {
      setBankDetails(inv.bankDetails);
      setShowBankDetails(true);
    }
    if (inv.upiDetails) {
      setUpiDetails(inv.upiDetails);
      setShowUpiDetails(true);
    }
    setView("builder");
  }

  // Duplicate Existing Invoice
  function handleDuplicateInvoice(inv: SavedInvoice) {
    const nextNum = `A${String(invoices.length + 19).padStart(5, "0")}`;
    const duplicated: SavedInvoice = {
      ...inv,
      id: `inv-${Date.now()}`,
      invoiceNumber: nextNum,
      title: `${inv.title} (Copy)`,
      date: new Date().toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" }),
      status: "unpaid",
      createdAt: new Date().toISOString(),
    };
    persistInvoices([duplicated, ...invoices]);
    toast({ title: "Invoice Duplicated! 📋", description: `Created #${nextNum}`, variant: "success" });
  }

  // Toggle Paid Status
  function toggleInvoiceStatus(id: string) {
    const updated = invoices.map(inv => {
      if (inv.id !== id) return inv;
      const nextStatus = inv.status === "paid" ? "unpaid" : "paid";
      return { ...inv, status: nextStatus as "paid" | "unpaid" };
    });
    persistInvoices(updated);
    toast({ title: "Status Updated", description: `Invoice status changed`, variant: "success" });
  }

  // Delete Invoice
  function deleteInvoice(id: string) {
    if (!confirm("Are you sure you want to delete this invoice?")) return;
    const updated = invoices.filter(i => i.id !== id);
    persistInvoices(updated);
    toast({ title: "Invoice deleted", variant: "info" });
  }

  // Save Current Invoice in Builder
  function handleSaveInvoice() {
    if (!billedToName.trim()) {
      toast({ title: "Customer Name Required", description: "Please enter or select the Billed To client name", variant: "error" });
      return;
    }

    // Auto-save client to customer directory for future dropdown selection
    saveCustomerToDirectory(billedToName, billedToAddress, billedToPhone, billedToGstin);

    const payload: SavedInvoice = {
      id: currentInvoiceId || `inv-${Date.now()}`,
      invoiceNumber,
      title: invoiceTitle,
      date: invoiceDate,
      dueDate,
      customerName: billedToName.trim(),
      customerPhone: billedToPhone.trim(),
      customerAddress: billedToAddress.trim(),
      customerGstin: billedToGstin.trim(),
      items: [...items],
      subtotal: calculatedSubtotal,
      taxRate: enableGst ? taxRate : 0,
      taxAmount: calculatedTax,
      tdsAmount: totalDeductions,
      discountAmount: 0,
      additionalCharges: totalAdditions,
      adjustments: [...adjustments],
      totalAmount: calculatedGrandTotal,
      status: invoiceStatus,
      paymentMode: "UPI / Bank",
      bankDetails: showBankDetails ? bankDetails : undefined,
      upiDetails: showUpiDetails ? upiDetails : undefined,
      createdAt: new Date().toISOString(),
    };

    let updated: SavedInvoice[];
    if (currentInvoiceId) {
      updated = invoices.map(inv => inv.id === currentInvoiceId ? payload : inv);
    } else {
      updated = [payload, ...invoices];
    }

    persistInvoices(updated);
    toast({ title: "Invoice Saved! 💾", description: `Invoice #${invoiceNumber} stored successfully`, variant: "success" });
    setView("list");
  }

  // Generate & Download PDF
  async function handleDownloadCurrentPdf() {
    try {
      const pdfData: BillPdfData = {
        orderId: invoiceNumber,
        items: items.map(it => ({
          name: it.name,
          qty: it.qty,
          unit: it.unit,
          rate: it.rate,
          amount: it.amount,
        })),
        subtotal: calculatedSubtotal,
        taxAmount: calculatedTax,
        taxRate: enableGst ? taxRate : 0,
        customAdjustments: adjustments.map(a => ({
          label: a.label,
          amount: a.amount,
          type: a.type,
        })),
        totalAmount: calculatedGrandTotal,
        customerName: billedToName.trim() || "Client Name",
        customerPhone: billedToPhone.trim(),
        customerAddress: billedToAddress.trim(),
        customerGstin: billedToGstin.trim(),
        date: invoiceDate,
        dueDate: dueDate,
        invoiceTitle: invoiceTitle,
        businessName: billedByName,
        businessAddress: billedByAddress,
        businessPhone: billedByPhone,
        businessGstin: billedByGstin,
        bankDetails: showBankDetails ? bankDetails : undefined,
        upiDetails: showUpiDetails ? upiDetails : undefined,
        logoUrl: logoUrl || undefined,
        signatureUrl: signatureUrl || "/default-signature.svg",
        currencySymbol: "₹",
      };

      const savedName = await generateBillPdf(pdfData);
      toast({ title: "Invoice PDF Downloaded! 📄", description: `Saved as ${savedName}`, variant: "success" });
    } catch (e: any) {
      toast({ title: "PDF Export Error", description: e?.message, variant: "error" });
    }
  }

  // Filtered invoices for list view
  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      if (statusFilter !== "all" && inv.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesNum = inv.invoiceNumber.toLowerCase().includes(q);
        const matchesClient = inv.customerName.toLowerCase().includes(q);
        const matchesTitle = inv.title.toLowerCase().includes(q);
        if (!matchesNum && !matchesClient && !matchesTitle) return false;
      }
      return true;
    });
  }, [invoices, statusFilter, searchQuery]);

  // Stats
  const totalInvoicedSum = useMemo(() => invoices.reduce((sum, i) => sum + i.totalAmount, 0), [invoices]);
  const totalPaidSum = useMemo(() => invoices.filter(i => i.status === "paid").reduce((sum, i) => sum + i.totalAmount, 0), [invoices]);
  const totalUnpaidSum = useMemo(() => invoices.filter(i => i.status === "unpaid").reduce((sum, i) => sum + i.totalAmount, 0), [invoices]);

  // Strict Phone Validation
  function handlePhoneChange(val: string, setter: (v: string) => void) {
    const cleaned = val.replace(/[^0-9+\s-]/g, "").slice(0, 15);
    setter(cleaned);
  }

  // Admin Access Gate
  if (userLoading || profileLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center gap-2 text-[#64748B]">
        <Loader2 className="animate-spin w-5 h-5 text-[#2563EB]" />
        <span className="text-xs font-bold">Verifying Administrator Access...</span>
      </div>
    );
  }

  if (!flags?.isAdmin) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6">
        <div className="w-16 h-16 bg-slate-100 rounded-lg flex items-center justify-center text-slate-600 mb-4 shadow-xs border border-[#E2E8F0]">
          <ShieldAlert size={32} />
        </div>
        <h2 className="text-xl font-bold text-[#0F172A]">Restricted Access</h2>
        <p className="text-xs text-[#64748B] mt-2 max-w-sm">
          Only store administrators have authorization to view, create, and manage official tax invoices.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] py-6 px-3 sm:px-6 lg:px-8">
      {/* Desktop Max Width Container with subtle left/right padding */}
      <div className="max-w-[1240px] mx-auto space-y-6">

        {/* ======================================================== */}
        {/* 1. LIST VIEW: INVOICE HISTORY & TRACKER                  */}
        {/* ======================================================== */}
        {view === "list" && (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-[#E2E8F0] shadow-xs">
              <div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#2563EB] text-white flex items-center justify-center font-bold shadow-xs">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight">Invoice Generator &amp; History</h1>
                    <p className="text-xs text-[#64748B] mt-0.5">Manage, create, and track tax invoices for {business?.name || "your store"}</p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleCreateNewInvoice}
                className="px-5 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold rounded-lg shadow-xs flex items-center gap-2 transition-all cursor-pointer hover:scale-[1.01] active:scale-98 self-start sm:self-auto"
              >
                <Plus className="w-4 h-4" />
                <span>Create New Invoice</span>
              </button>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs">
                <span className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">Total Invoiced</span>
                <div className="text-2xl font-bold text-[#0F172A] mt-1">₹{totalInvoicedSum.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
                <p className="text-[11px] text-[#64748B] mt-0.5">{invoices.length} invoices generated</p>
              </div>

              <div className="bg-[#F0FDF4] p-5 rounded-xl border border-[#DCFCE7] shadow-xs">
                <span className="text-xs font-semibold text-[#16A34A] uppercase tracking-wider">Total Received (Paid)</span>
                <div className="text-2xl font-bold text-[#15803D] mt-1">₹{totalPaidSum.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
                <p className="text-[11px] text-[#16A34A] mt-0.5">{invoices.filter(i => i.status === "paid").length} settled invoices</p>
              </div>

              <div className="bg-[#FFFBEB] p-5 rounded-xl border border-[#FEF3C7] shadow-xs">
                <span className="text-xs font-semibold text-[#D97706] uppercase tracking-wider">Pending (Unpaid)</span>
                <div className="text-2xl font-bold text-[#B45309] mt-1">₹{totalUnpaidSum.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
                <p className="text-[11px] text-[#B45309] mt-0.5">{invoices.filter(i => i.status === "unpaid").length} pending collection</p>
              </div>
            </div>

            {/* Search & Filter Toolbar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border border-[#E2E8F0] shadow-xs">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by invoice # or client..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-white rounded-lg border border-[#E2E8F0] text-xs focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 outline-none font-medium text-[#0F172A]"
                />
              </div>

              <div className="flex items-center gap-1.5 self-end sm:self-auto text-xs font-semibold">
                <button
                  onClick={() => setStatusFilter("all")}
                  className={cn("px-3.5 py-1.5 rounded-lg border transition-all cursor-pointer", statusFilter === "all" ? "bg-[#2563EB] text-white border-[#2563EB] shadow-xs" : "bg-white text-[#64748B] border-[#E2E8F0] hover:bg-slate-50")}
                >
                  All ({invoices.length})
                </button>
                <button
                  onClick={() => setStatusFilter("paid")}
                  className={cn("px-3.5 py-1.5 rounded-lg border transition-all cursor-pointer", statusFilter === "paid" ? "bg-[#16A34A] text-white border-[#16A34A] shadow-xs" : "bg-white text-[#64748B] border-[#E2E8F0] hover:bg-slate-50")}
                >
                  Paid ({invoices.filter(i => i.status === "paid").length})
                </button>
                <button
                  onClick={() => setStatusFilter("unpaid")}
                  className={cn("px-3.5 py-1.5 rounded-lg border transition-all cursor-pointer", statusFilter === "unpaid" ? "bg-[#D97706] text-white border-[#D97706] shadow-xs" : "bg-white text-[#64748B] border-[#E2E8F0] hover:bg-slate-50")}
                >
                  Unpaid ({invoices.filter(i => i.status === "unpaid").length})
                </button>
              </div>
            </div>

            {/* Invoices Table */}
            <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#EFF6FF] border-b border-[#DBEAFE] text-[11px] font-bold text-[#1E3A8A] uppercase tracking-wider">
                      <th className="py-3.5 px-4">Invoice #</th>
                      <th className="py-3.5 px-4">Date &amp; Due</th>
                      <th className="py-3.5 px-4">Billed To (Client)</th>
                      <th className="py-3.5 px-4">Items</th>
                      <th className="py-3.5 px-4 text-center">Amount</th>
                      <th className="py-3.5 px-4 text-center">Status</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0] text-xs bg-white">
                    {filteredInvoices.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-[#64748B]">
                          <FileText className="w-10 h-10 mx-auto mb-2 text-[#94A3B8]" />
                          <p className="font-bold text-[#0F172A]">No invoices found</p>
                          <p className="text-[11px] mt-0.5 text-[#64748B]">Click "Create New Invoice" to start</p>
                        </td>
                      </tr>
                    ) : (
                      filteredInvoices.map(inv => (
                        <tr
                          key={inv.id}
                          className="hover:bg-[#F8FAFC] transition-colors border-b border-[#E2E8F0]"
                        >
                          {/* Invoice # - Clicking here opens in same tab */}
                          <td className="py-3.5 px-4 font-bold text-[#2563EB]">
                            <button
                              onClick={() => handleEditInvoice(inv)}
                              title="Click to open and edit invoice"
                              className="font-bold text-[#2563EB] hover:text-[#1D4ED8] hover:underline cursor-pointer text-left transition-colors"
                            >
                              {inv.invoiceNumber}
                            </button>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-[#0F172A]">{inv.date}</div>
                            <div className="text-[10px] text-[#64748B]">Due: {inv.dueDate}</div>
                          </td>
                          <td className="py-3.5 px-4 max-w-[240px]">
                            <div className="font-semibold text-[#0F172A] truncate">{inv.customerName}</div>
                            <div className="text-[10px] text-[#64748B] truncate">{inv.customerAddress}</div>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 font-semibold text-slate-700 text-[10px] border border-slate-200">
                              {inv.items.length} items
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center font-bold text-[#0F172A] text-sm">
                            ₹{inv.totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </td>
                          {/* Non-clickable static status badge */}
                          <td className="py-3.5 px-4 text-center">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border select-none",
                                inv.status === "paid"
                                  ? "bg-[#F0FDF4] text-[#15803D] border-[#BBF7D0]"
                                  : "bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]"
                              )}
                            >
                              <span className={cn("w-1.5 h-1.5 rounded-full", inv.status === "paid" ? "bg-[#16A34A]" : "bg-[#F59E0B]")} />
                              <span>{inv.status}</span>
                            </span>
                          </td>
                          {/* Action icons with dedicated Mark as Paid icon */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {/* Dedicated Mark as Paid / Unpaid toggle icon */}
                              <button
                                onClick={() => toggleInvoiceStatus(inv.id)}
                                title={inv.status === "paid" ? "Click to Mark as Unpaid" : "Click to Mark as Paid"}
                                className={cn(
                                  "p-1.5 rounded-lg transition-colors cursor-pointer",
                                  inv.status === "paid"
                                    ? "text-[#16A34A] hover:bg-[#F0FDF4]"
                                    : "text-slate-400 hover:text-[#2563EB] hover:bg-[#EFF6FF]"
                                )}
                              >
                                {inv.status === "paid" ? (
                                  <CheckCircle2 className="w-4 h-4 text-[#16A34A]" />
                                ) : (
                                  <Check className="w-4 h-4" />
                                )}
                              </button>

                              {/* Edit in same tab */}
                              <button
                                onClick={() => handleEditInvoice(inv)}
                                title="Edit Invoice"
                                className="p-1.5 text-slate-600 hover:text-[#2563EB] hover:bg-[#EFF6FF] rounded-lg transition-colors cursor-pointer"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>

                              {/* Duplicate */}
                              <button
                                onClick={() => handleDuplicateInvoice(inv)}
                                title="Duplicate Invoice"
                                className="p-1.5 text-slate-600 hover:text-[#2563EB] hover:bg-[#EFF6FF] rounded-lg transition-colors cursor-pointer"
                              >
                                <Copy className="w-4 h-4" />
                              </button>

                              {/* Download PDF */}
                              <button
                                onClick={() => {
                                  generateBillPdf({
                                    orderId: inv.invoiceNumber,
                                    items: inv.items,
                                    subtotal: inv.subtotal,
                                    taxAmount: inv.taxAmount,
                                    taxRate: inv.taxRate,
                                    customAdjustments: inv.adjustments || [
                                      ...(inv.tdsAmount ? [{ label: "TDS Deduction", amount: inv.tdsAmount, type: "deduction" as const }] : []),
                                      ...(inv.discountAmount ? [{ label: "Discount", amount: inv.discountAmount, type: "deduction" as const }] : []),
                                      ...(inv.additionalCharges ? [{ label: "Additional Charges", amount: inv.additionalCharges, type: "addition" as const }] : []),
                                    ],
                                    totalAmount: inv.totalAmount,
                                    customerName: inv.customerName,
                                    customerPhone: inv.customerPhone,
                                    customerAddress: inv.customerAddress,
                                    customerGstin: inv.customerGstin,
                                    date: inv.date,
                                    dueDate: inv.dueDate,
                                    invoiceTitle: inv.title,
                                    businessName: billedByName,
                                    businessAddress: billedByAddress,
                                    businessPhone: billedByPhone,
                                    businessGstin: billedByGstin,
                                    bankDetails: inv.bankDetails,
                                    upiDetails: inv.upiDetails,
                                    logoUrl: logoUrl || undefined,
                                    signatureUrl: signatureUrl,
                                    currencySymbol: "₹",
                                  });
                                }}
                                title="Download PDF"
                                className="p-1.5 text-slate-600 hover:text-[#2563EB] hover:bg-[#EFF6FF] rounded-lg transition-colors cursor-pointer"
                              >
                                <Download className="w-4 h-4" />
                              </button>

                              {/* Delete */}
                              <button
                                onClick={() => deleteInvoice(inv.id)}
                                title="Delete Invoice"
                                className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* 2. LIVE INTERACTIVE INVOICE BUILDER (Screenshots Match)  */}
        {/* ======================================================== */}
        {view === "builder" && (
          <div className="space-y-6 animate-in fade-in">
            {/* Top Navigation */}
            <div className="flex items-center justify-between pb-1">
              <button
                onClick={() => setView("list")}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-zinc-700 hover:bg-zinc-100 text-xs font-bold transition-all cursor-pointer border border-zinc-200 bg-white shadow-2xs"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Invoices</span>
              </button>
            </div>

            {/* Main Paper Invoice Card */}
            <div className="bg-white rounded-lg border border-zinc-200/90 shadow-md p-6 sm:p-10 space-y-10">
              {/* Title Section with More Height & Presence */}
              <div className="text-center relative py-8 sm:py-10 border-b border-zinc-100/90 bg-zinc-50/40 rounded-[12px] flex items-center justify-center">
                {isEditingTitle ? (
                  <div className="flex items-center justify-center gap-2 max-w-md mx-auto">
                    <input
                      type="text"
                      value={invoiceTitle}
                      onChange={e => setInvoiceTitle(e.target.value)}
                      className="text-3xl sm:text-4xl font-extrabold text-center text-[#0F172A] border-b-2 border-[#2563EB] bg-transparent outline-none pb-1 uppercase tracking-tight"
                      autoFocus
                      onBlur={() => setIsEditingTitle(false)}
                      onKeyDown={e => e.key === "Enter" && setIsEditingTitle(false)}
                    />
                    <button onClick={() => setIsEditingTitle(false)} className="p-1 text-[#2563EB] cursor-pointer">
                      <Check className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => setIsEditingTitle(true)}
                    className="inline-flex items-center gap-2.5 text-3xl sm:text-4xl font-extrabold text-[#0F172A] tracking-tight cursor-pointer group hover:text-[#2563EB] transition-colors"
                  >
                    <span className="border-b-2 border-dashed border-slate-300 group-hover:border-[#2563EB] uppercase">
                      {invoiceTitle}
                    </span>
                    <Edit2 className="w-5 h-5 text-slate-400 group-hover:text-[#2563EB]" />
                  </div>
                )}
              </div>

              {/* Top Meta Details & Clean Logo */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
                {/* Left Details: Minimalist Bottom-Border Underline Inputs */}
                <div className="md:col-span-2 space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {/* Invoice No Line Input */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                        Invoice No <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={invoiceNumber}
                        onChange={e => setInvoiceNumber(e.target.value)}
                        placeholder="e.g. A00018"
                        className="w-full bg-transparent border-0 border-b border-slate-300 focus:border-[#2563EB] focus:ring-0 rounded-none px-0.5 py-1.5 text-xs font-bold text-[#0F172A] transition-colors outline-none"
                      />
                    </div>

                    {/* Invoice Date Line Input */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        Invoice Date <span className="text-slate-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={invoiceDate}
                        onChange={e => setInvoiceDate(e.target.value)}
                        placeholder="e.g. Aug 31, 2026"
                        className="w-full bg-transparent border-0 border-b border-slate-300 focus:border-[#2563EB] focus:ring-0 rounded-none px-0.5 py-1.5 text-xs font-semibold text-[#0F172A] transition-colors outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {/* Due Date Line Input */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        Due Date
                      </label>
                      <input
                        type="text"
                        value={dueDate}
                        onChange={e => setDueDate(e.target.value)}
                        placeholder="e.g. Sep 15, 2026"
                        className="w-full bg-transparent border-0 border-b border-slate-300 focus:border-[#2563EB] focus:ring-0 rounded-none px-0.5 py-1.5 text-xs font-semibold text-[#0F172A] transition-colors outline-none"
                      />
                    </div>

                    {/* Payment Status Dropdown (Matching Unit & Client Dropdown UI) */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        Payment Status
                      </label>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setOpenStatusDropdown(!openStatusDropdown)}
                          className="w-full flex items-center justify-between px-2.5 py-1.5 bg-white hover:bg-slate-50 rounded-[8px] border border-slate-200 hover:border-slate-300 focus:border-[#2563EB] text-xs font-semibold text-slate-800 transition-all shadow-2xs cursor-pointer"
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <span className={cn("w-2 h-2 rounded-full", invoiceStatus === "paid" ? "bg-[#16A34A]" : "bg-slate-400")} />
                            <span className="truncate">{invoiceStatus === "paid" ? "Paid" : "Unpaid"}</span>
                          </div>
                          <ChevronDown className={cn("w-3.5 h-3.5 text-slate-400 shrink-0 ml-1 transition-transform duration-150", openStatusDropdown && "rotate-180 text-[#2563EB]")} />
                        </button>

                        {openStatusDropdown && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setOpenStatusDropdown(false)} />
                            <div className="absolute left-0 top-full mt-1 w-full bg-white border border-slate-200 shadow-xl rounded-[10px] p-1 z-50 animate-in fade-in zoom-in-95 space-y-0.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setInvoiceStatus("unpaid");
                                  setOpenStatusDropdown(false);
                                }}
                                className={cn(
                                  "w-full text-left px-2.5 py-1.5 rounded-[6px] text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer",
                                  invoiceStatus === "unpaid" ? "bg-[#FFFBEB] text-[#B45309] font-bold" : "text-slate-700 hover:bg-slate-50"
                                )}
                              >
                                <div className="flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                                  <span>Unpaid</span>
                                </div>
                                {invoiceStatus === "unpaid" && <Check className="w-3.5 h-3.5 text-[#D97706]" />}
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setInvoiceStatus("paid");
                                  setOpenStatusDropdown(false);
                                }}
                                className={cn(
                                  "w-full text-left px-2.5 py-1.5 rounded-[6px] text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer",
                                  invoiceStatus === "paid" ? "bg-[#F0FDF4] text-[#15803D] font-bold" : "text-slate-700 hover:bg-slate-50"
                                )}
                              >
                                <div className="flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-[#16A34A]" />
                                  <span>Paid</span>
                                </div>
                                {invoiceStatus === "paid" && <Check className="w-3.5 h-3.5 text-[#16A34A]" />}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Logo / Add Logo */}
                <div className="flex flex-col items-center justify-center">
                  {logoUrl ? (
                    <div className="flex flex-col items-center">
                      <div className="w-36 h-24 flex items-center justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={logoUrl}
                          alt="Store Logo"
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>
                      <div className="flex items-center justify-center gap-3 mt-2 text-[11px] font-bold text-center">
                        <label className="cursor-pointer text-[#2563EB] hover:text-[#1D4ED8] flex items-center gap-1 transition-colors">
                          <Crop className="w-3 h-3" />
                          <span>Change</span>
                          <input
                            type="file"
                            accept="image/png, image/jpeg, image/jpg, image/webp"
                            className="hidden"
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onload = ev => {
                                  setCropperState({
                                    isOpen: true,
                                    imageSrc: ev.target?.result as string,
                                    cropType: "logo",
                                    aspectRatio: 1,
                                    title: "Crop Shop Logo (1:1 Square)",
                                    minSize: 60
                                  });
                                };
                                reader.readAsDataURL(file);
                              }
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => setLogoUrl(null)}
                          className="text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="group relative flex flex-col items-center justify-center w-36 h-28 border-2 border-dashed border-slate-300 hover:border-[#2563EB] bg-slate-50/70 hover:bg-[#EFF6FF] rounded-[12px] cursor-pointer transition-all duration-200 text-center p-3">
                      <div className="w-8 h-8 rounded-full bg-white shadow-2xs border border-slate-200 group-hover:border-blue-300 flex items-center justify-center text-slate-400 group-hover:text-[#2563EB] transition-colors mb-1.5">
                        <Plus className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-bold text-slate-700 group-hover:text-[#2563EB] transition-colors">
                        Add Logo
                      </span>
                      <span className="text-[10px] text-slate-400 mt-0.5">
                        PNG, JPG or WebP
                      </span>
                      <input
                        type="file"
                        accept="image/png, image/jpeg, image/jpg, image/webp"
                        className="hidden"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = ev => {
                              setCropperState({
                                isOpen: true,
                                imageSrc: ev.target?.result as string,
                                cropType: "logo",
                                aspectRatio: 1,
                                title: "Crop Shop Logo (1:1 Square)",
                                minSize: 60
                              });
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>

              {/* Billed By & Billed To Cards (Matches Screenshot Exactly with Grey Background) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Card 1: Billed By */}
                <div className="p-5 rounded-[12px] bg-slate-50 border border-[#E2E8F0] shadow-2xs space-y-3.5">
                  <div>
                    <span className="text-base sm:text-lg font-bold text-[#0F172A] border-b-2 border-dashed border-[#0F172A] pb-0.5 inline-block">
                      Billed By
                    </span>
                    <span className="text-xs sm:text-sm text-[#64748B] font-medium ml-2.5">
                      (Your Store Details)
                    </span>
                  </div>

                  {/* Separate Store Name Box */}
                  <div className="w-full bg-white border border-[#E2E8F0] rounded-lg px-3.5 py-2.5 text-xs font-normal text-slate-700 flex items-center justify-between">
                    <span className="truncate font-medium text-slate-800">{billedByName || "Brown fening tea"}</span>
                    <Store className="w-4 h-4 text-slate-400 shrink-0" />
                  </div>

                  {/* Sub-Card */}
                  {!isEditingBilledBy ? (
                    <div className="rounded-lg border border-[#E2E8F0] bg-white p-4 shadow-2xs min-h-[130px] flex flex-col justify-between">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-bold text-[#0F172A]">
                            {billedByName || "Brown fening tea"}
                          </h4>
                          <button
                            type="button"
                            onClick={() => setIsEditingBilledBy(true)}
                            className="text-[#2563EB] hover:text-[#1D4ED8] font-semibold text-xs inline-flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>
                        </div>

                        <p className="text-xs text-[#64748B] leading-relaxed min-h-[44px] max-w-xl">
                          {billedByAddress || "255, Rajiv Gandhi Salai (OMR), Navalur, Chennai, Tamil Nadu, India - 600130"}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 pt-2 text-[11px] text-[#64748B] border-t border-slate-100">
                        {billedByPhone && <span>Phone: <strong className="text-[#0F172A]">{billedByPhone}</strong></span>}
                        {billedByGstin && <span>GSTIN: <strong className="text-[#0F172A]">{billedByGstin}</strong></span>}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-[#E2E8F0] bg-white p-4 space-y-3 shadow-2xs">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <span className="text-xs font-bold text-[#0F172A]">Edit Store Details</span>
                        <button
                          type="button"
                          onClick={() => setIsEditingBilledBy(false)}
                          className="px-3 py-1 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-md text-xs font-bold transition-colors cursor-pointer"
                        >
                          Done
                        </button>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <label className="text-[10px] font-bold text-zinc-500 uppercase">Business / Store Name</label>
                          <input
                            type="text"
                            value={billedByName}
                            onChange={e => setBilledByName(e.target.value)}
                            placeholder="Store Name"
                            className="w-full mt-0.5 px-3 py-1.5 bg-white rounded-[8px] border border-zinc-200 text-xs font-semibold text-zinc-900 focus:border-zinc-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-zinc-500 uppercase">Official Address</label>
                          <textarea
                            rows={3}
                            value={billedByAddress}
                            onChange={e => setBilledByAddress(e.target.value)}
                            placeholder="Official Address"
                            className="w-full h-20 mt-0.5 px-3 py-2 bg-white rounded-[8px] border border-zinc-200 text-xs text-zinc-700 focus:border-zinc-500 outline-none resize-none"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-bold text-zinc-500 uppercase">Phone Number</label>
                            <input
                              type="text"
                              value={billedByPhone}
                              onChange={e => handlePhoneChange(e.target.value, setBilledByPhone)}
                              placeholder="+91..."
                              className="w-full mt-0.5 px-3 py-1.5 bg-white rounded-[8px] border border-zinc-200 text-xs text-zinc-700 focus:border-zinc-500 outline-none"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-zinc-500 uppercase">GSTIN (Optional)</label>
                            <input
                              type="text"
                              value={billedByGstin}
                              onChange={e => setBilledByGstin(e.target.value)}
                              placeholder="GSTIN"
                              className="w-full mt-0.5 px-3 py-1.5 bg-white rounded-[8px] border border-zinc-200 text-xs text-zinc-700 focus:border-zinc-500 outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Card 2: Billed To (Exact Screenshot Match with Grey Background) */}
                <div className="p-5 rounded-[12px] bg-zinc-50/80 border border-zinc-200/90 shadow-2xs space-y-3.5">
                  <div>
                    <span className="text-base sm:text-lg font-black text-zinc-900 border-b-2 border-dashed border-zinc-800 pb-0.5 inline-block">
                      Billed To
                    </span>
                    <span className="text-xs sm:text-sm text-zinc-500 font-medium ml-2.5">
                      (Client's Details)
                    </span>
                  </div>

                  {/* Clean Dropdown Selector (Matching Item Table Dropdown UI) */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenCustomerDropdown(!openCustomerDropdown)}
                      className="w-full flex items-center justify-between px-3.5 py-2.5 bg-white hover:bg-zinc-50/90 rounded-[8px] border border-zinc-200 hover:border-zinc-300 focus:border-indigo-600 text-xs font-semibold text-zinc-800 transition-all shadow-2xs cursor-pointer"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Users className="w-4 h-4 text-zinc-400 shrink-0" />
                        <span className="truncate">{billedToName || "Select client from directory..."}</span>
                      </div>
                      <ChevronDown className={cn("w-4 h-4 text-zinc-400 shrink-0 ml-2 transition-transform duration-150", openCustomerDropdown && "rotate-180 text-indigo-600")} />
                    </button>

                    {openCustomerDropdown && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setOpenCustomerDropdown(false)} />
                        <div className="absolute left-0 top-full mt-1.5 w-full bg-white border border-zinc-200 shadow-xl rounded-[10px] p-1.5 z-50 animate-in fade-in zoom-in-95 max-h-60 overflow-y-auto divide-y divide-zinc-100 scrollbar-thin">
                          <div className="p-1 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                            Saved Client Directory
                          </div>
                          <div className="py-1 space-y-0.5">
                            {savedCustomers.map(cust => (
                              <button
                                key={cust.id}
                                type="button"
                                onClick={() => {
                                  setSelectedCustomerId(cust.id);
                                  setBilledToName(cust.name);
                                  setBilledToAddress(cust.address || "");
                                  setBilledToPhone(cust.phone || "");
                                  setBilledToGstin(cust.gstin || "");
                                  setIsEditingBilledTo(false);
                                  setOpenCustomerDropdown(false);
                                }}
                                className={cn(
                                  "w-full text-left px-3 py-2 rounded-[6px] text-xs font-medium flex items-center justify-between transition-colors cursor-pointer",
                                  selectedCustomerId === cust.id ? "bg-indigo-50 text-indigo-700 font-bold" : "text-zinc-800 hover:bg-zinc-50"
                                )}
                              >
                                <div>
                                  <div className="font-bold text-zinc-900">{cust.name}</div>
                                  {cust.phone && <div className="text-[10px] text-zinc-400">{cust.phone}</div>}
                                </div>
                                {selectedCustomerId === cust.id && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                              </button>
                            ))}
                          </div>
                          <div className="pt-1.5 space-y-1">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedCustomerId("__new__");
                                setBilledToName("");
                                setBilledToAddress("");
                                setBilledToPhone("");
                                setBilledToGstin("");
                                setIsEditingBilledTo(true);
                                setOpenCustomerDropdown(false);
                              }}
                              className="w-full text-left px-3 py-2 rounded-[6px] text-xs font-bold text-indigo-600 hover:bg-indigo-50 flex items-center gap-1.5 transition-colors cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>+ Add New Client</span>
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Sub-Card */}
                  {!isEditingBilledTo ? (
                    <div className="rounded-[8px] border border-zinc-200 bg-white p-4 shadow-2xs min-h-[130px] flex flex-col justify-between">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-black text-zinc-900">
                            {billedToName || "No Client Selected"}
                          </h4>
                          <button
                            type="button"
                            onClick={() => setIsEditingBilledTo(true)}
                            className="text-[#8B5CF6] hover:text-[#7C3AED] font-semibold text-xs inline-flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>
                        </div>

                        <p className="text-xs text-zinc-600 leading-relaxed min-h-[44px] max-w-xl">
                          {billedToAddress || "No address provided. Click Edit to add address."}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 pt-2 text-[11px] text-zinc-500 border-t border-zinc-100">
                        {billedToPhone && <span>Phone: <strong className="text-zinc-700">{billedToPhone}</strong></span>}
                        {billedToGstin && <span>GSTIN: <strong className="text-zinc-700">{billedToGstin}</strong></span>}
                        {!billedToPhone && !billedToGstin && (
                          <span className="text-zinc-400 italic">No contact information added</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-[8px] border border-zinc-200 bg-white p-4 space-y-3 shadow-2xs">
                      <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
                        <span className="text-xs font-bold text-zinc-800">Edit Client Details</span>
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditingBilledTo(false);
                            if (billedToName.trim()) {
                              saveCustomerToDirectory(billedToName, billedToAddress, billedToPhone, billedToGstin);
                            }
                          }}
                          className="px-3 py-1 bg-[#8B5CF6] hover:bg-[#7C3AED] text-white rounded-[6px] text-xs font-bold transition-colors cursor-pointer"
                        >
                          Done
                        </button>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <label className="text-[10px] font-bold text-zinc-500 uppercase">Client Name *</label>
                          <input
                            type="text"
                            value={billedToName}
                            onChange={e => {
                              setBilledToName(e.target.value);
                              setSelectedCustomerId("__custom__");
                            }}
                            placeholder="Client / Company Name"
                            className="w-full mt-0.5 px-3 py-1.5 bg-zinc-50/50 rounded-[8px] border border-zinc-200 text-xs font-semibold text-zinc-900 focus:border-zinc-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-zinc-500 uppercase">Billing Address</label>
                          <textarea
                            rows={3}
                            value={billedToAddress}
                            onChange={e => setBilledToAddress(e.target.value)}
                            placeholder="Address..."
                            className="w-full h-20 mt-0.5 px-3 py-2 bg-zinc-50/50 rounded-[8px] border border-zinc-200 text-xs text-zinc-700 focus:border-zinc-500 outline-none resize-none"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-bold text-zinc-500 uppercase">Phone</label>
                            <input
                              type="text"
                              value={billedToPhone}
                              onChange={e => handlePhoneChange(e.target.value, setBilledToPhone)}
                              placeholder="+91..."
                              className="w-full mt-0.5 px-3 py-1.5 bg-zinc-50/50 rounded-[8px] border border-zinc-200 text-xs text-zinc-700 focus:border-zinc-500 outline-none"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-zinc-500 uppercase">GSTIN</label>
                            <input
                              type="text"
                              value={billedToGstin}
                              onChange={e => setBilledToGstin(e.target.value)}
                              placeholder="GSTIN"
                              className="w-full mt-0.5 px-3 py-1.5 bg-zinc-50/50 rounded-[8px] border border-zinc-200 text-xs text-zinc-700 focus:border-zinc-500 outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Dynamic Items Table (Refined @ui-ux-pro-max Responsive Styling) */}
              <div className="rounded-xl border border-[#E2E8F0] bg-white overflow-hidden shadow-xs mt-1">
                <div className="overflow-x-auto scrollbar-thin">
                  <div className="w-full md:min-w-[700px]">
                    {/* Desktop Table Header */}
                    <div className="bg-[#EFF6FF] text-[#1E3A8A] border-b border-[#DBEAFE] px-4 py-3.5 min-h-[46px] text-xs font-bold uppercase tracking-wider hidden md:grid md:grid-cols-[1fr_80px_90px_100px_120px_80px] gap-3 items-center">
                      <div className="text-left pl-2">Item</div>
                      <div className="text-center">Quantity</div>
                      <div className="text-center">Unit</div>
                      <div className="text-center">Rate (₹)</div>
                      <div className="text-left pl-2">Amount (₹)</div>
                      <div className="text-center"></div>
                    </div>

                    {/* Mobile Only Header */}
                    <div className="bg-[#EFF6FF] text-[#1E3A8A] border-b border-[#DBEAFE] px-4 py-3 min-h-[44px] text-xs font-bold uppercase tracking-wider flex md:hidden items-center justify-between">
                      <div className="pl-1">Item</div>
                      <div className="text-[11px] font-semibold text-[#1E3A8A]/80">{items.length} {items.length === 1 ? "line item" : "line items"}</div>
                    </div>

                    {/* Table Rows: Stacked on Mobile, Grid on Desktop */}
                    <div className="divide-y divide-[#E2E8F0] p-2 space-y-2 md:space-y-1.5 bg-white">
                      {items.map((row, idx) => (
                        <div
                          key={row.id}
                          className="flex flex-col md:grid md:grid-cols-[1fr_80px_90px_100px_120px_80px] gap-2.5 md:gap-3 items-stretch md:items-center p-3 md:px-2 md:py-2 rounded-lg bg-slate-50/50 md:bg-transparent hover:bg-[#F8FAFC] border border-[#E2E8F0] md:border-transparent transition-colors"
                        >
                          {/* Item Name with Single Input & Autocomplete Dropdown */}
                          <div className="relative min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-[#2563EB] md:text-[#64748B] text-xs w-4 shrink-0 text-center">{idx + 1}.</span>
                              <div className="relative flex-1 min-w-0">
                                <input
                                  type="text"
                                  value={row.name}
                                  onFocus={() => setOpenCatalogRowId(row.id)}
                                  onChange={(e) => {
                                    updateRow(row.id, "name", e.target.value);
                                    setOpenCatalogRowId(row.id);
                                  }}
                                  placeholder="Type item name or search menu..."
                                  className="w-full px-3 py-2 bg-white rounded-lg border border-[#E2E8F0] focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]/20 outline-none text-xs font-semibold text-[#0F172A] transition-all placeholder:text-[#94A3B8]"
                                />

                                {/* Autocomplete Dropdown Suggestions Popover */}
                                {openCatalogRowId === row.id && (
                                  <>
                                    <div
                                      className="fixed inset-0 z-40"
                                      onClick={() => setOpenCatalogRowId(null)}
                                    />
                                    <div className="absolute left-0 top-full mt-1.5 w-full max-h-56 overflow-y-auto bg-white border border-[#E2E8F0] shadow-xl z-50 rounded-lg divide-y divide-[#E2E8F0] animate-in fade-in zoom-in-95 scrollbar-thin">
                                      <div className="px-3.5 py-1.5 bg-[#EFF6FF] text-[10px] font-bold text-[#1E3A8A] uppercase tracking-wider flex items-center justify-between border-b border-[#DBEAFE]">
                                        <span>Select from Catalog</span>
                                        <span>Rate</span>
                                      </div>
                                      {catalog
                                        .filter(c => !row.name.trim() || c.name.toLowerCase().includes(row.name.toLowerCase()))
                                        .map(c => (
                                          <button
                                            key={c.id}
                                            type="button"
                                            onMouseDown={(e) => {
                                              e.preventDefault();
                                              handleSelectCatalogItem(row.id, c.name, c.price);
                                              setOpenCatalogRowId(null);
                                            }}
                                            className="w-full px-3.5 py-2.5 text-left hover:bg-[#EFF6FF]/60 flex items-center justify-between text-xs cursor-pointer group transition-colors"
                                          >
                                            <span className="font-bold text-[#0F172A] group-hover:text-[#2563EB]">{c.name}</span>
                                            <span className="text-[11px] font-bold text-[#15803D] bg-[#F0FDF4] border border-[#BBF7D0] px-2 py-0.5 rounded-md">₹{c.price}</span>
                                          </button>
                                        ))}
                                      {catalog.filter(c => !row.name.trim() || c.name.toLowerCase().includes(row.name.toLowerCase())).length === 0 && (
                                        <div className="px-3.5 py-3 text-xs text-[#64748B] italic">
                                          Custom item "{row.name}" (Press Tab to set rate)
                                        </div>
                                      )}
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Mobile Fields Container (Quantity, Unit, Rate) */}
                          <div className="grid grid-cols-3 gap-2 md:contents">
                            {/* Quantity */}
                            <div className="space-y-0.5 md:space-y-0">
                              <span className="text-[10px] font-bold text-[#64748B] uppercase md:hidden block">Qty</span>
                              <input
                                type="number"
                                min="1"
                                value={row.qty || ""}
                                onChange={e => updateRow(row.id, "qty", Number(e.target.value))}
                                className="w-full px-2 py-2 bg-white rounded-lg border border-[#E2E8F0] focus:border-[#2563EB] text-center font-bold text-xs text-[#0F172A] outline-none transition-colors"
                              />
                            </div>

                            {/* Unit Custom Dropdown */}
                            <div className="space-y-0.5 md:space-y-0">
                              <span className="text-[10px] font-bold text-[#64748B] uppercase md:hidden block">Unit</span>
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={() => setOpenUnitRowId(openUnitRowId === row.id ? null : row.id)}
                                  className="w-full flex items-center justify-between px-2.5 py-2 bg-white hover:bg-slate-50 rounded-lg border border-[#E2E8F0] hover:border-[#CBD5E1] focus:border-[#2563EB] text-xs font-semibold text-[#0F172A] transition-all shadow-2xs cursor-pointer"
                                >
                                  <span className="truncate">{row.unit || "Unit"}</span>
                                  <ChevronDown className={cn("w-3.5 h-3.5 text-[#64748B] shrink-0 ml-1 transition-transform duration-150", openUnitRowId === row.id && "rotate-180 text-[#2563EB]")} />
                                </button>

                                {openUnitRowId === row.id && (
                                  <>
                                    <div className="fixed inset-0 z-40" onClick={() => setOpenUnitRowId(null)} />
                                    <div className="absolute left-0 top-full mt-1 w-28 bg-white border border-[#E2E8F0] shadow-xl rounded-lg p-1 z-50 animate-in fade-in zoom-in-95 space-y-0.5">
                                      {DEFAULT_UNITS.map(u => (
                                        <button
                                          key={u}
                                          type="button"
                                          onClick={() => {
                                            updateRow(row.id, "unit", u);
                                            setOpenUnitRowId(null);
                                          }}
                                          className={cn(
                                            "w-full text-left px-2.5 py-1.5 rounded-md text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer",
                                            row.unit === u ? "bg-[#EFF6FF] text-[#1E3A8A] font-bold" : "text-[#0F172A] hover:bg-slate-50"
                                          )}
                                        >
                                          <span>{u}</span>
                                          {row.unit === u && <Check className="w-3 h-3 text-[#2563EB]" />}
                                        </button>
                                      ))}
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Rate (Centered & Auto-Populated) */}
                            <div className="space-y-0.5 md:space-y-0">
                              <span className="text-[10px] font-bold text-[#64748B] uppercase md:hidden block">Rate (₹)</span>
                              <input
                                type="number"
                                min="0"
                                value={row.rate || ""}
                                onChange={e => updateRow(row.id, "rate", Number(e.target.value))}
                                placeholder="0"
                                className="w-full px-2 py-2 bg-white rounded-lg border border-[#E2E8F0] focus:border-[#2563EB] text-center font-bold text-xs text-[#0F172A] outline-none transition-colors"
                              />
                            </div>
                          </div>

                          {/* Mobile Bottom Bar: Amount & Actions */}
                          <div className="flex items-center justify-between pt-2 border-t border-[#E2E8F0] md:border-0 md:pt-0 md:contents">
                            {/* Amount (Left Aligned) */}
                            <div className="text-left pl-0 md:pl-2 flex items-center gap-1.5 md:block">
                              <span className="text-[11px] font-bold text-[#64748B] uppercase md:hidden inline">Amount:</span>
                              <span className="font-black text-xs sm:text-sm text-[#0F172A] inline md:block truncate">
                                ₹{row.amount.toLocaleString("en-IN", { minimumFractionDigits: 0 })}
                              </span>
                            </div>

                            {/* Actions: Reorder Arrows & Delete Button */}
                            <div className="flex items-center justify-end md:justify-center gap-1">
                              <div className="flex items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => moveRow(idx, "up")}
                                  disabled={idx === 0}
                                  className="p-1 text-[#64748B] hover:text-[#0F172A] disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer transition-colors"
                                  title="Move Up"
                                >
                                  <ChevronUp className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveRow(idx, "down")}
                                  disabled={idx === items.length - 1}
                                  className="p-1 text-[#64748B] hover:text-[#0F172A] disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer transition-colors"
                                  title="Move Down"
                                >
                                  <ChevronDown className="w-4 h-4" />
                                </button>
                              </div>

                              <button
                                type="button"
                                onClick={() => removeRow(row.id)}
                                className="p-1 text-[#64748B] hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                                title="Delete item row"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Add New Line Button */}
                    <div className="p-3 bg-[#F8FAFC] border-t border-[#E2E8F0]">
                      <button
                        type="button"
                        onClick={addNewRow}
                        className="w-full py-2.5 border-2 border-dashed border-[#CBD5E1] hover:border-[#2563EB] hover:text-[#2563EB] text-[#64748B] rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer bg-white hover:bg-[#EFF6FF]/40"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Add New Line</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Section: Bank/UPI on Left, Calculations & Signature on Right with Grey Card Backgrounds */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
                {/* Left Column: Bank & UPI Cards */}
                <div className="space-y-4">
                  {/* Bank Details Card */}
                  <div className="p-5 rounded-[12px] bg-zinc-50/80 border border-zinc-200/90 space-y-3.5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-zinc-900 border-b border-dashed border-zinc-700 pb-0.5 inline-block">
                          Bank Account Details
                        </span>
                        <span className="text-zinc-500 text-[11px] font-normal ml-1.5">(Optional)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowBankDetails(!showBankDetails)}
                        className="text-xs font-bold text-[#8B5CF6] hover:underline cursor-pointer"
                      >
                        {showBankDetails ? "Hide" : "+ Add Bank Account"}
                      </button>
                    </div>

                    {showBankDetails && (
                      <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                        <input
                          placeholder="Bank Name (e.g. HDFC Bank)"
                          value={bankDetails.bankName}
                          onChange={e => setBankDetails(p => ({ ...p, bankName: e.target.value }))}
                          className="px-3 py-1.5 bg-white rounded-[8px] border border-zinc-200 text-xs"
                        />
                        <input
                          placeholder="Account No"
                          value={bankDetails.accountNo}
                          onChange={e => setBankDetails(p => ({ ...p, accountNo: e.target.value }))}
                          className="px-3 py-1.5 bg-white rounded-[8px] border border-zinc-200 text-xs"
                        />
                        <input
                          placeholder="IFSC Code"
                          value={bankDetails.ifsc}
                          onChange={e => setBankDetails(p => ({ ...p, ifsc: e.target.value }))}
                          className="px-3 py-1.5 bg-white rounded-[8px] border border-zinc-200 text-xs"
                        />
                        <input
                          placeholder="Branch Name"
                          value={bankDetails.branch}
                          onChange={e => setBankDetails(p => ({ ...p, branch: e.target.value }))}
                          className="px-3 py-1.5 bg-white rounded-[8px] border border-zinc-200 text-xs"
                        />
                      </div>
                    )}
                  </div>

                  {/* UPI Details Card */}
                  <div className="p-5 rounded-[12px] bg-zinc-50/80 border border-zinc-200/90 space-y-3.5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-zinc-900 border-b border-dashed border-zinc-700 pb-0.5 inline-block">
                          UPI Payment Details
                        </span>
                        <span className="text-zinc-500 text-[11px] font-normal ml-1.5">(Optional)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowUpiDetails(!showUpiDetails)}
                        className="text-xs font-bold text-[#8B5CF6] hover:underline cursor-pointer"
                      >
                        {showUpiDetails ? "Hide" : "+ Add UPI ID"}
                      </button>
                    </div>

                    {showUpiDetails && (
                      <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                        <input
                          placeholder="UPI ID (e.g. shop@okaxis)"
                          value={upiDetails.upiId}
                          onChange={e => setUpiDetails(p => ({ ...p, upiId: e.target.value }))}
                          className="px-3 py-1.5 bg-white rounded-[8px] border border-zinc-200 text-xs"
                        />
                        <input
                          placeholder="Payee Name"
                          value={upiDetails.payeeName}
                          onChange={e => setUpiDetails(p => ({ ...p, payeeName: e.target.value }))}
                          className="px-3 py-1.5 bg-white rounded-[8px] border border-zinc-200 text-xs"
                        />
                      </div>
                    )}
                  </div>

                  {/* Total in Words Display */}
                  <div className="p-4 rounded-[12px] bg-zinc-50/80 border border-zinc-200/90 text-xs shadow-2xs">
                    <span className="font-bold text-zinc-700 uppercase tracking-wider text-[10px] border-b border-dashed border-zinc-500 pb-0.5 inline-block">Total (in words)</span>
                    <p className="font-bold text-zinc-900 mt-2 uppercase leading-snug">
                      {totalInWords}
                    </p>
                  </div>
                </div>

                {/* Right Column: Amount Calculations & Signature */}
                <div className="space-y-6">
                  {/* Financial Breakdown */}
                  <div className="space-y-3 text-xs text-zinc-700 bg-zinc-50/80 p-5 rounded-[12px] border border-zinc-200/90 shadow-2xs">
                    <div className="flex justify-between items-center font-medium">
                      <span className="font-bold text-zinc-700">Subtotal / Amount</span>
                      <span className="font-bold text-zinc-900 text-sm">₹{calculatedSubtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                    </div>

                    {/* GST Display with Rate Selector & Remove Button */}
                    {enableGst && (
                      <div className="flex justify-between items-center py-1.5 border-b border-zinc-200">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-zinc-800 text-xs">GST</span>
                          {/* GST Rate Custom Dropdown */}
                          <div className="relative inline-flex items-center">
                            <button
                              type="button"
                              onClick={() => setOpenGstDropdown(!openGstDropdown)}
                              className="flex items-center gap-1.5 px-2.5 py-1 bg-white hover:bg-zinc-50 rounded-[8px] border border-zinc-200 hover:border-zinc-300 text-xs font-bold text-zinc-800 transition-all shadow-2xs cursor-pointer"
                            >
                              <span>@ {taxRate}% GST</span>
                              <ChevronDown className={cn("w-3 h-3 text-zinc-400 transition-transform duration-150", openGstDropdown && "rotate-180 text-indigo-600")} />
                            </button>

                            {openGstDropdown && (
                              <>
                                <div className="fixed inset-0 z-40" onClick={() => setOpenGstDropdown(false)} />
                                <div className="absolute left-0 top-full mt-1 w-28 bg-white border border-zinc-200 shadow-xl rounded-[10px] p-1 z-50 animate-in fade-in zoom-in-95 space-y-0.5">
                                  {[5, 12, 18, 28].map(rate => (
                                    <button
                                      key={rate}
                                      type="button"
                                      onClick={() => {
                                        setTaxRate(rate);
                                        setOpenGstDropdown(false);
                                      }}
                                      className={cn(
                                        "w-full text-left px-2.5 py-1.5 rounded-[6px] text-xs font-bold flex items-center justify-between transition-colors cursor-pointer",
                                        taxRate === rate ? "bg-indigo-50 text-indigo-700" : "text-zinc-700 hover:bg-zinc-50"
                                      )}
                                    >
                                      <span>@ {rate}%</span>
                                      {taxRate === rate && <Check className="w-3 h-3 text-indigo-600" />}
                                    </button>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-emerald-600 text-xs">+ ₹{calculatedTax.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                          <button
                            type="button"
                            onClick={() => setEnableGst(false)}
                            className="p-1 text-zinc-400 hover:text-rose-600 cursor-pointer transition-colors"
                            title="Remove GST"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Dynamic Adjustments List with Clickable + / - Toggle */}
                    {adjustments.map((adj) => (
                      <div
                        key={adj.id}
                        className="flex items-center justify-between gap-3 py-1.5 border-b border-zinc-200"
                      >
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          {adj.key === "custom" ? (
                            <input
                              type="text"
                              value={adj.label}
                              onChange={e => updateAdjustment(adj.id, "label", e.target.value)}
                              placeholder="Custom adjustment label..."
                              className="w-full bg-transparent font-bold text-xs text-zinc-900 outline-none border-0 border-b border-zinc-300 focus:border-zinc-800 rounded-none py-0.5"
                            />
                          ) : (
                            <span className="font-bold text-zinc-800 text-xs">{adj.label}</span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Fixed Static Sign Badge: Minus for deductions, Plus for additions */}
                          <span
                            className={cn(
                              "px-2.5 py-1 rounded-[6px] text-xs font-black select-none",
                              adj.type === "addition"
                                ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                : "bg-rose-100 text-rose-800 border border-rose-300"
                            )}
                          >
                            {adj.type === "addition" ? "+ ₹" : "- ₹"}
                          </span>

                          <input
                            type="number"
                            min="0"
                            value={adj.amount || ""}
                            onChange={e => updateAdjustment(adj.id, "amount", Math.max(0, Number(e.target.value) || 0))}
                            placeholder="0"
                            className="w-24 text-right bg-white border border-zinc-200 focus:border-zinc-800 rounded-[6px] font-bold text-xs text-zinc-900 outline-none px-2 py-1"
                          />

                          <button
                            type="button"
                            onClick={() => removeAdjustment(adj.id)}
                            className="p-1 text-zinc-400 hover:text-rose-600 cursor-pointer transition-colors ml-1"
                            title="Remove field"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* Quick Add-on Buttons with Fixed Defined Signs */}
                    <div className="flex flex-wrap items-center gap-2 pt-2">
                      {!enableGst && (
                        <button
                          type="button"
                          onClick={() => setEnableGst(true)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[8px] text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-300 transition-colors cursor-pointer"
                        >
                          <Percent className="w-3 h-3" /> + Add GST (+ ₹)
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => addAdjustment("Discount", 0, "discount", "deduction")}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[8px] text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-300 transition-colors cursor-pointer"
                      >
                        <Tag className="w-3 h-3" /> + Add Discount (- ₹)
                      </button>

                      <button
                        type="button"
                        onClick={() => addAdjustment("TDS Deduction", 0, "tds", "deduction")}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[8px] text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-300 transition-colors cursor-pointer"
                      >
                        <Receipt className="w-3 h-3" /> + Add TDS (- ₹)
                      </button>

                      <button
                        type="button"
                        onClick={() => addAdjustment("Extra Charge", 0, "custom", "addition")}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[8px] text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 transition-colors cursor-pointer"
                      >
                        <Plus className="w-3 h-3" /> + Add Extra Charge (+ ₹)
                      </button>

                      <button
                        type="button"
                        onClick={() => addAdjustment("Custom Deduction", 0, "custom", "deduction")}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[8px] text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-300 transition-colors cursor-pointer"
                      >
                        <PlusCircle className="w-3 h-3" /> + Add Deduction (- ₹)
                      </button>
                    </div>

                    {/* Grand Total */}
                    <div className="pt-3 border-t-2 border-zinc-900 flex justify-between items-baseline text-sm font-black text-zinc-900">
                      <span>Total Amount</span>
                      <span className="text-xl font-black text-zinc-900">
                        ₹{calculatedGrandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  {/* Signature Box */}
                  <div className="p-4 rounded-[12px] bg-zinc-50/80 border border-zinc-200/90 space-y-2.5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-zinc-900 border-b border-dashed border-zinc-700 pb-0.5 inline-block">
                          Authorised Signature
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="cursor-pointer text-[11px] font-bold text-[#8B5CF6] hover:underline flex items-center gap-1">
                          <Upload className="w-3 h-3" />
                          <span>Upload</span>
                          <input
                            type="file"
                            accept="image/png, image/jpeg, image/jpg, image/webp"
                            className="hidden"
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onload = ev => {
                                  setCropperState({
                                    isOpen: true,
                                    imageSrc: ev.target?.result as string,
                                    cropType: "signature",
                                    aspectRatio: 2.5,
                                    title: "Crop Authorised Signature",
                                    minSize: 80
                                  });
                                };
                                reader.readAsDataURL(file);
                              }
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => setSignatureUrl("/default-signature.svg")}
                          className="text-[11px] text-zinc-400 hover:text-zinc-600 font-bold cursor-pointer"
                        >
                          Reset
                        </button>
                      </div>
                    </div>

                    {/* Compact Signature Container */}
                    <div className="w-full h-24 bg-white rounded-[10px] border border-dashed border-zinc-300 flex items-center justify-center overflow-hidden p-2 shadow-2xs">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={signatureUrl || "/default-signature.svg"}
                        alt="Signature"
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                    <p className="text-center text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Authorised Signatory</p>
                  </div>

                  {/* Actions: Download PDF & Save Invoice */}
                  <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={handleDownloadCurrentPdf}
                      className="w-full sm:flex-1 py-3 px-4 bg-white border border-[#E2E8F0] text-[#0F172A] hover:bg-slate-50 rounded-xl text-xs sm:text-sm font-semibold shadow-2xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      <Download className="w-4 h-4 text-[#2563EB]" />
                      <span>Download PDF</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveInvoice}
                      className="w-full sm:flex-1 py-3 px-4 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl text-xs sm:text-sm font-semibold shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer hover:shadow-md"
                    >
                      <Save className="w-4 h-4" />
                      <span>Save Invoice</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Image Cropper Modal */}
      <ImageCropperModal
        isOpen={cropperState.isOpen}
        imageSrc={cropperState.imageSrc}
        cropType={cropperState.cropType}
        aspectRatio={cropperState.aspectRatio}
        title={cropperState.title}
        minSize={cropperState.minSize}
        onClose={() => setCropperState(prev => ({ ...prev, isOpen: false }))}
        onCropComplete={croppedUrl => {
          if (cropperState.cropType === "logo") setLogoUrl(croppedUrl);
          else setSignatureUrl(croppedUrl);
        }}
      />
    </div>
  );
}




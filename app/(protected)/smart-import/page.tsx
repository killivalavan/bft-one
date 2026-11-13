/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/lib/context/TenantContext";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { getAuthHeaders } from "@/lib/auth/clientAuth";
import { useB2BWorkspace } from "@/lib/hooks/useB2BData";
import { cn } from "@/lib/utils/cn";
import {
  Sparkles,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Trash2,
  RefreshCw,
  Download,
  History,
  ShieldCheck,
  Store,
  FileText,
  Users,
  Package,
  CreditCard,
  TrendingUp,
  RotateCcw,
  Search,
  X,
  Check,
} from "lucide-react";
import {
  DuplicateHandlingStrategy,
  ENTITY_META,
  ImportEntityType,
  ParsedWorkbook,
  SEYALPRO_ENTITY_FIELDS,
  SheetAnalysis,
  SheetMappingConfig,
  SourceSoftwareType,
  StagedImportRecord,
} from "@/lib/smart-import/types";
import {
  parseUploadedFile,
  createXlsxBytesFromSheets,
  MAX_FILE_SIZE_BYTES,
} from "@/lib/smart-import/fileParser";
import { analyzeWorkbooks } from "@/lib/smart-import/sheetAnalyzer";
import {
  generateDeterministicSheetMapping,
  recomputeMappingDiagnostics,
} from "@/lib/smart-import/aiMapper";
import {
  runValidationAndStaging,
  computeValidationSummary,
  normalizeFlexibleDate,
  parseCurrencyNumber,
} from "@/lib/smart-import/validationEngine";
import { B2B_CUSTOMERS_UPDATED_EVENT } from "@/lib/services/b2bClients";

const WIZARD_STEPS = [
  { step: 1, title: "Upload Files", subtitle: "Excel, CSV or Sheets" },
  { step: 2, title: "Sheet Analysis", subtitle: "Structure & categories" },
  { step: 3, title: "AI Mapping", subtitle: "Match columns" },
  { step: 4, title: "Validate & Review", subtitle: "Math & duplicates" },
  { step: 5, title: "Final Approval", subtitle: "Confirm migration" },
  { step: 6, title: "Completed", subtitle: "Summary & analytics" },
] as const;

const SOURCE_SOFTWARE_OPTIONS: Array<{ value: SourceSoftwareType; label: string; desc: string }> = [
  {
    value: "excel_sheets",
    label: "Excel / Google Sheets",
    desc: "Standard .xlsx, .xls, or .csv exports from Excel or Google Sheets",
  },
  {
    value: "billing_software",
    label: "Other Billing Software",
    desc: "Exports from Tally, Vyapar, Zoho Invoice, Busy, or POS billing tools",
  },
  {
    value: "business_dashboard",
    label: "Another Business Dashboard",
    desc: "Customer, order, or product exports from an existing ERP or CRM",
  },
  {
    value: "multiple_spreadsheets",
    label: "Multiple Manual Spreadsheets",
    desc: "Separate monthly sales, customer ledger, and expense files",
  },
  {
    value: "not_sure",
    label: "Not Sure / Mixed Files",
    desc: "Let CounterCub AI inspect and classify your files automatically",
  },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function buildSampleMigrationSheets() {
  return [
    {
      name: "Sales Invoices",
      rows: [
        ["HISTORICAL SALES REGISTER - SAMPLE MIGRATION"],
        [
          "Ref ID",
          "Bill Date",
          "Client",
          "Mobile",
          "Item Name",
          "Qty",
          "Unit Rate",
          "Unit Cost",
          "Grand Amt",
          "Received",
          "Pending",
          "Mode",
        ],
        [
          "INV-2025-101",
          "12/08/2025",
          "Green Leaf Cafe",
          "9876543210",
          "Artisan Sourdough Loaf",
          10,
          120,
          65,
          "₹1,200",
          "₹1,200",
          "₹0",
          "UPI",
        ],
        [
          "INV-2025-102",
          "14/08/2025",
          "Metro Coffee House",
          "9123456780",
          "Classic Butter Croissant",
          25,
          60,
          30,
          "₹1,500",
          "₹1,000",
          "₹500",
          "UPI",
        ],
        [
          "INV-2025-103",
          "18/08/2025",
          "Sunrise Bistro",
          "9988776655",
          "Belgian Choco Brownie",
          20,
          80,
          42,
          "₹1,600",
          "₹0",
          "₹1,600",
          "Pending",
        ],
      ],
    },
    {
      name: "Customer Directory",
      rows: [
        ["Buyer", "Phone Number", "Billing Address", "GST No"],
        ["Green Leaf Cafe", "+91 98765 43210", "OMR Navalur, Chennai", "33AABCG1234F1Z5"],
        ["Metro Coffee House", "+91 91234 56780", "Adyar, Chennai", "33AADCM5678G1Z2"],
        ["Sunrise Bistro", "+91 99887 76655", "Velachery, Chennai", ""],
      ],
    },
    {
      name: "Product Catalog",
      rows: [
        ["Product Name", "Category", "Sale Price", "Making Cost", "UOM", "Current Stock"],
        ["Artisan Sourdough Loaf", "Artisan Breads", 120, 65, "Pcs", 40],
        ["Classic Butter Croissant", "Pastries", 60, 30, "Pcs", 85],
        ["Belgian Choco Brownie", "Desserts", 80, 42, "Pcs", 60],
      ],
    },
    {
      name: "Operating Expenses",
      rows: [
        ["Expense Date", "Particulars", "Expense Category", "Total Spend", "Notes"],
        ["10/08/2025", "Bulk Organic Flour & Butter", "Raw Materials & Supplies", "₹4,500", "Wholesale vendor"],
        ["15/08/2025", "Eco Kraft Delivery Boxes", "Packaging & Boxes", "₹1,250", "500 boxes"],
      ],
    },
  ];
}

export default function SmartImportPage() {
  const { business } = useTenant();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const queryClient = useQueryClient();

  const bizId = business?.id || "default";
  const storeName = business?.name || "Connected Store";

  // Existing store data for duplicate detection
  const { data: cloudWorkspace } = useB2BWorkspace(bizId);

  // Top-level tab: "wizard" | "history"
  const [activeTab, setActiveTab] = useState<"wizard" | "history">("wizard");

  // Wizard Step (1 to 6)
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);

  // Step 1 state
  const [importName, setImportName] = useState<string>(
    `Business Data Migration – ${new Date().toLocaleDateString("en-IN")}`
  );
  const [sourceSoftware, setSourceSoftware] = useState<SourceSoftwareType>("excel_sheets");
  const [workbooks, setWorkbooks] = useState<ParsedWorkbook[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);

  // Step 2 state
  const [sheetAnalyses, setSheetAnalyses] = useState<SheetAnalysis[]>([]);

  // Step 3 state
  const [mappingConfigs, setMappingConfigs] = useState<SheetMappingConfig[]>([]);
  const [selectedMappingSheetKey, setSelectedMappingSheetKey] = useState<string>("");
  const [isAiMappingLoading, setIsAiMappingLoading] = useState(false);
  const [isAutoPilotLoading, setIsAutoPilotLoading] = useState(false);
  const [autoPilotStatus, setAutoPilotStatus] = useState<string>("");
  const [skippedManualReview, setSkippedManualReview] = useState(false);

  // Step 4 state
  const [stagedRecords, setStagedRecords] = useState<StagedImportRecord[]>([]);
  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateHandlingStrategy>("skip");
  const [validationFilter, setValidationFilter] = useState<
    "all" | "valid" | "duplicates" | "missing" | "math" | "invalid"
  >("all");
  const [validationSearch, setValidationSearch] = useState("");
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, any>>({});

  // Step 5 & 6 state
  const [userConfirmed, setUserConfirmed] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [completedJob, setCompletedJob] = useState<any | null>(null);

  // History state
  const [historyJobs, setHistoryJobs] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedHistoryJob, setSelectedHistoryJob] = useState<any | null>(null);
  const [rollingBackJobId, setRollingBackJobId] = useState<string | null>(null);

  // Fetch Import History for this store
  const fetchImportHistory = useCallback(async () => {
    if (!bizId || bizId === "default") return;
    setHistoryLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/smart-import/history?business_id=${bizId}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setHistoryJobs(data.jobs || []);
      }
    } catch (err) {
      console.warn("Failed to load import history:", err);
    } finally {
      setHistoryLoading(false);
    }
  }, [bizId]);

  useEffect(() => {
    fetchImportHistory();
  }, [fetchImportHistory]);

  // Handle file upload & parsing
  const handleFilesSelected = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    setIsParsing(true);
    const newlyParsed: ParsedWorkbook[] = [];

    try {
      for (const file of files) {
        if (file.size > MAX_FILE_SIZE_BYTES) {
          toast({
            title: "File Too Large",
            description: `"${file.name}" exceeds the 15 MB limit.`,
            variant: "error",
          });
          continue;
        }
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        const parsed = await parseUploadedFile(file.name, file.size, bytes);
        if (parsed.sheets.length === 0 || parsed.sheets.every((s) => s.rows.length === 0)) {
          toast({
            title: "Empty Spreadsheet",
            description: `"${file.name}" contains no data rows to import.`,
            variant: "error",
          });
          continue;
        }
        newlyParsed.push(parsed);
      }

      if (newlyParsed.length > 0) {
        setWorkbooks((prev) => {
          const existingNames = new Set(newlyParsed.map((n) => n.fileName.toLowerCase()));
          return [...prev.filter((p) => !existingNames.has(p.fileName.toLowerCase())), ...newlyParsed];
        });
        toast({
          title: "Files Processed",
          description: `Parsed ${newlyParsed.length} file${newlyParsed.length === 1 ? "" : "s"} successfully.`,
          variant: "success",
        });
      }
    } catch (err: any) {
      toast({
        title: "File Parse Error",
        description: err?.message || "Could not read the uploaded spreadsheet.",
        variant: "error",
      });
    } finally {
      setIsParsing(false);
    }
  };

  // Load Sample Migration File for instant testing
  const handleLoadSampleFile = async () => {
    setIsParsing(true);
    try {
      const sheets = buildSampleMigrationSheets();
      const xlsxBytes = createXlsxBytesFromSheets(sheets);
      const parsed = await parseUploadedFile(
        "Sample_Business_Migration_2025.xlsx",
        xlsxBytes.byteLength,
        xlsxBytes
      );
      setWorkbooks([parsed]);
      toast({
        title: "Sample Migration File Loaded",
        description:
          "Loaded 4 sheets (Sales Invoices, Customer Directory, Product Catalog, Operating Expenses).",
        variant: "success",
      });
    } catch (err: any) {
      toast({
        title: "Error Loading Sample",
        description: err?.message || "Failed to generate sample workbook.",
        variant: "error",
      });
    } finally {
      setIsParsing(false);
    }
  };

  // Download Sample Excel File
  const handleDownloadSampleXlsx = () => {
    const sheets = buildSampleMigrationSheets();
    const xlsxBytes = createXlsxBytesFromSheets(sheets);
    const blob = new Blob([xlsxBytes as unknown as BlobPart], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "CounterCub_Sample_Migration.xlsx";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Automated End-to-End AI Flow (Skipping Step 2 & Step 3 when confident)
  const handleAutoPilotFlow = async (preExistingAnalyses?: SheetAnalysis[]) => {
    if (workbooks.length === 0) {
      toast({
        title: "Upload Required",
        description: "Please upload at least one Excel or CSV file to continue.",
        variant: "error",
      });
      return;
    }

    setIsAutoPilotLoading(true);
    setAutoPilotStatus("1/3: Analyzing sheet structures and classifying business categories...");

    try {
      // 1. Analyze sheets if not already done
      const analyses = preExistingAnalyses || analyzeWorkbooks(workbooks);
      setSheetAnalyses(analyses);

      const activeAnalyses = analyses.filter((a) => a.includeInImport);
      if (activeAnalyses.length === 0) {
        toast({
          title: "No Sheets to Import",
          description: "All detected sheets were empty or skipped.",
          variant: "error",
        });
        setIsAutoPilotLoading(false);
        return;
      }

      setAutoPilotStatus("2/3: AI auto-mapping columns to CounterCub fields...");

      // 2. Generate initial deterministic mappings
      let configs = analyses.map((a) =>
        generateDeterministicSheetMapping(a, a.detectedEntity)
      );
      setMappingConfigs(configs);
      if (!selectedMappingSheetKey || !activeAnalyses.some((a) => a.sheetKey === selectedMappingSheetKey)) {
        setSelectedMappingSheetKey(activeAnalyses[0].sheetKey);
      }

      // 3. Request server-side AI refinement
      setIsAiMappingLoading(true);
      try {
        const headers = await getAuthHeaders();
        const res = await fetch("/api/smart-import/analyze", {
          method: "POST",
          headers,
          body: JSON.stringify({
            business_id: bizId,
            sheets: activeAnalyses.map((analysis) => ({
              analysis,
              entityTypeOverride: analysis.detectedEntity,
            })),
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.mappingConfigs) && data.mappingConfigs.length > 0) {
            const aiByKey = new Map<string, SheetMappingConfig>(
              data.mappingConfigs.map((mc: SheetMappingConfig) => [mc.sheetKey, mc])
            );
            configs = configs.map((cfg) => aiByKey.get(cfg.sheetKey) || cfg);
            setMappingConfigs(configs);
          }
        }
      } catch (aiErr) {
        console.warn("AI mapping refinement fallback to deterministic:", aiErr);
      }

      // 4. Check if any sheet has missing required fields
      const activeConfigs = configs.filter((c) => c.includeInImport);
      const sheetWithMissingReq = activeConfigs.find(
        (c) => c.missingRequiredFields.length > 0
      );

      if (sheetWithMissingReq) {
        // Needs user confirmation / manual attention -> stop on Step 3
        setSelectedMappingSheetKey(sheetWithMissingReq.sheetKey);
        setCurrentStep(3);
        toast({
          title: "Mapping Needs Confirmation",
          description: `AI auto-mapped your columns, but "${sheetWithMissingReq.sheetName}" needs: ${sheetWithMissingReq.missingRequiredFields.join(", ")}`,
          variant: "info",
        });
        setIsAutoPilotLoading(false);
        return;
      }

      // 5. Clean auto-pilot! Run validation & staging immediately
      setAutoPilotStatus("3/3: Running financial reconciliation & duplicate detection...");

      const existingSnapshot = {
        invoices: cloudWorkspace?.invoices || [],
        products: cloudWorkspace?.products || [],
        customers: cloudWorkspace?.stores || [],
        payments: cloudWorkspace?.payments || [],
        expenses: cloudWorkspace?.expenses || [],
      };

      const { stagedRecords: staged } = runValidationAndStaging(
        workbooks,
        configs,
        existingSnapshot,
        duplicateStrategy
      );

      setStagedRecords(staged);
      setSkippedManualReview(true);
      setCurrentStep(4);
      toast({
        title: "✨ AI Auto-Pilot Completed",
        description: `Analyzed ${activeAnalyses.length} sheet(s) and auto-mapped columns. Advanced directly to Data Validation.`,
        variant: "success",
      });
    } catch (err: any) {
      toast({
        title: "Auto-Pilot Error",
        description: err?.message || "Could not complete automated analysis.",
        variant: "error",
      });
      setCurrentStep(2);
    } finally {
      setIsAutoPilotLoading(false);
      setIsAiMappingLoading(false);
      setAutoPilotStatus("");
    }
  };

  // Proceed Step 1 -> Step 2 (Manual Review of Sheets)
  const handleProceedToStep2 = () => {
    if (workbooks.length === 0) {
      toast({
        title: "Upload Required",
        description: "Please upload at least one Excel or CSV file to continue.",
        variant: "error",
      });
      return;
    }
    const analyses = analyzeWorkbooks(workbooks);
    setSheetAnalyses(analyses);
    setCurrentStep(2);
  };

  // Proceed Step 2 -> Step 3 or direct to Step 4 via Auto-Pilot
  const handleProceedToStep3 = async () => {
    await handleAutoPilotFlow(sheetAnalyses);
  };

  // Update a single column's targetField in Step 3
  const handleUpdateColumnMapping = (
    sheetKey: string,
    sourceColumn: string,
    newTargetField: string
  ) => {
    setMappingConfigs((prev) =>
      prev.map((cfg) => {
        if (cfg.sheetKey !== sheetKey) return cfg;
        const updatedMappings = cfg.mappings.map((m) =>
          m.sourceColumn === sourceColumn
            ? {
              ...m,
              targetField: newTargetField,
              confidence: newTargetField && newTargetField !== "__ignore__" ? 100 : 0,
              reason:
                newTargetField === "__ignore__"
                  ? "Manually ignored by user"
                  : newTargetField
                    ? "Manually mapped by user"
                    : "Unmapped",
            }
            : m
        );
        return recomputeMappingDiagnostics({
          ...cfg,
          mappings: updatedMappings,
        });
      })
    );
  };

  // Change entity type for a sheet in Step 2 or Step 3
  const handleChangeSheetEntity = (sheetKey: string, newEntity: ImportEntityType) => {
    setSheetAnalyses((prev) =>
      prev.map((a) =>
        a.sheetKey === sheetKey ? { ...a, detectedEntity: newEntity, entityConfidence: 100 } : a
      )
    );
    const targetAnalysis = sheetAnalyses.find((a) => a.sheetKey === sheetKey);
    if (targetAnalysis) {
      const remapped = generateDeterministicSheetMapping(
        { ...targetAnalysis, detectedEntity: newEntity },
        newEntity
      );
      setMappingConfigs((prev) =>
        prev.map((c) => (c.sheetKey === sheetKey ? remapped : c))
      );
    }
  };

  // Exclude a whole sheet from the import (Step 3)
  const handleSkipSheet = (sheetKey: string) => {
    const remaining = mappingConfigs.filter((c) => c.includeInImport && c.sheetKey !== sheetKey);
    if (remaining.length === 0) {
      toast({
        title: "At least one sheet is needed",
        description: "Go back to Step 2 to choose which sheets to import.",
        variant: "warning",
      });
      return;
    }
    setMappingConfigs((prev) =>
      prev.map((c) => (c.sheetKey === sheetKey ? { ...c, includeInImport: false } : c))
    );
    setSheetAnalyses((prev) =>
      prev.map((a) => (a.sheetKey === sheetKey ? { ...a, includeInImport: false } : a))
    );
    setSelectedMappingSheetKey(remaining[0].sheetKey);
  };

  // Proceed Step 3 -> Step 4 (Run Validation & Duplicate Detection)
  const handleProceedToStep4 = () => {
    const activeConfigs = mappingConfigs.filter((c) => c.includeInImport);
    const sheetWithMissingReq = activeConfigs.find(
      (c) => c.missingRequiredFields.length > 0
    );
    if (sheetWithMissingReq) {
      toast({
        title: "Missing Required Column Mapping",
        description: `Sheet "${sheetWithMissingReq.sheetName}" is missing required fields: ${sheetWithMissingReq.missingRequiredFields.join(", ")}`,
        variant: "error",
      });
      setSelectedMappingSheetKey(sheetWithMissingReq.sheetKey);
      return;
    }

    const existingSnapshot = {
      invoices: cloudWorkspace?.invoices || [],
      products: cloudWorkspace?.products || [],
      customers: cloudWorkspace?.stores || [],
      payments: cloudWorkspace?.payments || [],
      expenses: cloudWorkspace?.expenses || [],
    };

    const { stagedRecords: staged } = runValidationAndStaging(
      workbooks,
      mappingConfigs,
      existingSnapshot,
      duplicateStrategy
    );
    setStagedRecords(staged);
    setValidationFilter("all");
    setCurrentStep(4);
  };

  // Change global duplicate handling strategy in Step 4
  const handleDuplicateStrategyChange = (strategy: DuplicateHandlingStrategy) => {
    setDuplicateStrategy(strategy);
    setStagedRecords((prev) =>
      prev.map((rec) => {
        if (rec.status === "invalid") return { ...rec, action: "skip" };
        if (rec.duplicateStatus !== "unique") {
          return {
            ...rec,
            action:
              strategy === "skip" ? "skip" : strategy === "merge" ? "merge" : "import",
          };
        }
        return rec;
      })
    );
  };

  // Save inline row edits in Step 4
  const handleSaveInlineEdit = (recId: string) => {
    setStagedRecords((prev) =>
      prev.map((rec) => {
        if (rec.id !== recId) return rec;
        const nextNorm = { ...rec.normalized, ...editDraft };
        const fieldDefs = SEYALPRO_ENTITY_FIELDS[rec.entityType] || [];
        const remainingIssues = rec.issues.filter((iss) => {
          if (iss.code === "MISSING_REQUIRED") {
            const val = nextNorm[iss.field];
            return val === undefined || val === null || String(val).trim() === "";
          }
          if (iss.code === "INVALID_DATE") {
            const parsed = normalizeFlexibleDate(nextNorm[iss.field]);
            if (parsed.isValid && parsed.iso) {
              nextNorm[iss.field] = parsed.iso;
              return false;
            }
            return true;
          }
          if (iss.code === "INVALID_NUMBER") {
            const parsed = parseCurrencyNumber(nextNorm[iss.field]);
            if (parsed.isValid && parsed.value !== null) {
              nextNorm[iss.field] = parsed.value;
              return false;
            }
            return true;
          }
          return true;
        });

        // Re-check required fields
        for (const f of fieldDefs) {
          if (f.required) {
            const v = nextNorm[f.key];
            if (v !== undefined && v !== null && String(v).trim() !== "") {
              // resolved
            }
          }
        }

        const hasErr = remainingIssues.some((i) => i.severity === "error");
        const hasWarn = remainingIssues.some((i) => i.severity === "warning");
        const nextStatus: StagedImportRecord["status"] = hasErr
          ? "invalid"
          : hasWarn
            ? "warning"
            : "valid";

        return {
          ...rec,
          normalized: nextNorm,
          issues: remainingIssues,
          status: nextStatus,
          action: hasErr ? "skip" : rec.action === "skip" ? "import" : rec.action,
        };
      })
    );
    setEditingRowId(null);
    setEditDraft({});
    toast({
      title: "Record Updated",
      description: "Field changes validated and applied.",
      variant: "success",
    });
  };

  // Export Validation Error Report as CSV
  const handleExportErrorReport = () => {
    const allIssues = stagedRecords.flatMap((r) => r.issues);
    if (allIssues.length === 0) {
      toast({
        title: "No Issues Found",
        description: "All staged records passed validation without errors.",
      });
      return;
    }

    let csv = "\uFEFFFile,Sheet,Row Number,Entity,Field,Severity,Code,Message,Original Value\n";
    for (const iss of allIssues) {
      csv += `"${iss.fileName}","${iss.sheetName}",${iss.rowNumber},"${iss.entityType}","${iss.field}","${iss.severity}","${iss.code}","${iss.message.replace(/"/g, '""')}","${(iss.originalValue || "").replace(/"/g, '""')}"\n`;
    }

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `CounterCub_Import_Validation_Report_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Computed validation summary
  const validationSummary = useMemo(() => {
    const allIssues = stagedRecords.flatMap((r) => r.issues);
    return computeValidationSummary(stagedRecords, allIssues);
  }, [stagedRecords]);

  // Filtered staged records for Step 4 table
  const filteredStagedRecords = useMemo(() => {
    return stagedRecords.filter((rec) => {
      if (validationFilter === "valid" && rec.status !== "valid") return false;
      if (validationFilter === "duplicates" && rec.duplicateStatus === "unique") return false;
      if (
        validationFilter === "missing" &&
        !rec.issues.some((i) => i.code === "MISSING_REQUIRED")
      )
        return false;
      if (
        validationFilter === "math" &&
        !rec.issues.some(
          (i) =>
            i.code === "MATH_DISCREPANCY" ||
            i.code === "BALANCE_MISMATCH" ||
            i.code === "MISSING_COST_DATA"
        )
      )
        return false;
      if (validationFilter === "invalid" && rec.status !== "invalid") return false;

      if (validationSearch.trim()) {
        const q = validationSearch.toLowerCase();
        const text = JSON.stringify(rec.normalized).toLowerCase();
        if (!text.includes(q) && !rec.sheetName.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [stagedRecords, validationFilter, validationSearch]);

  // Step 5 -> Step 6: Execute Import into Store's Supabase Workspace
  const handleExecuteImport = async () => {
    if (!userConfirmed) {
      toast({
        title: "Confirmation Required",
        description: "Please check the authorization box before importing.",
        variant: "error",
      });
      return;
    }

    const actionableCount = stagedRecords.filter(
      (r) => (r.action === "import" || r.action === "merge") && r.status !== "invalid"
    ).length;

    if (actionableCount === 0) {
      toast({
        title: "No Records Selected",
        description: "There are no valid records marked for import or merge.",
        variant: "error",
      });
      return;
    }

    setIsImporting(true);
    try {
      const headers = await getAuthHeaders();
      const filesPayload = workbooks.map((wb) => ({
        fileName: wb.fileName,
        fileSize: wb.fileSize,
        fileType: wb.fileType,
        sheetCount: wb.sheets.length,
        rowCount: wb.sheets.reduce((s, sh) => s + sh.rows.length, 0),
        detectedCategories: sheetAnalyses
          .filter((a) => a.fileId === wb.fileId)
          .map((a) => a.detectedEntity),
      }));

      const res = await fetch("/api/smart-import/execute", {
        method: "POST",
        headers,
        body: JSON.stringify({
          business_id: bizId,
          userConfirmed: true,
          importName,
          sourceSoftware,
          duplicateStrategy,
          files: filesPayload,
          mappingConfigs,
          records: stagedRecords,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Import failed on server.");
      }

      // Synchronize client-side localStorage cache for this specific store (bizId) so all pages reflect imported data immediately
      if (typeof window !== "undefined" && bizId && bizId !== "default" && data.workspaceDelta) {
        try {
          const delta = data.workspaceDelta;
          if (Array.isArray(delta.invoices) && delta.invoices.length > 0) {
            const existingInvs = JSON.parse(
              localStorage.getItem(`bftone_b2b_dispatches_${bizId}`) ||
              localStorage.getItem(`bftone_invoices_${bizId}`) ||
              "[]"
            );
            const map = new Map<string, any>();
            existingInvs.forEach((i: any) => map.set(i.id || i.invoiceNumber, i));
            delta.invoices.forEach((i: any) => map.set(i.id || i.invoiceNumber, i));
            const merged = Array.from(map.values());
            localStorage.setItem(`bftone_b2b_dispatches_${bizId}`, JSON.stringify(merged));
            localStorage.setItem(`bftone_invoices_${bizId}`, JSON.stringify(merged));
          }

          if (Array.isArray(delta.products) && delta.products.length > 0) {
            const existingProds = JSON.parse(
              localStorage.getItem(`bftone_baker_products_${bizId}`) || "[]"
            );
            const map = new Map<string, any>();
            existingProds.forEach((p: any) =>
              map.set(String(p.name || p.id).toLowerCase(), p)
            );
            delta.products.forEach((p: any) =>
              map.set(String(p.name || p.id).toLowerCase(), p)
            );
            localStorage.setItem(
              `bftone_baker_products_${bizId}`,
              JSON.stringify(Array.from(map.values()))
            );
          }

          if (Array.isArray(delta.stores) && delta.stores.length > 0) {
            const existingCusts = JSON.parse(
              localStorage.getItem(`bftone_customers_${bizId}`) || "[]"
            );
            const map = new Map<string, any>();
            existingCusts.forEach((c: any) =>
              map.set(String(c.name || c.id).toLowerCase(), c)
            );
            delta.stores.forEach((c: any) =>
              map.set(String(c.name || c.id).toLowerCase(), c)
            );
            const mergedClients = Array.from(map.values());
            localStorage.setItem(
              `bftone_customers_${bizId}`,
              JSON.stringify(mergedClients)
            );
            window.dispatchEvent(
              new CustomEvent(B2B_CUSTOMERS_UPDATED_EVENT, {
                detail: { clients: mergedClients },
              })
            );
          }

          if (Array.isArray(delta.payments) && delta.payments.length > 0) {
            const existingPays = JSON.parse(
              localStorage.getItem(`bftone_baker_payments_${bizId}`) || "[]"
            );
            localStorage.setItem(
              `bftone_baker_payments_${bizId}`,
              JSON.stringify([...delta.payments, ...existingPays])
            );
          }

          if (Array.isArray(delta.expenses) && delta.expenses.length > 0) {
            const existingExps = JSON.parse(
              localStorage.getItem(`bftone_baker_expenses_${bizId}`) || "[]"
            );
            localStorage.setItem(
              `bftone_baker_expenses_${bizId}`,
              JSON.stringify([...delta.expenses, ...existingExps])
            );
          }
        } catch { }
      }

      // Invalidate TanStack Query caches for this store
      queryClient.invalidateQueries({ queryKey: ["b2b", bizId] });
      queryClient.invalidateQueries({ queryKey: ["invoices", bizId] });

      setCompletedJob(data.job);
      setCurrentStep(6);
      fetchImportHistory();

      toast({
        title: "Smart Import Completed!",
        description: `Successfully imported ${data.job.imported_count} records into ${storeName}.`,
        variant: "success",
      });
    } catch (err: any) {
      toast({
        title: "Import Error",
        description: err?.message || "Could not complete the data import.",
        variant: "error",
      });
    } finally {
      setIsImporting(false);
    }
  };

  // Safe Rollback Handler
  const handleRollbackJob = async (job: any) => {
    const ok = await confirm({
      title: `Roll Back "${job.import_name}"?`,
      description:
        "This will safely remove unmodified records created by this import from your store. Any invoices that had subsequent payments or edits after import will be preserved.",
      confirmLabel: "Roll Back Import",
      variant: "danger",
    });
    if (!ok) return;

    setRollingBackJobId(job.id);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/smart-import/rollback", {
        method: "POST",
        headers,
        body: JSON.stringify({
          business_id: bizId,
          jobId: job.id,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Rollback failed");
      }

      // Remove rolled-back IDs from localStorage cache for this store
      if (typeof window !== "undefined" && bizId && data.RemovedRecordIds) {
        try {
          const rem = data.RemovedRecordIds;
          if (Array.isArray(rem.invoices) && rem.invoices.length > 0) {
            const invSet = new Set(rem.invoices);
            const cur = JSON.parse(
              localStorage.getItem(`bftone_b2b_dispatches_${bizId}`) || "[]"
            );
            const filtered = cur.filter((i: any) => !invSet.has(i.id));
            localStorage.setItem(
              `bftone_b2b_dispatches_${bizId}`,
              JSON.stringify(filtered)
            );
            localStorage.setItem(`bftone_invoices_${bizId}`, JSON.stringify(filtered));
          }
          if (Array.isArray(rem.products) && rem.products.length > 0) {
            const prodSet = new Set(rem.products);
            const cur = JSON.parse(
              localStorage.getItem(`bftone_baker_products_${bizId}`) || "[]"
            );
            localStorage.setItem(
              `bftone_baker_products_${bizId}`,
              JSON.stringify(cur.filter((p: any) => !prodSet.has(p.id)))
            );
          }
          if (Array.isArray(rem.customers) && rem.customers.length > 0) {
            const custSet = new Set(rem.customers);
            const cur = JSON.parse(
              localStorage.getItem(`bftone_customers_${bizId}`) || "[]"
            );
            localStorage.setItem(
              `bftone_customers_${bizId}`,
              JSON.stringify(cur.filter((c: any) => !custSet.has(c.id)))
            );
          }
        } catch { }
      }

      queryClient.invalidateQueries({ queryKey: ["b2b", bizId] });
      queryClient.invalidateQueries({ queryKey: ["invoices", bizId] });
      await fetchImportHistory();
      setSelectedHistoryJob(null);

      toast({
        title: "Import Rolled Back",
        description:
          data.conflicts?.length > 0
            ? `Rolled back unmodified records (${data.conflicts.length} modified record preserved).`
            : "All records created by this import were cleanly removed from your store.",
        variant: "success",
      });
    } catch (err: any) {
      toast({
        title: "Rollback Failed",
        description: err?.message || "Could not roll back this import.",
        variant: "error",
      });
    } finally {
      setRollingBackJobId(null);
    }
  };

  // Reset wizard for another import
  const handleResetWizard = () => {
    setWorkbooks([]);
    setSheetAnalyses([]);
    setMappingConfigs([]);
    setStagedRecords([]);
    setUserConfirmed(false);
    setCompletedJob(null);
    setCurrentStep(1);
    setActiveTab("wizard");
  };

  const activeMappingConfig = useMemo(
    () =>
      mappingConfigs.find((c) => c.sheetKey === selectedMappingSheetKey) ||
      mappingConfigs.find((c) => c.includeInImport) ||
      mappingConfigs[0],
    [mappingConfigs, selectedMappingSheetKey]
  );

  return (
    <div className="w-full max-w-6xl group-data-[sidebar-collapsed=true]:max-w-none mx-auto space-y-5">
      {/* ==================================================================== */}
      {/* TOP HEADER BAR                                                       */}
      {/* ==================================================================== */}
      <div className="bg-white rounded-3xl border border-[#E2E8F0] p-4 sm:p-5 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-sm shrink-0">
            <Sparkles size={22} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base sm:text-xl font-extrabold text-[#0F172A] tracking-tight">
                Smart Import
              </h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                <Sparkles size={11} />
                <span>AI-Powered Migration</span>
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <Store size={11} />
                <span>Store: {storeName}</span>
              </span>
            </div>
            <p className="text-xs text-[#64748B] mt-1">
              Bring your existing business records into CounterCub without manual entry.
            </p>
          </div>
        </div>

        {/* Mode Switcher: Wizard vs Import History */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="p-1 bg-slate-100 rounded-2xl border border-slate-200 flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveTab("wizard")}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer",
                activeTab === "wizard"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <Upload size={14} />
              <span>Import Wizard</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("history");
                fetchImportHistory();
              }}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer",
                activeTab === "history"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <History size={14} />
              <span>Import History ({historyJobs.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* TAB 1: SIX-STEP IMPORT WIZARD                                        */}
      {/* ==================================================================== */}
      {activeTab === "wizard" && (
        <div className="space-y-5">
          {/* 6-Step Progress Stepper */}
          <div className="bg-white rounded-3xl border border-[#E2E8F0] p-3.5 sm:p-4 shadow-xs overflow-x-auto no-scrollbar">
            <div className="flex items-center justify-between min-w-[640px] gap-2">
              {WIZARD_STEPS.map((s, idx) => {
                const isActive = currentStep === s.step;
                const isDone = currentStep > s.step;
                return (
                  <React.Fragment key={s.step}>
                    <button
                      type="button"
                      disabled={s.step > currentStep}
                      onClick={() => {
                        if (s.step < currentStep && currentStep < 6) {
                          setCurrentStep(s.step as any);
                        }
                      }}
                      className={cn(
                        "flex items-center gap-2.5 px-3 py-2 rounded-2xl text-left transition-all",
                        isActive
                          ? "bg-blue-50 border border-blue-200"
                          : isDone
                            ? "hover:bg-slate-50 cursor-pointer"
                            : "opacity-55 cursor-not-allowed"
                      )}
                    >
                      <div
                        className={cn(
                          "w-7 h-7 rounded-xl flex items-center justify-center text-xs font-extrabold shrink-0",
                          isActive
                            ? "bg-blue-600 text-white shadow-2xs"
                            : isDone
                              ? "bg-emerald-600 text-white"
                              : "bg-slate-100 text-slate-500 border border-slate-200"
                        )}
                      >
                        {isDone ? <Check size={14} /> : s.step}
                      </div>
                      <div className="min-w-0">
                        <p
                          className={cn(
                            "text-xs font-extrabold leading-tight whitespace-nowrap",
                            isActive ? "text-blue-700" : "text-[#0F172A]"
                          )}
                        >
                          {s.title}
                        </p>
                        <p className="text-[10px] text-[#64748B] whitespace-nowrap">
                          {s.subtitle}
                        </p>
                      </div>
                    </button>
                    {idx < WIZARD_STEPS.length - 1 && (
                      <div
                        className={cn(
                          "h-0.5 flex-1 min-w-[16px] rounded-full",
                          currentStep > s.step ? "bg-emerald-500" : "bg-slate-200"
                        )}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* ================================================================ */}
          {/* STEP 1: UPLOAD FILES                                             */}
          {/* ================================================================ */}
          {currentStep === 1 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Left 2 Columns: Upload Zone & File Queue */}
              <div className="lg:col-span-2 space-y-4">
                <div className="bg-white rounded-3xl border border-[#E2E8F0] p-5 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h2 className="text-base font-extrabold text-[#0F172A]">
                        Step 1: Upload Your Business Spreadsheets
                      </h2>
                      <p className="text-xs text-[#64748B]">
                        Upload one or multiple Excel (.xlsx, .xls) or CSV (.csv) files. No fixed template required.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleLoadSampleFile}
                        disabled={isParsing}
                        className="px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Sparkles size={13} />
                        <span>Try Sample Migration File</span>
                      </button>
                    </div>
                  </div>

                  {/* Import Name & Source Software */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-[11px] font-bold text-[#0F172A] uppercase tracking-wider mb-1">
                        Migration Reference Name
                      </label>
                      <input
                        type="text"
                        value={importName}
                        onChange={(e) => setImportName(e.target.value)}
                        placeholder="e.g., FY 2024-25 Historical Records"
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-[#0F172A] uppercase tracking-wider mb-1">
                        Where are these files from?
                      </label>
                      <select
                        value={sourceSoftware}
                        onChange={(e) => setSourceSoftware(e.target.value as SourceSoftwareType)}
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-[#0F172A] bg-white"
                      >
                        {SOURCE_SOFTWARE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Drag and Drop Area */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      if (e.dataTransfer.files) {
                        handleFilesSelected(e.dataTransfer.files);
                      }
                    }}
                    className={cn(
                      "border-2 border-dashed rounded-3xl p-8 text-center transition-all",
                      isDragging
                        ? "border-blue-600 bg-blue-50/60"
                        : "border-slate-300 hover:border-blue-400 bg-slate-50/60"
                    )}
                  >
                    <input
                      id="smart-import-file-input"
                      type="file"
                      multiple
                      accept=".xlsx,.xls,.csv"
                      onChange={(e) => {
                        if (e.target.files) handleFilesSelected(e.target.files);
                        e.target.value = "";
                      }}
                      className="hidden"
                    />
                    <div className="w-12 h-12 rounded-2xl bg-blue-600/10 border border-blue-500/20 text-blue-600 flex items-center justify-center mx-auto mb-3">
                      <FileSpreadsheet size={24} />
                    </div>
                    <p className="text-sm font-extrabold text-[#0F172A]">
                      Drag &amp; drop your Excel or CSV files here
                    </p>
                    <p className="text-xs text-[#64748B] mt-1">
                      Supports <strong>.xlsx</strong>, <strong>.xls</strong>, <strong>.csv</strong> &amp; Google Sheets exports (up to 15 MB per file)
                    </p>
                    <div className="mt-4 flex items-center justify-center gap-2.5">
                      <label
                        htmlFor="smart-import-file-input"
                        className="px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <Upload size={14} />
                        <span>Browse Files</span>
                      </label>
                      <button
                        type="button"
                        onClick={handleDownloadSampleXlsx}
                        className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold transition cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <Download size={14} />
                        <span>Download Sample .xlsx</span>
                      </button>
                    </div>
                  </div>

                  {/* Uploaded Files Queue */}
                  {workbooks.length > 0 && (
                    <div className="space-y-2.5 pt-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-[#0F172A] uppercase tracking-wider">
                          Uploaded Workbooks ({workbooks.length})
                        </span>
                        <button
                          type="button"
                          onClick={() => setWorkbooks([])}
                          className="text-xs font-bold text-rose-600 hover:underline cursor-pointer"
                        >
                          Clear All
                        </button>
                      </div>
                      <div className="space-y-2">
                        {workbooks.map((wb) => {
                          const totalRows = wb.sheets.reduce((s, sh) => s + sh.rows.length, 0);
                          return (
                            <div
                              key={wb.fileId}
                              className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center font-extrabold text-xs uppercase shrink-0">
                                  {wb.fileType}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-extrabold text-[#0F172A] truncate">
                                    {wb.fileName}
                                  </p>
                                  <p className="text-[11px] text-[#64748B]">
                                    {formatBytes(wb.fileSize)} • {wb.sheets.length} sheet
                                    {wb.sheets.length === 1 ? "" : "s"} •{" "}
                                    <strong>{totalRows}</strong> data rows ready
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                  Parsed
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setWorkbooks((prev) =>
                                      prev.filter((item) => item.fileId !== wb.fileId)
                                    )
                                  }
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                                  title="Remove file"
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Action Buttons: Auto-Pilot vs Step-by-Step */}
                  <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
                    <button
                      type="button"
                      onClick={handleProceedToStep2}
                      disabled={workbooks.length === 0 || isParsing || isAutoPilotLoading}
                      className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span>Step-by-Step Review</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAutoPilotFlow()}
                      disabled={workbooks.length === 0 || isParsing || isAutoPilotLoading}
                      className={cn(
                        "px-5 py-2.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition shadow-md shadow-blue-500/20",
                        workbooks.length > 0 && !isParsing && !isAutoPilotLoading
                          ? "bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-700 hover:to-indigo-700 text-white cursor-pointer"
                          : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                      )}
                    >
                      <Sparkles size={15} />
                      <span>Auto-Pilot: Analyze &amp; Map with AI</span>
                      <ArrowRight size={15} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column: Onboarding & Store Isolation Guarantee */}
              <div className="space-y-4">
                <div className="bg-white rounded-3xl border border-[#E2E8F0] p-5 shadow-xs space-y-3.5">
                  <div className="flex items-center gap-2 text-blue-700 font-extrabold text-xs uppercase tracking-wider">
                    <ShieldCheck size={16} />
                    <span>How Smart Import Works</span>
                  </div>
                  <ul className="space-y-2.5 text-xs text-[#64748B]">
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-blue-50 text-blue-700 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                        1
                      </span>
                      <span>
                        <strong className="text-[#0F172A]">Any Column Names:</strong> Upload your spreadsheets as they are. AI maps columns like <em>Client</em>, <em>Buyer</em>, <em>Grand Amt</em>, or <em>Pending</em> automatically.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-blue-50 text-blue-700 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                        2
                      </span>
                      <span>
                        <strong className="text-[#0F172A]">Multi-Sheet Support:</strong> Upload a single Excel workbook containing Invoices, Customers, Products, and Expenses across tabs.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-blue-50 text-blue-700 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                        3
                      </span>
                      <span>
                        <strong className="text-[#0F172A]">Strict Store Isolation:</strong> Records are imported strictly into <strong>{storeName}</strong> in Supabase and never affect any other store.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-blue-50 text-blue-700 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                        4
                      </span>
                      <span>
                        <strong className="text-[#0F172A]">Safe Rollback:</strong> Every migration is tracked with provenance so you can roll back an import anytime.
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* STEP 2: AI FILE & SHEET ANALYSIS                                 */}
          {/* ================================================================ */}
          {currentStep === 2 && (
            <div className="bg-white rounded-3xl border border-[#E2E8F0] p-5 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-extrabold text-[#0F172A]">
                    Step 2: AI File &amp; Sheet Structure Analysis
                  </h2>
                  <p className="text-xs text-[#64748B]">
                    Review the detected sheets, data formats, and business record categories before mapping columns.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft size={14} />
                    <span>Back</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleProceedToStep3}
                    className="px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-extrabold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Sparkles size={14} />
                    <span>Map Columns with AI</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sheetAnalyses.map((sheet) => {
                  const meta = ENTITY_META[sheet.detectedEntity];
                  return (
                    <div
                      key={sheet.sheetKey}
                      className={cn(
                        "rounded-2xl border p-4 space-y-3 transition-all",
                        sheet.includeInImport
                          ? "bg-white border-slate-200 shadow-2xs"
                          : "bg-slate-50 border-slate-200 opacity-60"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[10px] font-extrabold">
                              {sheet.fileName}
                            </span>
                            <span className="text-xs font-extrabold text-[#0F172A] truncate">
                              Sheet: {sheet.sheetName}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#64748B] mt-1">
                            <strong>{sheet.rowCount}</strong> records •{" "}
                            {sheet.columnProfiles.length} columns
                            {sheet.emptyRowsSkipped > 0 &&
                              ` • ${sheet.emptyRowsSkipped} blank rows skipped`}
                          </p>
                        </div>

                        <label className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0F172A] cursor-pointer shrink-0">
                          <input
                            type="checkbox"
                            checked={sheet.includeInImport}
                            onChange={(e) =>
                              setSheetAnalyses((prev) =>
                                prev.map((a) =>
                                  a.sheetKey === sheet.sheetKey
                                    ? { ...a, includeInImport: e.target.checked }
                                    : a
                                )
                              )
                            }
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span>Include</span>
                        </label>
                      </div>

                      {/* Detected Category Selector */}
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                            Classified Business Category ({sheet.entityConfidence}% match)
                          </label>
                        </div>
                        <select
                          value={sheet.detectedEntity}
                          onChange={(e) =>
                            handleChangeSheetEntity(
                              sheet.sheetKey,
                              e.target.value as ImportEntityType
                            )
                          }
                          className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-[#0F172A]"
                        >
                          {(Object.keys(ENTITY_META) as ImportEntityType[]).map((ek) => (
                            <option key={ek} value={ek}>
                              {ENTITY_META[ek].label} — {ENTITY_META[ek].description}
                            </option>
                          ))}
                        </select>
                        <p className="text-[11px] text-[#64748B]">{meta.description}</p>
                      </div>

                      {/* Detected Column Badges */}
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Detected Columns &amp; Types
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {sheet.columnProfiles.map((col) => (
                            <span
                              key={col.columnName}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200"
                            >
                              <span>{col.columnName}</span>
                              <span className="text-[9px] uppercase px-1 rounded bg-white text-blue-600 font-bold">
                                {col.inferredType}
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Metadata Footer */}
                      <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-[#64748B]">
                        {sheet.detectedDateFormats.length > 0 && (
                          <span>
                            Date format: <strong>{sheet.detectedDateFormats.join(", ")}</strong>
                          </span>
                        )}
                        {sheet.detectedCurrencies.length > 0 && (
                          <span>
                            Currency: <strong>{sheet.detectedCurrencies.join(", ")}</strong>
                          </span>
                        )}
                        {sheet.estimatedDuplicatesCount > 0 && (
                          <span className="text-amber-700 font-semibold">
                            • {sheet.estimatedDuplicatesCount} exact duplicate row(s)
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* STEP 3: AI COLUMN MAPPING                                        */}
          {/* ================================================================ */}
          {currentStep === 3 && activeMappingConfig && (
            <div className="bg-white rounded-3xl border border-[#E2E8F0] p-5 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-extrabold text-[#0F172A]">
                      Step 3: AI Column Mapping
                    </h2>
                    {isAiMappingLoading ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 animate-pulse">
                        <RefreshCw size={11} className="animate-spin" />
                        <span>Refining with AI...</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 size={11} />
                        <span>
                          Mapped ({activeMappingConfig.aiSource === "deterministic" ? "Semantic" : activeMappingConfig.aiSource || "Semantic + AI"})
                        </span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#64748B]">
                    Verify how each spreadsheet column maps to CounterCub&apos;s fields. High-confidence matches are selected automatically.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(2)}
                    className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft size={14} />
                    <span>Back</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleProceedToStep4}
                    className="px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-extrabold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <span>Validate Records</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>

              {/* Sheet Selector Tabs */}
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 border-b border-slate-200">
                {mappingConfigs
                  .filter((c) => c.includeInImport)
                  .map((cfg) => {
                    const isSelected = cfg.sheetKey === activeMappingConfig.sheetKey;
                    const hasMissing = cfg.missingRequiredFields.length > 0;
                    return (
                      <button
                        key={cfg.sheetKey}
                        type="button"
                        onClick={() => setSelectedMappingSheetKey(cfg.sheetKey)}
                        className={cn(
                          "px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer",
                          isSelected
                            ? "bg-blue-600 text-white shadow-2xs"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        )}
                      >
                        <span>{cfg.sheetName}</span>
                        <span
                          className={cn(
                            "px-1.5 py-0.5 rounded text-[9px] uppercase font-extrabold",
                            isSelected
                              ? "bg-blue-700 text-white"
                              : "bg-white text-slate-600"
                          )}
                        >
                          {ENTITY_META[cfg.entityType].label}
                        </span>
                        {hasMissing ? (
                          <AlertCircle
                            size={13}
                            className={isSelected ? "text-amber-300" : "text-rose-600"}
                          />
                        ) : (
                          <CheckCircle2
                            size={13}
                            className={isSelected ? "text-emerald-300" : "text-emerald-600"}
                          />
                        )}
                      </button>
                    );
                  })}
              </div>

              {/* Missing Required Fields Alert */}
              {activeMappingConfig.missingRequiredFields.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 flex flex-col sm:flex-row sm:items-start gap-3 text-xs text-rose-800">
                  <div className="flex items-start gap-2.5 flex-1">
                    <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-extrabold">
                        Required CounterCub fields not mapped yet for &ldquo;{activeMappingConfig.sheetName}&rdquo; ({ENTITY_META[activeMappingConfig.entityType].label}):
                      </p>
                      <p className="mt-0.5">
                        Please map:{" "}
                        <strong>{activeMappingConfig.missingRequiredFields.join(", ")}</strong>
                      </p>
                      <p className="mt-1 text-rose-700/90">
                        Ignoring columns does not satisfy required fields. If this sheet holds a different kind of data, change its category, or skip the sheet entirely.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={activeMappingConfig.entityType}
                      onChange={(e) =>
                        handleChangeSheetEntity(
                          activeMappingConfig.sheetKey,
                          e.target.value as ImportEntityType
                        )
                      }
                      className="px-2.5 py-1.5 rounded-xl border border-rose-200 bg-white text-xs font-bold text-[#0F172A]"
                      aria-label="Change sheet category"
                    >
                      {(Object.keys(ENTITY_META) as ImportEntityType[]).map((ek) => (
                        <option key={ek} value={ek}>
                          {ENTITY_META[ek].label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => handleSkipSheet(activeMappingConfig.sheetKey)}
                      className="px-3 py-1.5 rounded-xl bg-white border border-rose-300 text-rose-700 text-xs font-bold hover:bg-rose-100 transition cursor-pointer"
                    >
                      Skip this sheet
                    </button>
                  </div>
                </div>
              )}

              {/* Duplicate Target Field Warning */}
              {activeMappingConfig.duplicateTargetFields.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-900">
                  <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-extrabold">Duplicate Field Assignment Detected:</p>
                    <p className="mt-0.5">
                      Multiple columns are mapped to:{" "}
                      <strong>{activeMappingConfig.duplicateTargetFields.join(", ")}</strong>.
                    </p>
                  </div>
                </div>
              )}

              {/* Responsive Column Mapping Table */}
              <div className="table-scroll-container rounded-2xl border border-slate-200">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold text-[#64748B] uppercase tracking-wider">
                      <th className="py-3 px-4">Original Spreadsheet Column</th>
                      <th className="py-3 px-4">Sample Values</th>
                      <th className="py-3 px-4">CounterCub Target Field</th>
                      <th className="py-3 px-4 text-center">Confidence</th>
                      <th className="py-3 px-4">Mapping Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {activeMappingConfig.mappings.map((m) => {
                      const allowedFields =
                        SEYALPRO_ENTITY_FIELDS[activeMappingConfig.entityType] || [];
                      return (
                        <tr key={m.sourceColumn} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4 font-extrabold text-[#0F172A]">
                            <div className="flex items-center gap-2">
                              <span>{m.sourceColumn}</span>
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold uppercase">
                                {m.inferredType}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-[#64748B] max-w-[240px]">
                            <div className="flex flex-wrap gap-1">
                              {m.sampleValues.length > 0 ? (
                                m.sampleValues.slice(0, 3).map((sv, idx) => (
                                  <span
                                    key={idx}
                                    className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-medium truncate max-w-[140px]"
                                  >
                                    {sv}
                                  </span>
                                ))
                              ) : (
                                <span className="italic text-slate-400">Empty column</span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 min-w-[230px]">
                            <select
                              value={m.targetField}
                              onChange={(e) =>
                                handleUpdateColumnMapping(
                                  activeMappingConfig.sheetKey,
                                  m.sourceColumn,
                                  e.target.value
                                )
                              }
                              className={cn(
                                "w-full px-3 py-1.5 rounded-xl border text-xs font-bold",
                                m.targetField && m.targetField !== "__ignore__"
                                  ? "border-blue-300 bg-blue-50/40 text-blue-900"
                                  : "border-slate-200 bg-white text-slate-600"
                              )}
                            >
                              <option value="">-- Select CounterCub Field --</option>
                              <option value="__ignore__">🚫 Ignore / Skip Column</option>
                              {allowedFields.map((f) => (
                                <option key={f.key} value={f.key}>
                                  {f.label} {f.required ? "(Required)" : "(Optional)"}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            {m.targetField && m.targetField !== "__ignore__" ? (
                              <span
                                className={cn(
                                  "px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border",
                                  m.confidenceLevel === "high"
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : m.confidenceLevel === "medium"
                                      ? "bg-amber-50 text-amber-700 border-amber-200"
                                      : "bg-rose-50 text-rose-700 border-rose-200"
                                )}
                              >
                                {m.confidence}%{" "}
                                {m.confidenceLevel === "high"
                                  ? "High"
                                  : m.confidenceLevel === "medium"
                                    ? "Confirm"
                                    : "Manual"}
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-400">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-[11px] text-[#64748B]">
                            {!m.isCompatibleType ? (
                              <span className="text-amber-700 font-bold flex items-center gap-1">
                                <AlertTriangle size={13} />
                                <span>Check type compatibility</span>
                              </span>
                            ) : (
                              <span>{m.reason || "Mapped"}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* STEP 4: VALIDATION & DUPLICATE DETECTION                         */}
          {/* ================================================================ */}
          {currentStep === 4 && (
            <div className="space-y-4">
              {/* AI Auto-Pilot Notice Banner (if skipped manual review) */}
              {skippedManualReview && (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50 via-indigo-50/70 to-emerald-50/80 border border-blue-200/90 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-xs shrink-0">
                      <Sparkles size={18} />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-blue-950 flex items-center gap-1.5">
                        <span>AI Auto-Pilot Applied</span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-blue-100 text-blue-800 uppercase tracking-wide">
                          Auto-Mapped &amp; Ready
                        </span>
                      </h4>
                      <p className="text-[11px] text-blue-800/90 mt-0.5">
                        AI analyzed your sheets, classified categories, and mapped all columns with high confidence. You skipped manual steps and arrived directly at data validation.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setCurrentStep(3)}
                      className="px-3.5 py-1.5 rounded-xl bg-white border border-blue-300 text-blue-700 text-xs font-bold hover:bg-blue-100/60 transition shadow-2xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>Review / Edit AI Mappings</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Validation Summary KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <div className="bg-white p-3.5 rounded-2xl border border-[#E2E8F0] shadow-2xs">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                    Valid Records
                  </p>
                  <p className="text-xl font-black text-emerald-600 mt-1 tabular-nums">
                    {validationSummary.validCount}
                  </p>
                </div>
                <div className="bg-white p-3.5 rounded-2xl border border-[#E2E8F0] shadow-2xs">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                    Possible Duplicates
                  </p>
                  <p className="text-xl font-black text-amber-600 mt-1 tabular-nums">
                    {validationSummary.duplicateCount}
                  </p>
                </div>
                <div className="bg-white p-3.5 rounded-2xl border border-[#E2E8F0] shadow-2xs">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-rose-700">
                    Missing Fields
                  </p>
                  <p className="text-xl font-black text-rose-600 mt-1 tabular-nums">
                    {validationSummary.missingFieldsCount}
                  </p>
                </div>
                <div className="bg-white p-3.5 rounded-2xl border border-[#E2E8F0] shadow-2xs">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700">
                    Math / Cost Alerts
                  </p>
                  <p className="text-xl font-black text-blue-600 mt-1 tabular-nums">
                    {validationSummary.mathDiscrepancyCount + validationSummary.missingCostCount}
                  </p>
                </div>
                <div className="bg-white p-3.5 rounded-2xl border border-[#E2E8F0] shadow-2xs col-span-2 sm:col-span-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    Invalid / Blocked
                  </p>
                  <p className="text-xl font-black text-slate-800 mt-1 tabular-nums">
                    {validationSummary.invalidCount}
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-[#E2E8F0] p-5 shadow-xs space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-extrabold text-[#0F172A]">
                      Step 4: Validation, Financial Integrity &amp; Duplicate Resolution
                    </h2>
                    <p className="text-xs text-[#64748B]">
                      Inspect flagged rows, edit values inline, and choose how duplicates should be handled.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleExportErrorReport}
                      className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download size={14} />
                      <span>Export Issue Report (CSV)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentStep(3)}
                      className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <ArrowLeft size={14} />
                      <span>Back</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentStep(5)}
                      className="px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-extrabold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <span>Final Import Review</span>
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </div>

                {/* Duplicate Strategy & Filter Controls */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        { id: "all", label: `All (${stagedRecords.length})` },
                        { id: "valid", label: `Valid (${validationSummary.validCount})` },
                        { id: "duplicates", label: `Duplicates (${validationSummary.duplicateCount})` },
                        { id: "missing", label: `Missing Fields (${validationSummary.missingFieldsCount})` },
                        {
                          id: "math",
                          label: `Math / Cost Notes (${validationSummary.mathDiscrepancyCount + validationSummary.missingCostCount})`,
                        },
                        { id: "invalid", label: `Invalid (${validationSummary.invalidCount})` },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setValidationFilter(tab.id)}
                        className={cn(
                          "px-2.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer",
                          validationFilter === tab.id
                            ? "bg-blue-600 text-white"
                            : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                        )}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-slate-600 whitespace-nowrap">
                      Duplicate Strategy:
                    </label>
                    <select
                      value={duplicateStrategy}
                      onChange={(e) =>
                        handleDuplicateStrategyChange(
                          e.target.value as DuplicateHandlingStrategy
                        )
                      }
                      className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-[#0F172A]"
                    >
                      <option value="skip">Skip Duplicates (Recommended)</option>
                      <option value="merge">Merge / Update Existing Store Records</option>
                      <option value="import_as_new">Import as New Records</option>
                    </select>
                  </div>
                </div>

                {/* Search Input */}
                <div className="relative max-w-sm">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    value={validationSearch}
                    onChange={(e) => setValidationSearch(e.target.value)}
                    placeholder="Search customer, invoice no, product..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium"
                  />
                </div>

                {/* Staged Records Table */}
                <div className="table-scroll-container rounded-2xl border border-slate-200 max-h-[480px] overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold text-[#64748B] uppercase tracking-wider z-10">
                      <tr>
                        <th className="py-3 px-3">Row / Sheet</th>
                        <th className="py-3 px-3">Category</th>
                        <th className="py-3 px-3">Normalized Record Preview</th>
                        <th className="py-3 px-3">Validation &amp; Math Status</th>
                        <th className="py-3 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {filteredStagedRecords.slice(0, 150).map((rec) => {
                        const isEditing = editingRowId === rec.id;
                        const norm = rec.normalized;
                        return (
                          <tr key={rec.id} className="hover:bg-slate-50/70">
                            <td className="py-3 px-3 whitespace-nowrap">
                              <span className="font-extrabold text-[#0F172A]">
                                #{rec.rowNumber}
                              </span>
                              <p className="text-[10px] text-[#64748B]">{rec.sheetName}</p>
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[10px] font-extrabold">
                                {ENTITY_META[rec.entityType].label}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              {isEditing ? (
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-2 rounded-xl bg-blue-50/50 border border-blue-200">
                                  {Object.entries(norm)
                                    .filter(([k]) => k !== "items" && k !== "has_verified_cost")
                                    .map(([k, val]) => (
                                      <div key={k}>
                                        <label className="block text-[9px] font-bold uppercase text-slate-500">
                                          {k.replace(/_/g, " ")}
                                        </label>
                                        <input
                                          type="text"
                                          value={
                                            editDraft[k] !== undefined
                                              ? String(editDraft[k])
                                              : String(val ?? "")
                                          }
                                          onChange={(e) =>
                                            setEditDraft((prev) => ({
                                              ...prev,
                                              [k]: e.target.value,
                                            }))
                                          }
                                          className="w-full px-2 py-1 rounded border border-slate-300 bg-white text-xs font-semibold"
                                        />
                                      </div>
                                    ))}
                                  <div className="sm:col-span-3 flex justify-end gap-1.5 pt-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingRowId(null);
                                        setEditDraft({});
                                      }}
                                      className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 text-[11px] font-bold cursor-pointer"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleSaveInlineEdit(rec.id)}
                                      className="px-2.5 py-1 rounded-lg bg-blue-600 text-white text-[11px] font-bold cursor-pointer"
                                    >
                                      Save Fix
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                                  {Object.entries(norm)
                                    .filter(([k]) => k !== "items" && k !== "has_verified_cost")
                                    .slice(0, 6)
                                    .map(([k, val]) => (
                                      <span key={k}>
                                        <span className="text-slate-400 font-medium">
                                          {k.replace(/_/g, " ")}:
                                        </span>{" "}
                                        <strong className="text-[#0F172A]">
                                          {String(val ?? "—")}
                                        </strong>
                                      </span>
                                    ))}
                                  {Array.isArray(norm.items) && norm.items.length > 0 && (
                                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-bold">
                                      {norm.items.length} line item(s)
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-3">
                              {rec.issues.length === 0 ? (
                                <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-[11px]">
                                  <CheckCircle2 size={13} />
                                  <span>Verified</span>
                                </span>
                              ) : (
                                <div className="space-y-1">
                                  {rec.issues.map((iss) => (
                                    <div
                                      key={iss.id}
                                      className={cn(
                                        "text-[11px] font-semibold flex items-start gap-1",
                                        iss.severity === "error"
                                          ? "text-rose-600"
                                          : "text-amber-700"
                                      )}
                                    >
                                      <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                                      <span>{iss.message}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-3 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                {!isEditing && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingRowId(rec.id);
                                      setEditDraft({ ...rec.normalized });
                                    }}
                                    className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold cursor-pointer"
                                  >
                                    Edit
                                  </button>
                                )}
                                <select
                                  value={rec.action}
                                  onChange={(e) =>
                                    setStagedRecords((prev) =>
                                      prev.map((r) =>
                                        r.id === rec.id
                                          ? { ...r, action: e.target.value as any }
                                          : r
                                      )
                                    )
                                  }
                                  className={cn(
                                    "px-2.5 py-1 rounded-lg text-[11px] font-bold border",
                                    rec.action === "import"
                                      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                      : rec.action === "merge"
                                        ? "bg-blue-50 text-blue-800 border-blue-200"
                                        : "bg-slate-100 text-slate-600 border-slate-200"
                                  )}
                                >
                                  <option value="import">Import</option>
                                  <option value="merge">Merge</option>
                                  <option value="skip">Exclude / Skip</option>
                                </select>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* STEP 5: FINAL IMPORT REVIEW & EXPLICIT CONFIRMATION              */}
          {/* ================================================================ */}
          {currentStep === 5 && (
            <div className="bg-white rounded-3xl border border-[#E2E8F0] p-5 sm:p-6 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-extrabold text-[#0F172A]">
                    Step 5: Final Import Review &amp; Authorization
                  </h2>
                  <p className="text-xs text-[#64748B]">
                    Review the records that will be committed to your store workspace.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentStep(4)}
                  disabled={isImporting}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer self-start"
                >
                  <ArrowLeft size={14} />
                  <span>Back to Validation</span>
                </button>
              </div>

              {/* Destination Store & Tenant Isolation Card */}
              <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                    <Store size={20} />
                  </div>
                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-blue-700">
                      Destination Store Workspace (Tenant-Isolated)
                    </p>
                    <p className="text-sm font-black text-[#0F172A]">{storeName}</p>
                    <p className="text-[11px] text-[#64748B]">
                      Duplicate Strategy: <strong className="uppercase">{duplicateStrategy}</strong> • Migration Name: <strong>{importName}</strong>
                    </p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-blue-200 text-blue-800 text-xs font-extrabold self-start sm:self-center">
                  <ShieldCheck size={15} className="text-emerald-600" />
                  <span>Isolated to {storeName}</span>
                </span>
              </div>

              {/* Entity Breakdown Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {(Object.keys(validationSummary.byEntity) as ImportEntityType[])
                  .filter((et) => validationSummary.byEntity[et].total > 0)
                  .map((et) => {
                    const stats = validationSummary.byEntity[et];
                    return (
                      <div
                        key={et}
                        className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-extrabold text-[#0F172A]">
                            {ENTITY_META[et].label}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-white border border-slate-200 text-[11px] font-black text-slate-700">
                            {stats.total} total
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                          <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200">
                            <p className="text-[9px] font-bold uppercase text-emerald-700">
                              To Add
                            </p>
                            <p className="text-sm font-black text-emerald-700 tabular-nums">
                              {stats.toImport}
                            </p>
                          </div>
                          <div className="p-2 rounded-xl bg-blue-50 border border-blue-200">
                            <p className="text-[9px] font-bold uppercase text-blue-700">
                              To Merge
                            </p>
                            <p className="text-sm font-black text-blue-700 tabular-nums">
                              {stats.toMerge}
                            </p>
                          </div>
                          <div className="p-2 rounded-xl bg-slate-100 border border-slate-200">
                            <p className="text-[9px] font-bold uppercase text-slate-600">
                              Skipped
                            </p>
                            <p className="text-sm font-black text-slate-700 tabular-nums">
                              {stats.toSkip}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* Mandatory Explicit Confirmation Gate */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={userConfirmed}
                    onChange={(e) => setUserConfirmed(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs font-bold text-[#0F172A] leading-relaxed">
                    I have reviewed the mapped columns, validation summary, and duplicate handling rules, and I explicitly authorize importing these records into{" "}
                    <span className="text-blue-700 underline">{storeName}</span>.
                  </span>
                </label>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    disabled={!userConfirmed || isImporting}
                    onClick={handleExecuteImport}
                    className={cn(
                      "px-6 py-3 rounded-2xl text-xs sm:text-sm font-extrabold flex items-center gap-2 transition shadow-sm",
                      userConfirmed && !isImporting
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                        : "bg-slate-200 text-slate-400 cursor-not-allowed"
                    )}
                  >
                    {isImporting ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" />
                        <span>Importing Records into {storeName}...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={16} />
                        <span>Confirm &amp; Import Records Now</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* STEP 6: IMPORT COMPLETION & HISTORICAL ANALYTICS SUMMARY         */}
          {/* ================================================================ */}
          {currentStep === 6 && completedJob && (
            <div className="bg-white rounded-3xl border border-[#E2E8F0] p-6 shadow-xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-sm shrink-0">
                    <CheckCircle2 size={26} />
                  </div>
                  <div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800">
                      Migration Complete
                    </span>
                    <h2 className="text-lg font-black text-[#0F172A] mt-0.5">
                      {completedJob.import_name}
                    </h2>
                    <p className="text-xs text-[#64748B]">
                      Reference ID: <code className="font-bold text-slate-700">{completedJob.id}</code> • Completed in{" "}
                      <strong>{completedJob.summary?.durationMs || 120} ms</strong> • Store:{" "}
                      <strong>{storeName}</strong>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleResetWizard}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold transition cursor-pointer self-start sm:self-center"
                >
                  Start Another Import
                </button>
              </div>

              {/* Outcome Counters */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200">
                  <p className="text-[10px] font-extrabold uppercase text-emerald-800">
                    Successfully Imported
                  </p>
                  <p className="text-2xl font-black text-emerald-700 mt-1 tabular-nums">
                    {completedJob.imported_count}
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                  <p className="text-[10px] font-extrabold uppercase text-slate-600">
                    Skipped Records
                  </p>
                  <p className="text-2xl font-black text-slate-800 mt-1 tabular-nums">
                    {completedJob.skipped_count}
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200">
                  <p className="text-[10px] font-extrabold uppercase text-amber-800">
                    Duplicates Handled
                  </p>
                  <p className="text-2xl font-black text-amber-700 mt-1 tabular-nums">
                    {completedJob.duplicate_count}
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200">
                  <p className="text-[10px] font-extrabold uppercase text-rose-800">
                    Failed Records
                  </p>
                  <p className="text-2xl font-black text-rose-700 mt-1 tabular-nums">
                    {completedJob.failed_count}
                  </p>
                </div>
              </div>

              {/* AI-Generated Verified Historical Business Summary */}
              {completedJob.summary?.financials && (
                <div className="p-5 rounded-3xl bg-slate-900 text-white space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Sparkles size={18} className="text-blue-400" />
                      <h3 className="text-sm font-extrabold tracking-tight">
                        Verified Historical Business Summary
                      </h3>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-400/30">
                      Grounded in Imported Data
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 rounded-2xl bg-slate-800/90 border border-slate-700">
                      <p className="text-[10px] uppercase font-bold text-slate-400">
                        Historical Revenue
                      </p>
                      <p className="text-base font-black text-white mt-0.5 tabular-nums">
                        ₹{Number(completedJob.summary.financials.totalImportedRevenue || 0).toLocaleString("en-IN")}
                      </p>
                    </div>
                    <div className="p-3 rounded-2xl bg-slate-800/90 border border-slate-700">
                      <p className="text-[10px] uppercase font-bold text-slate-400">
                        Outstanding Dues
                      </p>
                      <p className="text-base font-black text-amber-400 mt-0.5 tabular-nums">
                        ₹{Number(completedJob.summary.financials.totalImportedDues || 0).toLocaleString("en-IN")}
                      </p>
                    </div>
                    <div className="p-3 rounded-2xl bg-slate-800/90 border border-slate-700">
                      <p className="text-[10px] uppercase font-bold text-slate-400">
                        Imported Expenses
                      </p>
                      <p className="text-base font-black text-rose-300 mt-0.5 tabular-nums">
                        ₹{Number(completedJob.summary.financials.totalImportedExpenses || 0).toLocaleString("en-IN")}
                      </p>
                    </div>
                    <div className="p-3 rounded-2xl bg-slate-800/90 border border-slate-700">
                      <p className="text-[10px] uppercase font-bold text-slate-400">
                        Cost Verification
                      </p>
                      <p className="text-xs font-extrabold text-emerald-400 mt-1">
                        {completedJob.summary.financials.hasVerifiedProductCosts
                          ? "✓ Verified Costs Present"
                          : "⚠️ Partial / Missing Costs"}
                      </p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">
                    {completedJob.summary.financials.costCompletenessNote}
                  </p>
                </div>
              )}

              {/* Quick Navigation Links to Existing CounterCub Modules */}
              <div className="space-y-2.5">
                <p className="text-xs font-extrabold uppercase tracking-wider text-[#64748B]">
                  Explore Imported Records in CounterCub
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                  <Link
                    href="/invoices"
                    className="p-3 rounded-2xl bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 transition flex flex-col gap-1.5"
                  >
                    <FileText size={18} className="text-blue-600" />
                    <span className="text-xs font-extrabold text-[#0F172A]">View Invoices</span>
                  </Link>
                  <Link
                    href="/b2b/customers"
                    className="p-3 rounded-2xl bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 transition flex flex-col gap-1.5"
                  >
                    <Users size={18} className="text-purple-600" />
                    <span className="text-xs font-extrabold text-[#0F172A]">View Customers</span>
                  </Link>
                  <Link
                    href="/b2b/products"
                    className="p-3 rounded-2xl bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 transition flex flex-col gap-1.5"
                  >
                    <Package size={18} className="text-emerald-600" />
                    <span className="text-xs font-extrabold text-[#0F172A]">View Products</span>
                  </Link>
                  <Link
                    href="/b2b/payments"
                    className="p-3 rounded-2xl bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 transition flex flex-col gap-1.5"
                  >
                    <CreditCard size={18} className="text-cyan-600" />
                    <span className="text-xs font-extrabold text-[#0F172A]">View Payments</span>
                  </Link>
                  <Link
                    href="/b2b/reports"
                    className="p-3 rounded-2xl bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 transition flex flex-col gap-1.5"
                  >
                    <TrendingUp size={18} className="text-blue-600" />
                    <span className="text-xs font-extrabold text-[#0F172A]">
                      Profit &amp; Analytics
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => setActiveTab("history")}
                    className="p-3 rounded-2xl bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 transition flex flex-col gap-1.5 text-left cursor-pointer"
                  >
                    <History size={18} className="text-amber-600" />
                    <span className="text-xs font-extrabold text-[#0F172A]">Import History</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: SMART IMPORT HISTORY & SAFE ROLLBACK                          */}
      {/* ==================================================================== */}
      {activeTab === "history" && (
        <div className="bg-white rounded-3xl border border-[#E2E8F0] p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-extrabold text-[#0F172A]">
                Smart Import History ({storeName})
              </h2>
              <p className="text-xs text-[#64748B]">
                Audit previous migrations for this store, inspect detailed reports, or safely roll back an import.
              </p>
            </div>
            <button
              type="button"
              onClick={fetchImportHistory}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw size={13} className={historyLoading ? "animate-spin" : ""} />
              <span>Refresh</span>
            </button>
          </div>

          {historyJobs.length === 0 ? (
            <div className="p-10 text-center rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <History size={28} className="mx-auto text-slate-400" />
              <p className="text-sm font-bold text-[#0F172A]">No Import History Yet</p>
              <p className="text-xs text-[#64748B]">
                Completed migrations for <strong>{storeName}</strong> will appear here with full provenance and rollback support.
              </p>
            </div>
          ) : (
            <div className="table-scroll-container rounded-2xl border border-slate-200">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold text-[#64748B] uppercase tracking-wider">
                    <th className="py-3 px-4">Import Name &amp; Ref</th>
                    <th className="py-3 px-4">Files</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4 text-center">Imported / Skipped</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {historyJobs.map((job) => (
                    <tr key={job.id} className="hover:bg-slate-50/80">
                      <td className="py-3.5 px-4">
                        <p className="font-extrabold text-[#0F172A]">{job.import_name}</p>
                        <code className="text-[10px] text-slate-400">{job.id}</code>
                      </td>
                      <td className="py-3.5 px-4 text-[#64748B]">
                        {Array.isArray(job.file_names) && job.file_names.length > 0
                          ? job.file_names.join(", ")
                          : "Spreadsheet"}
                      </td>
                      <td className="py-3.5 px-4 text-[#64748B] whitespace-nowrap">
                        {job.created_at
                          ? new Date(job.created_at).toLocaleString("en-IN", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })
                          : "—"}
                      </td>
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <span className="font-extrabold text-emerald-700">
                          {job.imported_count} added
                        </span>{" "}
                        /{" "}
                        <span className="text-slate-500">{job.skipped_count} skipped</span>
                      </td>
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <span
                          className={cn(
                            "px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border",
                            job.status === "completed"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : job.status === "rolled_back"
                                ? "bg-slate-100 text-slate-600 border-slate-300"
                                : "bg-amber-50 text-amber-700 border-amber-200"
                          )}
                        >
                          {job.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedHistoryJob(job)}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold cursor-pointer"
                          >
                            Report
                          </button>
                          {job.status !== "rolled_back" && (
                            <button
                              type="button"
                              disabled={rollingBackJobId === job.id}
                              onClick={() => handleRollbackJob(job)}
                              className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <RotateCcw size={12} />
                              <span>
                                {rollingBackJobId === job.id ? "Rolling back..." : "Rollback"}
                              </span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Detailed Job Report Modal */}
          {selectedHistoryJob && (
            <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl border border-slate-200 max-w-lg w-full p-6 space-y-4 shadow-xl">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-extrabold text-[#0F172A]">
                      {selectedHistoryJob.import_name}
                    </h3>
                    <p className="text-xs text-[#64748B]">
                      Ref: <code>{selectedHistoryJob.id}</code>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedHistoryJob(null)}
                    className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2.5 text-center">
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                    <p className="text-[10px] font-bold uppercase text-slate-500">Total Rows</p>
                    <p className="text-base font-black text-[#0F172A]">
                      {selectedHistoryJob.total_records}
                    </p>
                  </div>
                  <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200">
                    <p className="text-[10px] font-bold uppercase text-emerald-700">Imported</p>
                    <p className="text-base font-black text-emerald-700">
                      {selectedHistoryJob.imported_count}
                    </p>
                  </div>
                  <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200">
                    <p className="text-[10px] font-bold uppercase text-amber-700">Skipped</p>
                    <p className="text-base font-black text-amber-700">
                      {selectedHistoryJob.skipped_count}
                    </p>
                  </div>
                </div>

                {selectedHistoryJob.summary?.financials && (
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
                    <p className="font-extrabold text-[#0F172A]">Financial Snapshot:</p>
                    <p className="text-[#64748B]">
                      Imported Revenue:{" "}
                      <strong className="text-[#0F172A]">
                        ₹{Number(selectedHistoryJob.summary.financials.totalImportedRevenue || 0).toLocaleString("en-IN")}
                      </strong>{" "}
                      • Pending Dues:{" "}
                      <strong className="text-[#0F172A]">
                        ₹{Number(selectedHistoryJob.summary.financials.totalImportedDues || 0).toLocaleString("en-IN")}
                      </strong>
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {selectedHistoryJob.summary.financials.costCompletenessNote}
                    </p>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  {selectedHistoryJob.status !== "rolled_back" && (
                    <button
                      type="button"
                      onClick={() => handleRollbackJob(selectedHistoryJob)}
                      className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw size={14} />
                      <span>Roll Back This Import</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedHistoryJob(null)}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Auto-Pilot Processing Modal Overlay */}
      {isAutoPilotLoading && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-slate-100 text-center space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center mx-auto shadow-xs">
              <Sparkles size={28} className="animate-spin text-blue-600" />
            </div>
            <div>
              <h3 className="text-base font-black text-[#0F172A]">AI Auto-Pilot in Progress</h3>
              <p className="text-xs text-[#64748B] mt-1.5 leading-relaxed">
                {autoPilotStatus || "Analyzing spreadsheets and mapping columns..."}
              </p>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 h-2 rounded-full w-4/5 animate-pulse" />
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              Skipping manual Step 2 &amp; Step 3 when mappings are confident
            </p>
          </div>
        </div>
      )}
    </div>
  );
}


/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";
import { enhanceSheetMappingWithAI } from "@/lib/smart-import/aiMapper";
import { ImportEntityType, SheetAnalysis } from "@/lib/smart-import/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { user: caller } = auth;
    const body = await req.json().catch(() => ({}));

    const requestedBizId = body.business_id;
    if (
      requestedBizId &&
      requestedBizId !== "default" &&
      requestedBizId !== caller.businessId
    ) {
      return NextResponse.json(
        { error: "Forbidden: Cannot analyze import files for another store." },
        { status: 403 }
      );
    }

    const sheets: Array<{ analysis: SheetAnalysis; entityTypeOverride?: ImportEntityType }> =
      Array.isArray(body.sheets) ? body.sheets : [];

    if (sheets.length === 0) {
      return NextResponse.json({ error: "No sheets provided for analysis." }, { status: 400 });
    }

    const mappingConfigs = await Promise.all(
      sheets.slice(0, 20).map((item) =>
        enhanceSheetMappingWithAI(item.analysis, item.entityTypeOverride)
      )
    );

    return NextResponse.json({
      ok: true,
      business_id: caller.businessId,
      mappingConfigs,
    });
  } catch (err: any) {
    console.error("POST /api/smart-import/analyze error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to analyze spreadsheet mappings" },
      { status: 500 }
    );
  }
}


import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req, { requireAdmin: true });
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { user: caller, supa } = auth;
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const userId = (formData.get("userId") as string)?.trim() || "";
    const monthLabel = (formData.get("monthLabel") as string)?.trim() || "payslip";

    if (!file) {
      return NextResponse.json({ error: "No PDF file provided" }, { status: 400 });
    }

    // Maximum 10MB file size limit
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File exceeds maximum permitted size of 10MB." }, { status: 400 });
    }

    // Verify target employee belongs to caller's business
    if (userId && userId !== "general") {
      const { data: targetProfile, error: profErr } = await supa
        .from("profiles")
        .select("id, business_id")
        .eq("id", userId)
        .maybeSingle();

      if (profErr || !targetProfile) {
        return NextResponse.json({ error: "Target employee profile not found." }, { status: 404 });
      }

      if (!caller.isSuperAdmin && targetProfile.business_id && targetProfile.business_id !== caller.businessId) {
        return NextResponse.json(
          { error: "Forbidden: Cannot upload payslips for employees of another business." },
          { status: 403 }
        );
      }
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Verify PDF Magic Bytes (%PDF- / 0x25 0x50 0x44 0x46 0x2D)
    if (buffer.length < 5 || buffer[0] !== 0x25 || buffer[1] !== 0x50 || buffer[2] !== 0x44 || buffer[3] !== 0x46 || buffer[4] !== 0x2d) {
      return NextResponse.json({ error: "Invalid file format: File must be a valid PDF document." }, { status: 400 });
    }

    const sanitizedMonth = monthLabel.replace(/[^a-zA-Z0-9_-]/g, "_");
    const sanitizedUserId = (userId || "general").replace(/[^a-zA-Z0-9_-]/g, "_");
    const filePath = `${caller.businessId}/${sanitizedUserId}/${sanitizedMonth}_payslip.pdf`;

    const { error: uploadError } = await supa.storage
      .from("payslips")
      .upload(filePath, buffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      console.error("Payslip upload error:", uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const {
      data: { publicUrl },
    } = supa.storage.from("payslips").getPublicUrl(filePath);

    return NextResponse.json({
      success: true,
      url: publicUrl,
      path: filePath,
    });
  } catch (error: any) {
    console.error("API error uploading payslip:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

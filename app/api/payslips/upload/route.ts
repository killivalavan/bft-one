import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const userId = (formData.get("userId") as string) || "general";
    const monthLabel = (formData.get("monthLabel") as string) || "payslip";

    if (!file) {
      return NextResponse.json({ error: "No PDF file provided" }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    const sanitizedMonth = monthLabel.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filePath = `${userId}/${sanitizedMonth}_payslip.pdf`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabase.storage
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
    } = supabase.storage.from("payslips").getPublicUrl(filePath);

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

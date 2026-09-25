import { supabaseAdmin } from "@/lib/supabaseServer";

export type AuditAction =
  | "USER_CREATED"
  | "USER_INVITED"
  | "USER_UPDATED"
  | "USER_DELETED"
  | "PASSWORD_CHANGED"
  | "PASSWORD_RESET"
  | "ROLE_UPDATED"
  | "BUSINESS_CREATED"
  | "BUSINESS_UPDATED"
  | "BUSINESS_DELETED"
  | "TENANT_SWITCHED";

export interface AuditEventParams {
  businessId?: string | null;
  actorId?: string | null;
  actorEmail: string;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Extracts IP address and User Agent from a Next.js Request
 */
export function extractClientMetadata(request: Request): {
  ipAddress?: string;
  userAgent?: string;
} {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const ipAddress = forwardedFor ? forwardedFor.split(",")[0].trim() : realIp || "127.0.0.1";
  const userAgent = request.headers.get("user-agent") || undefined;
  return { ipAddress, userAgent };
}

/**
 * Records an immutable security audit log event
 */
export async function logAuditEvent(params: AuditEventParams): Promise<boolean> {
  try {
    const supa = supabaseAdmin();
    const payload = {
      business_id: params.businessId || null,
      actor_id: params.actorId || null,
      actor_email: params.actorEmail.toLowerCase().trim(),
      action: params.action,
      target_type: params.targetType || null,
      target_id: params.targetId || null,
      details: params.details || {},
      ip_address: params.ipAddress || null,
      user_agent: params.userAgent || null,
    };

    const { error } = await supa.from("audit_logs").insert(payload);
    if (error) {
      console.warn("[AuditLogger] Non-fatal log insert warning:", error.message);
      return false;
    }
    return true;
  } catch (err: any) {
    console.warn("[AuditLogger] Failed to write audit event:", err?.message);
    return false;
  }
}

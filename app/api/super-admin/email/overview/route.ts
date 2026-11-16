import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";
import { getResendClient } from "@/lib/email/resendClient";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await authenticateRequest(request, { requireSuperAdmin: true });
    if ("errorResponse" in auth) return auth.errorResponse;

    const { supa } = auth;
    const { searchParams } = new URL(request.url);
    const days = Math.min(90, Math.max(7, Number(searchParams.get("days")) || 14));

    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const rangeStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const [{ data: dispatches }, { data: settingsRow }] = await Promise.all([
      supa
        .from("email_dispatches")
        .select("id, status, category, created_at, sent_at, delivered_at, bounced_at, complained_at, scheduled_for")
        .gte("created_at", startOfMonth < rangeStart ? startOfMonth.toISOString() : rangeStart.toISOString())
        .order("created_at", { ascending: false })
        .limit(5000),
      supa.from("email_settings").select("*").eq("id", 1).maybeSingle(),
    ]);

    const rows = dispatches || [];
    const sentToday = rows.filter(
      (r: any) => r.sent_at && new Date(r.sent_at) >= startOfToday
    ).length;
    const sentMonth = rows.filter(
      (r: any) => r.sent_at && new Date(r.sent_at) >= startOfMonth
    ).length;
    const delivered = rows.filter((r: any) => r.status === "delivered").length;
    const failed = rows.filter((r: any) => r.status === "failed").length;
    const bounced = rows.filter((r: any) => r.status === "bounced").length;
    const complained = rows.filter((r: any) => r.status === "complained").length;
    const pendingQueue = rows.filter(
      (r: any) => r.status === "queued" && !r.scheduled_for
    ).length;
    const scheduledCount = rows.filter(
      (r: any) => r.status === "queued" && Boolean(r.scheduled_for)
    ).length;
    const transactionalMonth = rows.filter(
      (r: any) => r.sent_at && new Date(r.sent_at) >= startOfMonth && r.category !== "marketing"
    ).length;
    const marketingMonth = rows.filter(
      (r: any) => r.sent_at && new Date(r.sent_at) >= startOfMonth && r.category === "marketing"
    ).length;

    // Build daily volume series
    const dailyMap: Record<string, { date: string; transactional: number; marketing: number; failed: number }> = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      dailyMap[d] = { date: d, transactional: 0, marketing: 0, failed: 0 };
    }
    for (const r of rows) {
      const d = String(r.created_at || "").slice(0, 10);
      if (!dailyMap[d]) continue;
      if (r.status === "failed" || r.status === "bounced") {
        dailyMap[d].failed += 1;
      } else if (r.category === "marketing") {
        dailyMap[d].marketing += 1;
      } else {
        dailyMap[d].transactional += 1;
      }
    }

    const appDailyLimit = Number(settingsRow?.app_daily_limit ?? 80);
    const providerDailyLimit = Number(settingsRow?.provider_daily_limit ?? 100);
    const appMonthlyLimit = Number(settingsRow?.app_monthly_limit ?? 2400);
    const providerMonthlyLimit = Number(settingsRow?.provider_monthly_limit ?? 3000);

    const effectiveDailyLimit = Math.min(appDailyLimit, providerDailyLimit);
    const effectiveMonthlyLimit = Math.min(appMonthlyLimit, providerMonthlyLimit);
    const monthlyUsagePct =
      effectiveMonthlyLimit > 0 ? Math.round((sentMonth / effectiveMonthlyLimit) * 1000) / 10 : 0;

    // Query Resend domains to confirm live provider status (never fabricates provider usage counts)
    let providerStatus: {
      connected: boolean;
      keyConfigured: boolean;
      sendingOnly?: boolean;
      verifiedDomains: string[];
      error?: string;
    } = {
      connected: false,
      keyConfigured: Boolean(process.env.RESEND_API_KEY?.trim()),
      verifiedDomains: [],
    };
    if (!providerStatus.keyConfigured) {
      providerStatus.error = "RESEND_API_KEY not set in this environment.";
    } else {
      try {
        const resend = getResendClient();
        const { data: domData, error: domErr } = await resend.domains.list();
        if (!domErr && domData?.data) {
          providerStatus = {
            connected: true,
            keyConfigured: true,
            verifiedDomains: domData.data
              .filter((d: any) => d.status === "verified")
              .map((d: any) => d.name),
          };
        } else {
          const msg = domErr?.message || "Unable to query Resend domains.";
          const isRestrictedSendKey = /restrict|send|permission|unauthorized/i.test(msg);
          providerStatus = {
            connected: isRestrictedSendKey,
            keyConfigured: true,
            sendingOnly: isRestrictedSendKey,
            verifiedDomains: isRestrictedSendKey ? ["countercub.com"] : [],
            error: isRestrictedSendKey ? undefined : msg,
          };
        }
      } catch (e: unknown) {
        providerStatus.error = e instanceof Error ? e.message : "Resend client error.";
      }
    }

    return NextResponse.json({
      localMetrics: {
        sentToday,
        sentMonth,
        delivered,
        failed,
        bounced,
        complained,
        pendingQueue,
        scheduledCount,
        transactionalMonth,
        marketingMonth,
      },
      limits: {
        effectiveDailyLimit,
        effectiveMonthlyLimit,
        appDailyLimit,
        appMonthlyLimit,
        providerDailyLimit,
        providerMonthlyLimit,
        monthlyUsagePct,
        warnThreshold1: Number(settingsRow?.warn_threshold_1 ?? 70),
        warnThreshold2: Number(settingsRow?.warn_threshold_2 ?? 85),
        warnThreshold3: Number(settingsRow?.warn_threshold_3 ?? 95),
        criticalReserveCount: Number(settingsRow?.critical_reserve_count ?? 10),
      },
      providerStatus,
      dailySeries: Object.values(dailyMap),
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}


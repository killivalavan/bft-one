import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/serverAuth";

export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest(request, { requireAdmin: true });
    if ("errorResponse" in auth) {
      return auth.errorResponse;
    }

    const { user: caller, supa } = auth;
    const body = await request.json();
    const { action } = body;

    if (!action) {
      return NextResponse.json({ error: "Action is required" }, { status: 400 });
    }

    // 1. UPDATE EMPLOYEE PROFILE & INCREMENT POLICY
    if (action === "update_profile") {
      const {
        userId,
        fullName,
        employeeId,
        designation,
        department,
        dateOfJoining,
        joiningSalaryCents,
        incrementAmountCents,
        incrementFrequencyMonths,
        nextIncrementDate,
        incrementPolicyNote,
      } = body;

      if (!userId) {
        return NextResponse.json({ error: "userId is required" }, { status: 400 });
      }

      const updates: any = {};
      if (fullName !== undefined) updates.full_name = fullName || null;
      if (employeeId !== undefined) updates.employee_id = employeeId || null;
      if (designation !== undefined) updates.designation = designation || null;
      if (department !== undefined) updates.department = department || null;
      if (dateOfJoining !== undefined) updates.date_of_joining = dateOfJoining || null;
      if (joiningSalaryCents !== undefined) updates.joining_salary_cents = joiningSalaryCents ? Number(joiningSalaryCents) : null;
      if (incrementAmountCents !== undefined) updates.increment_amount_cents = Number(incrementAmountCents);
      if (incrementFrequencyMonths !== undefined) updates.increment_frequency_months = Number(incrementFrequencyMonths);
      if (nextIncrementDate !== undefined) updates.next_increment_date = nextIncrementDate || null;
      if (incrementPolicyNote !== undefined) updates.increment_policy_note = incrementPolicyNote || null;

      const { data, error } = await supa
        .from("profiles")
        .update(updates)
        .eq("id", userId)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, profile: data });
    }

    // 2. ADD INCREMENT RECORD
    if (action === "add_increment") {
      const {
        userId,
        effectiveDate,
        incrementAmountCents,
        newSalaryCents,
        previousSalaryCents,
        reason,
      } = body;

      if (!userId || !effectiveDate || !incrementAmountCents || !newSalaryCents) {
        return NextResponse.json({ error: "Missing required increment fields" }, { status: 400 });
      }

      // Record in employee_increments
      const { data: incRow, error: incErr } = await supa
        .from("employee_increments")
        .insert({
          business_id: caller.businessId,
          user_id: userId,
          effective_date: effectiveDate,
          previous_salary_cents: previousSalaryCents || 0,
          new_salary_cents: newSalaryCents,
          increment_amount_cents: incrementAmountCents,
          reason: reason || "Annual Performance Increment",
          approved_by: caller.email,
        })
        .select()
        .single();

      if (incErr) {
        return NextResponse.json({ error: incErr.message }, { status: 500 });
      }

      // Also update current base_salary_cents and per_day_salary_cents on profile
      const perDaySalaryCents = Math.round(newSalaryCents / 30);
      await supa
        .from("profiles")
        .update({
          base_salary_cents: newSalaryCents,
          per_day_salary_cents: perDaySalaryCents,
        })
        .eq("id", userId);

      return NextResponse.json({ ok: true, increment: incRow });
    }

    // 2b. DELETE INCREMENT RECORD
    if (action === "delete_increment") {
      const { incrementId, userId } = body;
      if (!incrementId) {
        return NextResponse.json({ error: "incrementId is required" }, { status: 400 });
      }

      const { data: targetInc } = await supa
        .from("employee_increments")
        .select("*")
        .eq("id", incrementId)
        .single();

      const { error: delErr } = await supa
        .from("employee_increments")
        .delete()
        .eq("id", incrementId);

      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 500 });
      }

      if (userId && targetInc) {
        const { data: latestInc } = await supa
          .from("employee_increments")
          .select("*")
          .eq("user_id", userId)
          .order("effective_date", { ascending: false })
          .limit(1)
          .maybeSingle();

        const restoredBaseCents = latestInc ? latestInc.new_salary_cents : targetInc.previous_salary_cents;
        if (restoredBaseCents) {
          await supa
            .from("profiles")
            .update({
              base_salary_cents: restoredBaseCents,
              per_day_salary_cents: Math.round(restoredBaseCents / 30),
            })
            .eq("id", userId);
        }
      }

      return NextResponse.json({ ok: true });
    }

    // 3. AWARD / MANAGE ACHIEVEMENT
    if (action === "award_achievement") {
      const {
        userId,
        badgeKey,
        title,
        description,
        category,
        achievedDate,
      } = body;

      if (!userId || !badgeKey || !title) {
        return NextResponse.json({ error: "Missing achievement fields" }, { status: 400 });
      }

      const { data: achRow, error: achErr } = await supa
        .from("employee_achievements")
        .upsert(
          {
            business_id: caller.businessId,
            user_id: userId,
            badge_key: badgeKey,
            title,
            description: description || null,
            category: category || "milestone",
            achieved_date: achievedDate || new Date().toISOString().slice(0, 10),
            is_unlocked: true,
          },
          { onConflict: "user_id,badge_key" }
        )
        .select()
        .single();

      if (achErr) {
        return NextResponse.json({ error: achErr.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, achievement: achRow });
    }

    // 4. DELETE / REVOKE ACHIEVEMENT
    if (action === "delete_achievement") {
      const { achievementId } = body;
      if (!achievementId) {
        return NextResponse.json({ error: "achievementId required" }, { status: 400 });
      }

      const { error } = await supa
        .from("employee_achievements")
        .delete()
        .eq("id", achievementId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true });
    }

    // 5. CREATE NOTICE BOARD ANNOUNCEMENT
    if (action === "create_notice") {
      const {
        title,
        message,
        priority,
        targetAudienceType,
        targetAudienceValue,
        isPinned,
        expiresAt,
      } = body;

      if (!title || !message) {
        return NextResponse.json({ error: "Title and message are required" }, { status: 400 });
      }

      const { data: noticeRow, error: noticeErr } = await supa
        .from("employee_notices")
        .insert({
          business_id: caller.businessId,
          title,
          message,
          priority: priority || "normal",
          target_audience_type: targetAudienceType || "all",
          target_audience_value: targetAudienceValue || null,
          is_pinned: !!isPinned,
          expires_at: expiresAt || null,
          created_by: caller.id,
        })
        .select()
        .single();

      if (noticeErr) {
        return NextResponse.json({ error: noticeErr.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, notice: noticeRow });
    }

    // 6. UPDATE NOTICE BOARD ANNOUNCEMENT
    if (action === "update_notice") {
      const { noticeId, ...updates } = body;
      if (!noticeId) {
        return NextResponse.json({ error: "noticeId required" }, { status: 400 });
      }

      const dbUpdates: any = { updated_at: new Date().toISOString() };
      if (updates.title !== undefined) dbUpdates.title = updates.title;
      if (updates.message !== undefined) dbUpdates.message = updates.message;
      if (updates.priority !== undefined) dbUpdates.priority = updates.priority;
      if (updates.isPinned !== undefined) dbUpdates.is_pinned = updates.isPinned;
      if (updates.expiresAt !== undefined) dbUpdates.expires_at = updates.expiresAt;
      if (updates.targetAudienceType !== undefined) dbUpdates.target_audience_type = updates.targetAudienceType;
      if (updates.targetAudienceValue !== undefined) dbUpdates.target_audience_value = updates.targetAudienceValue;

      const { data: updatedNotice, error } = await supa
        .from("employee_notices")
        .update(dbUpdates)
        .eq("id", noticeId)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, notice: updatedNotice });
    }

    // 7. DELETE NOTICE
    if (action === "delete_notice") {
      const { noticeId } = body;
      if (!noticeId) {
        return NextResponse.json({ error: "noticeId required" }, { status: 400 });
      }

      const { error } = await supa
        .from("employee_notices")
        .delete()
        .eq("id", noticeId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (e: any) {
    console.error("Admin employee-hub error:", e);
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function POST(request: Request) {
  try {
    const supa = supabaseAdmin();

    const body = await request.json().catch(()=>({})) as { email?:string; password?:string; isAdmin?:boolean };
    const email = body.email || process.env.ADMIN_EMAIL!;
    const isAdmin = body.isAdmin ?? true;

    if (!email) {
      return NextResponse.json({ error: "email required" }, { status: 400 });
    }

    const { data: list } = await supa.auth.admin.listUsers();
    const found = list?.users.find(u=>u.email===email);
    let userId = found?.id;

    if (!userId) {
      // New user: a password is required to create the auth account.
      const password = body.password || process.env.ADMIN_DEFAULT_PASSWORD!;
      if (!password) {
        return NextResponse.json({ error: "password required to create a new user" }, { status: 400 });
      }
      const { data, error } = await supa.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      userId = data.user?.id!;
    } else if (body.password) {
      // Existing user: only touch the password/email confirmation if one was explicitly provided.
      const { error: upErr } = await supa.auth.admin.updateUserById(userId, {
        password: body.password,
        email_confirm: true,
      } as any);
      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    const { error: e2 } = await supa.from("profiles").upsert({ id: userId, email, is_admin: isAdmin }, { onConflict: "id" });
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

    return NextResponse.json({ ok: true, userId });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || "unknown" }, { status: 500 });
  }
}

// Convenience: allow seeding via GET in the browser
export async function GET() {
  return POST(new Request("http://local/", { method: "POST", body: JSON.stringify({}) } as any));
}

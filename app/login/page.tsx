"use client";
import { supabaseClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function LoginPage() {
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [error,setError] = useState<string|undefined>();
  const router = useRouter();

  async function onLogin(e:React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); return; }
    router.push("/");
  }

  return (
    <div className="max-w-md mx-auto">
      <Card>
        <CardHeader>
          <h1 className="text-xl font-semibold">Sign in</h1>
          <p className="text-sm text-zinc-500">Use your email and password</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={onLogin} className="grid gap-3">
            <Input placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
            <Input placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
            {error && <div className="text-red-600 text-sm">{error}</div>}
            <Button type="submit" block>Login</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

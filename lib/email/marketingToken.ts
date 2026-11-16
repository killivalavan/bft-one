import crypto from "node:crypto";

function getHmacSecret(): string {
  const secret =
    process.env.RESEND_WEBHOOK_SECRET ||
    process.env.CRON_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "";
  if (!secret) {
    throw new Error("Missing server secret for marketing preference tokens.");
  }
  return secret;
}

export interface MarketingTokenPayload {
  businessId: string;
  contactEmail: string;
  exp: number;
}

export function createMarketingToken(
  businessId: string,
  contactEmail: string,
  ttlDays = 90
): string {
  const payload: MarketingTokenPayload = {
    businessId,
    contactEmail: contactEmail.toLowerCase().trim(),
    exp: Date.now() + ttlDays * 24 * 60 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto
    .createHmac("sha256", getHmacSecret())
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifyMarketingToken(token: string): MarketingTokenPayload | null {
  try {
    const parts = (token || "").split(".");
    if (parts.length !== 2) return null;
    const [encoded, sig] = parts;
    const expectedSig = crypto
      .createHmac("sha256", getHmacSecret())
      .update(encoded)
      .digest("base64url");

    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const parsed = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    ) as MarketingTokenPayload;

    if (!parsed?.businessId || !parsed?.contactEmail || !parsed?.exp) return null;
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}


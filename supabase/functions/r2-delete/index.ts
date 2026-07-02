import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ACCOUNT_ID = Deno.env.get("R2_ACCOUNT_ID")!;
const ACCESS_KEY = Deno.env.get("R2_ACCESS_KEY_ID")!;
const SECRET_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY")!;
const PUBLIC_BASE = Deno.env.get("R2_PUBLIC_BASE")!;
const BUCKET = "pithy-files";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
};

// Пускаем только залогиненного админа (см. комментарий в r2-upload-url).
async function requireAdmin(req: Request): Promise<Response | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const deny = (status: number, msg: string) =>
    new Response(JSON.stringify({ error: msg }), {
      status, headers: { ...CORS, "Content-Type": "application/json" },
    });

  if (!token) return deny(401, "Unauthorized");

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error } = await sb.auth.getUser();
  if (error || !user) return deny(401, "Unauthorized");

  const { data: profile } = await sb
    .from("user_profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) return deny(403, "Forbidden: admin only");

  return null;
}

function toHex(buf: ArrayBuffer) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function hmac(key: ArrayBuffer | CryptoKey, msg: string): Promise<ArrayBuffer> {
  const k = key instanceof CryptoKey ? key : await crypto.subtle.importKey(
    "raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
}

async function signingKey(secret: string, date: string): Promise<CryptoKey> {
  const kDate  = await hmac(new TextEncoder().encode(`AWS4${secret}`), date);
  const kRegion = await hmac(kDate, "auto");
  const kService = await hmac(kRegion, "s3");
  const kSigning = await hmac(kService, "aws4_request");
  return crypto.subtle.importKey("raw", kSigning, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS });

  const denied = await requireAdmin(req);
  if (denied) return denied;

  const { url } = await req.json();
  if (!url || !url.startsWith(PUBLIC_BASE)) {
    return new Response("Invalid URL", { status: 400, headers: CORS });
  }

  const key = url.slice(PUBLIC_BASE.length + 1);
  if (!key) return new Response("Empty key", { status: 400, headers: CORS });

  const host = `${ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const dateStamp = amzDate.slice(0, 8);
  const emptyHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";

  const canonical = [
    "DELETE",
    `/${BUCKET}/${key}`,
    "",
    `host:${host}\nx-amz-content-sha256:${emptyHash}\nx-amz-date:${amzDate}\n`,
    signedHeaders,
    emptyHash,
  ].join("\n");

  const hashedCanonical = toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical)));
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, hashedCanonical].join("\n");
  const sigKey = await signingKey(SECRET_KEY, dateStamp);
  const signature = toHex(await crypto.subtle.sign("HMAC", sigKey, new TextEncoder().encode(stringToSign)));

  const authHeader = `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const r2Res = await fetch(`https://${host}/${BUCKET}/${key}`, {
    method: "DELETE",
    headers: {
      "Authorization": authHeader,
      "x-amz-content-sha256": emptyHash,
      "x-amz-date": amzDate,
    },
  });

  if (!r2Res.ok && r2Res.status !== 204) {
    const text = await r2Res.text();
    return new Response(`R2 delete failed: ${r2Res.status} | ${text}`, { status: 502, headers: CORS });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});

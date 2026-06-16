const ACCOUNT_ID = Deno.env.get("R2_ACCOUNT_ID")!;
const ACCESS_KEY = Deno.env.get("R2_ACCESS_KEY_ID")!;
const SECRET_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY")!;
const PUBLIC_BASE = Deno.env.get("R2_PUBLIC_BASE")!;
const BUCKET = "pithy-files";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
};

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
  const kDate = await hmac(new TextEncoder().encode(`AWS4${secret}`), date);
  const kRegion = await hmac(kDate, "auto");
  const kService = await hmac(kRegion, "s3");
  const kSigning = await hmac(kService, "aws4_request");
  return crypto.subtle.importKey("raw", kSigning, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

async function presignedPutUrl(key: string, contentType: string): Promise<string> {
  const host = `${ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;

  const params = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${ACCESS_KEY}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    // 30 min — big files on slow mobile networks (3G) need more than the original 5 min
    // or the upload URL's signature expires mid-transfer.
    "X-Amz-Expires": "1800",
    "X-Amz-SignedHeaders": "content-type;host",
  });

  const canonical = [
    "PUT",
    `/${BUCKET}/${key}`,
    params.toString(),
    `content-type:${contentType}\nhost:${host}\n`,
    "content-type;host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const hashedCanonical = toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical)));
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, hashedCanonical].join("\n");

  const sigKey = await signingKey(SECRET_KEY, dateStamp);
  const signature = toHex(await crypto.subtle.sign("HMAC", sigKey, new TextEncoder().encode(stringToSign)));

  params.set("X-Amz-Signature", signature);
  return `https://${host}/${BUCKET}/${key}?${params.toString()}`;
}

Deno.serve(async (req) => {
  console.log("[r2-upload-url] incoming request", { method: req.method, origin: req.headers.get("origin") });

  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const rawBody = await req.text();
  console.log("[r2-upload-url] raw body:", rawBody);

  let fileName: string, contentType: string;
  try {
    const parsed = JSON.parse(rawBody);
    fileName = parsed.fileName;
    contentType = parsed.contentType;
  } catch (e) {
    console.error("[r2-upload-url] JSON parse failed:", (e as Error).message);
    return new Response(JSON.stringify({ error: "Invalid JSON body", rawBody }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  console.log("[r2-upload-url] parsed:", { fileName, contentType });

  if (!fileName) {
    console.error("[r2-upload-url] missing fileName");
    return new Response(JSON.stringify({ error: "fileName is required" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  try {
    const ext = fileName.split(".").pop();
    const key = `chat/${crypto.randomUUID()}.${ext}`;

    const uploadUrl = await presignedPutUrl(key, contentType);
    const publicUrl = `${PUBLIC_BASE}/${key}`;

    console.log("[r2-upload-url] generated", { key, publicUrl, env: {
      hasAccountId: !!ACCOUNT_ID, hasAccessKey: !!ACCESS_KEY, hasSecretKey: !!SECRET_KEY, hasPublicBase: !!PUBLIC_BASE,
    } });

    return new Response(JSON.stringify({ uploadUrl, publicUrl }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[r2-upload-url] presign failed:", (e as Error).message, (e as Error).stack);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});

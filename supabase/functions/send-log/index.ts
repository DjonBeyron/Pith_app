import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Отправка логов из приложения в GitHub (ветка logs, папка logs/) по нажатию кнопки.
// Секреты функции: GITHUB_LOG_TOKEN (fine-grained PAT, Contents: read & write на репозиторий),
// GITHUB_LOG_REPO (owner/repo, по умолчанию DjonBeyron/Pith_app), GITHUB_LOG_BRANCH (по умолчанию logs).
const TOKEN = Deno.env.get("GITHUB_LOG_TOKEN") ?? "";
const REPO = Deno.env.get("GITHUB_LOG_REPO") ?? "DjonBeyron/Pith_app";
const BRANCH = Deno.env.get("GITHUB_LOG_BRANCH") ?? "logs";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const MAX_FILES = 8;
const MAX_FILE_CHARS = 4_000_000;
const GH = "https://api.github.com";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Пускаем только залогиненного админа (см. r2-delete).
async function requireAdmin(req: Request): Promise<Response | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json(401, { error: "Unauthorized" });
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error } = await sb.auth.getUser();
  if (error || !user) return json(401, { error: "Unauthorized" });
  const { data: profile } = await sb.from("user_profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) return json(403, { error: "Forbidden: admin only" });
  return null;
}

const gh = (path: string, init: RequestInit = {}) =>
  fetch(`${GH}/repos/${REPO}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "pithy-send-log",
      ...(init.headers ?? {}),
    },
  });

// Ветки logs ещё нет — создаём от основной ветки репозитория.
async function ensureBranch(): Promise<string | null> {
  const have = await gh(`/git/ref/heads/${BRANCH}`);
  if (have.ok) return null;
  if (have.status !== 404) return `GitHub: ветка ${have.status}`;
  const repo = await gh("");
  if (!repo.ok) return `GitHub: репозиторий ${repo.status}`;
  const def = (await repo.json()).default_branch;
  const base = await gh(`/git/ref/heads/${def}`);
  if (!base.ok) return `GitHub: основная ветка ${base.status}`;
  const sha = (await base.json()).object.sha;
  const make = await gh("/git/refs", {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${BRANCH}`, sha }),
  });
  return make.ok || make.status === 422 ? null : `GitHub: создание ветки ${make.status}`;
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const safeName = (s: unknown) =>
  String(s ?? "log.txt").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "").slice(0, 80) || "log.txt";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS });
  if (!TOKEN) return json(500, { error: "Не задан секрет GITHUB_LOG_TOKEN" });

  const denied = await requireAdmin(req);
  if (denied) return denied;

  let body: { files?: { name?: string; text?: string }[]; version?: string };
  try { body = await req.json(); } catch { return json(400, { error: "Bad JSON" }); }
  const files = (body.files ?? []).filter((f) => typeof f?.text === "string" && f.text.length).slice(0, MAX_FILES);
  if (!files.length) return json(400, { error: "Нет файлов" });
  if (files.some((f) => f.text!.length > MAX_FILE_CHARS)) return json(413, { error: "Файл слишком большой" });

  const bad = await ensureBranch();
  if (bad) return json(502, { error: bad });

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*$/, "");
  const paths: string[] = [];
  for (const [i, f] of files.entries()) {
    const path = `logs/${stamp}_${i + 1}_${safeName(f.name)}`;
    const put = await gh(`/contents/${path}`, {
      method: "PUT",
      body: JSON.stringify({
        message: `log: ${safeName(f.name)}${body.version ? ` (v${String(body.version).slice(0, 20)})` : ""}`,
        content: toBase64(f.text!),
        branch: BRANCH,
      }),
    });
    if (!put.ok) return json(502, { error: `GitHub: запись ${put.status}`, paths });
    paths.push(path);
  }

  // Новая отправка заменяет старую: прежние файлы logs/ (не прочитанные и не удалённые) убираем.
  // Сбой уборки отправку не ломает — просто останется лишнее.
  let removed = 0;
  try {
    const list = await gh(`/contents/logs?ref=${BRANCH}`);
    const old = list.ok ? await list.json() : [];
    for (const f of Array.isArray(old) ? old : []) {
      if (f.type !== "file" || paths.includes(f.path)) continue;
      const del = await gh(`/contents/${f.path}`, {
        method: "DELETE",
        body: JSON.stringify({ message: `log: заменено новой отправкой (${f.name})`, sha: f.sha, branch: BRANCH }),
      });
      if (del.ok) removed++;
    }
  } catch { /* уборка необязательна */ }
  return json(200, { ok: true, branch: BRANCH, paths, removed });
});

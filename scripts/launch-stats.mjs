// Отчёт «Запуск» без открытия приложения: хватает ли наполнения, чтобы приложение жило для новых пользователей.
// Тот же подсчёт, что во вкладке админки «Запуск» (src/features/admin/launch/launchStats.js), но данные берутся по REST
// анонимным ключом: curricula, lessons, word_audio, scenes. Анониму RLS отдаёт ТОЛЬКО опубликованное и не-Pro
// (черновиков и Pro-фраз он не видит), а шаблоны пушей (push_templates) недоступны вовсе — строка «только в админке».
// Полная картина (черновики, пуши) — во вкладке «Запуск» в админке.
//
// Запуск: VITE_SUPABASE_URL=… VITE_SUPABASE_ANON_KEY=… node scripts/launch-stats.mjs
// Печатает Markdown в stdout; если задан GITHUB_STEP_SUMMARY — дописывает отчёт и туда (вкладка Summary в Actions).
// Код выхода всегда 0, пока данные читаются: отчёт информационный. Не прочитались curricula/lessons — выход 1.
import { appendFileSync } from 'node:fs'
import { buildLaunchStats } from '../src/features/admin/launch/launchStats.js'
import { formatLaunchReport } from '../src/features/admin/launch/launchReportMd.js'

const URL_BASE = (process.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '')
const KEY = process.env.VITE_SUPABASE_ANON_KEY ?? ''
if (!URL_BASE || !KEY) {
  console.error('Нужны VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в окружении.')
  process.exit(1)
}

const PAGE = 500

// Все строки таблицы постранично (PostgREST отдаёт не больше 1000 за запрос). → массив
async function getAll(table, select, order = 'id', filter = '') {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const q = `select=${encodeURIComponent(select)}&order=${order}&limit=${PAGE}&offset=${from}${filter}`
    const res = await fetch(`${URL_BASE}/rest/v1/${table}?${q}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      const err = new Error(`${table}: HTTP ${res.status} ${body.slice(0, 200)}`)
      err.status = res.status
      err.body = body
      throw err
    }
    const part = await res.json()
    rows.push(...part)
    if (part.length < PAGE) return rows
  }
}

// Колонки curricula: какие-то могут ещё не существовать в базе (миграции) — спускаемся по ярусам, как приложение
const BASE = 'id,title,lesson_ids,video_url,published,preview_only,is_pro,difficulty,difficulty_votes'
const TIERS = [
  `${BASE},scene_id,word_translations,difficulty_admin`,
  `${BASE},scene_id,word_translations`,
  `${BASE},word_translations`,
  BASE,
]
async function curricula() {
  let last
  for (const cols of TIERS) {
    try { return await getAll('curricula', cols) } catch (e) {
      last = e
      if (e.status !== 400) throw e // 400 «колонки нет» — пробуем набор поменьше, остальное — настоящая ошибка
    }
  }
  throw last
}

// Источник читается отдельно: сбой одного не валит отчёт, причина уходит в строку «нет данных»
const reasons = {}
async function part(name, fn) {
  try { return await fn() } catch (e) {
    reasons[name] = e.message
    console.error(`[launch-stats] ${name}: ${e.message}`)
    return null
  }
}

const [cur, lessons, audio, scenes] = await Promise.all([
  part('curricula', curricula),
  part('lessonCards', () => getAll('lessons', 'id,title,published,cards:script->reviewCards')),
  part('wordAudio', () => getAll('word_audio', 'key,url', 'key', '&lang=eq.en')),
  part('scenes', () => getAll('scenes', 'id,status')),
])

reasons.pushTemplates = 'только в админке (таблицу читает только админ)'
const stats = buildLaunchStats({ curricula: cur, lessonCards: lessons, wordAudio: audio, pushTemplates: null, scenes, reasons })

const header = [
  'Данные читаются анонимным ключом: видны только опубликованные не-Pro фразы и опубликованные уроки.',
  'Черновики, Pro и шаблоны пушей здесь не видны — полная картина во вкладке «Запуск» в админке.',
].join(' ')
const md = formatLaunchReport(stats, { header })
console.log(md)
if (process.env.GITHUB_STEP_SUMMARY) {
  try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`) } catch (e) { console.error(`[launch-stats] summary: ${e.message}`) }
}
process.exit(cur && lessons ? 0 : 1)

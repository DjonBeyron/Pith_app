import { emptyLevel } from './levelModel.js'

// Уровень ГОСТЯ — в localStorage (вошедшему он лежит в user_profiles, см.
// shared/api/levelApi.js). Стиль — как guestMemory.js: любой сбой хранилища
// (приватный режим, битый JSON) тихо даёт пустой уровень.
export const LEVEL_KEY = 'pithy_level_v1'

const num = (v, fallback, min, max) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback)

function axisOf(raw, base) {
  const r = raw && typeof raw === 'object' ? raw : {}
  return {
    level: num(r.level, base.level, 0, 1),
    sigma: num(r.sigma, base.sigma, 0, 1),
    n: Math.round(num(r.n, base.n, 0, 1e9)),
  }
}

// Приводит что угодно к валидному виду { ear, vocab, updatedAt }
export function normalizeLevel(raw) {
  const base = emptyLevel()
  const r = raw && typeof raw === 'object' ? raw : {}
  return { ear: axisOf(r.ear, base.ear), vocab: axisOf(r.vocab, base.vocab), updatedAt: num(r.updatedAt, 0, 0, Infinity) }
}

export function loadLevel() {
  try { return normalizeLevel(JSON.parse(localStorage.getItem(LEVEL_KEY) ?? 'null')) } catch { return emptyLevel() }
}

export function saveLevel(level) {
  try { localStorage.setItem(LEVEL_KEY, JSON.stringify(normalizeLevel(level))) } catch { /* приватный режим — уровень не сохранится */ }
}

export function clearLevel() {
  try { localStorage.removeItem(LEVEL_KEY) } catch { /* нечего чистить */ }
}

// Контрольная группа без «умных» вопросов Пита (PLAN_NEW_USER.md → решение 23, раздел 7 «Контрольная группа»).
// Зачем: честно понять, помогают ли вопросы возврату, — сравнивая тех, кто их видит, с теми, кто нет, в одно время.
// Здесь: чистые функции (хеш, деление, правила допуска) и тонкая обёртка над localStorage. Ничего не бросает.
// Файл НЕ импортирует analytics/track.js (track.js сам берёт группу отсюда — иначе цикл импортов).

export const DEFAULT_SHARE = 10 // доля контрольной группы по умолчанию, %
export const MAX_SHARE = 50     // выше — это уже тест 50/50, а не «контрольная группа»
export const GROUPS = { control: 'control', prompts: 'prompts' }

export const GROUP_KEY = 'pithy_prompt_group_v1'       // { group, share, id } — группа устройства (прилипает)
export const SHARE_CACHE_KEY = 'pithy_prompt_share_v1' // последняя известная доля (число) из app_settings
export const PROMPT_CONTROL_KEY = 'prompt_control'     // ключ app_settings: jsonb { share: 0..50 }
// Совпадает с ANON_KEY в analytics/track.js (импортировать оттуда нельзя — цикл): id устройства гостя
const ANON_KEY = 'pithy_anon_id'

// Какие кандидаты скрыты у контрольной группы: «умные» вопросы по поведению, предложения игр, подсказки интерфейса.
// Функциональные шаги (explain_done, asked, notify_ask) показываем всем: это не «умные вопросы», а часть приложения
export const CONTROL_BLOCKED_REASONS = ['behavior', 'game_offer', 'ui_hint']

const isGroup = g => g === GROUPS.control || g === GROUPS.prompts

// Доля в процентах: нечисло → DEFAULT_SHARE, иначе целое, зажатое в 0..MAX_SHARE
export function clampShare(share) {
  const n = typeof share === 'number' ? share : Number.parseFloat(share)
  if (!Number.isFinite(n)) return DEFAULT_SHARE
  return Math.max(0, Math.min(MAX_SHARE, Math.round(n)))
}

// Стабильный хеш строки в 0..99: FNV-1a 32 бита (смещение 0x811c9dc5, простое 0x01000193) по кодам UTF-16,
// остаток от деления на 100. Одинаков на всех устройствах и при любой перезагрузке: одно и то же id всегда в одной «корзине»
export function hashId(id) {
  const s = String(id ?? '')
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h % 100
}

// Группа по id и доле: корзина < доли → контрольная. Доля 0 → контрольной нет
export function groupFor(id, share) {
  return hashId(id) < clampShare(share) ? GROUPS.control : GROUPS.prompts
}

// Приоритеты: группа из профиля (вошедший) → запомненная на устройстве → вычисленная по id и доле.
// Запомненная «прилипает», чтобы человек не перескакивал из группы в группу при смене доли в админке
export function resolveGroup({ stored, id, share, profileGroup } = {}) {
  if (isGroup(profileGroup)) return profileGroup
  if (isGroup(stored)) return stored
  return groupFor(id, share)
}

// Можно ли показать кандидата шторки этой группе. legacy: true — задание, которое было в приложении и до вопросов Пита
// («Ловля слов», «О чём диалог», старые подсказки ленты): контрольная группа получает ПРЕЖНЕЕ поведение, а не урезанное,
// поэтому такие кандидаты ей показываются; режутся только новые «умные» вопросы, игры и подсказки
export function allowedInGroup(group, candidate) {
  if (group !== GROUPS.control) return true
  if (candidate?.legacy) return true
  return !CONTROL_BLOCKED_REASONS.includes(candidate?.reason)
}

// ---------- обёртка над localStorage ----------
const ls = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null } catch { return null } }

function readJson(key) {
  try { return JSON.parse(ls()?.getItem(key) ?? 'null') } catch { return null }
}
function writeJson(key, value) {
  try { ls()?.setItem(key, JSON.stringify(value)) } catch { /* приватный режим */ }
}

// Если хранилище недоступно, группа всё равно держится до перезагрузки страницы
let memo = null
let memoId = null

function cachedShare() {
  const raw = readJson(SHARE_CACHE_KEY)
  return typeof raw === 'number' ? clampShare(raw) : DEFAULT_SHARE
}

function deviceId() {
  try {
    const id = ls()?.getItem(ANON_KEY)
    if (id) return id
  } catch { /* нет хранилища */ }
  memoId ??= 'x' + Math.random().toString(36).slice(2, 14)
  return memoId
}

// Синхронно: запомненная группа, а если её нет — вычислить по id устройства и доле из кэша настройки, записать и вернуть.
// Доля 0 в админке = «группы нет»: все, включая уже распределённых в control, видят вопросы (запомненное не стираем —
// вернут долю, вернётся и прежняя группа, никто не «перескочит»)
export function currentGroup() {
  if (cachedShare() === 0) return GROUPS.prompts
  const stored = readJson(GROUP_KEY)
  if (isGroup(stored?.group)) { memo = stored.group; return stored.group }
  if (memo) return memo
  const id = deviceId()
  const share = cachedShare()
  const group = resolveGroup({ id, share })
  memo = group
  writeJson(GROUP_KEY, { group, share, id })
  return group
}

// Пришла доля из app_settings: обновить кэш. Уже вычисленную группу не трогаем (прилипание)
export function applyShare(share) {
  writeJson(SHARE_CACHE_KEY, clampShare(share))
}

// После входа группа из профиля побеждает группу устройства (человек мог начать на другом устройстве)
export function adoptProfileGroup(group) {
  if (!isGroup(group)) return
  memo = group
  const prev = readJson(GROUP_KEY)
  writeJson(GROUP_KEY, { group, share: prev?.share ?? cachedShare(), id: prev?.id ?? deviceId() })
}

// Гость регистрируется: его группа переезжает вместе с ним (уходит в профиль через RPC set_prompt_group)
export const getGroupForSignup = () => currentGroup()

// Для тестов: сбросить память модуля
export function resetGroupMemo() { memo = null; memoId = null }

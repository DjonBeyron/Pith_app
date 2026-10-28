import { STORAGE_KEY } from './promptRules.js'
import { normalizeState, prune } from './promptBudget.js'

// Тонкая обёртка над localStorage для состояния бюджета вопросов Пита (формат — шапка promptBudget.js).
// Ничего не бросает: приватный режим / недоступное или битое хранилище → состояние «с нуля».
const ls = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null } catch { return null } }

export function read() {
  try {
    return normalizeState(JSON.parse(ls()?.getItem(STORAGE_KEY) ?? 'null'))
  } catch { return normalizeState(null) }
}

export function write(state) {
  try { ls()?.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* приватный режим */ }
}

// Прочитать и сразу выкинуть истёкшие паузы
export const loadState = (now = Date.now()) => prune(read(), now)

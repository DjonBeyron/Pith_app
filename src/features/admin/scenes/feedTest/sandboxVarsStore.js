import { normalizeCfg } from './sandboxVarsModel.js'

// Хранилище имитации памяти песочницы — sessionStorage (до закрытия вкладки, только это устройство; в базу и сеть не идёт).
// Любое обращение в try/catch: приватный режим, переполнение, нет window — тогда панель живёт со значениями по умолчанию.
export const SANDBOX_VARS_KEY = 'pithy_sandbox_vars_v1'

const ss = () => { try { return typeof sessionStorage !== 'undefined' ? sessionStorage : null } catch { return null } }

export function loadSandboxVars(storage = ss()) {
  try {
    const raw = storage?.getItem(SANDBOX_VARS_KEY)
    return normalizeCfg(raw ? JSON.parse(raw) : null)
  } catch { return normalizeCfg(null) }
}

// → true, если записали
export function saveSandboxVars(cfg, storage = ss()) {
  try { storage.setItem(SANDBOX_VARS_KEY, JSON.stringify(cfg)); return true } catch { return false }
}

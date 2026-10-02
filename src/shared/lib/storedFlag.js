// Булев флаг интерфейса на устройстве (свёрнуто/развёрнуто и т.п.): читается и пишется без падений, если
// localStorage недоступен (приватный режим) — тогда действует значение по умолчанию до перезагрузки
export function readFlag(key, fallback) {
  try {
    const v = localStorage.getItem(key)
    return v === '1' ? true : v === '0' ? false : fallback
  } catch { return fallback }
}

export function writeFlag(key, value) {
  try { localStorage.setItem(key, value ? '1' : '0') } catch { /* не запомнится */ }
}

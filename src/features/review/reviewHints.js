// Одноразовые подсказки повторения — флаги в localStorage (не удалось прочитать
// или записать, например приватный режим, — просто показываем как в первый раз)
export const hintSeen = key => { try { return !!localStorage.getItem(key) } catch { return false } }
export const markHint = key => { try { localStorage.setItem(key, '1') } catch { /* приватный режим */ } }

import { useAdmin } from '../../app/AdminContext.jsx'
import { usePlayerDebugUi } from '../../shared/lib/usePlayerDebugUi.js'

// Показывать ли в уроке диагностический набор: кнопку «⬇ лог» и штамп версии.
// Нужны они для одного и того же — получить от пользователя внятный отчёт о
// баге, — поэтому и включаются одним переключателем в админке.
//
// Админ видит набор всегда; в «режиме пользователя» — нет, там он ученик
// (isAdmin из контекста как раз эффективный). Остальные — только если админ
// включил настройку (общая, из базы, см. usePlayerDebugUi.js).
//
// Живёт в features/player, а не в shared/lib: знает про AdminContext, а
// shared про app знать не должен.
export function useShowDebugUi() {
  const { isAdmin } = useAdmin()
  const forEveryone = usePlayerDebugUi()
  return isAdmin || forEveryone
}

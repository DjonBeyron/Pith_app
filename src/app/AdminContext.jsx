import { createContext, useContext, useSyncExternalStore } from 'react'
import { useIsAdmin } from '../shared/lib/useIsAdmin.js'
import { getUserMode, setUserMode, subscribeUserMode } from '../shared/lib/userMode.js'

// Один источник правды об админ-статусе на всё приложение.
// Провайдер держит useIsAdmin (один запрос getProfile), потребители читают через useAdmin().
//
// isAdmin здесь — ЭФФЕКТИВНЫЙ статус: настоящий админ минус «режим пользователя»
// (см. userMode.js). Все потребители читают именно его и прячут свой админский
// UI сами, без правок в каждом файле. Настоящий статус доступен как isRealAdmin —
// он нужен ровно в двух местах: кнопка «Админ» в нижней панели и содержимое самой
// админки, иначе выключить режим было бы нечем.
const AdminCtx = createContext({
  user: null, isAdmin: false, isRealAdmin: false, userMode: false, setUserMode, loading: true,
})

export function AdminProvider({ children }) {
  const base = useIsAdmin()
  const userMode = useSyncExternalStore(subscribeUserMode, getUserMode, () => false)
  const value = {
    ...base,
    isAdmin: base.isAdmin && !userMode,
    isRealAdmin: base.isAdmin,
    userMode: base.isAdmin && userMode, // не-админу флаг в localStorage ничего не значит
    setUserMode,
  }
  return <AdminCtx.Provider value={value}>{children}</AdminCtx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAdmin() {
  return useContext(AdminCtx)
}

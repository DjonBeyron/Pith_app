import { createContext, useContext } from 'react'
import { useIsAdmin } from '../shared/lib/useIsAdmin.js'

// Один источник правды об админ-статусе на всё приложение.
// Провайдер держит useIsAdmin (один запрос getProfile), потребители читают через useAdmin().
const AdminCtx = createContext({ user: null, isAdmin: false, loading: true })

export function AdminProvider({ children }) {
  const value = useIsAdmin()
  return <AdminCtx.Provider value={value}>{children}</AdminCtx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAdmin() {
  return useContext(AdminCtx)
}

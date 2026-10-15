import { useMemo, useSyncExternalStore } from 'react'
import { readSandbox, onSandboxChange } from './feedSandbox.js'
import { pickSandboxModule } from './sandboxModule.js'

// Песочница в React: запись (или null) из sessionStorage, живая подписка.
export const useSandbox = () => useSyncExternalStore(onSandboxChange, readSandbox, () => null)

// Синтетический модуль песочницы или null. Только для админа в обычном режиме (isAdmin из useAdmin — он гаснет в
// «режиме пользователя» и у «новенького»): обычному пользователю песочница не видна никогда, даже если запись
// каким-то образом лежит в его sessionStorage
export function useSandboxModule(isAdmin) {
  const sb = useSandbox()
  return useMemo(() => pickSandboxModule(isAdmin, sb), [isAdmin, sb])
}

import { lazy, Suspense } from 'react'
import { lazyRetry } from '../../../shared/lib/lazyRetry.js'

// Панель правки рядом с плеером — десктоп, только админ, только запуск из
// канваса. Тянет за собой весь NodeContentEditor (~200 КБ) — обычному
// пользователю он не нужен, поэтому грузится отдельным чанком в момент, когда
// панель реально показали, и в стартовый бандл не попадает.
const PlayerAdminPanel = lazy(() => lazyRetry(() => import('./PlayerAdminPanel.jsx'), 'player-admin-panel'))

export default function PlayerAdminPanelLazy(props) {
  return (
    <Suspense fallback={null}>
      <PlayerAdminPanel {...props} />
    </Suspense>
  )
}

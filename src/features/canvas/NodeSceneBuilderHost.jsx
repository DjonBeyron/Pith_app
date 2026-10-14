import { lazy, Suspense } from 'react'
import { lazyRetry } from '../../shared/lib/lazyRetry.js'

// Тот же полноэкранный «Сборщик сцен» админки (admin/scenes/BuilderWindow,
// ленивый chunk) поверх канваса — в управляемом режиме: initialScene →
// правки → «Применить к ноде» (onApply(scene, saved)) → закрыть. Окно — портал в
// body, но React-события из портала всплывают по дереву компонентов к ноде
// канваса (drag по mousedown, выделение по click, Esc доски): обёртка глушит
// их здесь, чтобы клик в сборщике не тащил ноду и не проваливался в холст.
// Переиспользуется панелью «Сцена» модуля ленты (lessons/ModuleScenePanel):
// title/applyLabel — свои подписи, initialRow — строка библиотеки сцены.
const BuilderWindow = lazy(() => lazyRetry(() => import('../admin/scenes/BuilderWindow.jsx'), 'scene-builder'))

const stop = e => e.stopPropagation()

export default function NodeSceneBuilderHost({ initialScene, initialRow = null, onApply, onClose, title = 'Сцена для ноды', applyLabel }) {
  return (
    <div
      className="nodeSceneBuilderHost"
      onMouseDown={stop} onMouseUp={stop} onClick={stop} onDoubleClick={stop} onPointerDown={stop}
      onTouchStart={stop} onKeyDown={stop} onKeyUp={stop} onWheel={stop} onContextMenu={stop}
    >
      <Suspense fallback={null}>
        <BuilderWindow title={title} applyLabel={applyLabel} initialScene={initialScene} initialRow={initialRow} onApply={onApply} onClose={onClose} />
      </Suspense>
    </div>
  )
}

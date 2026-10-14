import { useMemo, useState } from 'react'
import { orderByConfig, weightedOrder, legacyOrder } from './previewOrders.js'
import { changedIds } from './orderDiff.js'

export const PREVIEW_TOP = 20

// Порядки для предпросмотра: черновик (взвешенно), активная версия (как лента
// отрисует её сейчас), legacy и, если выбрана, версия из истории. Плюс набор id,
// сдвинувшихся после последней правки черновика — для подсветки.
export function usePreviewOrders(modules, rank, draft, active, versionCfg) {
  const orders = useMemo(() => ({
    draft: weightedOrder(modules, rank, draft),
    active: orderByConfig(modules, rank, active),
    legacy: legacyOrder(modules, rank),
    version: versionCfg ? orderByConfig(modules, rank, versionCfg) : null,
  }), [modules, rank, draft, active, versionCfg])

  // Предыдущий порядок черновика — через состояние, выведенное в рендере (без эффекта)
  const [prev, setPrev] = useState({ order: orders.draft, changed: new Set() })
  if (prev.order !== orders.draft) {
    // Первая загрузка списка (был пустой) — не правка, подсвечивать нечего
    setPrev({ order: orders.draft, changed: prev.order.length ? changedIds(orders.draft, prev.order, PREVIEW_TOP) : new Set() })
  }

  return { orders, changed: prev.changed }
}

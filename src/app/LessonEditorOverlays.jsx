import { lazy, Suspense } from 'react'
import { lazyRetry } from '../shared/lib/lazyRetry.js'
import { canvasLsKey } from '../features/canvas/canvasStorageKeys.js'

// Код-сплиттинг: редакторы нужны только is_admin — обычный пользователь эти
// chunk'и даже не скачивает (см. PROJECT.md, этап 2)
const CanvasPage      = lazy(() => lazyRetry(() => import('../features/canvas/CanvasPage.jsx'), 'canvas'))
const ProductionPage  = lazy(() => lazyRetry(() => import('../features/production/ProductionPage.jsx'), 'production'))
const ReviewCardsPage = lazy(() => lazyRetry(() => import('../features/reviewCards/ReviewCardsPage.jsx'), 'review-cards'))

// Три вида редактора одного урока — оверлеем поверх оболочки (лента под ним
// не размонтируется): «Граф» (canvas), «Продакшен» (линейный список) и
// «Карточки» (колода повтора). Открыт максимум один; переключение между ними
// — через шапку самого редактора (каждый сохраняет перед уходом).
// Вынесено из ShellV2.jsx; состояние (какой урок в каком редакторе) — там же.
export default function LessonEditorOverlays({
  canvasLesson, setCanvasLesson, productionLesson, setProductionLesson,
  cardsLesson, setCardsLesson, onBackToModule,
}) {
  // Открыть урок в другом редакторе, закрыв текущий
  const open = (setter, lesson) => id => {
    setCanvasLesson(null); setProductionLesson(null); setCardsLesson(null)
    setter({ id, moduleLessons: lesson?.moduleLessons ?? [] })
  }
  // Соседний редактор только что сохранил урок на сервер — это самая свежая
  // версия. У CanvasBoard свой localStorage-черновик (canvasLsKey), который
  // при монтировании имеет приоритет над данными сервера: если он остался от
  // прошлой незакрытой сессии канваса, он перекрыл бы свежие правки
  const openCanvasFrom = lesson => id => {
    localStorage.removeItem(canvasLsKey(id))
    open(setCanvasLesson, lesson)(id)
  }

  return (
    <>
      {canvasLesson && (
        <div className="shellV2CanvasOverlay">
          <Suspense fallback={<div className="shellV2Panel">Загрузка редактора…</div>}>
            <CanvasPage
              lessonId={canvasLesson.id}
              moduleLessons={canvasLesson.moduleLessons ?? []}
              module={canvasLesson.module ?? null}
              /* Назад — в схему модуля этого урока (если знаем её), а не на
                 главный экран: чаще всего дальше правят соседний урок. Модуль
                 мог найтись уже внутри редактора (урок открыли из всплывашки,
                 где модуль неизвестен) — он и приходит сюда */
              onBack={found => {
                const m = found ?? canvasLesson.module
                setCanvasLesson(null)
                onBackToModule(m)
              }}
              onOpenProduction={open(setProductionLesson, canvasLesson)}
              onOpenCards={open(setCardsLesson, canvasLesson)}
            />
          </Suspense>
        </div>
      )}

      {productionLesson && (
        <div className="shellV2CanvasOverlay">
          <Suspense fallback={<div className="shellV2Panel">Загрузка продакшена…</div>}>
            <ProductionPage
              lessonId={productionLesson.id}
              moduleLessons={productionLesson.moduleLessons ?? []}
              onBack={() => setProductionLesson(null)}
              onOpenCanvas={openCanvasFrom(productionLesson)}
              onOpenCards={open(setCardsLesson, productionLesson)}
            />
          </Suspense>
        </div>
      )}

      {cardsLesson && (
        <div className="shellV2CanvasOverlay">
          <Suspense fallback={<div className="shellV2Panel">Загрузка карточек…</div>}>
            <ReviewCardsPage
              lessonId={cardsLesson.id}
              moduleLessons={cardsLesson.moduleLessons ?? []}
              onBack={() => setCardsLesson(null)}
              onOpenCanvas={openCanvasFrom(cardsLesson)}
              onOpenProduction={open(setProductionLesson, cardsLesson)}
            />
          </Suspense>
        </div>
      )}
    </>
  )
}

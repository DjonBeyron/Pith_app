import { GROUPS } from '../../../shared/lib/ranking/signalRegistry.js'
import { orderShift, topDifference } from './orderDiff.js'
import { PREVIEW_TOP } from './usePreviewOrders.js'
import { GROUP_COLORS } from './signalTexts.js'
import PreviewRow from './PreviewRow.jsx'

// Правая колонка: топ-20 ленты по выбранному порядку — черновик (взвешенно),
// активная версия, legacy или версия из истории. У строки — score, вклады сигналов
// (stacked bar цветами групп), причины, сдвиги позиции к активной и к legacy.
// Подсветка — фразы, сдвинувшиеся после последней правки черновика.
const MODES = [['draft', 'Черновик'], ['active', 'Активная версия'], ['legacy', 'Legacy']]

export default function FeedPreview({ orders, changed, mode, setMode, hasVersion, draftEngine, loading, error, noMemory }) {
  const list = (orders[mode] ?? orders.draft) ?? []
  const top = list.slice(0, PREVIEW_TOP)
  const vsActive = new Map(orderShift(list, orders.active).map(s => [s.id, s]))
  const vsLegacy = new Map(orderShift(list, orders.legacy).map(s => [s.id, s]))
  const diffActive = topDifference(orders.draft, orders.active, PREVIEW_TOP)
  const diffLegacy = topDifference(orders.draft, orders.legacy, PREVIEW_TOP)

  return (
    <div className="fpWrap">
      <div className="fpModes" role="tablist" aria-label="Какой порядок показать">
        {MODES.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={mode === id} className={mode === id ? 'fpMode fpModeOn' : 'fpMode'} onClick={() => setMode(id)}>{label}</button>
        ))}
        {hasVersion && (
          <button role="tab" aria-selected={mode === 'version'} className={mode === 'version' ? 'fpMode fpModeOn' : 'fpMode'} onClick={() => setMode('version')}>Версия из истории</button>
        )}
      </div>
      <p className="fpSummary">
        Черновик отличается от активной версии в <b>{diffActive}</b> из {PREVIEW_TOP} позиций, от legacy — в <b>{diffLegacy}</b>.
        {mode === 'draft' && draftEngine === 'legacy' && ' Движок в черновике — старый: лента так НЕ пойдёт, здесь показано, как было бы при взвешенном расчёте.'}
      </p>
      <div className="fpLegend" aria-label="Цвета групп сигналов">
        {Object.entries(GROUPS).map(([g, title]) => (
          <span key={g} className="fpLegendItem"><span className="fpLegendDot" style={{ background: GROUP_COLORS[g] }} aria-hidden="true" />{title}</span>
        ))}
      </div>
      {loading && <p className="fpHint">Загружаю фразы…</p>}
      {error && <p className="fpHint fpError">{error}</p>}
      {!loading && !error && noMemory && <p className="fpHint">Память слов ещё не загружена (или вы не вошли) — порядок пока как у админа, без личных сигналов.</p>}
      {!loading && !error && !top.length && <p className="fpHint">Опубликованных фраз нет.</p>}
      <ol className="fpList">
        {top.map((item, i) => (
          <PreviewRow
            key={item.module.id} item={item} pos={i + 1} mode={mode}
            vsActive={vsActive.get(item.module.id)} vsLegacy={vsLegacy.get(item.module.id)}
            changed={mode === 'draft' && changed.has(item.module.id)}
          />
        ))}
      </ol>
      <p className="fpHint fpFoot">Список — все опубликованные фразы на данных памяти админа (в реальной ленте начатые модули скрыты). Правила «подмешка из хвоста» уже применены.</p>
    </div>
  )
}

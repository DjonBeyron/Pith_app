import { savedWhen } from '../timelineStore.js'

// Панель инструментов монтажа: «✎ Правка», масштаб (− / + / вся игра / по ширине этапа), легенда цветов и подсказка «как читать стол». В режиме правки — вторая строка: способ сдвига
// («со шлейфом» / «только этот клип»), отмена и возврат (↶ ↷ — весь стек, не один шаг), «👁 оригинал», итог черновика (подсказка, почему клип упёрся, — поверх стола, чтобы стол не прыгал под рукой).
// Нашёлся сохранённый черновик (draft.pending) — вопрос «продолжить / сбросить»: правка недоступна, пока на него не ответили.
const LEGEND = [['pit', 'Пит'], ['mia', 'Мия'], ['dictor', 'Диктор — слово, перевод, фраза'], ['silent', 'без озвучки (подпись)'], ['dead', 'игра молчит'], ['player', 'ждём игрока'], ['anim', 'анимация без речи'], ['count', 'отсчёт / техника']]

export default function MontageBar({ editOn, onEdit, mode, onMode, orig, onOrig, draft, sum, summary, onZoomIn, onZoomOut, onFit, onStage }) {
  const p = draft.pending
  return (
    <div className="mtgBar">
      <div className="mtgBarRow">
        <button type="button" className="tlChip mtgEditBtn" aria-pressed={editOn} onClick={onEdit} disabled={!!p} data-testid="mtg-edit-toggle">✎ Правка{draft.edits.length ? ` · ${draft.edits.length}` : ''}</button>
        <div className="tlGroup" aria-label="Масштаб">
          <button type="button" className="tlChip" onClick={onZoomOut} aria-label="Мельче" data-testid="mtg-zoom-out">−</button>
          <button type="button" className="tlChip" onClick={onZoomIn} aria-label="Крупнее" data-testid="mtg-zoom-in">+</button>
          <button type="button" className="tlChip" onClick={onFit} data-testid="mtg-fit">вся игра</button>
          <button type="button" className="tlChip" onClick={onStage ?? undefined} disabled={!onStage} data-testid="mtg-fit-stage">по ширине этапа</button>
        </div>
        <p className="mtgHow" data-testid="mtg-how"><b>Как читать:</b> клип = сколько реально звучало аудио; зазор = тишина (число — секунды). <span className="mtgKeys">← → по клипам · Ctrl + колесо — масштаб</span></p>
      </div>
      <p className="mtgLegend">{LEGEND.map(([k, t]) => <span key={k}><i data-k={k} />{t}</span>)}</p>
      {p && (
        <div className="mtgPending" data-testid="mtg-pending">
          <b>Есть черновик из {p.h.now.length} {p.h.now.length === 1 ? 'правки' : 'правок'}</b>{p.savedAt ? ` (записан ${savedWhen(p.savedAt)})` : ''}:
          <button type="button" className="tlChip" onClick={draft.accept} data-testid="mtg-pending-accept">продолжить</button>
          <button type="button" className="tlChip" onClick={draft.discard} data-testid="mtg-pending-discard">сбросить</button>
        </div>
      )}
      {editOn && !p && (
        <div className="mtgBarRow mtgEditRow" data-testid="mtg-edit-row">
          <div className="tlGroup" role="radiogroup" aria-label="Способ сдвига">
            <button type="button" role="radio" aria-checked={mode === 'ripple'} className="tlChip" onClick={() => onMode('ripple')} data-testid="mtg-mode-ripple" title="Всё, что после клипа, едет вместе с ним — игра становится короче или длиннее">сдвиг со шлейфом</button>
            <button type="button" role="radio" aria-checked={mode === 'solo'} className="tlChip" onClick={() => onMode('solo')} data-testid="mtg-mode-solo" title="Двигается только этот клип — до своих соседей">только этот клип</button>
          </div>
          <div className="tlGroup">
            <button type="button" className="tlChip" onClick={draft.undo} disabled={!draft.canUndo} title="Отменить (Ctrl+Z)" aria-label="Отменить" data-testid="mtg-undo">↶ отменить</button>
            <button type="button" className="tlChip" onClick={draft.redo} disabled={!draft.canRedo} title="Вернуть (Ctrl+Shift+Z, Ctrl+Y)" aria-label="Вернуть" data-testid="mtg-redo">↷ вернуть</button>
            <button type="button" className="tlChip" aria-pressed={orig} onClick={onOrig} disabled={!draft.edits.length} data-testid="mtg-orig" title="Показать игру как была, без правок">👁 оригинал</button>
          </div>
          <b className="mtgSum" data-testid="mtg-sum" data-removed={Math.round(sum.removed)}>{summary}</b>
        </div>
      )}
    </div>
  )
}

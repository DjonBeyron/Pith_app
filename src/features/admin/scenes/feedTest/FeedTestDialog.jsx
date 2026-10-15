import { useState } from 'react'
import FeedTestHowTo from './FeedTestHowTo.jsx'
import FeedTestSandbox from './FeedTestSandbox.jsx'
import FeedTestLink from './FeedTestLink.jsx'
import ScTip from '../ScTip.jsx'

// Диалог «Проверить в ленте» внутри окна сборщика. Два варианта (переключатель сверху):
//   · «Тест без привязки (песочница)» — ПО УМОЛЧАНИЮ (FeedTestSandbox): текущий черновик показывается в ленте обособленным
//     слайдом «ТЕСТ», без библиотеки, публикации, модуля и записи в БД;
//   · «Привязать к модулю ленты» — боевой (FeedTestLink): сохранить/опубликовать, привязать к модулю (curricula.scene_id),
//     показать всем пользователям вместо видео фразы.
// Esc закрывает диалог (data-esc-own). draft — useBuilderDraft, save(status) — useBuilderActions.save.
const MODES = [
  { id: 'sandbox', label: 'Тест без привязки (песочница)' },
  { id: 'link', label: 'Привязать к модулю ленты' },
]

export default function FeedTestDialog({ draft, library, save, onClose, onLeave, setStatus, origin = 'admin' }) {
  const [mode, setMode] = useState('sandbox')
  const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() } }
  return (
    <div className="scbDlgWrap" data-esc-own="1" onKeyDown={onKey} onClick={e => e.stopPropagation()}>
      <div className="scbDlg" role="dialog" aria-modal="true" aria-label="Проверить сцену в ленте">
        <div className="scbHRow">
          <h3 className="scbDlgTitle">Проверить в ленте <ScTip help="feed_test" /></h3>
          <button type="button" className="fsBtn fsBtnSmall" onClick={onClose}>Закрыть</button>
        </div>
        <div className="scbFtModes" role="group" aria-label="Вариант проверки">
          {MODES.map(m => (
            <button key={m.id} type="button" className={`scbFtMode${mode === m.id ? ' scbFtModeOn' : ''}`} aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>{m.label}</button>
          ))}
        </div>
        {mode === 'sandbox'
          ? <FeedTestSandbox draft={draft} onClose={onClose} onLeave={onLeave} setStatus={setStatus} origin={origin} />
          : <FeedTestLink draft={draft} library={library} save={save} onClose={onClose} onLeave={onLeave} setStatus={setStatus} />}
        <FeedTestHowTo />
      </div>
    </div>
  )
}

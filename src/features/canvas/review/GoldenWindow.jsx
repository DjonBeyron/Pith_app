import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { listLessonExamples, deleteLessonExample } from '../../../shared/api/lessonExamplesApi.js'
import { goldenJson } from './lessonExamples.js'

const KIND = { pair: 'до → после', bad: '❌ нельзя', good: '✅ можно' }

// Окно «⭐ Золотой набор»: все примеры (по всем урокам, новые сверху), удалить, скопировать/скачать JSON (lesson-drafts/examples.json —
// примеры для промпта автора и калибровки судьи). tick — перезагрузить список (после добавления из окна замечания/пометок)
export default function GoldenWindow({ tick = 0, onClose }) {
  const [list, setList] = useState(null)
  const [msg, setMsg] = useState('')
  useEffect(() => { let dead = false; listLessonExamples().then(l => { if (!dead) setList(l) }, e => { if (!dead) { setList([]); setMsg(`Не загрузилось: ${e?.message ?? e}`) } }); return () => { dead = true } }, [tick])
  const json = useMemo(() => goldenJson(list ?? []), [list])
  const flash = t => { setMsg(t); setTimeout(() => setMsg(''), 3000) }
  const copy = async () => { try { await navigator.clipboard.writeText(JSON.stringify(json, null, 2)); flash('JSON скопирован') } catch { flash('Не удалось скопировать — скачай файлом') } }
  const download = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }))
    a.download = 'examples.json'; a.click(); URL.revokeObjectURL(a.href)
  }
  const remove = async id => { try { await deleteLessonExample(id); setList(l => l.filter(e => e.id !== id)) } catch (e) { flash(`Не удалилось: ${e?.message ?? e}`) } }
  return createPortal(
    <div className="rvwNtBack" onMouseDown={e => { e.stopPropagation(); if (e.target === e.currentTarget) onClose() }}>
      <div className="rvwNtBox rvwNtWide" onMouseDown={e => e.stopPropagation()}>
        <div className="rvwNtHead"><b>⭐ Золотой набор ({list?.length ?? '…'})</b><button className="rvwBtn" onClick={onClose}>Закрыть</button></div>
        <div className="rvwNtList rvwNtScroll">
          {list && list.length === 0 && <div className="rvwEmpty">Пока пусто. В окне замечания — «⭐ В золотой набор», в правой колонке — «в набор» у пометок с телефона</div>}
          {(list ?? []).map(e => (
            <div key={e.id} className="rvwNtItem">
              <div className="rvwNtRow"><span><b>{KIND[e.kind] ?? e.kind}</b> · {e.lessonTitle || 'урок'} · №{e.seq ?? '?'} {e.type}{e.source !== 'review' ? ` · ${e.source}` : ''}</span><button className="rvwBtn" onClick={() => remove(e.id)}>Удалить</button></div>
              <div className="rvwNtQuote">{e.before}</div>
              {e.kind === 'pair' && <div className="rvwNtQuote rvwGoldAfter">→ {e.after}</div>}
              {e.comments.length > 0 && <div className="rvwNtQuote">{e.comments.join(' · ')}</div>}
            </div>
          ))}
        </div>
        <div className="rvwNtBtns">
          <button className="rvwBtn rvwBtnPrimary" disabled={!list?.length} onClick={copy}>Скопировать JSON</button>
          <button className="rvwBtn" disabled={!list?.length} onClick={download}>Скачать examples.json</button>
          {msg && <span className="rvwInfo">{msg}</span>}
        </div>
      </div>
    </div>,
    document.body,
  )
}

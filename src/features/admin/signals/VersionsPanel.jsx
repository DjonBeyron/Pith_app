import { configDiff } from './draftModel.js'

// Вкладка «История» средней колонки: активная версия и до 20 прежних
// (feed_signals_history) — дата, автор, заметка, что изменила версия относительно
// предыдущей; «Предпросмотр» (порядок ленты по ней в правой колонке) и «Откатить».
const fmt = iso => {
  if (!iso) return 'без даты'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function DiffList({ diff }) {
  if (!diff.length) return <p className="vpDiff vpMuted">веса и тумблеры без изменений</p>
  return <ul className="vpDiff">{diff.slice(0, 6).map(d => <li key={d.kind + (d.id ?? '')}>{d.text}</li>)}{diff.length > 6 && <li>…ещё {diff.length - 6}</li>}</ul>
}

export default function VersionsPanel({ history, active, busy, onReload, onPreview, onRollback, previewingAt }) {
  const { list, loading, error } = history
  const chain = [active, ...list] // chain[i] изменила chain[i+1]

  return (
    <div className="vpWrap">
      <div className="vpHead">
        <span className="vpTitle">Версии конфига</span>
        <button className="fsBtn fsBtnSmall" onClick={onReload} disabled={loading}>{loading ? 'Загружаю…' : 'Обновить'}</button>
      </div>
      <div className="vpItem vpItemActive">
        <div className="vpMeta"><b>Активная</b> · {fmt(active.updatedAt)} · {active.updatedBy || 'автор неизвестен'} · движок <b>{active.engine}</b></div>
        {active.note && <p className="vpNote">«{active.note}»</p>}
        <DiffList diff={configDiff(list[0] ?? active, active)} />
      </div>
      {error && <p className="fpHint fpError">{error}</p>}
      {!loading && !error && !list.length && <p className="fpHint">Прежних версий нет — история появится после первого сохранения.</p>}
      {list.map((v, i) => (
        <div key={v.updatedAt ?? i} className={previewingAt && previewingAt === v.updatedAt ? 'vpItem vpItemPreview' : 'vpItem'}>
          <div className="vpMeta">{fmt(v.updatedAt)} · {v.updatedBy || 'автор неизвестен'} · движок <b>{v.engine}</b></div>
          {v.note && <p className="vpNote">«{v.note}»</p>}
          <DiffList diff={configDiff(chain[i + 2] ?? v, v)} />
          <div className="vpBtns">
            <button className="fsBtn fsBtnSmall" onClick={() => onPreview(v)}>Предпросмотр</button>
            <button className="fsBtn fsBtnSmall" onClick={() => onRollback(v.updatedAt)} disabled={busy || !v.updatedAt}>Откатить</button>
          </div>
        </div>
      ))}
    </div>
  )
}

const fmt = t => new Date(t).toLocaleString('ru', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

// Кнопки «Изменения» (розовые полоски у сообщений, которые отличаются от выбранной версии) + выбор версии для сравнения (в том числе локальных,
// записанных на этом компьютере) + «Только изменённые» — лента показывает подряд лишь отличающиеся сообщения
export default function VersionsBar({ versions, onlyChanged, setOnlyChanged }) {
  return (
    <>
      <button className={`rvwBtn rvwBtnChg${versions.show ? ' on' : ''}`} disabled={!versions.canCompare} onClick={() => versions.setShow(!versions.show)}
        title={versions.canCompare ? 'Розовая полоска у сообщений, которые отличаются от выбранной версии (новые, изменённые и те, к которым были замечания)' : 'Предыдущей версии урока ещё нет: она появится, когда урок изменится (загрузка, сохранение, импорт или правка) и разбор откроют снова'}>
        Изменения{versions.show ? ` (${versions.marks.size})` : ''}
      </button>
      {versions.show && (
        <>
          <select className="rvwVerSel" value={versions.baseIndex} onChange={e => versions.setPick(Number(e.target.value))} title="С какой версией сравнивать (версии хранятся на этом компьютере)">
            {versions.options.map(o => <option key={o.i} value={o.i}>с версией от {fmt(o.t)}</option>)}
          </select>
          <button className={`rvwBtn rvwBtnChg${onlyChanged ? ' on' : ''}`} onClick={() => setOnlyChanged(!onlyChanged)} title="Показать в ленте подряд только изменённые сообщения">
            Только изменённые
          </button>
        </>
      )}
    </>
  )
}

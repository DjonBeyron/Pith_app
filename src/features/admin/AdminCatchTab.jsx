import { useState, useEffect } from 'react'
import { loadCurricula } from '../../shared/lib/curriculaApi.js'
import { listCatchCounts } from '../../shared/api/catchApi.js'
import { useCatchSandbox } from './useCatchSandbox.js'
import AdminCatchPhone from './AdminCatchPhone.jsx'
import AdminCatchHelp from './AdminCatchHelp.jsx'
import { setForcedCatch, sendToFeed } from '../feed/catch/catchForce.js'
import { readCatchPrefs, writeCatchPrefs, resolveModuleId, withLevels } from './catchAdminPrefs.js'

const LEVELS = [
  [0, 'серый'], [1, 'зелёный'], [2, 'синий'], [3, 'золотой'], [4, 'фиолетовый'],
]
// Ключ счётчиков попапов «Раскрыть»/«Подсказать» (catchConfirm.js его не экспортирует, файлы ленты не трогаем)
const CONFIRM_KEY = 'pithy_catch_confirm_v1'

// Админ → «Ловля»: песочница механики «Ловля слов» (спек v2) без ленты и без реальной памяти. Берём фразу модуля,
// для каждого слова админ выбирает уровень 0–4 (как будто слово так сильно в памяти) и ловит слова на настоящих
// компонентах в «телефоне» 390px (AdminCatchPhone). Сигналы в СВОЮ память — только если включён переключатель.
// Кнопка «?» раскрывает справку для автора (AdminCatchHelp).
// Выбор помнится между заходами (catchAdminPrefs.js, localStorage): фраза, уровни слов по каждой фразе, переключатель
// записи в память и раскрытая справка. «Сбросить» чистит только ввод в песочнице, сохранённый выбор не трогает.
export default function AdminCatchTab() {
  const [mods, setMods] = useState(null) // null — загрузка
  const [prefs, setPrefs] = useState(readCatchPrefs)
  const [modId, setModId] = useState(prefs.moduleId)
  const { write, help } = prefs
  const [counts, setCounts] = useState(null)
  const [popupNote, setPopupNote] = useState('')
  const [feedNote, setFeedNote] = useState('')

  useEffect(() => {
    loadCurricula()
      .then(rows => {
        const list = rows.filter(r => r.title)
        setMods(list)
        setModId(resolveModuleId(prefs.moduleId, list)) // сохранённой фразы уже нет — первая
      })
      .catch(() => setMods([]))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const mod = mods?.find(m => m.id === modId) ?? null
  const save = next => { setPrefs(next); writeCatchPrefs(next) }
  const sb = useCatchSandbox({
    title: mod?.title ?? '', moduleId: mod?.id ?? null, writeMemory: write,
    savedLevels: prefs.levelsByModule[modId] ?? null,
    onLevelsChange: (id, levels) => save(withLevels(prefs, id, levels)),
  })
  const pickModule = id => { setModId(id); save({ ...prefs, moduleId: id }) }

  async function showCounts() {
    const m = await listCatchCounts()
    setCounts([...m.entries()].sort((a, b) => b[1] - a[1]))
  }

  function resetPopups() {
    try {
      localStorage.removeItem(CONFIRM_KEY)
      setPopupNote('Счётчики попапов сброшены — «Раскрыть» и «Подсказать» снова спросят подтверждение')
    } catch {
      setPopupNote('Не удалось сбросить: localStorage недоступен')
    }
  }

  // «Отправить в ленту»: уровни ВСЕХ слов песочницы (в т.ч. дефолтные) → принудительное задание → лента поворачивается к фразе
  function sendFeed() {
    const levels = Object.fromEntries(sb.words.map(w => [w.index, sb.levelOf(w)]))
    if (!setForcedCatch({ moduleId: mod.id, levels, writeMemory: write })) {
      setFeedNote('Не удалось: sessionStorage недоступен')
      return
    }
    setFeedNote('')
    sendToFeed(mod.id)
  }

  return (
    <div className="aeWrap">
      <div className="aeHead">
        <span className="aeTitle">Ловля слов (песочница)</span>
        <button
          className={`acHelpBtn${help ? ' acHelpBtnOn' : ''}`} aria-expanded={help} aria-label="Справка"
          onClick={() => save({ ...prefs, help: !help })}
        >?</button>
        <button className="aeRefresh" onClick={sb.reset}>Сбросить</button>
        <button className="aeRefresh" onClick={sendFeed} disabled={!mod || sb.words.length === 0}>Отправить в ленту</button>
      </div>
      <p className="aeHint">
        Фраза встанет первой в ленте с заданием по этим уровням, без лимитов. Один раз: после «Готово» или «Раскрыть» задание снимается
      </p>
      {feedNote && <p className="aeHint">{feedNote}</p>}
      {help && <AdminCatchHelp />}

      <select className="acSelect" value={modId} onChange={e => pickModule(e.target.value)} aria-label="Фраза">
        {(mods ?? []).map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
      </select>
      {mods && mods.length === 0 && <p className="aeHint">Нет фраз (модулей с названием)</p>}

      <label className="acSwitch">
        <input type="checkbox" checked={write} onChange={e => save({ ...prefs, write: e.target.checked })} />
        Писать сигналы в память (мою)
      </label>

      <div className="arvActions">
        <button className="aeRefresh" onClick={resetPopups}>Сбросить счётчики попапов</button>
        <button className="aeRefresh" onClick={showCounts}>Показать счётчики «услышано»</button>
      </div>
      {popupNote && <p className="aeHint">{popupNote}</p>}
      {counts?.length === 0 && <p className="aeHint">Счётчиков пока нет</p>}
      {(counts ?? []).map(([word, n]) => (
        <div key={word} className="aeRow arvRow">
          <span className="arvWord">{word}</span>
          <span className="arvMeta">· {n}</span>
        </div>
      ))}

      {mod && sb.words.length === 0 && <p className="aeHint">У фразы нет слов</p>}

      {mod && sb.words.length > 0 && (
        <>
          <div className="acLevels">
            {sb.words.map(w => (
              <label key={w.index} className="acLevel">
                <span>{w.text}</span>
                <select value={sb.levelOf(w)} onChange={e => sb.setLevel(w.index, Number(e.target.value))}>
                  {LEVELS.map(([l, name]) => <option key={l} value={l}>{l} {name}</option>)}
                </select>
              </label>
            ))}
          </div>

          <AdminCatchPhone title={mod.title} sb={sb} />

          {sb.memoryNote && <p className="aeHint acMemory">{sb.memoryNote}</p>}
          <div className="acLog" aria-label="Лог действий">
            {sb.log.length === 0 ? <span className="aeHint">Лог действий пуст — нажми чип «Проверь» → «всё ли удалось услышать»</span>
              : sb.log.map((t, i) => <div key={i}>{t}</div>)}
          </div>
        </>
      )}
    </div>
  )
}

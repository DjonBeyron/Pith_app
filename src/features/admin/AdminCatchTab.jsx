import { useState, useEffect } from 'react'
import { loadCurricula } from '../../shared/lib/curriculaApi.js'
import { listCatchCounts } from '../../shared/api/catchApi.js'
import { catchOwnCount } from '../feed/catch/feedCatch.js'
import CatchChip from '../feed/catch/CatchChip.jsx'
import CatchMaskedWords from '../feed/catch/CatchMaskedWords.jsx'
import CatchPanel from '../feed/catch/CatchPanel.jsx'
import { useCatchSandbox } from './useCatchSandbox.js'

const LEVELS = [0, 1, 2, 3, 4]

// Админ → «Ловля»: песочница механики «Ловля слов» без ленты и без реальной памяти. Берём фразу модуля,
// для каждого слова админ выбирает уровень 0–4 (как будто слово так сильно в памяти), и ловит слова на
// настоящих CatchChip / CatchMaskedWords / CatchPanel. Сигналы в СВОЮ память — только если включён переключатель.
export default function AdminCatchTab() {
  const [mods, setMods] = useState(null) // null — загрузка
  const [modId, setModId] = useState('')
  const [write, setWrite] = useState(false)
  const [counts, setCounts] = useState(null)

  useEffect(() => {
    loadCurricula()
      .then(rows => {
        const list = rows.filter(r => r.title)
        setMods(list)
        setModId(list[0]?.id ?? '')
      })
      .catch(() => setMods([]))
  }, [])

  const mod = mods?.find(m => m.id === modId) ?? null
  const sb = useCatchSandbox({ title: mod?.title ?? '', moduleId: mod?.id ?? null, writeMemory: write })

  async function showCounts() {
    const m = await listCatchCounts()
    setCounts([...m.entries()].sort((a, b) => b[1] - a[1]))
  }

  return (
    <div className="aeWrap">
      <div className="aeHead">
        <span className="aeTitle">Ловля слов (песочница)</span>
        <button className="aeRefresh" onClick={sb.reset}>Сбросить</button>
      </div>
      <p className="aeHint">
        Песочница: тут нет ленты, лимитов и реальной памяти — уровень каждого слова задаёшь сам. Уровни и число
        запутывателей на клавиатуре: 0 — нет; 1 — 1; 2 — 2–3; 3 — 4–5; 4 — вся клавиатура. «Помочь памяти» —
        сигнал «не расслышал» (слово завтра первой карточкой), верный набор своего слова (уровень 2+) без помощи —
        «услышано в живой речи».
      </p>

      <select className="acSelect" value={modId} onChange={e => setModId(e.target.value)} aria-label="Фраза">
        {(mods ?? []).map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
      </select>
      {mods && mods.length === 0 && <p className="aeHint">Нет фраз (модулей с названием)</p>}

      <label className="acSwitch">
        <input type="checkbox" checked={write} onChange={e => setWrite(e.target.checked)} />
        Писать сигналы в память (мою)
      </label>

      {mod && sb.words.length === 0 && <p className="aeHint">У фразы нет слов</p>}

      {mod && sb.words.length > 0 && (
        <>
          <div className="acLevels">
            {sb.words.map(w => (
              <label key={w.index} className="acLevel">
                <span>{w.text}</span>
                <select value={sb.levelOf(w)} onChange={e => sb.setLevel(w.index, Number(e.target.value))}>
                  {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </label>
            ))}
          </div>

          <div className="acPhone">
            <div className="acPhrase">
              <CatchChip
                ownCount={catchOwnCount(sb.words)}
                remaining={sb.done ? 0 : sb.remaining}
                total={sb.words.length}
                started={sb.open}
              />
              <div className="feedPhrase feedPhraseCatch">
                <CatchMaskedWords
                  title={mod.title}
                  words={sb.words}
                  typedIndexes={sb.done ? new Set(sb.words.map(w => w.index)) : sb.typedIndexes}
                  currentIndex={sb.current?.index ?? -1}
                  onPick={sb.pickWord}
                />
              </div>
            </div>
            {sb.open && (
              <CatchPanel
                current={sb.current}
                typed={sb.typed}
                helped={sb.helped}
                model={sb.model}
                wrongFlash={sb.wrongFlash}
                remaining={sb.remaining}
                onKey={sb.press}
                onBackspace={sb.backspace}
                onHelp={sb.help}
                onCheck={sb.check}
                onReveal={sb.reveal}
              />
            )}
          </div>

          {sb.memoryNote && <p className="aeHint acMemory">{sb.memoryNote}</p>}
          <div className="acLog" aria-label="Лог действий">
            {sb.log.length === 0 ? <span className="aeHint">Лог действий пуст — тапни слово под маской</span>
              : sb.log.map((t, i) => <div key={i}>{t}</div>)}
          </div>
        </>
      )}

      <div className="arvActions">
        <button className="aeRefresh" onClick={showCounts}>Показать счётчики «услышано»</button>
      </div>
      {counts?.length === 0 && <p className="aeHint">Счётчиков пока нет</p>}
      {(counts ?? []).map(([word, n]) => (
        <div key={word} className="aeRow arvRow">
          <span className="arvWord">{word}</span>
          <span className="arvMeta">· {n}</span>
        </div>
      ))}
    </div>
  )
}

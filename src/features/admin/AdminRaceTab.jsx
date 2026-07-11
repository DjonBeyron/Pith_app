import { useState, useEffect } from 'react'
import { loadRaces, saveRace, deleteRace, fetchRaceLessons } from '../../shared/api/raceApi.js'
import { loadCurricula } from '../../shared/lib/curriculaApi.js'
import { notifyRaceChanged } from '../race/raceBus.js'
import AdminRacePicker from './AdminRacePicker.jsx'

const p2 = n => String(n).padStart(2, '0')
// timestamptz ↔ <input type="datetime-local">
function toLocal(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`
}
const fromLocal = s => (s ? new Date(s).toISOString() : null)
// Человекочитаемая подпись выбранного времени — снимает путаницу с AM/PM
const fmtHuman = ts => (ts
  ? new Date(ts).toLocaleString('ru', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
  : 'не выбрано')

// Дефолтное окно гонки: ближайшие суббота 00:00 — воскресенье 23:59
function nextWeekend() {
  const now = new Date()
  const sat = new Date(now)
  sat.setDate(now.getDate() + ((6 - now.getDay() + 7) % 7 || 7))
  sat.setHours(0, 0, 0, 0)
  const sun = new Date(sat)
  sun.setDate(sat.getDate() + 1)
  sun.setHours(23, 59, 0, 0)
  return { starts_at: sat.toISOString(), ends_at: sun.toISOString() }
}

// Админ: конструктор супергонки — тема, супер-урок (ПРО-модуль), задания-
// модули (XP модуля = сумма уроков), окно старт/конец, порог 80% XP.
export default function AdminRaceTab() {
  const [races,  setRaces]  = useState(null)
  const [mods,   setMods]   = useState([]) // все модули: [{ id, title, xp, count, isPro }]
  const [openId, setOpenId] = useState(null)
  const [msg,    setMsg]    = useState('')

  useEffect(() => {
    loadRaces().then(setRaces).catch(e => { setRaces([]); setMsg('Ошибка: ' + e.message) })
    // Модули (включая про и черновики) с суммой XP их уроков
    ;(async () => {
      try {
        const cur = await loadCurricula()
        const allLessonIds = [...new Set(cur.flatMap(c => c.lesson_ids ?? []))]
        const withXp = await fetchRaceLessons(allLessonIds)
        const xpById = new Map(withXp.map(l => [l.id, l.xp]))
        setMods(cur.map(c => {
          const ids = c.lesson_ids ?? []
          return {
            id: c.id, title: c.title, count: ids.length, isPro: !!c.is_pro,
            xp: ids.reduce((s, id) => s + (xpById.get(id) ?? 0), 0),
          }
        }))
      } catch { /* список просто останется пустым */ }
    })()
  }, [])

  const modById = id => mods.find(m => m.id === id)
  const patch = (id, p) => setRaces(rs => rs.map(r => (r.id === id ? { ...r, ...p } : r)))

  async function persist(r) {
    setMsg('Сохранение...')
    const { error } = await saveRace({
      id: r.id, title: r.title, description: r.description,
      race_module_id: r.race_module_id || null,
      prep_module_ids: r.prep_module_ids ?? [],
      starts_at: r.starts_at, ends_at: r.ends_at,
    })
    setMsg(error ? 'Не сохранилось: ' + error : '✓ Сохранено')
    if (!error) notifyRaceChanged()
  }

  async function add() {
    const { race, error } = await saveRace({ title: 'Новая гонка', prep_module_ids: [], ...nextWeekend() })
    if (error) { setMsg('Ошибка: ' + error); return }
    setRaces(rs => [race, ...rs])
    setOpenId(race.id)
  }

  async function remove(r) {
    if (!window.confirm(`Удалить гонку «${r.title}»?`)) return
    setRaces(rs => rs.filter(x => x.id !== r.id))
    if (await deleteRace(r.id)) {
      notifyRaceChanged()
    } else {
      setMsg('Не удалилось — обнови страницу')
    }
  }

  function movePrep(r, i, dir) {
    const ids = [...(r.prep_module_ids ?? [])]
    const j = i + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    patch(r.id, { prep_module_ids: ids })
  }

  if (races === null) return <div className="anHint">Загрузка гонок...</div>

  return (
    <div className="aptWrap">
      <h3 className="anTitle">Супергонки</h3>
      {races.map(r => {
        const prepIds = r.prep_module_ids ?? []
        const totalXp = prepIds.reduce((s, id) => s + (modById(id)?.xp ?? 0), 0)
        // Задания — обычные модули; супер-урок — только про-модули
        const freeMods = mods.filter(m => !m.isPro && !prepIds.includes(m.id))
        const proMods  = mods.filter(m => m.isPro)
        return (
          <div key={r.id} className="aptRow">
            <div className="aptHead">
              <button className="aptName" onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                {r.title || 'Без темы'}
                <span className="aptTrig">
                  {r.starts_at ? new Date(r.starts_at).toLocaleDateString('ru') : 'без даты'}
                  {r.results_published ? ' · итоги подведены' : ''}
                </span>
              </button>
              <button className="amDel" onClick={() => remove(r)} title="Удалить гонку">✕</button>
            </div>

            {openId === r.id && (
              <div className="aptEdit">
                <label className="anField">Тема (жизненная ситуация)
                  <input value={r.title ?? ''} maxLength={80}
                    onChange={e => patch(r.id, { title: e.target.value })} />
                </label>
                <label className="anField">Описание для страницы гонки
                  <textarea rows={2} value={r.description ?? ''} maxLength={300}
                    onChange={e => patch(r.id, { description: e.target.value })} />
                </label>

                <div className="anField">Супер-урок гонки (про-модуль, XP — после итогов)
                  <AdminRacePicker
                    value={r.race_module_id}
                    placeholder="— не выбран (создай про-модуль во вкладке «Модули») —"
                    options={proMods.map(m => ({
                      id: m.id, label: m.title, hint: `${m.count} ур. · ${m.xp} XP`,
                    }))}
                    onPick={id => patch(r.id, { race_module_id: id })}
                  />
                </div>

                <div className="anField">Старт (суббота) — {fmtHuman(r.starts_at)}
                  <input type="datetime-local" style={{ colorScheme: 'dark' }} value={toLocal(r.starts_at)}
                    onChange={e => patch(r.id, { starts_at: fromLocal(e.target.value) })} />
                </div>
                <div className="anField">Конец (воскресенье) — {fmtHuman(r.ends_at)}
                  <input type="datetime-local" style={{ colorScheme: 'dark' }} value={toLocal(r.ends_at)}
                    onChange={e => patch(r.id, { ends_at: fromLocal(e.target.value) })} />
                </div>

                <div className="anField">
                  Задания — модули · всего {totalXp} XP · порог открытия {Math.ceil(totalXp * 0.8)} XP (80%)
                  {prepIds.map((id, i) => (
                    <div key={id} className="arPrepRow">
                      <span className="arPrepNum">{i + 1}</span>
                      <span className="arPrepTitle">
                        {modById(id)?.title ?? id}
                        <span className="arPrepCount"> · {modById(id)?.count ?? '?'} ур.</span>
                      </span>
                      <span className="arPrepXp">{modById(id)?.xp ?? 0} XP</span>
                      <button onClick={() => movePrep(r, i, -1)} disabled={i === 0}>↑</button>
                      <button onClick={() => movePrep(r, i, 1)} disabled={i === prepIds.length - 1}>↓</button>
                      <button className="amDel" onClick={() => patch(r.id, { prep_module_ids: prepIds.filter(x => x !== id) })}>✕</button>
                    </div>
                  ))}
                  <AdminRacePicker
                    value={null}
                    placeholder="+ Добавить модуль..."
                    options={freeMods.map(m => ({ id: m.id, label: m.title, hint: `${m.count} ур. · ${m.xp} XP` }))}
                    onPick={id => patch(r.id, { prep_module_ids: [...prepIds, id] })}
                  />
                </div>

                <div className="aptBtns">
                  <button className="primaryBtn" onClick={() => persist(r)}>Сохранить гонку</button>
                </div>
              </div>
            )}
          </div>
        )
      })}
      <button className="aptAdd" onClick={add}>+ Новая гонка</button>
      {msg && <div className="anResult">{msg}</div>}
    </div>
  )
}

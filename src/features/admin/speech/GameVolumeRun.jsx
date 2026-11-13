import { useEffect, useRef, useState } from 'react'
import { buildPlan, runIteration, saveSettings, restoreSettings, answerLine, summaryText, QUESTIONS } from '../../../shared/lib/gameVolumeRun.js'
import { loadRun, saveRun, clearRun } from '../../../shared/lib/gameVolumeRunStore.js'
import { gameJournal } from '../../../shared/lib/gameJournal.js'
import { APP_VERSION } from '../../../shared/lib/version.js'
import { pLog } from '../../../shared/lib/debug.js'
import { saveDebugFile, SAVE_HOW } from '../../player/modules/rotate-phone/wordLaneDebugExport.js'
import { loadPit } from './gameVolumePit.js'
import { shutGameMic } from '../../../shared/lib/gameMic.js'
import { startCapture } from '../../pillstand/voiceset/voiceSetCapture.js'

// Админ → «Голос» → «Стенд громкости» → «Прогон громкости» (v3.3.204): тест сам повторяет старт игры по кругу в разных режимах, подсказывает, что нажать, и спрашивает, что видел и слышал.
// Режимы скрыты (оценка вслепую), в журнале и в итоговом файле они подписаны. Настройки владельца на время прогона меняются и в конце возвращаются. Логика — gameVolumeRun.js.
// v3.3.205: прогон переживает сворачивание (iPhone выгружает страницу, пока человек сравнивает звук в Telegram): после каждого шага состояние в хранилище (gameVolumeRunStore.js); заход, который
// свернули посреди речи, не засчитывается и предлагается заново; у ответов есть комментарий и сравнение с Telegram; «Дальше» яркая, когда можно идти.
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const PLAN = buildPlan()

function restored() { // состояние из хранилища → начальные значения (или null)
  const s = loadRun()
  if (!s || s.idx < 0 || s.idx >= PLAN.length) return null
  return { run: { plan: PLAN, idx: Math.min(s.idx, PLAN.length - 1), orig: s.orig, from: gameJournal.size(), base: s.lines }, res: s.results.map(r => ({ item: PLAN[r.n - 1], answers: r.answers, ok: r.ok })).filter(r => r.item), done: !!s.done }
}

export default function GameVolumeRun() {
  const [init] = useState(restored)
  const [pit, setPit] = useState(undefined)   // undefined — грузится, null — нет озвучки (будет тон)
  const [run, setRun] = useState(init?.run ?? null) // { plan, idx, orig, from, base }
  const [phase, setPhase] = useState(init ? (init.done ? 'done' : 'ready') : 'idle') // idle | ready | play | ask | done
  const [prompt, setPrompt] = useState(false)
  const [res, setRes] = useState(init?.res ?? [])
  const [last, setLast] = useState(null)      // результат прогона текущей итерации
  const [ans, setAns] = useState({})
  const [note, setNote] = useState(init ? `Прогон восстановлен: ${init.done ? 'все заходы пройдены' : `продолжаем с захода ${init.run.idx + 1} из ${PLAN.length}`}. Можно сворачивать между заходами.` : '')
  const hidden = useRef(false)
  useEffect(() => { let off = false; loadPit().then(p => { if (!off) setPit(p) }).catch(() => { if (!off) setPit(null) }); return () => { off = true } }, [])
  useEffect(() => { // свернули посреди захода — звук оборвался, ответ не засчитываем
    const f = () => { if (globalThis.document?.visibilityState === 'hidden') hidden.current = true }
    globalThis.document?.addEventListener?.('visibilitychange', f)
    return () => globalThis.document?.removeEventListener?.('visibilitychange', f)
  }, [])
  const item = run?.plan[run.idx]
  const lines = r => [...(r.base ?? []), ...gameJournal.lines().slice(r.from)]
  const keep = (r, results, done = false) => saveRun({ idx: r.idx, orig: r.orig, results, lines: lines(r), done })

  const begin = () => {
    const orig = saveSettings()
    pLog(`[прогон] старт: ${PLAN.length} заходов, настройки до прогона ${JSON.stringify(orig)}, голос ${pit?.buffer ? 'Пита' : 'тон'}, версия ${APP_VERSION}`)
    const r = { plan: PLAN, idx: 0, orig, from: gameJournal.size(), base: [] }
    setRun(r); setRes([]); setAns({}); setNote(''); setPhase('ready'); keep(r, [])
  }
  const play = () => { // жест: runIteration первым делом открывает микрофон
    hidden.current = false
    setPhase('play'); setPrompt(false); setAns({}); setNote('')
    runIteration(item, { buffer: pit?.buffer ?? null, onPrompt: () => setPrompt(true), capture: startCapture }).then(r => {
      setPrompt(false)
      if (hidden.current) { pLog(`[прогон] #${item.n}/${item.of}: приложение свернули во время захода — заход не засчитан, повтор`); setNote('Приложение свернули во время захода — он не засчитан. Нажми «Старт» ещё раз.'); setPhase('ready'); return }
      setLast(r); setPhase('ask')
    })
  }
  const answered = !!item && QUESTIONS[item.mode].every(([k]) => ans[k])
  const next = () => {
    pLog(answerLine(item, ans))
    const results = [...res, { item, answers: ans, ok: last?.ok !== false }]
    setRes(results)
    if (run.idx + 1 >= run.plan.length) { restoreSettings(run.orig); shutGameMic('конец прогона'); pLog('[прогон] конец, настройки возвращены'); keep(run, results, true); setPhase('done'); return }
    const r = { ...run, idx: run.idx + 1 }
    setRun(r); setPhase('ready'); keep(r, results)
  }
  const cancel = () => { if (run) restoreSettings(run.orig); shutGameMic('прогон прерван'); pLog('[прогон] прерван, настройки возвращены'); clearRun(); setRun(null); setPhase('idle'); setNote('Прогон прерван, настройки возвращены') }
  const again = () => { clearRun(); setRun(null); setRes([]); setPhase('idle'); setNote('') }
  const send = async () => {
    const header = ['Pithy — прогон громкости', `версия ${APP_VERSION}`, `устройство: ${globalThis.navigator?.userAgent ?? '—'}`, `настройки до прогона: ${JSON.stringify(run.orig)}`, `голос: ${pit?.buffer ? 'Пита (race_start)' : 'тест-тон'}`, `время: ${new Date().toISOString()}`]
    const text = summaryText({ results: res, header, journal: lines(run) })
    const name = `pithy-volume-run-${stamp()}.txt`
    const how = await saveDebugFile({ name, blob: new File([text], name, { type: 'text/plain' }) })
    setNote(`${SAVE_HOW[how] ?? how}: ${name}`)
  }
  const pick = (k, v) => setAns(a => ({ ...a, [k]: v }))

  return (
    <div data-testid="game-volume-run">
      <h4 className="aspH">Прогон громкости ({PLAN.length} заходов, ≈ {Math.ceil(PLAN.length * 0.5)} минут)</h4>
      <p className="aspHint">Тест сам повторяет старт игры в разных режимах (какие — не показывает, чтобы оценка была честной). Поставь громкость телефона на ≈ 35 % и не трогай, пока тест не попросит. Заходы 1–{PLAN.length / 2} «слушаю» (громкость, хруст, сравнение с Telegram), {PLAN.length / 2 + 1}–{PLAN.length} «иконка» (в середине речи нажать ▲, посмотреть иконку, нажать ▼). Между заходами приложение можно сворачивать (например, послушать начало Пита в Telegram: кнопка «Отправить: начало Пита» чуть ниже): прогон сохраняется. Если свернуть посреди захода — он не засчитается, повтори его. После Telegram звук игры может стать громче — это нормально, напиши в комментарии.{PLAN.some(p => p.cfg.media) ? ' В части заходов в фоне играет тихий шум в <audio> — имитация «звука из ленты».' : ''} В конце «Отправить итог» — один файл с ответами и журналом.</p>
      {phase === 'idle' && <div className="aspRow"><button type="button" className="aspChip aspChipGo" disabled={pit === undefined} onClick={begin} data-testid="run-begin">{pit === undefined ? 'Загружаю голос Пита…' : pit ? '▶ Начать прогон' : '▶ Начать прогон (озвучки нет — будет тон)'}</button></div>}
      {item && phase !== 'idle' && phase !== 'done' && <div className="aspCapVal" data-testid="run-step"><b>Заход {item.n} из {item.of}</b> — {item.mode === 'icon' ? 'иконка: в середине речи нажми ▲ громкости, посмотри на иконку, потом ▼' : 'слушаю: кнопки громкости не трогай'}</div>}
      {phase === 'ready' && <div className="aspRow"><button type="button" className="aspChip aspChipGo" onClick={play} data-testid="run-play">▶ Заход {item.n}: старт</button></div>}
      {phase === 'play' && <div className="aspCapVal" data-testid="run-playing">{prompt ? '👉 СЕЙЧАС: нажми ▲ громкости, посмотри на иконку в полоске, потом ▼' : 'Играет… слушай'}</div>}
      {phase === 'ask' && (
        <div data-testid="run-ask">
          {QUESTIONS[item.mode].map(([k, t, opts]) => (
            <div key={k} className="aspRow"><span className="aspCapVal">{t}</span>
              {opts.map(o => <button key={o} type="button" className={`aspChip${ans[k] === o ? ' aspChipOn' : ''}`} aria-pressed={ans[k] === o} onClick={() => pick(k, o)}>{o}</button>)}
            </div>
          ))}
          <div className="aspRow"><input className="aspInput aspNote" type="text" placeholder="Комментарий (необязательно): что ещё заметил" value={ans.note ?? ''} onChange={e => pick('note', e.target.value)} data-testid="run-comment" /></div>
          <div className="aspRow"><button type="button" className="aspChip aspChipGo" disabled={!answered} onClick={next} data-testid="run-next">{answered ? 'Дальше →' : 'Дальше → (ответь на вопросы выше)'}</button></div>
        </div>
      )}
      {phase === 'done' && <div className="aspRow"><span className="aspCapVal">Готово: {res.length} ответов. Настройки возвращены.</span><button type="button" className="aspChip aspChipGo" onClick={send} data-testid="run-send">📤 Отправить итог</button><button type="button" className="aspChip" onClick={again}>Сначала</button></div>}
      {run && phase !== 'idle' && phase !== 'done' && <div className="aspRow"><button type="button" className="aspChip" onClick={cancel} data-testid="run-cancel">Прервать прогон</button></div>}
      {note && <div className="aspCapVal" data-testid="run-note">{note}</div>}
    </div>
  )
}

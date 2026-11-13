import { useEffect, useState } from 'react'
import { buildPlan, runIteration, saveSettings, restoreSettings, answerLine, summaryText, QUESTIONS } from '../../../shared/lib/gameVolumeRun.js'
import { gameJournal } from '../../../shared/lib/gameJournal.js'
import { APP_VERSION } from '../../../shared/lib/version.js'
import { pLog } from '../../../shared/lib/debug.js'
import { saveDebugFile, SAVE_HOW } from '../../player/modules/rotate-phone/wordLaneDebugExport.js'
import { loadPit } from './gameVolumePit.js'

// Админ → «Голос» → «Стенд громкости» → «Прогон громкости» (v3.3.204): тест сам повторяет старт игры по кругу в разных режимах, подсказывает, что нажать, и спрашивает, что видел и слышал.
// Режимы скрыты (оценка вслепую), в журнале и в итоговом файле они подписаны. Настройки владельца на время прогона меняются и в конце возвращаются. Логика — gameVolumeRun.js.
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

export default function GameVolumeRun() {
  const [pit, setPit] = useState(undefined)   // undefined — грузится, null — нет озвучки (будет тон)
  const [run, setRun] = useState(null)        // { plan, idx, orig, from }
  const [phase, setPhase] = useState('idle')  // idle | ready | play | ask | done
  const [prompt, setPrompt] = useState(false)
  const [res, setRes] = useState([])
  const [last, setLast] = useState(null)      // результат прогона текущей итерации
  const [ans, setAns] = useState({})
  const [note, setNote] = useState('')
  useEffect(() => { let off = false; loadPit().then(p => { if (!off) setPit(p) }).catch(() => { if (!off) setPit(null) }); return () => { off = true } }, [])
  const item = run?.plan[run.idx]

  const begin = () => {
    const plan = buildPlan(), orig = saveSettings()
    pLog(`[прогон] старт: ${plan.length} итераций, настройки до прогона ${JSON.stringify(orig)}, голос ${pit?.buffer ? 'Пита' : 'тон'}, версия ${APP_VERSION}`)
    setRun({ plan, idx: 0, orig, from: gameJournal.size() }); setRes([]); setAns({}); setNote(''); setPhase('ready')
  }
  const play = () => { // жест: runIteration первым делом открывает микрофон
    setPhase('play'); setPrompt(false); setAns({})
    runIteration(item, { buffer: pit?.buffer ?? null, onPrompt: () => setPrompt(true) }).then(r => { setLast(r); setPrompt(false); setPhase('ask') })
  }
  const answered = !!item && QUESTIONS[item.mode].every(([k]) => ans[k])
  const next = () => {
    pLog(answerLine(item, ans))
    setRes(r => [...r, { item, answers: ans, ok: last?.ok !== false, run: last }])
    if (run.idx + 1 >= run.plan.length) { restoreSettings(run.orig); pLog('[прогон] конец, настройки возвращены'); setPhase('done'); return }
    setRun({ ...run, idx: run.idx + 1 }); setPhase('ready')
  }
  const cancel = () => { if (run) restoreSettings(run.orig); pLog('[прогон] прерван, настройки возвращены'); setRun(null); setPhase('idle'); setNote('Прогон прерван, настройки возвращены') }
  const send = async () => {
    const header = ['Pithy — прогон громкости', `версия ${APP_VERSION}`, `устройство: ${globalThis.navigator?.userAgent ?? '—'}`, `настройки до прогона: ${JSON.stringify(run.orig)}`, `голос: ${pit?.buffer ? 'Пита (race_start)' : 'тест-тон'}`, `время: ${new Date().toISOString()}`]
    const text = summaryText({ results: res, header, journal: gameJournal.lines().slice(run.from) })
    const name = `pithy-volume-run-${stamp()}.txt`
    const how = await saveDebugFile({ name, blob: new File([text], name, { type: 'text/plain' }) })
    setNote(`${SAVE_HOW[how] ?? how}: ${name}`)
  }
  const pick = (k, v) => setAns(a => ({ ...a, [k]: v }))

  return (
    <div data-testid="game-volume-run">
      <h4 className="aspH">Прогон громкости (12 заходов, ≈ 6 минут)</h4>
      <p className="aspHint">Тест сам повторяет старт игры в разных режимах (какие — не показывает, чтобы оценка была честной). Поставь громкость телефона на ≈ 35 % и не трогай, пока тест не попросит. Зайди 1–6 «слушаю» (оцени громкость и хруст), 7–12 «иконка» (в середине речи нажать ▲, посмотреть иконку, нажать ▼). В конце «Отправить итог» — один файл с ответами и журналом.</p>
      {phase === 'idle' && <div className="aspRow"><button type="button" className="aspChip aspChipOn" disabled={pit === undefined} onClick={begin} data-testid="run-begin">{pit === undefined ? 'Загружаю голос Пита…' : pit ? '▶ Начать прогон' : '▶ Начать прогон (озвучки нет — будет тон)'}</button></div>}
      {item && phase !== 'idle' && phase !== 'done' && <div className="aspCapVal" data-testid="run-step"><b>Заход {item.n} из {item.of}</b> — {item.mode === 'icon' ? 'иконка: в середине речи нажми ▲ громкости, посмотри на иконку, потом ▼' : 'слушаю: кнопки громкости не трогай'}</div>}
      {phase === 'ready' && <div className="aspRow"><button type="button" className="aspChip aspChipOn" onClick={play} data-testid="run-play">▶ Заход {item.n}: старт</button></div>}
      {phase === 'play' && <div className="aspCapVal" data-testid="run-playing">{prompt ? '👉 СЕЙЧАС: нажми ▲ громкости, посмотри на иконку в полоске, потом ▼' : 'Играет… слушай'}</div>}
      {phase === 'ask' && (
        <div data-testid="run-ask">
          {QUESTIONS[item.mode].map(([k, t, opts]) => (
            <div key={k} className="aspRow"><span className="aspCapVal">{t}</span>
              {opts.map(o => <button key={o} type="button" className={`aspChip${ans[k] === o ? ' aspChipOn' : ''}`} aria-pressed={ans[k] === o} onClick={() => pick(k, o)}>{o}</button>)}
            </div>
          ))}
          <div className="aspRow"><button type="button" className="aspChip aspChipOn" disabled={!answered} onClick={next} data-testid="run-next">Дальше →</button></div>
        </div>
      )}
      {phase === 'done' && <div className="aspRow"><span className="aspCapVal">Готово: {res.length} ответов. Настройки возвращены.</span><button type="button" className="aspChip aspChipOn" onClick={send} data-testid="run-send">📤 Отправить итог</button><button type="button" className="aspChip" onClick={() => { setRun(null); setPhase('idle') }}>Сначала</button></div>}
      {run && phase !== 'idle' && phase !== 'done' && <div className="aspRow"><button type="button" className="aspChip" onClick={cancel} data-testid="run-cancel">Прервать прогон</button></div>}
      {note && <div className="aspCapVal" data-testid="run-note">{note}</div>}
    </div>
  )
}

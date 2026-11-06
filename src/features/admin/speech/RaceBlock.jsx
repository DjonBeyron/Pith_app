import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { flushSync } from 'react-dom'
import RotatePhoneModule from '../../player/modules/rotate-phone/RotatePhoneModule.jsx'
import { saveDebugFile, SAVE_HOW } from '../../player/modules/rotate-phone/wordLaneDebugExport.js'
import { readTapMode, writeTapMode } from '../../player/modules/rotate-phone/wordLaneHudSettings.js'
import { FIXTURES, FIXTURE_IDS } from '../../rehearsal/rehearsalFixtures.js'
import { loadRehearsalForm, saveRehearsalForm, subscribeRehearsalForm, parsePlanJson, fixtureJson } from '../../rehearsal/rehearsalTestForm.js'
import { RACE_LINES } from '../../pitrace/raceLines.js'
import { RACE_ROUNDS, RACE_TITLES, STAGES_ROUND } from '../../pitrace/raceOnly.js'
import { raceTexts } from '../../pitrace/raceTexts.js'
import { extrasOf } from '../../pitrace/raceWords.js'
import { raceDebugFile } from '../../pitrace/raceLog.js'
import PolishSettings from './PolishSettings.jsx'
import RuModelAddress from './RuModelAddress.jsx'
import VoskReadyNotice from '../../../shared/ui/VoskReadyNotice.jsx'
import { useVoskReady } from '../../../shared/lib/vosk/useVoskReady.js'
import usePolishOpen from './usePolishOpen.js'
import usePolishVoice from './usePolishVoice.js'
import useTransVoice from './useTransVoice.js'
import { whyNotIdle } from './launchWhy.js'
import '../../../styles/admin-rehearsal-polish.css'
import '../../../styles/admin-race-ask.css'

// Админ → «Голос» → «Встряхни память (стенд)» (САМЫЙ ВЕРХ вкладки, над «Шлифовкой репетиции»; прежнее имя «Гонка с Питом»): проверка новой игры на движке репетиции (CONCEPT_RACE.md, src/features/pitrace/). Раскладка на 375 px: крупная кнопка «Вспомни на слух + финал» (актуальный режим),
// под ней «Полная гонка», проходы, вершина, спуск и «Скачать отладку», под кнопками — статус русской модели слуха для прохода B (VoskReadyNotice, кнопка «Скачать»; без неё проход B идёт тапом), ниже сворачиваемый раздел «Настройки» (по умолчанию свёрнут, состояние — usePolishOpen): фикстура плана (общая форма с «Шлифовкой репетиции» и «Тестом игры», rehearsalTestForm.js),
// статус и кнопки озвучки реплик race_* (usePolishVoice → rehearsalVoice.voiceMissingPitLines с набором RACE_LINES), кусков фразы и переводов слов, «Тап вместо речи» (общий флаг игры pithy_wl_tap_v1).
// Любая кнопка запуска только ОТКРЫВАЕТ сцену игры на весь экран с попапом «Говорю / Тапаю» (pitrace/RaceAskPlate.jsx, внутри RotatePhoneModule): пока человек не ответил, ничего не стартует; ответ — свежий жест, в нём же startGameAudio
// (микрофон, звук). План с game: 'race' и round (raceOnly.js); один модуль игры на блок (RotatePhoneModule bare forceDebug startRef). «Скачать отладку» — журнал плеера, строки гонки помечены «[race]». Память и XP пишутся в симуляцию (sessionStorage), на сервер ничего не уходит.
const SETTINGS_ID = 'race-settings'

export default function RaceBlock({ save = saveDebugFile }) {
  const [rform, setRform] = useState(loadRehearsalForm)
  useEffect(() => subscribeRehearsalForm(setRform), []) // фикстуру правят и в «Шлифовке репетиции» — форма общая
  const [round, setRound] = useState(null)               // с каким раундом собрана нода игры (null — вся гонка)
  const [tap, setTap] = useState(readTapMode)
  const [note, setNote] = useState('')
  const [status, setStatus] = useState({ phase: 'wait', busy: false, ready: false, problem: '' })
  const startRef = useRef(null)
  const ru = useVoskReady({ lang: 'ru', hold: false }) // русская модель Vosk (проход B «назови перевод»): скачана ли; в память её грузит игра перед проходом

  const { plan, error } = useMemo(() => parsePlanJson(rform.json), [rform.json])
  const racePlan = useMemo(() => (plan ? { ...plan, game: 'race', round: round ?? undefined, extraWords: extrasOf(plan) } : null), [plan, round])
  const node = useMemo(() => ({ id: 'race-stand', type: 'rotate_phone', isHistory: false, typeData: { rotate_phone: { plan: racePlan } } }), [racePlan])
  const voice = usePolishVoice({ plan: racePlan, list: RACE_LINES, texts: raceTexts })
  const trans = useTransVoice({ plan: racePlan }) // переводы слов разгона: Пит говорит их голосом перед пилюлей
  const { isOpen, toggle } = usePolishOpen()
  const playing = status.phase === 'game'
  const idle = !playing && !status.busy && status.ready
  const working = !!voice.busy || trans.busy
  const linesAll = voice.pit.done >= voice.pit.total
  const chunksAll = voice.chunks.done >= voice.chunks.total
  const transAll = trans.done >= trans.total

  const launch = useCallback(id => { flushSync(() => setRound(id)); startRef.current?.() }, []) // нода обновляется синхронно, чтобы start() взял план раунда и открыл сцену с попапом (полный экран — из этого тапа)
  const pickFixture = fixture => { const next = { ...rform, fixture, json: fixtureJson(fixture) }; setRform(next); saveRehearsalForm(next) }
  const flip = on => { setTap(on); writeTapMode(on) }
  async function exportLog() { setNote(SAVE_HOW[await save(raceDebugFile())] ?? SAVE_HOW.failed) }
  const summary = `${FIXTURES[rform.fixture]?.title ?? ''} · реплики ${voice.lines ? `${voice.pit.done}/${voice.pit.total}` : '…'} · тап: ${tap ? 'вкл' : 'выкл'}`

  return (
    <section className="aspBlock rhpBlock" data-testid="race-block">
      <h3 className="aspH">Встряхни память (стенд)</h3>
      <button type="button" className="aspSay rhpBig" onClick={() => launch(STAGES_ROUND)} disabled={!idle || !racePlan} data-testid="race-run-stages">{RACE_TITLES[STAGES_ROUND]}</button>
      <div className="rhpVoiceRow">
        <button type="button" className="aspChip" onClick={() => launch(null)} disabled={!idle || !racePlan} data-testid="race-run-full">Полная гонка</button>
        {RACE_ROUNDS.map(r => <button key={r} type="button" className="aspChip" onClick={() => launch(r)} disabled={!idle || !racePlan} data-testid={`race-run-${r}`}>{RACE_TITLES[r]}</button>)}
        <button type="button" className="aspChip" onClick={exportLog} data-testid="race-export">Скачать отладку</button>
      </div>
      {ru.status === 'ready' ? <p className="rhpHint" data-testid="race-ru-ready">Русская модель слуха скачана: проход B идёт голосом</p> : <><VoskReadyNotice vosk={ru} /><p className="rhpHint" data-testid="race-ru-need">Без русской модели проход B идёт тапом по трём пилюлям</p></>}
      {!idle && !playing && <p className="rhpHint" role="status" data-testid="race-why">{whyNotIdle(status)}</p>}
      {status.warm && <p className="rhpHint" role="status" data-testid="race-warm">{status.warm}</p>}
      {note && <p className="rhpHint" role="status" data-testid="race-note">{note}</p>}
      {status.problem && <p className="aspErr" role="alert" data-testid="race-problem">{status.problem}</p>}
      {error && <p className="aspErr" role="alert" data-testid="race-error">{error}</p>}
      <PolishSettings open={isOpen(SETTINGS_ID)} onToggle={() => toggle(SETTINGS_ID)} summary={summary} testid="race-settings">
        <p className="rhpHint">Один этап «Вспомни на слух» из двух проходов (скажи слово по переводу, назови перевод) и финал; в «Полной гонке» после него вершина и спуск. Память и XP — в симуляции.</p>
        <label className="aspLabel">Фраза (фикстура плана)
          <select className="aspInput" value={rform.fixture} disabled={playing} onChange={e => pickFixture(e.target.value)} data-testid="race-fixture">
            {FIXTURE_IDS.map(id => <option key={id} value={id}>{FIXTURES[id].title}</option>)}
          </select>
        </label>
        <div className="rhpVoice">
          <div className="rhpVoiceRow">
            <span data-testid="race-lines-status">Реплики Пита race_*: {voice.lines ? `озвучено ${voice.pit.done} из ${voice.pit.total}` : 'загружаю…'}</span>
            <button type="button" className="aspChip" onClick={voice.voicePit} disabled={playing || working || !voice.lines || linesAll} data-testid="race-voice-lines">{voice.busy === 'lines' ? 'Озвучиваю…' : linesAll ? 'Реплики озвучены' : 'Озвучить реплики (ElevenLabs)'}</button>
          </div>
          <div className="rhpVoiceRow">
            <span data-testid="race-chunks-status">Куски и слова фразы: озвучено {voice.chunks.done} из {voice.chunks.total}</span>
            <button type="button" className="aspChip" onClick={voice.voiceChunks} disabled={playing || working || !racePlan || chunksAll} data-testid="race-voice-chunks">{voice.busy === 'chunks' ? 'Озвучиваю…' : chunksAll ? 'Куски озвучены' : 'Озвучить куски фразы'}</button>
          </div>
          <div className="rhpVoiceRow">
            <span data-testid="race-trans-status">Переводы слов (русский голос Пита): озвучено {trans.done} из {trans.total}</span>
            <button type="button" className="aspChip" onClick={trans.voice} disabled={playing || working || !racePlan || transAll} data-testid="race-voice-trans">{trans.busy ? 'Озвучиваю…' : transAll ? 'Переводы озвучены' : 'Озвучить переводы (ElevenLabs)'}</button>
          </div>
          {trans.busy && trans.step && <div className="aspHint" role="status">озвучиваю {trans.step}…</div>}
          {Object.keys(trans.errors).length > 0 && <p className="aspErr" role="alert" data-testid="race-trans-error">Не озвучилось: {Object.entries(trans.errors).map(([k, e]) => `${k} (${e})`).join('; ')}. Нужны права админа и доступ к ElevenLabs.</p>}
          {working && voice.step && <div className="aspHint" role="status">озвучиваю {voice.step}…</div>}
          {voice.error && <p className="aspErr" role="alert" data-testid="race-voice-error">Не озвучилось: {voice.error}. Нужны права админа и доступ к ElevenLabs.</p>}
        </div>
        <RuModelAddress locked={playing} />
        <label className="aspLabelInline"><input type="checkbox" checked={tap} onChange={e => flip(e.target.checked)} disabled={playing} data-testid="race-tap-mode" /> Тап вместо речи (тап по дорожке засчитывает слово; флаг общий с игрой, перед стартом его выставляет плашка «Голосом / Пальцами»)</label>
      </PolishSettings>
      {racePlan && <RotatePhoneModule linesRev={voice.rev} node={node} bare forceDebug startRef={startRef} onStatus={setStatus} onTap={setTap} />}
    </section>
  )
}

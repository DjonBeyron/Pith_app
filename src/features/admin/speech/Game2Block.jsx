import { useState } from 'react'
import { FIXTURES, FIXTURE_IDS, DEFAULT_FIXTURE } from '../../rehearsal/rehearsalFixtures.js'
import { saveDebugFile, SAVE_HOW } from '../../player/modules/rotate-phone/wordLaneDebugExport.js'
import { readTapMode, writeTapMode } from '../../player/modules/rotate-phone/wordLaneHudSettings.js'
import RotateTapHint from '../../player/modules/rotate-phone/RotateTapHint.jsx'
import WordLaneWarmBar from '../../player/modules/rotate-phone/WordLaneWarmBar.jsx'
import { useWarmProgress } from '../../player/modules/rotate-phone/useWarmProgress.js'
import VoskReadyNotice from '../../../shared/ui/VoskReadyNotice.jsx'
import { useVoskReady } from '../../../shared/lib/vosk/useVoskReady.js'
import Game2Stage from '../../game2/Game2Stage.jsx'
import useGame2Setup from '../../game2/useGame2Setup.js'
import useGame2Launch from '../../game2/useGame2Launch.js'
import { game2Cfg } from '../../game2/game2Cfg.js'
import { game2DebugFile } from '../../game2/game2Log.js'
import '../../../styles/admin-rehearsal-polish.css'
import '../../../styles/admin-game2-howto.css'
import Game2Howto from '../../game2/Game2Howto.jsx'

// Админ → «Голос» → «Мини-игра 2.0 (стенд)» (под «Шлифовкой репетиции»): проверка новой механики — одна лента времени вместо трёх дорожек (CONCEPT_GAME2.md, src/features/game2/).
// Фикстура плана (rehearsalFixtures.js) — какая фраза; «Озвучить фразу (ElevenLabs)» — озвучка ЦЕЛОЙ фразы с таймингами слов (нет её — лента идёт на оценке таймингов, подпись «фраза не озвучена»);
// реплики Пита rh2_* озвучиваются тем же путём, что реплики репетиции; «Тап вместо речи» — общий флаг pithy_wl_tap_v1 (как в игре). «Запустить» — жест: микрофон, звук, полный экран (useGame2Launch.js).
// Память и XP не пишутся. «Скачать отладку» — общий журнал плеера (строки «[game2] …»), как у шлифовки.
export default function Game2Block({ save = saveDebugFile }) {
  const [fixture, setFixture] = useState(DEFAULT_FIXTURE)
  const [tap, setTap] = useState(readTapMode)
  const [note, setNote] = useState('')
  const s = useGame2Setup({ fixture })
  const vosk = useVoskReady({ why: 'lesson' })
  const g = useGame2Launch({ lines: s.lines, phrase: s.phrase, ready: vosk.status === 'ready' })
  const wp = useWarmProgress(game2Cfg(), s.lines ?? {}, !!s.lines)
  const playing = g.phase === 'game'
  const working = !!s.busy
  const linesAll = s.lineCount.done >= s.lineCount.total
  const label = g.busy ? '…' : !wp.open && s.lines ? wp.label : 'Запустить'
  const flip = on => { setTap(on); writeTapMode(on) }
  async function exportLog() { setNote(SAVE_HOW[await save(game2DebugFile())] ?? SAVE_HOW.failed) }

  return (
    <section className="aspBlock rhpBlock" data-testid="g2-block">
      <h3 className="aspH">Мини-игра 2.0 (стенд)</h3>
      <p className="rhpHint">Одна лента времени: слушаю, ловлю, тень, по памяти, скорость. Без памяти и XP.</p>
      <Game2Howto />
      <label className="aspLabel">Фраза (фикстура плана)
        <select className="aspInput" value={fixture} disabled={playing || g.busy} onChange={e => setFixture(e.target.value)} data-testid="g2-fixture">
          {FIXTURE_IDS.map(id => <option key={id} value={id}>{FIXTURES[id].title}</option>)}
        </select>
      </label>
      <div className="rhpVoice">
        <div className="rhpVoiceRow">
          <span data-testid="g2-phrase-status">«{s.text}» — {s.phrase ? `фраза озвучена (слов с таймингами: ${s.phrase.words.length})` : 'фраза не озвучена: лента на оценке таймингов'}</span>
          <button type="button" className="aspChip" onClick={s.voicePhrase} disabled={playing || working} data-testid="g2-voice-phrase">{s.busy === 'phrase' ? 'Озвучиваю…' : s.phrase ? 'Озвучить заново' : 'Озвучить фразу (ElevenLabs)'}</button>
        </div>
        <div className="rhpVoiceRow">
          <span data-testid="g2-lines-status">Реплики Пита rh2_*: {s.lines ? `озвучено ${s.lineCount.done} из ${s.lineCount.total}` : 'загружаю…'}</span>
          <button type="button" className="aspChip" onClick={s.voiceLines} disabled={playing || working || !s.lines || linesAll} data-testid="g2-voice-lines">{s.busy === 'lines' ? 'Озвучиваю…' : linesAll ? 'Реплики озвучены' : 'Озвучить реплики (ElevenLabs)'}</button>
        </div>
        {s.error && <p className="aspErr" role="alert" data-testid="g2-voice-error">Не озвучилось: {s.error}. Нужны права админа и доступ к ElevenLabs.</p>}
      </div>
      <label className="aspLabelInline"><input type="checkbox" checked={tap} onChange={e => flip(e.target.checked)} disabled={playing} data-testid="g2-tap-mode" /> Тап вместо речи (тап по пилюле засчитывает слово; флаг общий с игрой)</label>
      {!s.lines || wp.all ? null : <WordLaneWarmBar wp={wp} />}
      {vosk.status !== 'ready' && <VoskReadyNotice vosk={vosk} />}
      <div className="rhpVoiceRow">
        <button type="button" className="aspSay" onClick={g.launch} disabled={playing || g.busy || !s.lines || vosk.status !== 'ready'} data-testid="g2-run">{label}</button>
        <button type="button" className="aspChip" onClick={exportLog} data-testid="g2-export">Скачать отладку</button>
      </div>
      {note && <p className="rhpHint" role="status" data-testid="g2-note">{note}</p>}
      {g.problem && <p className="aspErr" role="alert" data-testid="g2-problem">{g.problem}</p>}
      {g.phase === 'tap' && <RotateTapHint onTap={g.tapped} />}
      {playing && <Game2Stage plan={s.plan} lines={s.lines} phrase={s.phrase} tapMode={tap} onExit={g.close} />}
    </section>
  )
}

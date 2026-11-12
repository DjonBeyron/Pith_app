import { useState } from 'react'
import { LAB_ROWS, playLabRow, ratingsLine } from '../../../shared/lib/gameVolumeLab.js'
import { pLog } from '../../../shared/lib/debug.js'
import { getCatLines } from '../../../shared/api/catLinesApi.js'
import { normalizeLines } from '../../player/modules/rotate-phone/wordLaneCatLines.js'
import { loadSoundBuffer } from '../../player/modules/rotate-phone/wordLaneBuffers.js'

// Админ → «Голос» → «Громкость на iPhone» → «Стенд громкости» (v3.3.197): один тест-звук в разных состояниях звука и микрофона, оценка на слух. Подробности — gameVolumeLab.js.
const PIT_ID = 'race_start' // озвучка Пита для стенда: стартовая реплика гонки (≈ 3,5 с), уже озвучена в игре
/** Голос Пита как в игре (те же байты, тот же декодер и нормализация) → { url, buffer } или null (реплика не озвучена) */
async function loadPit() {
  const url = normalizeLines(await getCatLines())?.[PIT_ID]?.url
  if (!url) return null
  const buffer = await loadSoundBuffer(`lab:${PIT_ID}`, () => fetch(url).then(r => r.arrayBuffer()))
  return { url, buffer }
}
const RATES = [['тихо', 'тихо'], ['норм', 'нормально'], ['громко', 'громко']]

export default function GameVolumeLab() {
  const [note, setNote] = useState('')
  const [ratings, setRatings] = useState({})
  const [busy, setBusy] = useState(false)
  const [pit, setPit] = useState(null)        // { url, buffer } — голос Пита, загруженный для стенда
  const [src, setSrc] = useState('tone')       // 'tone' | 'pit'
  const play = id => { // первым делом в обработчике нажатия (жест нужен для getUserMedia)
    if (busy) return
    setBusy(true); setNote(`Играет строка ${id}…`)
    playLabRow(id, src === 'pit' && pit ? { sound: pit } : {}).then(r => setNote(`Строка ${id}: ${r.ok ? 'сыграно' : 'не вышло'} — ${r.steps.join('; ')}`)).finally(() => setBusy(false))
  }
  const pickSrc = v => {
    setSrc(v)
    if (v !== 'pit' || pit) return
    setNote('Загружаю голос Пита…')
    loadPit().then(p => { if (p) { setPit(p); setNote(`Голос Пита загружен (${PIT_ID}, ${p.buffer ? Math.round(p.buffer.duration * 10) / 10 : '?'} с)`) } else { setSrc('tone'); setNote('Реплика Пита не озвучена или не загрузилась — остался тон') } }).catch(() => { setSrc('tone'); setNote('Не удалось загрузить голос Пита — остался тон') })
  }
  const rate = (id, v) => setRatings(r => ({ ...r, [id]: v }))
  const save = () => { const line = ratingsLine(ratings); pLog(`[audio] стенд громкости: оценки ${line}`); setNote(`Записано в журнал: ${line}`) }
  return (
    <div data-testid="game-volume-lab">
      <h4 className="aspH">Стенд громкости</h4>
      <p className="aspHint">Поставь громкость телефона на ≈ 35 % и больше её не трогай. Играй строки по очереди: тест-звук один и тот же, меняется только состояние звука и микрофона. Оцени каждую на слух; строка, которая тише остальных, и есть причина. Потом «Записать оценки» и пришли журнал.</p>
      <div className="aspChips" role="radiogroup" aria-label="Что играть" data-testid="lab-src">
        {[['tone', 'Тест-тон'], ['pit', 'Голос Пита (как в игре)']].map(([v, t]) => <button key={v} type="button" role="radio" aria-checked={src === v} className={`aspChip${src === v ? ' aspChipOn' : ''}`} onClick={() => pickSrc(v)} data-value={v}>{t}</button>)}
      </div>
      {LAB_ROWS.map(r => (
        <div key={r.id} className="aspRow" data-row={r.id}>
          <button type="button" className="aspChip" disabled={busy} onClick={() => play(r.id)} data-testid={`lab-play-${r.id}`}>▶ {r.id}</button>
          <span className="aspCapVal">{r.title}</span>
          {RATES.map(([v, t]) => <button key={v} type="button" className={`aspChip${ratings[r.id] === v ? ' aspChipOn' : ''}`} onClick={() => rate(r.id, v)} aria-pressed={ratings[r.id] === v}>{t}</button>)}
        </div>
      ))}
      <div className="aspRow"><button type="button" className="aspChip" onClick={save} data-testid="lab-save">Записать оценки в журнал</button></div>
      {note && <div className="aspCapVal" data-testid="lab-note">{note}</div>}
    </div>
  )
}

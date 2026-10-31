import { useState, useRef, useEffect } from 'react'
import { SFX_DEFAULT_PROMPT, SFX_DEFAULT_SECONDS, generateSfx } from '../../../shared/lib/sfxApi.js'
import { previewUrl } from '../../player/modules/rotate-phone/wordLaneNotes.js'
import { buildCandidate, dropCandidate, saveCandidate, checkSoundFile, dbfs } from './gameSfxFlow.js'

// Админ → «Голос» → «Звуки игры»: настоящее «мяу». Два пути к одной записи: «Сгенерировать мяу» (ElevenLabs sound-generation через edge function tts-elevenlabs, kind:'sfx')
// или «Загрузить свой файл (wav/mp3/m4a)». Запись нормализуется в браузере (тишина по краям обрезана, RMS ≈ −28 dBFS как у синтезированных мяу — чтобы на iPhone было тихо без audio.volume),
// появляется «кандидатом» с тремя кнопками прослушивания (один файл, скорость 1 / 1.26 / 1.5 без сохранения высоты), и только «Сделать звуком награды» грузит её в R2 и включает режим «Своё».
export default function GameSfxPanel({ onSaved }) {
  const [prompt, setPrompt] = useState(SFX_DEFAULT_PROMPT)
  const [seconds, setSeconds] = useState(SFX_DEFAULT_SECONDS)
  const [busy, setBusy] = useState('') // '' | 'gen' | 'file' | 'save'
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [cand, setCand] = useState(null)
  const fileRef = useRef(null)
  const candRef = useRef(null)
  useEffect(() => () => dropCandidate(candRef.current), [])

  const take = async (bytes, label) => {
    const c = await buildCandidate(bytes)
    dropCandidate(candRef.current)
    candRef.current = c
    setCand(c)
    setInfo(`${label}: ${c.ms} мс, уровень ${dbfs(c.rms)}. Послушай три тона и, если нравится, нажми «Сделать звуком награды».`)
  }
  const guarded = async (kind, fn) => {
    setBusy(kind); setError(''); setInfo('')
    try { await fn() } catch (e) { setError(e?.message || String(e)) } finally { setBusy('') }
  }
  const generate = () => guarded('gen', async () => {
    const { bytes } = await generateSfx(prompt.trim(), { seconds })
    await take(bytes, 'Сгенерировано')
  })
  const pickFile = () => guarded('file', async () => {
    const file = fileRef.current?.files?.[0]
    const bad = checkSoundFile(file)
    if (bad) throw new Error(bad)
    await take(await file.arrayBuffer(), 'Файл разобран')
  })
  const save = () => guarded('save', async () => {
    await saveCandidate(cand)
    setInfo('Сохранено: звук награды — «Своё» (одна запись, три тона). Действует со следующего тапа «Начать» в игре.')
    onSaved?.()
  })

  return (
    <div className="aspSfx" data-testid="game-sfx-panel">
      <label className="aspLabel">Запрос для ElevenLabs (по-английски)
        <textarea className="aspInput" rows={2} value={prompt} maxLength={450} data-testid="sfx-prompt" onChange={e => setPrompt(e.target.value)} />
      </label>
      <label className="aspLabel">Длительность: {seconds.toFixed(1)} с
        <input type="range" min="0.5" max="2" step="0.1" value={seconds} aria-label="Длительность мяу" data-testid="sfx-seconds" onChange={e => setSeconds(Number(e.target.value))} />
      </label>
      <div className="aspRow">
        <button type="button" className="aspChip" disabled={!!busy || !prompt.trim()} data-testid="sfx-generate" onClick={generate}>{busy === 'gen' ? 'Генерирую…' : 'Сгенерировать мяу'}</button>
        <button type="button" className="aspChip" disabled={!!busy} data-testid="sfx-upload" onClick={() => fileRef.current?.click()}>{busy === 'file' ? 'Разбираю…' : 'Загрузить свой файл (wav/mp3/m4a)'}</button>
        <input ref={fileRef} type="file" accept="audio/*,.wav,.mp3,.m4a" hidden data-testid="sfx-file" onChange={() => { pickFile() }} />
      </div>
      {cand && (
        <div className="aspRow" data-testid="sfx-candidate">
          {[0, 1, 2].map(k => (
            <button key={k} type="button" className="aspChip" data-testid={`sfx-listen-${k + 1}`} onClick={() => previewUrl(cand.previewUrl, k)}>Тон {k + 1}</button>
          ))}
          <button type="button" className="aspChip aspChipOn" disabled={!!busy} data-testid="sfx-save" onClick={save}>{busy === 'save' ? 'Сохраняю…' : 'Сделать звуком награды'}</button>
        </div>
      )}
      {info && <p className="aspHint" data-testid="sfx-info">{info}</p>}
      {error && <p className="aspHint" role="alert" style={{ color: '#ff8a80' }} data-testid="sfx-error">{error}</p>}
    </div>
  )
}

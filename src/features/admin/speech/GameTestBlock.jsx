import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import RotatePhoneModule from '../../player/modules/rotate-phone/RotatePhoneModule.jsx'
import { listWordAudio, cachedWordAudio, subscribeWordAudio } from '../../../shared/lib/wordAudio/wordAudioApi.js'
import { generateWordAudio } from '../../../shared/lib/wordAudio/wordAudioGenerate.js'
import { loadTestForm, saveTestForm, chunkRows } from './gameTestRows.js'
import GameTestRehearsal from './GameTestRehearsal.jsx'
import { loadRehearsalForm, saveRehearsalForm } from '../../rehearsal/rehearsalTestForm.js'

// Админ → «Голос»: «Тест игры» — быстрый запуск «Повтори за диктором» без урока, чтобы отлаживать анимацию и звук. Фраза с кусками через «|» и перевод (по умолчанию «I'm | trying | to learn»);
// «Озвучить» — озвучка кусков в общую библиотеку слов тем же путём, что у уроков (generateWordAudio: ElevenLabs → R2 → word_audio, ключ wordKey), у каждого куска видно «есть / нет озвучки»;
// «Запустить игру» — синтетическая нода rotate_phone, игра на весь экран. Тап по кнопке — жест (микрофон, звук, полный экран — ровно как «Начать» в уроке): кнопка вызывает start() модуля через startRef.
// HUD настроек (⚙) и «Скачать отладку» включены всегда (forceDebug). Результаты нигде не пишутся, XP не начисляется. После игры кнопка превращается в «Ещё раз».
// Переключатель «Нода (как сейчас)» / «Репетиция (симуляция)»: второй режим — сценарий «Репетиция с Питом» по плану-фикстуре (GameTestRehearsal.jsx, CONCEPT_REHEARSAL.md); режим запоминается в браузере админа.
export default function GameTestBlock({ generate = generateWordAudio }) {
  const [form, setForm] = useState(loadTestForm)
  const [rform, setRform] = useState(loadRehearsalForm) // режим «Репетиция (симуляция)»: фикстура и JSON плана
  const changeR = patch => setRform(prev => { const next = { ...prev, ...patch }; saveRehearsalForm(next); return next })
  const [lib, setLib] = useState(() => cachedWordAudio())
  const [voicing, setVoicing] = useState('')   // ключ куска, который озвучивается сейчас
  const [errors, setErrors] = useState({})     // ключ → текст ошибки
  const [status, setStatus] = useState({ phase: 'wait', busy: false, ready: false, problem: '' })
  const [runs, setRuns] = useState(0)
  const startRef = useRef(null)
  useEffect(() => {
    listWordAudio().then(setLib)
    return subscribeWordAudio(setLib)
  }, [])
  const change = patch => setForm(prev => { const next = { ...prev, ...patch }; saveTestForm(next); return next })

  const rows = chunkRows(form.phrase, lib)
  const missing = rows.filter(r => r.key && !r.has)
  const playing = status.phase === 'game'

  async function voice() {
    const failed = {}
    for (const r of missing) {
      setVoicing(r.key)
      try { await generate(r.key, r.text) } catch (e) { failed[r.key] = e?.message || String(e) }
    }
    setVoicing('')
    setErrors(failed)
  }

  // Нода собирается заново, только когда поменялась фраза или перевод; lang и заголовок фиксированы
  const node = useMemo(() => ({ id: 'wl-test', type: 'rotate_phone', isHistory: false, typeData: { rotate_phone: { phrase: form.phrase, translation: form.translation, lang: 'en-US', content: 'Тест' } } }), [form.phrase, form.translation])
  const onDone = useCallback(() => setRuns(n => n + 1), [])

  const modes = (
    <div className="aspChips" data-testid="game-test-mode">
      {[['node', 'Нода (как сейчас)'], ['rehearsal', 'Репетиция (симуляция)']].map(([id, title]) => (
        <button key={id} type="button" className={`aspChip${rform.mode === id ? ' aspChipOn' : ''}`} disabled={playing} onClick={() => changeR({ mode: id })} aria-pressed={rform.mode === id} data-testid={`game-test-mode-${id}`}>{title}</button>
      ))}
    </div>
  )
  if (rform.mode === 'rehearsal') {
    return (
      <section className="aspBlock" data-testid="game-test-block">
        <h3 className="aspH">Тест игры «Повтори за диктором»</h3>
        {modes}
        <GameTestRehearsal form={rform} onChange={changeR} lib={lib} generate={generate} />
      </section>
    )
  }
  return (
    <section className="aspBlock" data-testid="game-test-block">
      <h3 className="aspH">Тест игры «Повтори за диктором»</h3>
      {modes}
      <label className="aspLabel">Фраза (куски через «|», до трёх)
        <input className="aspInput" type="text" value={form.phrase} disabled={playing} onChange={e => change({ phrase: e.target.value })} data-testid="game-test-phrase" />
      </label>
      <label className="aspLabel">Перевод
        <input className="aspInput" type="text" value={form.translation} disabled={playing} onChange={e => change({ translation: e.target.value })} data-testid="game-test-translation" />
      </label>
      <ul className="aspHint" data-testid="game-test-chunks">
        {rows.map((r, i) => (
          <li key={`${i}-${r.text}`} data-state={!r.key ? 'skip' : voicing === r.key ? 'busy' : r.has ? 'ok' : 'missing'}>
            «{r.text}» — {!r.key ? 'не для озвучки (латиница, без кириллицы)' : voicing === r.key ? 'озвучиваю…' : r.has ? <span className="aspOk">есть озвучка</span> : <span className="aspBad">нет озвучки</span>}
            {errors[r.key] && <span className="aspErr" role="alert"> {errors[r.key]}</span>}
          </li>
        ))}
        {!rows.length && <li>Введите фразу: куски через «|»</li>}
      </ul>
      <div className="aspRow">
        <button type="button" className="aspChip" onClick={voice} disabled={!!voicing || !missing.length || !lib} data-testid="game-test-voice">{voicing ? 'Озвучиваю…' : missing.length ? `Озвучить (${missing.length})` : 'Всё озвучено'}</button>
        <button type="button" className="aspSay" onClick={() => startRef.current?.()} disabled={!rows.length || playing || status.busy || !status.ready} data-testid="game-test-start">{runs > 0 ? 'Ещё раз' : 'Запустить игру'}</button>
      </div>
      <RotatePhoneModule node={node} bare forceDebug startRef={startRef} onStatus={setStatus} onDone={onDone} />
      <p className="aspHint">Куски без озвучки прозвучат голосом системы. Игра открывается на весь экран; в углу кнопка ⚙ (настройки на лету, «Скачать отладку», «Перезапустить ступень»). Результаты не сохраняются, XP не начисляется. Распознавание только Vosk: если модели нет, появится уведомление о загрузке.</p>
    </section>
  )
}

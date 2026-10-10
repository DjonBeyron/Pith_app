import { useState, useRef, useEffect } from 'react'
import { startListening } from '../../../shared/lib/vosk/voskEngine.js'
import { copyText } from './copyText.js'
import { TEST_GRAMMAR, TEST_WORDS, TEST_REFERENCE, makeAttempt, verdict, attemptLine, buildVoskReport } from './voskReport.js'

// «Тест закрытого словаря»: эталон «trying», словарь try / trying / [unk]. Говорим «try», затем «trying» — смотрим, что услышал
// Vosk. Доказательство, что закрытый словарь не «исправляет» форму. model(): текущая загруженная модель; meta — данные для отчёта.
export default function VoskVocabTest({ model, ready, lock, meta }) {
  const [attempts, setAttempts] = useState({}) // say → попытка
  const [say, setSay] = useState('')            // что слушаем сейчас
  const [partial, setPartial] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')
  const sess = useRef(null)
  useEffect(() => () => sess.current?.cancel(), [])

  async function start(word) { // в тапе: getUserMedia требует жест
    setError(''); setPartial(''); setCopied(''); setSay(word); lock(true)
    const done = () => { setSay(''); setPartial(''); lock(false) }
    try {
      sess.current = await startListening(model(), TEST_GRAMMAR, {
        onPartial: setPartial,
        onResult: (text, stats) => { setAttempts(a => ({ ...a, [word]: makeAttempt(word, text, stats) })); done() },
        onError: msg => { setError(msg); done() },
      })
    } catch (e) { setError(e?.name === 'NotAllowedError' ? 'Микрофон не разрешён' : (e?.message || String(e))); done() }
  }

  const list = TEST_WORDS.map(w => attempts[w]).filter(Boolean)
  const last = list.at(-1)
  async function copy() { setCopied((await copyText(buildVoskReport({ ...meta, attempts: list }))) ? 'Скопировано' : 'Не удалось скопировать') }

  return (
    <div className="apCard">
      <div className="apCardHead"><b>Тест закрытого словаря</b></div>
      <p className="aspHint">Эталон «{TEST_REFERENCE}», словарь <code>{TEST_GRAMMAR}</code>. Нажмите «Сказать», произнесите слово и нажмите «Стоп». Сначала «try», потом «trying».</p>
      <div className="aspRow">
        {TEST_WORDS.map(w => (
          <button key={w} className="aspSay apSmall" disabled={!ready || !!say} onClick={() => start(w)}>Сказать «{w}»</button>
        ))}
        {say && <button className="aspStop" onClick={() => sess.current?.stop()}>Стоп</button>}
        {say && <span className="aspRec"><i className="aspDot" />слушаю «{say}»…</span>}
      </div>
      {!ready && !say && <div className="aspHint">Сначала скачайте модель и загрузите движок в память.</div>}
      {partial && <div className="aspLive">{partial}</div>}
      {last && (
        <div className="aspFinal vkHeard" aria-label="Услышали">
          <span className="aspHint">Услышали:</span>
          <b className="vkHeardText">«{last.heard || '—'}»</b>
          <span className="aspHint">{last.conf != null ? `уверенность ${last.conf}` : 'уверенность не получена'}
            {last.start != null && last.end != null ? ` · слово ${last.start}–${last.end} с` : ''} · итог {last.resultMs ?? '—'} мс</span>
        </div>
      )}
      {list.length > 0 && <ol className="apConc">{list.map(a => <li key={a.say}>{attemptLine(a)}</li>)}</ol>}
      {list.length > 0 && <div className="apVerdict">{verdict(list)}</div>}
      <div className="aspRow">
        <button className="aeRefresh" disabled={!list.length} onClick={copy}>Скопировать результат Vosk</button>
        {copied && <span className="aspHint">{copied}</span>}
      </div>
      {error && <div className="aspErr"><b>{error}</b></div>}
    </div>
  )
}

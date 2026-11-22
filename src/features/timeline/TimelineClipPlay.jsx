import { FROM_NOW } from './timelineVoice.js'

// Кнопка ▶ / ■ (играть / стоп) в карточке реплики: проиграть озвучку клипа обычным <audio> (useClipAudio.js), полоска — ход проигрывания (CSS-анимация на длину файла: экран не перерисовывается каждый кадр).
// Нет озвучки — кнопка серая и подсказка почему («нет озвучки (подпись)», «в библиотеке слов нет записи…»). Мелко и честно: звук берётся из настроек на момент просмотра, а не из записи игры.
// line — реплика модели (timelineModel), audio — useClipAudio (null — звука на экране нет: ничего не рисуется).
export default function TimelineClipPlay({ line, audio }) {
  if (!audio || !line) return null
  const v = audio.of(line), st = audio.state.key === audio.key(line) ? audio.state : null
  const on = st?.status === 'playing' || st?.status === 'loading'
  const left = st?.status === 'playing' ? Math.max(0.2, (st.dur ?? v.duration ?? (line.ms > 0 ? line.ms / 1000 : 2)) - (st.at ?? 0)) : 0
  const note = st?.status === 'error' ? `✗ ${st.error}` : !v.url ? v.why : st?.status === 'loading' ? 'загружаю звук…' : `${v.from}${v.changed ? ' · текст в настройках уже другой' : ''}`
  return (
    <div className="tlPlay" data-testid="tl-play" data-state={st?.status ?? 'idle'} data-has={v.url ? '1' : '0'}>
      <button type="button" className="tlBtn tlPlayBtn" onClick={() => audio.toggle(line)} disabled={!v.url} aria-pressed={on} title={on ? 'Остановить (Esc)' : 'Проиграть озвучку этой реплики'} data-testid="tl-play-btn">{on ? '■ Стоп' : '▶ Слушать'}</button>
      <span className="tlPlayBar" aria-hidden="true">{left > 0 && <i key={`${st.key}:${st.at}`} style={{ animationDuration: `${left.toFixed(2)}s` }} />}</span>
      <small className="tlPlayNote" data-testid="tl-play-note">{note}</small>
      {v.url && <small className="tlPlayHonest">{FROM_NOW}</small>}
    </div>
  )
}

import { earTimes } from './pillStandEar.js'

// «Что слышит Vosk» под пилюлей стенда (CONCEPT_PILLSTAND.md): уровень (полоска --rms пишет кадр стенда без React, отметка — порог голоса), затвор, черновик, итоги с «кто закрыл», совпадение,
// засчитанные слова, откаты, неверные слова, задержки. Моноширинный мелкий шрифт, прокрутка внутри блока; на 375 px строки переносятся.
const ms = v => (v == null ? '—' : `${v} мс`)
const q = t => `«${t}»`

export default function PillStandEar({ view, rmsRef, onCopy, onSave, note }) {
  const t = earTimes(view)
  return (
    <div className="psEar" data-testid="ps-ear">
      <div className="psEarHead">
        <span className="psLevel" ref={rmsRef} data-voice={view.voice ? '1' : undefined} data-testid="ps-level"><i /></span>
        <span className="psGate" data-open={view.gate ? '1' : view.gate === false ? '0' : undefined} data-testid="ps-gate">затвор {view.gate == null ? '—' : view.gate ? 'открыт' : 'закрыт'}</span>
        <button type="button" className="psBtn psBtn--tiny" onClick={onCopy} data-testid="ps-copy">Сводка</button>
        <button type="button" className="psBtn psBtn--tiny" onClick={onSave} data-testid="ps-save">⬇ Трасса</button>
      </div>
      {note && <p className="psNote" data-testid="ps-note">{note}</p>}
      <p className="psLine" data-testid="ps-partial"><b>черновик</b> {view.partial ? q(view.partial) : '—'}</p>
      <p className="psLine" data-testid="ps-final"><b>итог</b> {view.finals.length ? view.finals.slice(-3).map(f => `+${f.t} ${q(f.text)} (${f.by})${f.conf.length ? ` [${f.conf.join(', ')}]` : ''}`).join(' · ') : '—'}</p>
      <p className="psLine"><b>совпадение</b> {view.best ? q(view.best) : '—'}{view.ratio != null ? ` ratio ${String(view.ratio).replace('.', ',')}` : ''}{view.status ? ` · слушатель ${view.status}` : ''}</p>
      <p className="psLine" data-testid="ps-words"><b>засчитано</b> {view.words.map(w => `${w.index + 1}${q(w.text)}+${w.t}${w.draft ? 'ч' : ''}`).join(' ') || '—'}</p>
      {!!view.backs.length && <p className="psLine psLine--bad"><b>откаты</b> {view.backs.map(b => `${b.index + 1}${q(b.text)}+${b.t}`).join(' ')}</p>}
      {!!view.wrongs.length && <p className="psLine psLine--bad"><b>неверные</b> {view.wrongs.map(w => `${q(w.word)}≠${q(w.expect)}+${w.t}`).join(' ')}</p>}
      <p className="psLine" data-testid="ps-times"><b>мс</b> голос→черновик {ms(t.voiceToPartial)} · конец голоса→зачёт {ms(t.afterVoice)} · слово→заливка {view.reach.slice(-4).map(r => r.ms).join(', ') || '—'}</p>
      <ol className="psHist" data-testid="ps-hist">{view.partials.slice().reverse().map((p, i) => <li key={`${p.t}-${i}`}>+{p.t} {q(p.text)}</li>)}</ol>
    </div>
  )
}

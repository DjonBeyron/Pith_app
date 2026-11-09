import PillStandVoskWords from './PillStandVoskWords.jsx'
import { COLOR_LEGEND } from './pillStandColor.js'

// Крупная строка «Vosk: …» под пилюлей стенда (CONCEPT_PILLSTAND.md, «Что слышит Vosk»): текущий черновик (бледнее) или последний итог (ярче), раскрашенный пословно — на iPhone видно не вглядываясь,
// что определил Vosk; под ней легенда цветов мелкой строкой. Живой экран — из панели слуха, плеер — из кадра (черновик / итог кадра и засчитанное к его моменту).
export default function PillStandVoskLine({ partial = '', final = '', say = '', state = null, testid = 'ps-vosk-line' }) {
  const kind = partial ? 'partial' : 'final'
  return (
    <div className="psVoskLine" data-testid={testid}>
      <p className="psVoskBig" data-kind={final || partial ? kind : undefined}><span className="psVoskTag">{final || partial ? `Vosk ${kind === 'partial' ? 'черновик' : 'итог'}:` : 'Vosk:'}</span> {partial || final ? <PillStandVoskWords text={partial || final} kind={kind} say={say} state={state} testid={`${testid}-words`} /> : <span className="psVw">…</span>}</p>
      <p className="psLegend" aria-label="Цвета слов">{COLOR_LEGEND.map(([c, t]) => <span key={c} className="psVw"><b data-c={c}>{t}</b></span>)}</p>
    </div>
  )
}

import { colorWords } from './pillStandColor.js'

// Слова строки Vosk пословно в цвете (pillStandColor.js): засчитано — зелёный, итог — яркий, черновик — бледнее, нет в цели — оранжево-красный, откат — зачёркнуто. Цвета — переменные --vw-* (pill-stand-colors.css).
export default function PillStandVoskWords({ text, kind = 'partial', say = '', state = null, testid }) {
  const ws = colorWords(text, { kind, say, counted: state?.counted, gone: state?.gone })
  if (!ws.length) return <span className="psVw" data-testid={testid}>—</span>
  return <span className="psVw" data-kind={kind} data-testid={testid}>{ws.map((x, i) => <b key={`${i}-${x.w}`} data-c={x.c}>{x.w}</b>)}</span>
}

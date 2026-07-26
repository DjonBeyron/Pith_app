// Линия перевода слова: изгибающаяся кривая от середины слова до середины
// нижней грани подложки с переводом — та же кубическая безье, что связывает
// ноды в редакторе канваса (см. neuronPath в CanvasConnections.jsx), только
// развёрнутая по вертикали: там линия выходит вбок и входит вбок, здесь
// выходит вверх и входит в подложку снизу.
//
//        ┌───────────┐
//        │  ПЕРЕВОД  │
//        └─────┬─────┘   ← вход всегда снизу по центру
//         ╭────╯
//   слово ╯
//
// Подложка ВСЕГДА по центру экрана по X и на одной высоте по Y, куда бы ни
// тыкнули: от слова зависит только форма кривой.
const RISE = 44        // высота подложки над блоком фразы
const LW = 1.5         // толщина линии

// Ручки безье вытянуты вдоль оси связи (у нас — вертикаль) на 40% пролёта,
// но не меньше 40px, и смещены поперёк на 30% — от этого линия выходит из
// слова вверх, плавно уводится вбок и входит в подложку строго снизу
function neuronPath(x1, y1, x2, y2) {
  const dx = x2 - x1
  const v = Math.max(Math.abs(y2 - y1) * 0.4, 40)
  return `M ${x1} ${y1} C ${x1 + dx * 0.3} ${y1 - v}, ${x2 - dx * 0.3} ${y2 + v}, ${x2} ${y2}`
}

export default function WordTranslateLine({ pick, onClose }) {
  const { x, y, text, hostW, blockTop, closing } = pick
  const cx = hostW / 2
  const startY = y                       // линия стартует вплотную к подложке слова
  // Уровень низа подложки общий для всех слов фразы; если слово оказалось
  // совсем близко к нему, подложку приподнимаем — иначе линии не видно
  const rise = Math.max(12, startY - (blockTop - RISE))
  const railY = startY - rise
  const d = neuronPath(x, startY, cx, railY)

  return (
    <div className={closing ? 'wtLayer wtLayerClosing' : 'wtLayer'}>
      <svg className="wtSvg" width={hostW} height={Math.max(1, startY + LW)}>
        {/* Широкий полупрозрачный дубль — мягкое свечение вокруг линии,
            как у связей в канвасе */}
        <path className="wtPathGlow" d={d} pathLength="1" />
        <path className="wtPath" d={d} pathLength="1" />
      </svg>
      <div
        className="wtPlate"
        style={{ top: `${railY + LW / 2}px` }}
        onClick={e => { e.stopPropagation(); onClose() }}>
        {text}
      </div>
    </div>
  )
}

// Облачко реплики — HTML поверх SVG (перенос строк и foreignObject на iOS
// ненадёжны). side: 'a' (слева) | 'b' (справа) | 'c' (по центру — над одиночным котом). showTranslation — режим показа
// 'both' (sceneOptions.js): под текстом перевод мельче и светлее, появляется вместе
// с репликой; нет translation у реплики — только оригинал. phase 'translation'
// (звучит озвучка перевода) — перевод подсвечен, оригинал приглушён (CSS по data-phase).

export default function SceneBubbleV2({ line, name, side = 'a', visible = true, showTranslation = false, phase = null }) {
  if (!visible || !line?.text) return null
  const tr = showTranslation && line.translation ? line.translation : null
  return (
    <div className={`scn-bubble scn-bubble--${side}`} role="status" aria-live="polite" data-phase={phase ?? undefined}>
      {name && <div className="scn-bubble__name">{name}</div>}
      <div className="scn-bubble__text">{line.text}</div>
      {tr && <div className="scn-bubble__tr">{tr}</div>}
      <span className="scn-bubble__tail" aria-hidden="true" />
    </div>
  )
}

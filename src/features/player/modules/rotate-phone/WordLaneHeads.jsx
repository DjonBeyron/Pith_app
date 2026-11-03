// Подписи кусков над дорожками (не читка-караоке: у неё свои слова, ReadKaraoke). Один span на дорожку с ключом-номером — между стадиями узлы не пересоздаются, меняется только текст и яркость.
// data-new — подпись только что появилась: вокруг неё рамка цвета дорожки (word-lane-label-frame.css); 1 / 2 чередуются, чтобы рамка сыграла заново, если текст сменился, пока шла прежняя.
export default function WordLaneHeads({ heads, fresh }) {
  return heads.map((h, i) => (
    <span key={i} className={`wlHead${h.on ? ' wlHead--on' : ''}${h.text ? '' : ' wlHead--empty'}`} data-testid={`wl-head-${i}`} data-new={fresh[i] || undefined}>{h.text}</span>
  ))
}

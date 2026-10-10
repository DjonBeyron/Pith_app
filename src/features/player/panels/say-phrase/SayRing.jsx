// Кольцо вокруг круга-микрофона «Сказать фразу» (образец владельца): серый «трек» + полупрозрачная салатовая дуга (≈ четверть окружности, скруглённые
// концы, от верха по часовой). Чистый SVG-stroke, без JS и без перерисовки React: состояние показывает CSS по классу родителя .sayMicBox--{mode}
// (say-phrase-ring.css): в покое дуга медленно плывёт по треку, при записи уступает место живому эквалайзеру (дуга гаснет), на «Готово» кольцо
// плавно становится целиком зелёным (.sayRingFull). Кольцо лежит над слоем волн и не принимает касаний.
const R = 60
const LEN = 2 * Math.PI * R

export default function SayRing() {
  const arc = (LEN / 4).toFixed(1)
  return (
    <svg className="sayRing" viewBox="0 0 128 128" aria-hidden="true" focusable="false" data-testid="say-ring">
      <circle className="sayRingTrack" cx="64" cy="64" r={R} />
      <g className="sayRingSpin">
        <circle className="sayRingArc" cx="64" cy="64" r={R} strokeDasharray={`${arc} ${(LEN - arc).toFixed(1)}`} transform="rotate(-90 64 64)" />
      </g>
      <circle className="sayRingFull" cx="64" cy="64" r={R} />
    </svg>
  )
}

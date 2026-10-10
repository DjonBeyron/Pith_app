// Кольцо вокруг круга-микрофона «Сказать фразу» (образец владельца): серый «трек» + полупрозрачная дуга (≈ четверть окружности, скруглённые концы, от верха по часовой)
// + сплошное зелёное кольцо (.sayRingFull). Чистый SVG-stroke, без JS и без перерисовки React: состояние показывает CSS по классу родителя .sayMicBox--{state}
// (say-phrase-ring.css): locked — серый трек и бегущая серая дуга; ready — СПЛОШНОЕ зелёное кольцо (дуга и трек скрыты, ничего не движется); active — то же зелёное кольцо, приглушённое,
// масштаб вместе с кругом; done — полностью зелёное. Кольцо лежит над слоем волн и не принимает касаний.
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

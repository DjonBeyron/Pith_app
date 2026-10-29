// Когда и где выскакивает голова Пита (чистая логика без DOM — время и показ приходят аргументами, проверяется тестами).
//  voice(level) — вызывается каждый кадр: голос громче порога → голова выскакивает (если спрятана — в СЛЕДУЮЩЕМ месте из spots, по кругу), держится, пока голос не стихнет на HIDE_AFTER_MS;
//  hold(ms) — принудительно торчать ms мс (реакция на принятую пилюлю / промах).
// Места — центры головы по ширине экрана, %: голова шириной в полэкрана, поэтому от 25 до 75 % — целиком в кадре (уши и усы не срезаются краем); чередуются слева направо, чтобы кот не появлялся дважды подряд в одном углу, середину (там в фазе ученика микрофон) обходят.
export const CAT_SPOTS = [27, 73, 33, 67, 28, 72, 36]
export const VOICE_AT = 0.1
export const HIDE_AFTER_MS = 900
export const HIDE_MS = 450 // голова уходит вниз за 0,42 с (word-lane.css): если за это время её снова зовут, место не меняется — иначе --cat-x перескакивал бы, пока она ещё видна на полпути

export function catPeek({ spots = CAT_SPOTS, now, show, hide }) {
  let up = false
  let lastNeed = 0   // до какого момента голова нужна (голос / реакция)
  let i = -1
  let hiddenAt = -Infinity
  const raise = () => { if (!up) { if (now() - hiddenAt >= HIDE_MS || i < 0) i = (i + 1) % spots.length; up = true; show(spots[i]) } }
  return {
    voice(level) {
      const t = now()
      if (level >= VOICE_AT) { lastNeed = Math.max(lastNeed, t + HIDE_AFTER_MS); raise() }
      if (up && t > lastNeed) { up = false; hiddenAt = t; hide() }
    },
    hold(ms) { lastNeed = Math.max(lastNeed, now() + ms); raise() },
    isUp: () => up,
    spot: () => spots[i] ?? null,
  }
}

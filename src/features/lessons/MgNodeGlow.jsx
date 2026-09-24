// Свечение нодов «Старт» и «Финал» — статичный SVG-слой ПОД нодом: та же
// форма (path), залитая цветом свечения и размытая один раз (feGaussianBlur).
//
// Раньше свечение давал filter: drop-shadow на обёртке .mgGlow — фильтр на
// ВСЁМ ноде. Внутри нода регулярно что-то движется (блик, ключ по бару XP,
// замок церемонии), и на каждом кадре движения браузер пересчитывал размытие
// всего нода — на слабом Android подлагивало. Здесь размытие живёт в своём
// GPU-слое (will-change в CSS) и не пересчитывается: смена состояний —
// только прозрачностью слоёв.
//
// layers: [{ name, blur }] — blur в px как у прежнего drop-shadow (у него третья
// длина — это и есть σ размытия, сверено на глаз бок о бок со старым);
// цвет и видимость каждого слоя — в CSS (.mgNodeGlowLayer--<name>).
export default function MgNodeGlow({ id, path, size, layers }) {
  return (
    <svg className="mgNodeGlow" viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <defs>
        {layers.map(l => (
          <filter key={l.name} id={`${id}-${l.name}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={l.blur} />
          </filter>
        ))}
      </defs>
      {layers.map(l => (
        <path key={l.name} className={`mgNodeGlowLayer mgNodeGlowLayer--${l.name}`}
          d={path} filter={`url(#${id}-${l.name})`} />
      ))}
    </svg>
  )
}

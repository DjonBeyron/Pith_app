// Плашки «опасных зон» слайда: где лежат верхняя панель, HUD, фраза, кнопка «Изучить фразу» и нижняя панель. Рамки —
// из feedZones() (те же числа, что считают положение котов в ленте); зона, которую задели коты, подсвечена красным.
export default function FeedZonePlates({ zones, hit = [] }) {
  return (
    <div className="ffpZones" aria-hidden="true">
      {zones.map(z => (
        <i
          key={z.id} className={hit.includes(z.id) ? 'ffpZone ffpZoneHit' : 'ffpZone'} data-zone={z.id}
          style={{ left: z.l, top: z.t, width: z.r - z.l, height: z.b - z.t }}
        >
          <b>{z.label}</b>
        </i>
      ))}
    </div>
  )
}

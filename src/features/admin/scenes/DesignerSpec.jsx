import { TEMPLATE_FILES } from './designerTemplates.js'
import { downloadText } from './fileUtils.js'
import DesignerSections from './DesignerSections.jsx'
import SvgChecker from './SvgChecker.jsx'
import DesignerHowTo from './DesignerHowTo.jsx'
import '../../../styles/admin-scenes-designer.css'

// Раздел «Для дизайнера»: спецификация простым языком с картинками-схемами (DesignerSections),
// кнопки «Скачать шаблон» (SVG-шаблоны кота и предметов — Blob + <a download>) и
// «Проверить SVG» (SvgChecker → checkSpriteSvg). Страницу можно показать внешнему дизайнеру
// с экрана админа или переслать текстом.
export default function DesignerSpec() {
  return (
    <div className="scd">
      <div className="scCard scdIntro">
        <p className="scCardTitle">Спецификация спрайтов для дизайнера</p>
        <p className="scHint">
          Сцена «два кота говорят» рисуется из плоских SVG-файлов: два кота, предметы в именованных ячейках и фон. Ниже — что именно
          нарисовать, в каких размерах, как назвать группы и чего в файле быть не должно. Скачайте шаблон, нарисуйте поверх контуров,
          проверьте файл кнопкой внизу — и присылайте.
        </p>
        <div className="scdBtns">
          {TEMPLATE_FILES.map(t => (
            <button key={t.id} type="button" className="scBtn" onClick={() => downloadText(t.file, t.make(), 'image/svg+xml;charset=utf-8')}>
              Скачать: {t.title}
            </button>
          ))}
          <a className="scBtn scdJump" href="#scd-check">Проверить SVG ↓</a>
        </div>
        <DesignerHowTo />
      </div>
      <DesignerSections />
      <SvgChecker />
    </div>
  )
}

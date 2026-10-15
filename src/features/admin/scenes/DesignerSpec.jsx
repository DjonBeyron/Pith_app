import { TEMPLATE_FILES } from './designerTemplates.js'
import { downloadText } from './fileUtils.js'
import DesignerSections from './DesignerSections.jsx'
import SvgChecker from './SvgChecker.jsx'
import DesignerHowTo from './DesignerHowTo.jsx'
import DesignerPackButtons from './designer-pack/DesignerPackButtons.jsx'
import DesignerDevSection from './designer-pack/DesignerDevSection.jsx'
import SvgToCodeTool from './designer-pack/SvgToCodeTool.jsx'
import '../../../styles/admin-scenes-designer.css'
import '../../../styles/admin-scenes-designer-pack.css'

// Раздел «Для дизайнера»: спецификация простым языком с картинками-схемами (DesignerSections),
// кнопки «Скачать шаблон» (SVG-шаблоны кота и предметов — Blob + <a download>),
// «Проверить SVG» (SvgChecker → checkSpriteSvg), пакет для внешнего дизайнера (PDF/HTML-документ,
// автономная проверка, шаблоны — designer-pack/) и раздел «Для программиста / админа» с
// конвертером SVG → код реестра. Дизайнер админку не видит — ему уходит пакет.
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
        <DesignerPackButtons />
      </div>
      <DesignerSections />
      <SvgChecker />
      <DesignerDevSection><SvgToCodeTool /></DesignerDevSection>
    </div>
  )
}

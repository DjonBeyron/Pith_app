import { CAT_PARTS, CAT_VIEWBOX } from '../../scene/v2/sprites/catSprite.js'
import { SCENE_VIEWBOX } from '../../scene/v2/sprites/backgrounds.js'
import { FORBIDDEN_TAGS, SPRITE_KINDS } from '../../scene/v2/spriteCheck.js'
import { NODE_BUDGET } from '../../scene/v2/sceneBudget.js'
import { LAYERS } from '../../scene/v2/sprites/slots.js'
import { PALETTE_PRESETS } from '../../scene/v2/sceneConstants.js'
import { CatCanvasDiagram, SceneLayersDiagram, VisemesDiagram, EmotionsDiagram } from './DesignerDiagrams.jsx'
import { LAYER_LABEL } from './slotRules.js'
import { PALETTE_KEYS } from './sceneLabels.js'
import ScTip from './ScTip.jsx'

// Текст спецификации для дизайнера: разделы с картинками. Числа и списки берутся из ядра
// (spriteCheck, catSprite, slots, sceneBudget) — спецификация не расходится с проверкой.
// print=true — та же разметка для печатного документа (designer-pack/buildPrintDoc): без кнопок «?».
const Section = ({ id, title, tip, print, children }) => (
  <section className="scdSec" id={id} aria-labelledby={`${id}-h`}>
    <h2 id={`${id}-h`} className="scdH">{title}{tip && !print && <> <ScTip help={tip} /></>}</h2>
    {children}
  </section>
)

export default function DesignerSections({ print = false }) {
  const K = SPRITE_KINDS
  return (
    <div className="scdSecs">
      <Section id="scd-canvas" title="1. Размеры холста" tip="viewbox" print={print}>
        <ul className="scList">
          <li><b>Кот</b> — viewBox <code>{CAT_VIEWBOX}</code> (ширина 200, высота 240). Кот стоит на нижнем краю, голова — круг радиусом ≈ 48 с центром (100, 96).</li>
          <li><b>Фон</b> — viewBox <code>{SCENE_VIEWBOX}</code>, вертикальный 9:16, как экран телефона. Линия пола — y = 430. Пол и стена в ленте продолжаются за кадр: нижняя часть кадра (y 430…640) — «безопасный пол», ниже и по бокам фон просто тянется тем же узором. За пределами 360×640 ничего важного не рисуйте.</li>
          <li><b>Предмет</b> — свой viewBox по габариту, не больше {K.prop.maxW}×{K.prop.maxH}; точка (0,0) — якорь (см. раздел 4).</li>
        </ul>
        <div className="scdFigs"><CatCanvasDiagram /><SceneLayersDiagram /></div>
      </Section>

      <Section id="scd-parts" title="2. Обязательные именованные группы" tip="data_part" print={print}>
        <p>Каждая часть — отдельная группа <code>&lt;g data-part="имя"&gt;</code>. Имена латиницей, ровно такие:</p>
        <p className="scdChips">{CAT_PARTS.map(p => <code key={p} className={K.cat.requiredParts.includes(p) ? 'scdReq' : ''}>{p}</code>)}</p>
        <p className="scHint">Подчёркнутые — обязательные для кота (проверка не пропустит файл без них): {K.cat.requiredParts.join(', ')}. Группа <code>head</code>
          содержит <code>ears</code> и <code>face</code>; внутри <code>face</code> — <code>eyes</code>, <code>mouth</code>, <code>whiskers</code>; <code>paws</code> — внутри <code>body</code>.
          Хвост и голова получают свой <code>transform="translate(…)"</code>: приложение качает хвост и кивает головой вокруг этих точек.</p>
        <p><b>Предмет</b>: одна группа <code>&lt;g data-part="id-предмета"&gt;</code> со всеми фигурами внутри. <b>Фон</b>: группы <code>wall</code> и <code>floor</code>.</p>
      </Section>

      <Section id="scd-mouth" title="3. Три формы рта и четыре эмоции" tip="viseme" print={print}>
        <p>Внутри <code>mouth</code> лежат одновременно три группы <code>&lt;g data-viseme="closed|half|open"&gt;</code> — приложение показывает одну из них, быстро переключая во время речи.</p>
        <VisemesDiagram />
        <p>Эмоции {!print && <ScTip help="emotion" />} меняют глаза, брови и форму закрытого рта. В базовом файле нарисуйте <code>neutral</code>; остальные — либо отдельными файлами
          <code>cat-male-happy.svg</code> и т.д., либо описанием, как приложение дорисовывает веки (как у встроенных котов).</p>
        <EmotionsDiagram />
      </Section>

      <Section id="scd-anchor" title="4. Якоря и слои" tip="anchor" print={print}>
        <ul className="scList">
          <li><b>Напольные и настольные предметы</b> (стол, растение, кружка): (0,0) — нижняя середина, рисунок уходит вверх в минус по y.</li>
          <li><b>Настенные</b> (картина, часы, доска, окно): (0,0) — центр.</li>
          <li><b>Подвесные</b> (лампа): (0,0) — точка крепления сверху, рисунок уходит вниз.</li>
        </ul>
        <p>Слои отрисовки снизу вверх: {LAYERS.map((l, i) => <span key={l}><code>{l}</code> ({LAYER_LABEL[l]}){i < LAYERS.length - 1 ? ' → ' : ''}</span>)}. Коты рисуются после предметов пола и стола, облачко — поверх всего.</p>
      </Section>

      <Section id="scd-color" title="5. Палитра и правила цвета" tip="current_color" print={print}>
        <p>Цвет задаётся атрибутами <code>fill</code> и <code>stroke</code>: <code>#rrggbb</code>, <code>rgb()</code>, <code>currentColor</code> или <code>none</code>. Допустимые свойства:
          <code>opacity</code>, <code>stroke-width</code>, <code>stroke-linecap</code>, <code>stroke-linejoin</code>, <code>stroke-dasharray</code>, <code>transform</code>.</p>
        <p>Кот перекрашивается палитрой персонажа — используйте пять ролей цвета и пометьте в файле комментарием, какая фигура к какой роли относится:</p>
        <div className="scdPalettes">
          {Object.entries(PALETTE_PRESETS).map(([id, p]) => (
            <div key={id} className="scdPal">
              <span className="scdPalName">{id}</span>
              {PALETTE_KEYS.map(([k, label]) => <span key={k} className="scdSwatch" style={{ '--c': p[k] }} title={`${label}: ${p[k]}`}>{label}</span>)}
            </div>
          ))}
        </div>
      </Section>

      <Section id="scd-forbidden" title="6. Чего в файле быть не должно" tip="forbidden" print={print}>
        <p className="scdChips">{FORBIDDEN_TAGS.map(t => <code key={t} className="scdBan">&lt;{t}&gt;</code>)}</p>
        <ul className="scList">
          <li>Никаких <code>url(…)</code> в атрибутах, <code>href</code>/<code>xlink:href</code>, обработчиков <code>on*</code>, <code>&lt;style&gt;</code> и анимаций внутри файла — анимирует приложение.</li>
          <li>Только теги: <code>svg, g, path, rect, circle, ellipse, line, polyline, polygon, text, title, desc</code>. Текст в фигурах лучше не использовать (шрифты на телефонах разные).</li>
          <li>Файл до 64 КБ, без встроенных растров. Экспортируйте «plain SVG» и уберите метаданные редактора.</li>
        </ul>
      </Section>

      <Section id="scd-budget" title="7. Бюджет узлов" tip="budget" print={print}>
        <ul className="scList">
          <li>Кот ≤ <b>{K.cat.maxNodes}</b> узлов (встроенные — 53–58), предмет ≤ <b>{K.prop.maxNodes}</b> (лучше 4–8), фон ≤ <b>{K.background.maxNodes}</b>.</li>
          <li>Сцена целиком (фон + два кота + все предметы) ≤ <b>{NODE_BUDGET}</b>. Узел = любая фигура или группа. Объединяйте штрихи в один <code>path</code>.</li>
        </ul>
      </Section>

      <Section id="scd-files" title="8. Имена файлов и чек-лист сдачи" tip="file_names" print={print}>
        <ul className="scList">
          <li>Имена: <code>cat-male.svg</code>, <code>cat-female.svg</code>, предметы — <code>coffee-cup.svg</code>, фоны — <code>bg-cafe.svg</code>. Латиница, дефисы, нижний регистр.</li>
          <li>Чек-лист: ☐ viewBox верный ☐ группы data-part названы ☐ три виземы рта ☐ точка (0,0) = якорь ☐ цвета только fill/stroke ☐ запрещённых тегов нет
            ☐ узлов в лимите ☐ файл проверен кнопкой ниже и показал «ок».</li>
        </ul>
      </Section>
    </div>
  )
}

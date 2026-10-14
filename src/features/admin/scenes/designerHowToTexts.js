import { CAT_PARTS } from '../../scene/v2/sprites/catSprite.js'
import { FORBIDDEN_TAGS, SPRITE_KINDS } from '../../scene/v2/spriteCheck.js'
import { NODE_BUDGET } from '../../scene/v2/sceneBudget.js'

// Тексты мини-инструкции «Как работать» для внешнего дизайнера. Числа и списки берутся из
// ядра (spriteCheck, catSprite, sceneBudget) — текст не расходится с проверкой SVG.
// designerHowToTexts.test.js падает, если в ядре появился новый запрещённый тег без слов
// на человеческом языке (TAG_WORDS) или изменился список частей/виземов.

// Запрещённый тег → слово для человека (несколько тегов могут давать одно слово)
export const TAG_WORDS = {
  filter: 'фильтры и тени', mask: 'маски', clipPath: 'обрезка (clip)', foreignObject: 'вставки HTML', script: 'скрипты',
  image: 'внешние и встроенные картинки', use: 'клоны <use>', style: 'блоки <style>', pattern: 'узоры-паттерны',
  linearGradient: 'градиенты', radialGradient: 'градиенты', animate: 'анимации внутри файла', animateTransform: 'анимации внутри файла',
  animateMotion: 'анимации внутри файла', set: 'анимации внутри файла', a: 'ссылки', symbol: 'символы', defs: 'раздел <defs>',
}
export const banWords = () => [...new Set(FORBIDDEN_TAGS.map(t => TAG_WORDS[t]).filter(Boolean))]

export const FILE_EXAMPLES = ['cat-male.svg', 'coffee-cup.svg', 'bg-cafe.svg']
export const EXPORT_HINTS = [
  ['Figma', 'Export → SVG. Включите «Include "id" attribute» и «Outline text»; «Simplify stroke» лучше выключить.'],
  ['Illustrator', 'Save As → SVG. Styling: Presentation Attributes; Object IDs: Layer Names; включите Minify.'],
  ['Inkscape', 'Save As → «Plain SVG» (не «Inkscape SVG»).'],
]
export const EXPORT_GENERIC = 'Если названий опций у вас нет — выбирайте «чистый SVG, свойства как атрибуты, текст в контуры, без метаданных редактора».'

export const HOWTO_TITLE = 'Как работать — 5 шагов'
export const HOWTO_STEPS = [
  { id: 'download', title: 'Скачайте шаблон', body: 'Нажмите нужную кнопку «Скачать»: кот, предмет на полу или предмет на стене. Шаблон — готовый SVG с подписанными группами и бледным пунктирным контуром-подсказкой.' },
  {
    id: 'draw', title: 'Рисуйте внутри групп',
    body: `Откройте файл в Figma, Illustrator или Inkscape. Не переименовывайте и не удаляйте группы с data-part / id (у кота: ${CAT_PARTS.join(', ')}; рот — три формы closed, half, open) — рисуйте внутри них, держась контура-подсказки. Размер холста (viewBox) не меняйте. Красный крестик — точка привязки, её не двигайте.`,
  },
  {
    id: 'ban', title: 'Чего нельзя',
    body: `Нельзя: ${banWords().join(', ')}; текст тегом <text> (переведите в контуры). Лёгкость важнее детализации: кот — до ${SPRITE_KINDS.cat.maxNodes} узлов, предмет — до ${SPRITE_KINDS.prop.maxNodes}, фон — до ${SPRITE_KINDS.background.maxNodes}; вся сцена целиком — не больше ${NODE_BUDGET}. Узел — любая фигура или группа: сливайте штрихи в один path.`,
  },
  { id: 'export', title: 'Экспортируйте чистый SVG', body: 'Экспорт — обычный SVG без лишнего: свойства как атрибуты (не в <style>), идентификаторы групп сохранены, текст в контурах.' },
  {
    id: 'check', title: 'Проверьте и отправьте',
    body: `Нажмите «Проверить SVG» ниже и выберите тип. Зелёный вердикт «Ок» — файл можно отправлять. Красный — исправьте пункты из списка и проверьте снова. Назовите файл латиницей через дефис в нижнем регистре (${FILE_EXAMPLES.join(', ')}) и отправьте администратору.`,
  },
]

export const APP_TITLE = 'Как это будет работать в приложении'
export const APP_POINTS = [
  ['scene', 'Из ваших частей собирается сцена, где двое котов разговаривают.'],
  ['cat', 'Части кота двигаются сами: рот меняет три формы под речь, глаза моргают, тело «дышит», хвост качается, эмоция меняет глаза.'],
  ['props', 'Предметы ставятся в ячейки — на стол, на стену, на пол. Поэтому важны точка привязки и размер.'],
  ['where', 'Сцену увидят в ленте рекомендаций, в уроках (как видео или кружок) и в карточках повторов.'],
  ['light', 'Приложение работает и на слабых телефонах, поэтому лёгкость файла важнее детализации.'],
]

export const GOODBAD = {
  good: 'Хорошо: группа mouth содержит три вложенные группы closed, half, open.',
  bad: 'Плохо: рот одной картинкой или одним слитным контуром — приложению нечего переключать.',
}

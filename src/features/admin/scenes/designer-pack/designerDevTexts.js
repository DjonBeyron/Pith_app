import { SPRITE_KINDS } from '../../../scene/v2/spriteCheck.js'
import { NODE_BUDGET } from '../../../scene/v2/sceneBudget.js'
import { PACK_FILES } from './packConsts.js'

// Тексты раздела «Для программиста / админа»: что делать с присланным SVG, куда класть, как
// добавить в реестр и слоты, как проверить, как увидеть, как попадает в ленту/уроки, чего не
// делать, чек-лист приёмки. Показываются в админке (DesignerDevSection) и в печатном документе.
// Пути к файлам — реальные (designerDevTexts.test.js проверяет, что они существуют), числа — из ядра.

export const DEV_TITLE = 'Для программиста / админа: как добавить спрайт от дизайнера'
export const DEV_INTRO = 'Спрайты живут в коде приложения, а не в базе и не в папке с картинками: один и тот же рисунок рисует React, перекрашивает палитра персонажа и считает бюджет узлов. Поэтому присланный SVG нужно один раз перевести в код реестра — конвертер ниже делает это сам.'

export const DEV_FILES = [
  ['src/features/scene/v2/sprites/propsCommon.js', 'общие предметы (стол, окно, растение, торшер, картина)'],
  ['src/features/scene/v2/sprites/propsOffice.js', 'предметы офиса'],
  ['src/features/scene/v2/sprites/propsCafe.js', 'предметы кафе'],
  ['src/features/scene/v2/sprites/spriteRegistry.js', 'реестр SPRITES: собирает коты + предметы + фоны, считает nodeCount, viewBox, слоты'],
  ['src/features/scene/v2/sprites/slots.js', 'ячейки сцены: координаты якорей, слой, какие предметы принимают (accepts)'],
  ['src/features/scene/v2/sprites/catSprite.js', 'кот строится кодом по полу и палитре (лицо и эмоции — catFaceSprite.js)'],
  ['src/features/scene/v2/sprites/backgrounds.js', 'фоны локаций (слои wall/floor)'],
  ['src/features/scene/v2/sprites/svgTree.js', 'формат дерева { tag, attrs, children }: el(), part(), countNodes, treeToSvgDocument'],
  ['src/features/scene/v2/spriteCheck.js', 'проверка SVG дизайнера — та же, что в проверщике из пакета'],
  ['src/features/scene/v2/sprites/spriteRegistry.test.js', 'тест реестра: лимиты узлов, каждый предмет в слоте, accepts ↔ реестр'],
  ['scripts/lint-scene.mjs', 'линтер сцены из терминала (--demo проверяет встроенные сцены)'],
]

export const DEV_STEPS = [
  {
    id: 'accept', title: 'Примите файл',
    body: `Откройте присланный SVG в «Проверить SVG» выше (тип: предмет / кот / фон) — вердикт должен быть зелёным. Дизайнер мог проверить сам в файле ${PACK_FILES.checker}: проверка там та же. Красный вердикт — верните файл с пунктами из списка, в коде ничего не правьте.`,
  },
  {
    id: 'where', title: 'Куда класть',
    body: 'SVG-файл как файл в репозиторий не кладётся (папка public/ для спрайтов не используется). Предмет становится записью в массиве COMMON_PROPS / OFFICE_PROPS / CAFE_PROPS в sprites/propsCommon.js, propsOffice.js или propsCafe.js; новая категория — новый файл propsXxx.js (до 250 строк) и строка в SPRITES реестра. Кот и фон — особый случай: их строит код (catSprite.js, backgrounds.js), файл дизайнера переносится в этот код руками с помощью конвертера; эмоции и палитра кота — отдельная работа.',
  },
  {
    id: 'convert', title: 'Превратите SVG в код',
    body: 'Вставьте файл в «Конвертировать SVG в код спрайта» ниже, задайте id (= имя файла без .svg: coffee-cup), русское название, категорию и якорь — получите готовую запись. Поля записи: id, title, category, anchor (bottom — стоит на точке, center — висит центром, top — подвешен), size { w, h } (габарит = viewBox), build: () => part(id, {}, [el(\'rect\', { … }), …]). Реестр сам посчитает nodeCount, viewBox и список слотов; легенда для нейросети подхватит предмет автоматически.',
  },
  {
    id: 'slots', title: 'Добавьте в слоты',
    body: 'В sprites/slots.js впишите id предмета в accepts подходящих ячеек: напольные — floor-left / floor-right (и counter в кафе), настенные — wall-art / wall-board / wall-menu, настольные — desk-* в офисе и table-* в кафе (они требуют стол: needs: \'table\'). Новый слот — объект { id, title, x, y, layer, scale?, needs?, accepts } в COMMON_SLOTS / OFFICE_SLOTS / CAFE_SLOTS; слой — один из wall, floor, table, tabletop (порядок отрисовки). Без хотя бы одного слота предмет не появится в сборщике, а spriteRegistry.test.js упадёт.',
  },
  {
    id: 'verify', title: 'Проверьте',
    body: `npx vitest run src/features/scene/v2 — реестр (лимит узлов: предмет ≤ ${SPRITE_KINDS.prop.maxNodes}, кот ≤ ${SPRITE_KINDS.cat.maxNodes}, фон ≤ ${SPRITE_KINDS.background.maxNodes}; каждый предмет в слоте; accepts ссылаются на существующие id), затем npm run lint (0 ошибок, файлы ≤ 400 строк), node scripts/lint-scene.mjs --demo (встроенные сцены не вылезли за бюджет ${NODE_BUDGET} узлов) и полный npx vitest run.`,
  },
  {
    id: 'see', title: 'Посмотрите глазами',
    body: 'Админ → Сцены → «Спрайты»: карточка нового предмета с числом узлов, слотами и статусом проверки (можно скопировать SVG и id). «Сборщик» → ячейка → в выпадающем списке появился предмет; «Бюджет» в центре показывает, сколько узлов прибавилось. Предмет на экране телефона 390 px должен читаться без лупы.',
  },
  {
    id: 'ship', title: 'Как попадает к пользователям',
    body: 'Спрайт — часть кода, поэтому он появится у всех после деплоя новой версии приложения (APP_VERSION). Сцена с ним: сборщик → «Сохранить» → «Опубликовать» → привязать к модулю ленты (curricula.scene_id) или вставить нодой «Сцена» в урок (снимок сцены лежит в ноде). Лента и урок рисуют сцену тем же SceneRenderer из реестра: сцена ссылается на предмет по id, поэтому id существующих спрайтов менять и удалять нельзя — сохранённые сцены их потеряют.',
  },
]

export const DEV_DONTS = [
  'Не класть SVG в public/ и не подключать через <img>: спрайт не перекрасится, не посчитается в бюджете и не пройдёт проверку.',
  'Не переименовывать и не удалять id существующих спрайтов и имена групп data-part (tail, body, head, eyes, mouth …) — на них завязаны сохранённые сцены и CSS-анимации.',
  'Не добавлять в деревья filter / mask / clipPath / градиенты / <use> / <image>: svgTree бросит ошибку на запрещённый тег, а на телефонах это лаги.',
  `Не поднимать лимиты SPRITE_KINDS и NODE_BUDGET (${NODE_BUDGET}) «чтобы влезло» — сначала упростить рисунок; лимиты — защита слабых Android.`,
  'Не править supabase_schema.sql и baseline: спрайты не требуют миграций БД.',
  'Не менять viewBox кота (0 0 200 240) и фона (0 0 360 640): от них зависят CAT_PLACEMENT и координаты слотов.',
]

export const DEV_CHECKLIST = [
  'Файл проходит «Проверить SVG» своего типа (зелёный вердикт), имя латиницей-через-дефис.',
  `Узлов не больше лимита (предмет ≤ ${SPRITE_KINDS.prop.maxNodes}, лучше 4–8); тени и блики — плоскими фигурами.`,
  'Точка (0,0) — там, где надо по типу якоря: стоит на столе/полу, висит центром на стене, подвешен за верх.',
  'Цвета читаются на обоих фонах (офис светлый, кафе тёплый тёмный) и в тёмной теме.',
  'Для кота: все группы data-part, три виземы рта, эмоции отдельными файлами или группами data-emotion, палитра помечена комментарием.',
  'Запись добавлена в реестр, id — в accepts нужных слотов, тесты и lint зелёные, предмет виден в «Спрайтах» и в сборщике.',
]

export const DEV_COMMANDS = ['npx vitest run src/features/scene/v2', 'npm run lint', 'node scripts/lint-scene.mjs --demo', 'npx vitest run']

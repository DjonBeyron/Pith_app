import { PALETTE_PRESETS } from './sceneConstants.js'
import { PIT } from './scenePit.js'

// Демо-сцены v2 — пример для админки, нейросети (легенда) и тестов. Все
// проходят lintScene без ошибок (см. sceneLint.test.js). Две — из одной реплики
// (задания «Повтори» и «Ответь коту»: кот сказал — зритель повторил/ответил), последняя —
// одиночная (один кот Пит, characters без b): кружок, открывающий/закрывающий урок.

export const demoOfficeScene = {
  version: 2,
  id: 'demo-office-work',
  title: 'Про работу',
  location: 'office',
  characters: {
    a: { kind: 'cat', gender: 'male', name: 'Рыжик', palette: PALETTE_PRESETS.ginger, stripes: true, voice: { pitch: 0.8, rate: 1 } },
    b: { kind: 'cat', gender: 'female', name: 'Дымка', palette: PALETTE_PRESETS.grey, stripes: true, voice: { pitch: 1.3, rate: 1.05 } },
  },
  slots: {
    window: 'window',
    'wall-art': 'picture',
    'wall-board': 'whiteboard',
    'wall-clock': 'wall-clock',
    'floor-left': 'floor-lamp',
    'floor-right': 'plant',
    table: 'table',
    'desk-left': 'laptop',
    'desk-center': 'papers',
    'desk-right': 'mug',
  },
  timeline: [
    { who: 'a', text: 'Дымка, у нас дедлайн по отчёту уже завтра. Ты видела письмо?', emotion: 'surprised' },
    { who: 'b', text: 'Видела. Поэтому я с утра на третьей кружке кофе.', emotion: 'tired' },
    { who: 'a', text: 'Кофе — это план? Нам ещё совещание в три часа.', emotion: 'neutral' },
    { who: 'b', text: 'Совещание про то, как мы будем успевать. Классика.', emotion: 'happy' },
    { who: 'a', text: 'Давай так: ты пишешь цифры, я рисую графики. Успеем.', emotion: 'happy', pose: 'lean' },
    { who: 'b', text: 'Договорились. Но после дедлайна — спать на подоконнике до вечера.', emotion: 'happy' },
  ],
  options: { bubbles: true, autoplay: false, loop: false },
}

export const demoCafeScene = {
  version: 2,
  id: 'demo-cafe-break',
  title: 'Кофе-брейк',
  location: 'cafe',
  characters: {
    a: { kind: 'cat', gender: 'female', name: 'Мурка', palette: PALETTE_PRESETS.cream, stripes: false, voice: { pitch: 1.4, rate: 1 } },
    b: { kind: 'cat', gender: 'male', name: 'Барсик', palette: PALETTE_PRESETS.black, stripes: false, voice: { pitch: 0.7, rate: 0.95 } },
  },
  slots: {
    window: 'window',
    'wall-art': 'picture',
    'wall-menu': 'menu-board',
    ceiling: 'pendant-lamp',
    counter: 'coffee-machine',
    'floor-left': 'plant',
    'floor-right': 'floor-lamp',
    table: 'table',
    'table-left': 'coffee-cup',
    'table-right': 'pastry-plate',
  },
  timeline: [
    { who: 'a', text: 'Барсик, ты опять заказал самый большой капучино?', emotion: 'surprised' },
    { who: 'b', text: 'Это не большой. Это нормальный. Просто чашка маленькая.', emotion: 'neutral' },
    { who: 'a', text: 'Чашка размером с ведро, вообще-то.', emotion: 'happy' },
    { who: 'b', text: 'Зато круассан — один. Видишь, я умею в баланс.', emotion: 'happy', pose: 'lean' },
    { who: 'a', text: 'Ладно, половину круассана — мне. За баланс.', emotion: 'happy' },
  ],
  options: { bubbles: true, autoplay: false, loop: false },
}

const cafeCats = demoCafeScene.characters
const cafeSlots = demoCafeScene.slots

export const demoRepeatOneLineScene = {
  version: 2,
  id: 'demo-one-line-repeat',
  title: 'Одна реплика: Повтори',
  location: 'cafe',
  characters: cafeCats,
  slots: cafeSlots,
  timeline: [{ who: 'a', text: 'Coffee, please!', emotion: 'happy' }],
  options: { bubbles: true, autoplay: false, loop: false },
  task: { kind: 'repeat', lineIndex: 0, accept: ['A coffee, please'], hint: 'Скажи так же, как кот' },
}

export const demoSayOneLineScene = {
  version: 2,
  id: 'demo-one-line-say',
  title: 'Одна реплика: Ответь коту',
  location: 'cafe',
  characters: cafeCats,
  slots: cafeSlots,
  timeline: [{ who: 'b', text: 'What would you like to drink?', emotion: 'happy' }],
  options: { bubbles: true, autoplay: false, loop: false },
  task: { kind: 'say', lineIndex: 0, answers: ['Tea, please', 'I would like a coffee'], accept: ['Coffee, please'], keywords: ['tea', 'coffee'], hint: 'Назови любой напиток' },
}

// Кружок Пита: один кот по центру, 1–2 реплики, без задания (mode 'circle' ноды урока)
export const demoPitCircleScene = {
  version: 2,
  id: 'demo-pit-circle',
  title: 'Кружок Пита',
  location: 'office',
  characters: { a: PIT },
  slots: demoOfficeScene.slots,
  timeline: [
    { who: 'a', text: 'Привет! Сегодня разберём одно полезное слово.', emotion: 'happy' },
    { who: 'a', text: 'Готов? Тогда поехали.', emotion: 'neutral' },
  ],
  options: { bubbles: true, autoplay: false, loop: false },
}

// Шаблон под слова пользователя (vars): Пит просит и получает еду; слово подставляется из памяти (шаги 4–5),
// пока слов нет — запасное «a sandwich / бутерброд». {food} — слово, {food:ru} — его перевод
export const demoTemplateScene = {
  version: 2,
  id: 'demo-template-food',
  title: 'Шаблон: закажи еду',
  location: 'cafe',
  characters: { a: PIT },
  slots: cafeSlots,
  vars: { food: { pick: 'weak', fallback: { text: 'a sandwich', translation: 'бутерброд' } } },
  timeline: [
    { who: 'a', text: 'Can I have {food}, please?', emotion: 'happy', translation: 'Можно мне {food:ru}, пожалуйста?' },
    { who: 'a', text: 'Thank you! {food} looks great.', emotion: 'surprised', translation: 'Спасибо! {food:ru} выглядит отлично.' },
  ],
  options: { bubbles: true, autoplay: false, loop: false },
}

export const DEMO_SCENES = [demoOfficeScene, demoCafeScene, demoRepeatOneLineScene, demoSayOneLineScene, demoPitCircleScene, demoTemplateScene]

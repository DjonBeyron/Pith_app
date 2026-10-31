// Демо-сцена с маскотами: Пит знакомится с Мией в кафе, оба меняют лицо по ходу реплик (face — говорящий, react — слушающий).
// Реплики на английском с русским переводом, режим «текст + перевод»; озвучку (ElevenLabs) ставит сборщик кнопкой «Озвучить».
// Лица подобраны под сюжет: Пит смущается, делает вид, что всё нормально, влюбляется; Мия сначала с пафосом, потом закатывает глаза и оттаивает.
export const demoMascotScene = {
  version: 2,
  id: 'demo-mascots-meeting',
  title: 'Пит и Мия: знакомство',
  location: 'cafe',
  characters: {
    a: { kind: 'cat', gender: 'male', name: 'Пит', skin: 'kit', pupilReaction: true, extraFace: true, voice: { pitch: 0.8, rate: 0.95 } },
    b: { kind: 'cat', gender: 'female', name: 'Мия', skin: 'mia2', pupilReaction: true, extraFace: true, voice: { pitch: 1.3, rate: 0.9 } },
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
    { who: 'a', text: "Um... hi. I'm Pit.", emotion: 'neutral', face: 'shy', react: 'pathos', translation: 'Эм... привет. Я Пит.' },
    { who: 'b', text: "Oh. Hi, Pit. I'm Mia.", emotion: 'neutral', face: 'roll', react: 'pretend', translation: 'О. Привет, Пит. Я Мия.' },
    { who: 'a', text: "I like your bow. It's really nice!", emotion: 'happy', face: 'love', react: 'smirk', translation: 'Мне нравится твой бантик. Он очень красивый!' },
    { who: 'b', text: 'I know.', emotion: 'neutral', face: 'smirk', react: 'bliss', translation: 'Знаю.' },
    { who: 'a', text: 'Do you... want to share a coffee?', emotion: 'neutral', face: 'shy', react: 'interest', translation: 'Ты... хочешь выпить кофе вместе?' },
    { who: 'b', text: "Hmm. Maybe. You're kind of funny.", emotion: 'happy', face: 'smirk', react: 'love', translation: 'Хм. Может быть. Ты забавный.' },
    { who: 'a', text: 'Really?!', emotion: 'surprised', face: 'bliss', react: 'interest', translation: 'Правда?!' },
  ],
  options: { bubbles: true, autoplay: false, loop: false, display: 'both' },
}

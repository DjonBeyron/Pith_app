// Русские подписи к значениям формата сцены v2 — одним файлом, чтобы компоненты галереи,
// сборщика и спецификации не дублировали словари (и не экспортировали их из .jsx).
export const EMOTION_LABEL = { neutral: 'спокоен', happy: 'рад', tired: 'устал', surprised: 'удивлён' }
export const POSE_LABEL = { idle: 'стоит', talk: 'говорит', lean: 'наклон' }
export const MOUTH_LABEL = { closed: 'закрыт', half: 'приоткрыт', open: 'открыт' }
export const PRESET_LABEL = { ginger: 'рыжий', grey: 'серый', cream: 'кремовый', black: 'чёрный' }
export const KIND_LABEL = { cat: 'персонаж', prop: 'предмет', background: 'фон' }
export const GENDER_LABEL = { male: '♂ кот', female: '♀ кошка' }
export const PALETTE_KEYS = [['fur', 'шерсть'], ['belly', 'грудка'], ['accent', 'ухо/нос'], ['eye', 'глаза'], ['stripe', 'полоски']]
export const STATUS_LABEL = { draft: 'черновик', published: 'опубликована' }

import AudioModule      from './audio/AudioModule.jsx'
import CircleModule     from './circle/CircleModule.jsx'
import TextModule       from './text/TextModule.jsx'
import PhotoModule      from './photo/PhotoModule.jsx'
import VideoModule      from './video/VideoModule.jsx'
import StickerModule    from './sticker/StickerModule.jsx'
import SystemModule     from './system/SystemModule.jsx'
import WordChoiceModule from './word-choice/WordChoiceModule.jsx'

const MODULE_MAP = {
  audio:       AudioModule,
  circle:      CircleModule,
  text:        TextModule,
  photo:       PhotoModule,
  video:       VideoModule,
  sticker:     StickerModule,
  system:      SystemModule,
  word_choice: WordChoiceModule,
}

// Returns the component for a given node type, or null if unknown.
// To add a new module: create modules/<type>/<Type>Module.jsx and add one line here.
export function resolveModule(type) {
  return MODULE_MAP[type] ?? null
}

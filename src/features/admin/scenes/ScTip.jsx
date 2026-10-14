import HelpTip from '../signals/HelpTip.jsx'
import { helpContent } from './scenesHelp.js'

// Кнопка «?» подвкладки «Сцены»: тот же HelpTip, что в окне сигналов, но тексты — из
// scenesHelp.js по ключу. Внутри окна сборщика (.fsWin) подсказка берёт токены окна;
// в галерее и спецификации — запасные токены из admin-scenes.css (body > .htPop).
export default function ScTip({ help }) {
  return <HelpTip content={helpContent(help)} />
}

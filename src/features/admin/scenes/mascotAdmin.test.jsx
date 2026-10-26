import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { setSkin, fromScene } from './builderModel.js'
import { updateLine } from './timelineOps.js'
import { lineEditLabel, characterEditLabel } from './history/historyLabels.js'
import { speakerColor } from './ui/colorContrast.js'
import { demoMascotScene } from '../../scene/v2/demoScenes.js'
import { normalizeSceneV2 } from '../../scene/v2/sceneSchemaV2.js'
import MascotFields from './MascotFields.jsx'
import LineFaceFields from './LineFaceFields.jsx'
import MascotControls from './MascotControls.jsx'
import SpriteCard from './SpriteCard.jsx'
import { getSprite } from '../../scene/v2/sprites/spriteRegistry.js'

const scene = () => normalizeSceneV2(demoMascotScene)

describe('образ персонажа в сборщике', () => {
  it('setSkin: маскот приносит пол, имя и включённые переключатели; убирает лица, относившиеся к этому персонажу', () => {
    const s = scene()
    const next = setSkin(s, 'b', 'kit')
    expect(next.characters.b).toMatchObject({ skin: 'kit', gender: 'male', name: 'Пит', pupilReaction: true, extraFace: true })
    // face реплик, где говорит b, и react реплик, где говорит a (это лицо b), сброшены; остальное — на месте
    s.timeline.forEach((l, i) => {
      const n = next.timeline[i]
      if (l.who === 'b') { expect(n.face).toBeUndefined(); expect(n.react).toBe(l.react) } else { expect(n.react).toBeUndefined(); expect(n.face).toBe(l.face) }
    })
    expect(s.characters.b.skin).toBe('mia') // исходник не тронут
  })
  it('возврат к обычному коту убирает поля маскота, имя остаётся', () => {
    const next = setSkin(scene(), 'a', null)
    expect(next.characters.a.skin).toBeUndefined()
    expect(next.characters.a.pupilReaction).toBeUndefined()
    expect(next.characters.a.extraFace).toBeUndefined()
    expect(next.characters.a.name).toBe('Пит')
  })
  it('чужой ключ и неизвестный skin', () => {
    const s = scene()
    expect(setSkin(s, 'c', 'kit')).toBe(s)
    expect(setSkin(s, 'a', 'dog').characters.a.skin).toBeUndefined()
  })
  it('смена говорящего сбрасывает face и react реплики; прочие правки их не трогают', () => {
    const tl = scene().timeline
    const moved = updateLine(tl, 0, { who: 'b' })
    expect(moved[0].face).toBeUndefined(); expect(moved[0].react).toBeUndefined()
    const same = updateLine(tl, 0, { who: 'a' })
    expect(same[0].face).toBe('shy')
    expect(updateLine(tl, 0, { text: 'Hi' })[0].face).toBe('shy')
    expect(updateLine(tl, 0, { face: null })[0].face).toBeUndefined()
  })
  it('подписи истории, цвет метки говорящего', () => {
    expect(lineEditLabel(0, { face: 'shy' })[0]).toMatch(/лицо говорящего в реплике 1/)
    expect(lineEditLabel(2, { react: null })[0]).toMatch(/лицо слушающего в реплике 3/)
    expect(characterEditLabel('a', { pupilReaction: false })[0]).toMatch(/реакция зрачков A/)
    expect(speakerColor({ skin: 'kit' }, 'a')).toBe('#bc82fa')
    expect(speakerColor({ palette: { fur: '#112233' } }, 'a')).toBe('#112233')
  })
  it('черновик из сцены с маскотами сохраняет маскотов', () => {
    expect(fromScene(demoMascotScene).characters.a.skin).toBe('kit')
  })
})

describe('разметка форм', () => {
  it('MascotFields: три образа и два выключателя у маскота; у обычного кота выключателей нет', () => {
    const s = scene()
    const html = renderToStaticMarkup(<MascotFields who="a" character={s.characters.a} actions={{}} />)
    expect(html).toContain('Обычный кот'); expect(html).toContain('>Пит<'); expect(html).toContain('>Мия<')
    expect(html).toContain('Реакция зрачков'); expect(html).toContain('Дополнительная мимика')
    const plain = renderToStaticMarkup(<MascotFields who="a" character={{ name: 'x', gender: 'male' }} actions={{}} />)
    expect(plain).not.toContain('Реакция зрачков')
  })
  it('LineFaceFields: лицо говорящего и реакция слушающего по состояниям их маскотов', () => {
    const s = scene()
    const html = renderToStaticMarkup(<LineFaceFields prefix="f-timeline-0" index={0} line={s.timeline[0]} characters={s.characters} actions={{}} />)
    expect(html).toContain('Лицо: Пит'); expect(html).toContain('Реакция: Мия')
    expect(html).toContain('(shy)'); expect(html).toContain('(pathos)')
    expect(html).toContain('f-timeline-0-face'); expect(html).toContain('f-timeline-0-react')
  })
  it('LineFaceFields: ничего, если маскотов нет или дополнительная мимика выключена', () => {
    const s = scene()
    const off = { a: { ...s.characters.a, extraFace: false }, b: { ...s.characters.b, extraFace: false } }
    expect(renderToStaticMarkup(<LineFaceFields prefix="p" index={0} line={s.timeline[0]} characters={off} actions={{}} />)).toBe('')
    const plain = { a: { name: 'A', gender: 'male' }, b: { name: 'B', gender: 'female' } }
    expect(renderToStaticMarkup(<LineFaceFields prefix="p" index={0} line={s.timeline[0]} characters={plain} actions={{}} />)).toBe('')
  })
  it('галерея: карточка маскота с лицами, ртом и выключателями; проверка ок', () => {
    const html = renderToStaticMarkup(<SpriteCard sprite={getSprite('mascot-mia')} />)
    expect(html).toContain('Мия'); expect(html).toContain('interest'); expect(html).toContain('Реакция зрачков'); expect(html).toContain('>ок<')
    expect(renderToStaticMarkup(<MascotControls skin="kit" value={{ face: 'shy', mouth: 'open', pupilReaction: true, extraFace: true }} onChange={() => {}} />)).toContain('aria-checked="true"')
  })
})

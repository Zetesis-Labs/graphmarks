import { describe, expect, it } from 'vitest'
import { type DropSubject, dropExclusions } from './drop-rules'

const base: DropSubject = {
  id: 'b1',
  isBookmark: true,
  isAdoptable: false,
  parentId: 'f1',
  hubs: ['t:dev'],
  folderMemberIds: []
}

describe('dropExclusions', () => {
  it('las vistas derivadas no tienen semántica de soltado', () => {
    expect(dropExclusions('domains', base, '·')).toBeNull()
    expect(dropExclusions('history', base, '·')).toBeNull()
  })

  it('en tags veta los hubs ya presentes y el hub sin-etiquetar', () => {
    expect(dropExclusions('tags', base, 'untagged')).toEqual(new Set(['t:dev', 'untagged']))
    expect(dropExclusions('tags', { ...base, isBookmark: false }, 'untagged')).toBeNull()
    expect(dropExclusions('tags', { ...base, isBookmark: false, isAdoptable: true }, 'untagged')).toEqual(
      new Set(['t:dev', 'untagged'])
    )
  })

  it('en carpetas veta al sujeto, su padre y su subárbol', () => {
    const folder: DropSubject = { ...base, id: 'f2', isBookmark: false, folderMemberIds: ['f2', 'b9'] }
    expect(dropExclusions('folders', folder, '·')).toEqual(new Set(['f2', 'b9', 'f1']))
  })

  it('una pestaña adoptable solo tiene vetados sus hubs', () => {
    expect(dropExclusions('folders', { ...base, isBookmark: false, isAdoptable: true, hubs: ['gh:x'] }, '·')).toEqual(
      new Set(['gh:x'])
    )
  })
})

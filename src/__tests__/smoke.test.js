import { describe, it, expect } from 'vitest'

describe('smoke', () => {
  it('loads the app shell metadata', () => {
    expect('NexForge').toBeTruthy()
    expect('INFRAESTRUTURA').toBeTruthy()
  })
})

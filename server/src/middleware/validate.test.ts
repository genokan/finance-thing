import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import type { Request, Response } from 'express'
import { validate } from './validate'

const schema = z.object({ name: z.string().min(1), amount: z.coerce.number().positive() })

function run(body: unknown) {
  const req = { body } as Request
  const json = vi.fn()
  const status = vi.fn().mockReturnValue({ json })
  const res = { status } as unknown as Response
  const next = vi.fn()
  validate(schema)(req, res, next)
  return { req, next, status, json }
}

describe('validate middleware', () => {
  it('passes parsed (coerced) data through and calls next', () => {
    const { req, next, status } = run({ name: 'Rent', amount: '2100' })
    expect(next).toHaveBeenCalledOnce()
    expect(status).not.toHaveBeenCalled()
    expect(req.body).toEqual({ name: 'Rent', amount: 2100 })
  })

  it('rejects invalid bodies with a 400 naming the field', () => {
    const { next, status, json } = run({ name: '', amount: -5 })
    expect(next).not.toHaveBeenCalled()
    expect(status).toHaveBeenCalledWith(400)
    const payload = json.mock.calls[0]![0] as { error: string }
    expect(payload.error).toMatch(/name/)
    expect(payload.error).toMatch(/amount/)
  })

  it('strips unknown fields rather than passing them through', () => {
    const { req } = run({ name: 'Rent', amount: 1, injected: 'nope' })
    expect(req.body).not.toHaveProperty('injected')
  })
})

import type { Request, Response, NextFunction } from 'express'
import type { ZodSchema } from 'zod'

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      // Build a specific, human-readable message instead of a generic one.
      const message = result.error.issues
        .map((i) => `${i.path.join('.') || 'field'}: ${i.message}`)
        .join('; ')
      res.status(400).json({ error: message, issues: result.error.issues })
      return
    }
    req.body = result.data
    next()
  }
}

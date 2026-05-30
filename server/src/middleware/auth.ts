import { Request, Response, NextFunction } from 'express'

export function authenticate(_req: Request, _res: Response, next: NextFunction): void {
  next()
}

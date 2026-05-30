import { Request, Response, NextFunction } from 'express'

export function globalRateLimiter(_req: Request, _res: Response, next: NextFunction): void {
  next()
}

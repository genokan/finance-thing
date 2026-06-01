import pino from 'pino'

const isDev = process.env.NODE_ENV !== 'production'

// Single Pino instance for the whole server. Human-friendly pretty output in
// dev; structured JSON in production (ready to ship to a log aggregator).
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
        },
      }
    : {}),
})

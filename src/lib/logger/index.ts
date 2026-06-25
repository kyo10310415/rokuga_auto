import pino from 'pino'

const isDev = process.env.NODE_ENV !== 'production'

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  }),
  base: {
    service: 'meet-correction-app',
    env: process.env.NODE_ENV,
  },
})

/**
 * コンテキスト付きの子ロガーを作成
 */
export function createLogger(context: Record<string, unknown>) {
  return logger.child(context)
}

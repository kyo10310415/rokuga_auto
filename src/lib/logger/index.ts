import pino from 'pino'

const isDev = process.env.NODE_ENV !== 'production'

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  serializers: {
    err: () => ({ message: '処理に失敗しました。' }),
    error: () => '処理に失敗しました。',
  },
  hooks: {
    logMethod(args, method) {
      // A direct Error argument otherwise also becomes the default log message.
      if (args[0] instanceof Error) {
        args[0] = { err: true }
        if (args.length === 1) args.push('処理に失敗しました。')
      }
      return method.apply(this, args)
    },
  },
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

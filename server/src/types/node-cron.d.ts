// node-cron ships no types; minimal declaration for our usage.
declare module 'node-cron' {
  interface ScheduledTask {
    start(): void
    stop(): void
  }
  export function schedule(
    expression: string,
    task: () => void | Promise<void>,
    options?: { scheduled?: boolean; timezone?: string },
  ): ScheduledTask
  const _default: { schedule: typeof schedule }
  export default _default
}

export class AssertionError extends Error {
  constructor(message: string | void, args: any[]) {
    super(`${message || "assertion error"} ${args.join(" ")}`);
  }
}

export function assert<T>(condition: T, message?: string, ...args: any[]): T {
  if (!condition) {
    throw new AssertionError(message, args);
  }
  return condition;
}

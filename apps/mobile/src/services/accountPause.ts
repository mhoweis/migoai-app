type AccountPausedHandler = () => void | Promise<void>;

let handler: AccountPausedHandler | null = null;

export function registerAccountPausedHandler(nextHandler: AccountPausedHandler): void {
  handler = nextHandler;
}

export async function handleAccountPaused(): Promise<void> {
  await handler?.();
}

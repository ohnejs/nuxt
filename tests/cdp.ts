import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/**
 * A headless Chrome page driven over the DevTools protocol, its profile under `tests/.chrome/`.
 * Frames share the page's process, so `frame` finds a cross-origin frame's context.
 */
export async function openBrowser() {
  const profile = new URL(`.chrome/${process.pid}/`, import.meta.url).pathname;
  mkdirSync(profile, { recursive: true });
  const chrome = spawn(
    CHROME,
    [
      '--headless',
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--disable-site-isolation-trials',
      '--disable-features=IsolateOrigins,site-per-process',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  const active = `${profile}DevToolsActivePort`;
  while (!existsSync(active) || !readFileSync(active, 'utf8').includes('\n')) await sleep(50);
  const port = readFileSync(active, 'utf8').split('\n')[0];
  let target: { webSocketDebuggerUrl: string } | undefined;
  while (!target) {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    target = list.find((entry: { type: string }) => entry.type === 'page');
    if (!target) await sleep(50);
  }
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));

  let id = 0;
  const waiting = new Map<number, (value: any) => void>();
  const logs: string[] = [];
  const contexts = new Map<number, { origin: string; isDefault: boolean }>();
  socket.addEventListener('message', (message) => {
    const { id, method, params, ...rest } = JSON.parse(String(message.data));
    if (id) waiting.get(id)?.(rest);
    if (method === 'Runtime.consoleAPICalled') {
      logs.push(params.args.map((arg: any) => arg.value ?? arg.description).join(' '));
    }
    if (method === 'Runtime.exceptionThrown')
      logs.push(`exception: ${params.exceptionDetails.exception?.description}`);
    if (method === 'Runtime.executionContextCreated') {
      const { context } = params;
      contexts.set(context.id, { origin: context.origin, isDefault: context.auxData?.isDefault });
    }
    if (method === 'Runtime.executionContextDestroyed') contexts.delete(params.executionContextId);
    if (method === 'Runtime.executionContextsCleared') contexts.clear();
  });
  const send = (method: string, params = {}) =>
    new Promise<any>((resolve) => {
      waiting.set(++id, resolve);
      socket.send(JSON.stringify({ id, method, params }));
    });
  await send('Runtime.enable');
  await send('Page.enable');

  const evaluate = async (expression: string, contextId?: number) => {
    const { result, error } = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      ...(contextId && { contextId }),
    });
    if (error || result.exceptionDetails)
      throw new Error(JSON.stringify(error ?? result.exceptionDetails));
    return result.result.value;
  };
  const until = async (expression: string, contextId?: number, timeout = 8000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (await evaluate(expression, contextId).catch(() => false)) return;
      await sleep(50);
    }
    const text = await evaluate('document.body?.innerText', contextId).catch(() => '?');
    throw new Error(`Timed out waiting for ${expression}: ${text} ${logs.join(' | ')}`);
  };

  return {
    logs,
    evaluate,
    until,
    goto: (url: string) => send('Page.navigate', { url }),
    async frame(origin: string, timeout = 8000) {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        for (const [id, context] of contexts)
          if (context.origin === origin && context.isDefault) return id;
        await sleep(50);
      }
      throw new Error(`No frame shows ${origin}`);
    },
    async close() {
      socket.close();
      chrome.kill();
      await once(chrome, 'exit');
      rmSync(profile, { recursive: true, force: true });
    },
  };
}

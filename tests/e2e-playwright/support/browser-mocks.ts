import type { Page } from "@playwright/test";

export async function installClipboardMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const writes: string[] = [];
    Object.defineProperty(window, "__e2eClipboardWrites", {
      configurable: true,
      value: writes,
      writable: false
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          writes.push(value);
        }
      }
    });
  });
}

export async function installEventSourceMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const instances: Array<{
      close: () => void;
      emitMessage: (payload: unknown) => void;
      emitOpen: () => void;
      onerror: ((event: Event) => void) | null;
      onmessage: ((event: MessageEvent<string>) => void) | null;
      onopen: ((event: Event) => void) | null;
      url: string;
    }> = [];

    class MockEventSource {
      readonly close = () => undefined;
      readonly url: string;
      onerror: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent<string>) => void) | null = null;
      onopen: ((event: Event) => void) | null = null;

      constructor(url: string) {
        this.url = url;
        instances.push(this);
      }

      emitMessage(payload: unknown) {
        this.onmessage?.(
          new MessageEvent("message", {
            data: JSON.stringify(payload)
          })
        );
      }

      emitOpen() {
        this.onopen?.(new Event("open"));
      }
    }

    Object.defineProperty(window, "__e2eEventSources", {
      configurable: true,
      value: instances,
      writable: false
    });
    Object.defineProperty(window, "EventSource", {
      configurable: true,
      value: MockEventSource
    });
  });
}

export async function emitEventSourceMessage(
  page: Page,
  payload: unknown,
  index = 0
): Promise<void> {
  await page.evaluate(
    ([nextPayload, nextIndex]) => {
      (
        (window as unknown as { __e2eEventSources: Array<{ emitMessage: (payload: unknown) => void }> })
          .__e2eEventSources[nextIndex]
      )?.emitMessage(nextPayload);
    },
    [payload, index] as const
  );
}

export async function emitEventSourceOpen(page: Page, index = 0): Promise<void> {
  await page.evaluate((nextIndex) => {
    (
      (window as unknown as { __e2eEventSources: Array<{ emitOpen: () => void }> })
        .__e2eEventSources[nextIndex]
    )?.emitOpen();
  }, index);
}

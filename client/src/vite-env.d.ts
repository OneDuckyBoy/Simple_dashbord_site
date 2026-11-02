/// <reference types="vite/client" />

interface Window {
  /** От embed.js на ai-automation (client/index.html). */
  AiAutomationChat?: { mount(options: { getToken: () => Promise<string> }): unknown; unmount(): void }
}

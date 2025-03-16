import { Browser, launch } from 'puppeteer'

type WithBrowserFn<T> = (browser: Browser) => Promise<T>

export const withBrowser = async <T>(fn: WithBrowserFn<T>) => {
  const browser = await launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  try {
    return await fn(browser)
  } finally {
    await browser.close()
  }
}

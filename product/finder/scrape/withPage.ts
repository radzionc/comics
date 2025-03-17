import { Page, Browser } from 'puppeteer'

type WithPageFn<T> = (browser: Page) => Promise<T>

type MakeWithPageInput = {
  url: string
  browser: Browser
}

export const makeWithPage = ({ url, browser }: MakeWithPageInput) => {
  const withPage = async <T>(fn: WithPageFn<T>) => {
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 800 })
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    )
    await page.goto(url, { waitUntil: 'networkidle2' })

    try {
      return await fn(page)
    } finally {
      await page.close()
    }
  }

  return withPage
}

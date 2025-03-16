import { Page } from 'puppeteer'

import { ScrapePageInput } from './ScrapePageInput'

export async function getPage({
  url,
  browser,
}: ScrapePageInput): Promise<Page> {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800 })
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  )
  await page.goto(url, { waitUntil: 'networkidle2' })

  if (!page) {
    throw new Error(`Could not create new page for ${url}`)
  }

  return page
}

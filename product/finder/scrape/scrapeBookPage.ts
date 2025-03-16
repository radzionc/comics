import { attempt } from '@lib/utils/attempt'
import { Browser } from 'puppeteer'

const headerSelector = '.product-page__header h1'

type ScrapeBookPageInput = {
  url: string
  browser: Browser
}

export async function scrapeBookPage({ url, browser }: ScrapeBookPageInput) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800 })
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  )
  await page.goto(url, { waitUntil: 'networkidle2' })

  if (!page) {
    throw new Error(`Could not create new page for ${url}`)
  }

  const header = await attempt(
    page.waitForSelector(headerSelector, { timeout: 5000 }),
  )

  if ('error' in header) {
    throw new Error(`Product header not found for ${url}`)
  }

  const productName = await page.$eval(
    headerSelector,
    (el: Element) => el.textContent?.trim() || '',
  )
  if (!productName) {
    throw new Error(`Could not extract product name for ${url}`)
  }

  const priceText = await page.$eval(
    '.price-block__final-price',
    (el: Element) => el.textContent?.trim() || '',
  )
  const priceMatch = priceText.match(/[\d\s,.]+/)
  const price = priceMatch
    ? parseFloat(priceMatch[0].replace(/\s+/g, '').replace(',', '.'))
    : 0

  if (price === 0) {
    throw new Error(`Could not extract valid price for ${url}`)
  }

  const numberOfPages = await page.evaluate(() => {
    for (const element of document.querySelectorAll('*')) {
      const text = element.textContent?.trim() || ''
      if (text.includes('страниц')) {
        const pagesMatch = text.match(/(\d+)\s*страниц/)
        if (pagesMatch && pagesMatch[1]) {
          return parseInt(pagesMatch[1], 10)
        }
      }
    }
  })

  if (!numberOfPages) {
    throw new Error(`Could not find page count for ${url}`)
  }

  return {
    name: productName,
    price,
    numberOfPages,
    url,
  }
}

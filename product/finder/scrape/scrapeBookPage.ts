import { attempt, Result } from '@lib/utils/attempt'
import { Browser, Page } from 'puppeteer'

import { Book } from '../Book'

const headerSelector = '.product-page__header h1'

async function extractProductDetails(page: Page, url: string): Promise<Book> {
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
    return 0
  })

  if (numberOfPages === 0) {
    throw new Error(`Could not find page count for ${url}`)
  }

  return {
    name: productName,
    price,
    numberOfPages,
    url,
  }
}

export async function scrapeBookPage(
  url: string,
  browser: Browser,
): Promise<Result<Book, Error>> {
  let currentPage: Page | null = null

  try {
    currentPage = await browser.newPage()
    await currentPage.setViewport({ width: 1280, height: 800 })
    await currentPage.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    )
    await currentPage.goto(url, { waitUntil: 'networkidle2' })

    const result = await attempt<Book, Error>(async () => {
      return extractProductDetails(currentPage as Page, url)
    })

    return result
  } finally {
    if (currentPage) {
      await currentPage.close()
    }
  }
}

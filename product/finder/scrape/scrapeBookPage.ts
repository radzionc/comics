import { attempt } from '@lib/utils/attempt'
import { Page } from 'puppeteer'

const headerSelector = '.product-page__header h1'

export async function scrapeBookPage(page: Page) {
  const header = await attempt(
    page.waitForSelector(headerSelector, { timeout: 5000 }),
  )

  if ('error' in header) {
    throw new Error(`Product header not found for ${page.url()}`)
  }

  const productName = await page.$eval(
    headerSelector,
    (el: Element) => el.textContent?.trim() || '',
  )
  if (!productName) {
    throw new Error(`Could not extract product name for ${page.url()}`)
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
    throw new Error(`Could not extract valid price for ${page.url()}`)
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
    throw new Error(`Could not find page count for ${page.url()}`)
  }

  return {
    name: productName,
    price,
    numberOfPages,
    url: page.url(),
  }
}

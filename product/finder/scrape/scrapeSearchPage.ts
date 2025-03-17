import { sleep } from '@lib/utils/sleep'
import { Page } from 'puppeteer'

const productLinkSelector = '.product-card-list .product-card__link'

export async function scrapeSearchPage(page: Page): Promise<string[]> {
  console.log(`Scraping search page: ${page.url()}`)

  const recursiveScroll = async (pageCounts: number[]) => {
    const currentProductCount = await page.evaluate(
      (selector) => document.querySelectorAll(selector).length,
      productLinkSelector,
    )

    if (pageCounts.find((count) => count === currentProductCount)) {
      return
    }

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await sleep(1000)

    await recursiveScroll([...pageCounts, currentProductCount])
  }

  await recursiveScroll([])

  const bookLinks = await page.evaluate((selector) => {
    return Array.from(document.querySelectorAll(selector))
      .map((link) => link.getAttribute('href'))
      .filter((href): href is string => href !== null)
  }, productLinkSelector)

  if (bookLinks.length === 0) {
    throw new Error(`No books found on ${page.url()}`)
  }

  console.log(`Found ${bookLinks.length} books on ${page.url()}`)
  return bookLinks
}

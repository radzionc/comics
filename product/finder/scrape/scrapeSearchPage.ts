import { sleep } from '@lib/utils/sleep'

import { getPage } from './getPage'
import { ScrapePageInput } from './ScrapePageInput'

const productLinkSelector = '.product-card-list .product-card__link'

export async function scrapeSearchPage({
  url,
  browser,
}: ScrapePageInput): Promise<string[]> {
  const page = await getPage({ url, browser })

  console.log(`Scraping search page: ${url}`)

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

  // Extract all book links
  const bookLinks = await page.evaluate((selector) => {
    return Array.from(document.querySelectorAll(selector))
      .map((link) => link.getAttribute('href'))
      .filter((href): href is string => href !== null)
  }, productLinkSelector)

  if (bookLinks.length === 0) {
    throw new Error(`No book links found on ${url}`)
  }

  console.log(`Found ${bookLinks.length} book links`)
  return bookLinks
}

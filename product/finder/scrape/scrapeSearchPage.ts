import { attempt } from '@lib/utils/attempt'

import { getPage } from './getPage'
import { ScrapePageInput } from './ScrapePageInput'

const productLinkSelector = '.product-card-list .product-card__link'

export async function scrapeSearchPage({
  url,
  browser,
}: ScrapePageInput): Promise<string[]> {
  const page = await getPage({ url, browser })

  console.log(`Scraping search page: ${url}`)

  // Scroll and load all products
  let previousProductCount = 0
  let currentProductCount = 0
  let scrollAttempts = 0
  let noChangeCounter = 0
  const maxScrollAttempts = 50
  const scrollStabilityThreshold = 3

  do {
    currentProductCount = await page.evaluate(
      (selector) => document.querySelectorAll(selector).length,
      productLinkSelector,
    )

    console.log(
      `Current product count: ${currentProductCount}, scroll attempt: ${scrollAttempts + 1}`,
    )

    if (currentProductCount === previousProductCount) {
      noChangeCounter++
      if (noChangeCounter >= scrollStabilityThreshold) {
        console.log(
          `No new products after ${scrollStabilityThreshold} consecutive scrolls, current count: ${currentProductCount}`,
        )
        break
      }
    } else {
      noChangeCounter = 0
    }

    // Scroll to bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await new Promise((resolve) =>
      setTimeout(resolve, 1000 + Math.random() * 1000),
    )

    // Try clicking "Show more" button
    const showMoreButton = await page.$('.pagination-next')
    if (showMoreButton) {
      await attempt(async () => {
        await showMoreButton.click()
        await page.waitForNavigation({
          waitUntil: 'networkidle0',
          timeout: 5000,
        })
      })
    }

    // Incremental scrolling every 3rd attempt
    if (scrollAttempts % 3 === 0) {
      const viewportHeight = await page.evaluate(() => window.innerHeight)
      const totalHeight = await page.evaluate(() => document.body.scrollHeight)

      for (let i = 1; i <= 3; i++) {
        const targetPosition = Math.floor((totalHeight / 3) * i)
        await page.evaluate((pos) => window.scrollTo(0, pos), targetPosition)
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }

    previousProductCount = currentProductCount
    scrollAttempts++
  } while (scrollAttempts < maxScrollAttempts)

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

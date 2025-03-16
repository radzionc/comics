import puppeteer, { Browser } from 'puppeteer'

/**
 * Represents a book with its price per page information
 */
interface BookInfo {
  name: string
  price: number
  numberOfPages: number
  pricePerPage: number
  url: string
}

/**
 * Fetches and extracts product information from a Wildberries product page
 * and calculates the price per page
 * @param url The URL of the Wildberries product page
 * @param browser The browser instance to use
 * @returns BookInfo object or null if scraping failed
 */
async function scrapeWildberriesProduct(
  url: string,
  browser: Browser,
): Promise<BookInfo | null> {
  let page = null

  try {
    console.log(`Scraping product: ${url}`)

    // Open a new page
    page = await browser.newPage()

    // Set viewport size
    await page.setViewport({ width: 1280, height: 800 })

    // Set user agent to mimic a real browser
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    )

    // Navigate to the URL
    await page.goto(url, { waitUntil: 'networkidle2' })

    // Wait for product information to load with a shorter timeout
    // Use waitForSelector with optional flag to continue even if not found
    const headerExists = await page
      .waitForSelector('.product-page__header h1', { timeout: 5000 })
      .then(() => true)
      .catch(() => false)

    if (!headerExists) {
      console.log(`Product header not found for ${url}, skipping this product`)
      return null
    }

    // Extract product information using Puppeteer's evaluate
    const productName = await page.$eval(
      '.product-page__header h1',
      (el) => el.textContent?.trim() || '',
    )
    if (!productName) {
      console.log(
        `Could not extract product name for ${url}, skipping this product`,
      )
      return null
    }

    // Fix price extraction - take only the first price value
    const priceText = await page.$eval(
      '.price-block__final-price',
      (el) => el.textContent?.trim() || '',
    )
    // Extract numeric price value (remove currency symbol and convert to number)
    const priceMatch = priceText.match(/[\d\s,.]+/)
    const price = priceMatch
      ? parseFloat(priceMatch[0].replace(/\s+/g, '').replace(',', '.'))
      : 0

    if (price === 0) {
      console.log(
        `Could not extract valid price for ${url}, skipping this product`,
      )
      return null
    }

    // Extract product specifications using Puppeteer's evaluate
    const specifications = await page.evaluate(() => {
      const specs: Record<string, string> = {}
      document.querySelectorAll('.product-params__cell').forEach((element) => {
        const titleEl = element.querySelector('.product-params__cell-title')
        const textEl = element.querySelector('.product-params__cell-text')
        const name = titleEl?.textContent?.trim() || ''
        const value = textEl?.textContent?.trim() || ''
        if (name && value) {
          specs[name] = value
        }

        // Also check for direct span content for page numbers
        const spanText =
          element.querySelector('span')?.textContent?.trim() || ''
        if (spanText && spanText.includes('страниц')) {
          specs['Количество страниц'] = spanText
        }
      })
      return specs
    })

    // Look for number of pages in specifications
    let numberOfPages = 0
    const pageKeywords = [
      'Количество страниц',
      'Страниц',
      'страниц',
      'Pages',
      'pages',
    ]

    // First try to find it in specifications
    for (const key in specifications) {
      if (pageKeywords.some((keyword) => key.includes(keyword))) {
        const pagesMatch = specifications[key].match(/\d+/)
        if (pagesMatch) {
          numberOfPages = parseInt(pagesMatch[0], 10)
          break
        }
      }
    }

    // If not found in specifications, search directly in the page content
    if (numberOfPages === 0) {
      numberOfPages = await page.evaluate(() => {
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
    }

    // If still no page count found, log and skip
    if (numberOfPages === 0) {
      console.log(`Could not find page count for ${url}, skipping this product`)
      return null
    }

    // Calculate price per page
    let pricePerPage = 0
    if (numberOfPages > 0 && price > 0) {
      pricePerPage = price / numberOfPages
    }

    // Return the book information
    return {
      name: productName,
      price,
      numberOfPages,
      pricePerPage,
      url,
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error(`Error scraping the page ${url}: ${error.message}`)
    } else {
      console.error(`Unexpected error for ${url}: ${String(error)}`)
    }
    return null
  } finally {
    // Close the page but not the browser
    if (page) {
      await page.close()
    }
  }
}

/**
 * Main function to scrape books from search page and calculate price per page
 */
async function findCheapestBooksPerPage(searchUrl: string): Promise<void> {
  let browser: Browser | null = null

  try {
    // Launch a single browser instance for all operations
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })

    // Get all book links from the search page
    const bookLinks = await scrapeSearchPage(searchUrl, browser)

    if (bookLinks.length === 0) {
      console.error('No book links found on the search page')
      return
    }

    console.log(`Starting to process ${bookLinks.length} books...`)

    // Process books in batches to avoid overwhelming the system
    const batchSize = 5
    const booksInfo: (BookInfo | null)[] = []

    for (let i = 0; i < bookLinks.length; i += batchSize) {
      const batch = bookLinks.slice(i, i + batchSize)
      console.log(
        `Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(bookLinks.length / batchSize)}`,
      )

      const batchResults = await Promise.all(
        batch.map((url) => scrapeWildberriesProduct(url, browser as Browser)),
      )

      booksInfo.push(...batchResults)
    }

    // Filter out null results (failed scrapes)
    const validBooks = booksInfo.filter(
      (book): book is BookInfo => book !== null,
    )

    // Filter out books with no pages or invalid price per page
    const booksWithValidPricePerPage = validBooks.filter(
      (book) => book.numberOfPages > 0 && book.pricePerPage > 0,
    )

    if (booksWithValidPricePerPage.length === 0) {
      console.log('No books with valid price per page information found')
      return
    }

    // Sort books by price per page (cheapest first)
    const sortedBooks = booksWithValidPricePerPage.sort(
      (a, b) => a.pricePerPage - b.pricePerPage,
    )

    // Print the results
    console.log('\nBooks sorted by price per page (cheapest first):')
    sortedBooks.forEach((book, index) => {
      console.log(`\n${index + 1}. ${book.name}`)
      console.log(`   Price: ${book.price.toFixed(2)} ₽`)
      console.log(`   Pages: ${book.numberOfPages}`)
      console.log(`   Price per page: ${book.pricePerPage.toFixed(2)} ₽`)
      console.log(`   URL: ${book.url}`)
    })

    console.log(`\nTotal books processed: ${validBooks.length}`)
    console.log(
      `Books with valid price per page: ${booksWithValidPricePerPage.length}`,
    )
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error(`Error in main process: ${error.message}`)
    } else {
      console.error(`Unexpected error in main process: ${String(error)}`)
    }
  } finally {
    // Close the browser
    if (browser) {
      await browser.close()
      console.log('Browser closed')
    }
  }
}

/**
 * Scrapes a search results page to get all book links
 * @param searchUrl The URL of the search results page
 * @param browser The browser instance to use
 * @returns Array of book URLs
 */
async function scrapeSearchPage(
  searchUrl: string,
  browser: Browser,
): Promise<string[]> {
  let page = null
  try {
    console.log(`Scraping search page: ${searchUrl}`)

    page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 800 })
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    )

    await page.goto(searchUrl, { waitUntil: 'networkidle2' })

    // Wait for product cards to load
    await page.waitForSelector('.product-card__link', { timeout: 15000 })

    // Get the expected total number of products from the page
    let expectedProductCount = await page.evaluate(() => {
      // Try multiple selectors to find the product count
      // First try the specific data-link attribute
      const dataLinkSpan = document.querySelector(
        'span[data-link*="pagerModel.totalItems"]',
      )
      if (dataLinkSpan && dataLinkSpan.textContent) {
        const countText = dataLinkSpan.textContent.trim()
        const countMatch = countText.match(/\d+/)
        if (countMatch) {
          return parseInt(countMatch[0], 10)
        }
      }

      // Try a more general approach with the searching-results__count
      const countElement = document.querySelector(
        '.searching-results__count span',
      )
      if (countElement && countElement.textContent) {
        const countText = countElement.textContent.trim()
        const countMatch = countText.match(/\d+/)
        if (countMatch) {
          return parseInt(countMatch[0], 10)
        }
      }

      // As a last resort, try to find any span with a number followed by "товаров"
      const allSpans = document.querySelectorAll('span')
      for (const span of allSpans) {
        if (span.textContent) {
          const text = span.textContent.trim()
          if (/\d+/.test(text)) {
            const countMatch = text.match(/\d+/)
            if (countMatch) {
              // Check if this number is followed by "товаров" somewhere in the parent
              const parent = span.parentElement
              if (
                parent &&
                parent.textContent &&
                parent.textContent.includes('товар')
              ) {
                return parseInt(countMatch[0], 10)
              }
            }
          }
        }
      }

      // If all else fails, try to count the product cards directly
      const productCards = document.querySelectorAll('.product-card__link')
      if (productCards.length > 0) {
        return productCards.length
      }

      return 0 // Default if we can't find the count
    })

    console.log(
      `Expected total products according to the page: ${expectedProductCount}`,
    )

    // If we couldn't find the count, try a different approach with a delay
    if (expectedProductCount === 0) {
      console.log(
        'Could not find product count, waiting for page to fully load...',
      )

      // Wait a bit longer for the page to fully render
      await new Promise((resolve) => setTimeout(resolve, 5000))

      // Try again with a more direct approach
      const secondAttemptCount = await page.evaluate(() => {
        // Look for any text containing a number followed by "товаров"
        const pageText = document.body.innerText
        const matches = pageText.match(/(\d+)\s*товар/)
        if (matches && matches[1]) {
          return parseInt(matches[1], 10)
        }
        return 0
      })

      if (secondAttemptCount > 0) {
        console.log(
          `Found product count on second attempt: ${secondAttemptCount}`,
        )
        // Update the expected count
        expectedProductCount = secondAttemptCount
      }
    }

    console.log(
      `Expected total products according to the page: ${expectedProductCount}`,
    )

    // Scroll down to trigger lazy loading until no more new products appear
    console.log('Starting to scroll to load all products...')

    let previousProductCount = 0
    let currentProductCount = 0
    let scrollAttempts = 0
    const maxScrollAttempts = 50 // Increased max attempts to ensure we get all products
    const scrollStabilityThreshold = 5 // Number of consecutive scrolls with no new products before stopping

    let noChangeCounter = 0 // Count consecutive scrolls with no new products

    do {
      // Get current product count
      currentProductCount = await page.evaluate(() => {
        return document.querySelectorAll('.product-card__link').length
      })

      console.log(
        `Current product count: ${currentProductCount}, scroll attempt: ${scrollAttempts + 1}`,
      )

      // Check if we've reached the expected count
      if (
        expectedProductCount > 0 &&
        currentProductCount >= expectedProductCount
      ) {
        console.log(
          `Found all ${expectedProductCount} products, stopping scrolling`,
        )
        break
      }

      // Check if product count hasn't changed
      if (currentProductCount === previousProductCount) {
        noChangeCounter++
        console.log(
          `No new products loaded, consecutive count: ${noChangeCounter}`,
        )
      } else {
        noChangeCounter = 0 // Reset counter if we found new products
      }

      // Scroll to the bottom of the page
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))

      // Add a small random delay to mimic human behavior and give page time to load
      const randomDelay = 1000 + Math.floor(Math.random() * 1000)
      await new Promise((resolve) => setTimeout(resolve, randomDelay))

      // Also try clicking "Show more" button if it exists
      const showMoreButton = await page.$('.pagination-next')
      if (showMoreButton) {
        try {
          await showMoreButton.click()
          console.log('Clicked "Show more" button')
          await page
            .waitForNavigation({ waitUntil: 'networkidle0', timeout: 5000 })
            .catch(() =>
              console.log('Navigation timeout after clicking "Show more"'),
            )
        } catch (error) {
          console.log('Failed to click "Show more" button')
        }
      }

      // Try scrolling in smaller increments to trigger lazy loading
      if (scrollAttempts % 3 === 0) {
        const viewportHeight = await page.evaluate(() => window.innerHeight)
        const totalHeight = await page.evaluate(
          () => document.body.scrollHeight,
        )

        // Scroll in 3 steps from current position to bottom
        for (let i = 1; i <= 3; i++) {
          const targetPosition = Math.floor((totalHeight / 3) * i)
          await page.evaluate((pos) => window.scrollTo(0, pos), targetPosition)
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
      }

      previousProductCount = currentProductCount
      scrollAttempts++

      // Stop if we've scrolled many times with no change in product count
      if (noChangeCounter >= scrollStabilityThreshold) {
        console.log(
          `No new products after ${scrollStabilityThreshold} consecutive scrolls, stopping`,
        )
        break
      }
    } while (scrollAttempts < maxScrollAttempts)

    console.log(`Finished scrolling. Total scroll attempts: ${scrollAttempts}`)

    // Final check for product count
    const finalProductCount = await page.evaluate(() => {
      return document.querySelectorAll('.product-card__link').length
    })
    console.log(`Final product count: ${finalProductCount}`)

    // Extract all book links using Puppeteer's evaluate
    const bookLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.product-card__link'))
        .map((link) => link.getAttribute('href'))
        .filter((href): href is string => href !== null)
    })

    console.log(`Found ${bookLinks.length} book links on the search page`)

    // If we still don't have all products, try a different approach
    if (expectedProductCount > 0 && bookLinks.length < expectedProductCount) {
      console.log(`Still missing products. Trying alternative approach...`)

      // Try to extract links directly from the page using JavaScript
      const jsLinks = await page.evaluate(() => {
        const links = Array.from(
          document.querySelectorAll('.product-card__link'),
        )
        return links
          .map((link) => link.getAttribute('href'))
          .filter((href): href is string => href !== null)
      })

      console.log(`Found ${jsLinks.length} links using JavaScript approach`)

      // Use the larger set of links
      if (jsLinks.length > bookLinks.length) {
        return jsLinks
      }
    }

    return bookLinks
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error(`Error scraping search page: ${error.message}`)
    } else {
      console.error(`Unexpected error scraping search page: ${String(error)}`)
    }
    return []
  } finally {
    // Close the page but not the browser
    if (page) {
      await page.close()
    }
  }
}

// URL of the Wildberries search page to scrape
const searchUrl =
  'https://www.wildberries.ru/catalog/0/search.aspx?page=1&sort=popular&search=%D0%BB%D1%8E%D0%B4%D0%B8+%D0%B8%D0%BA%D1%81+%D0%BA%D0%BE%D0%BC%D0%B8%D0%BA%D1%81%D1%8B&priceU=4000%3B10000&foriginal=1'

// Execute the main function
findCheapestBooksPerPage(searchUrl)
  .then(() => console.log('Process completed'))
  .catch((error: unknown) => {
    if (error instanceof Error) {
      console.error('Process failed:', error.message)
    } else {
      console.error('Process failed:', String(error))
    }
  })

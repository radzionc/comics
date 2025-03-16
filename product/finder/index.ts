import { attempt } from '@lib/utils/attempt'
import { getErrorMessage } from '@lib/utils/getErrorMessage'
import { addQueryParams } from '@lib/utils/query/addQueryParams'
import puppeteer, { Browser } from 'puppeteer'

import { Book, getBookPricePerPage } from './Book'
import { scrapeBookPage } from './scrape/scrapeBookPage'
import { scrapeSearchPage } from './scrape/scrapeSearchPage'

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
    const searchResult = await attempt(() =>
      scrapeSearchPage({ url: searchUrl, browser: browser as Browser }),
    )
    if ('error' in searchResult) {
      console.error('Failed to scrape search page:', searchResult.error)
      return
    }

    const bookLinks = searchResult.data
    if (bookLinks.length === 0) {
      console.error('No book links found on the search page')
      return
    }

    console.log(`Starting to process ${bookLinks.length} books...`)

    // Process books in batches to avoid overwhelming the system
    const batchSize = 5
    const booksInfo: Book[] = []

    for (let i = 0; i < bookLinks.length; i += batchSize) {
      const batch = bookLinks.slice(i, i + batchSize)
      console.log(
        `Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(bookLinks.length / batchSize)}`,
      )

      const batchResults = await Promise.all(
        batch.map((url) =>
          attempt(scrapeBookPage({ url, browser: browser as Browser })),
        ),
      )

      // Filter out failed scrapes and collect successful results
      batchResults.forEach((result) => {
        if ('error' in result) {
          console.error('Failed to scrape book:', getErrorMessage(result.error))
        } else {
          booksInfo.push(result.data)
        }
      })
    }

    if (booksInfo.length === 0) {
      console.log('No books with valid information found')
      return
    }

    // Sort books by price per page (cheapest first)
    const sortedBooks = booksInfo.sort(
      (a, b) => getBookPricePerPage(a) - getBookPricePerPage(b),
    )

    // Print the results
    console.log('\nBooks sorted by price per page (cheapest first):')
    sortedBooks.forEach((book, index) => {
      console.log(`\n${index + 1}. ${book.name}`)
      console.log(`   Price: ${book.price.toFixed(2)} ₽`)
      console.log(`   Pages: ${book.numberOfPages}`)
      console.log(
        `   Price per page: ${getBookPricePerPage(book).toFixed(2)} ₽`,
      )
      console.log(`   URL: ${book.url}`)
    })

    console.log(`\nTotal books processed successfully: ${booksInfo.length}`)
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

const searchString = 'люди икс коммиксы'

// URL of the Wildberries search page to scrape
const searchUrl = addQueryParams(
  `https://www.wildberries.ru/catalog/0/search.aspx`,
  {
    page: 1,
    sort: 'popular',
    search: searchString,
    priceU: '4000;10000',
    foriginal: '1',
  },
)

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

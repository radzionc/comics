import { order } from '@lib/utils/array/order'
import { toBatches } from '@lib/utils/array/toBatches'
import { attempt } from '@lib/utils/attempt'
import { addQueryParams } from '@lib/utils/query/addQueryParams'
import { Browser } from 'puppeteer'

import { Book, getBookPagePrice } from './Book'
import { scrapeBookPage } from './scrape/scrapeBookPage'
import { scrapeSearchPage } from './scrape/scrapeSearchPage'
import { withBrowser } from './scrape/withBrowser'

const searchStrings = [
  'marvel коммиксы',
  'бэтмен коммиксы',
  'росомаха коммиксы',
]

const maxResultsToDisplay = 20
const batchSize = 5

const minPrice = 40
const maxPrice = 100

const findBooks = async (browser: Browser) => {
  const searchUrls = searchStrings.map((searchString) =>
    addQueryParams(`https://www.wildberries.ru/catalog/0/search.aspx`, {
      page: 1,
      sort: 'popular',
      search: searchString,
      priceU: [minPrice, maxPrice].map((v) => v * 100).join(';'),
      foriginal: '1',
    }),
  )

  const bookUrls: string[] = []

  for (const searchUrl of searchUrls) {
    const newBookUrls = await scrapeSearchPage({ url: searchUrl, browser })
    bookUrls.push(...newBookUrls.filter((url) => !bookUrls.includes(url)))
  }

  console.log(`Found ${bookUrls.length} book urls`)

  const batches = toBatches(bookUrls, batchSize)
  const scrapeResults = []

  for (const batch of batches) {
    console.log(`Scraping batch of ${batch.length} books`)
    const batchResults = await Promise.all(
      batch.map((url) => attempt(scrapeBookPage({ url, browser }))),
    )
    scrapeResults.push(...batchResults)
  }

  const books = scrapeResults.reduce((acc, result) => {
    if ('error' in result) {
      return acc
    }
    return [...acc, result.data]
  }, [] as Book[])

  const sortedBooks = order(books, getBookPagePrice, 'asc').slice(
    0,
    maxResultsToDisplay,
  )

  console.log('Top Deals:')
  sortedBooks.forEach((book, index) => {
    const pricePerPage = getBookPagePrice(book).toFixed(2)
    console.log(`${index + 1}. ${book.name}`)
    console.log(`Price: ${book.price}`)
    console.log(`Pages: ${book.numberOfPages}`)
    console.log(`Price per page: ${pricePerPage}`)
    console.log(`URL: ${book.url}`)
    console.log('---')
  })
}

withBrowser(findBooks).catch(console.error)

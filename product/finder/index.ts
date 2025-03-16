import { order } from '@lib/utils/array/order'
import { toBatches } from '@lib/utils/array/toBatches'
import { attempt } from '@lib/utils/attempt'
import { addQueryParams } from '@lib/utils/query/addQueryParams'
import puppeteer from 'puppeteer'

import { Book } from './Book'
import { getBookPagePrice } from './Book'
import { scrapeBookPage } from './scrape/scrapeBookPage'
import { scrapeSearchPage } from './scrape/scrapeSearchPage'

const searchStrings = [
  'marvel коммиксы',
  'бэтмен коммиксы',
  'росомаха коммиксы',
  'люди икс коммиксы',
  'человек паук коммиксы',
]

const main = async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  const searchUrls = searchStrings.map((searchString) =>
    addQueryParams(`https://www.wildberries.ru/catalog/0/search.aspx`, {
      page: 1,
      sort: 'popular',
      search: searchString,
      priceU: '4000;10000',
      foriginal: '1',
    }),
  )

  const bookUrls: string[] = []

  for (const searchUrl of searchUrls) {
    const newBookUrls = await scrapeSearchPage({ url: searchUrl, browser })
    bookUrls.push(...newBookUrls.filter((url) => !bookUrls.includes(url)))
  }

  console.log(`Found ${bookUrls.length} book urls`)

  const batches = toBatches(bookUrls, 5)
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

  const sortedBooks = order(books, getBookPagePrice, 'desc')

  console.log('\nBooks sorted by price per page (most expensive first):\n')
  sortedBooks.forEach((book) => {
    const pricePerPage = getBookPagePrice(book).toFixed(2)
    console.log(`${book.name}`)
    console.log(`Price: ${book.price}`)
    console.log(`Pages: ${book.numberOfPages}`)
    console.log(`Price per page: ${pricePerPage}`)
    console.log(`URL: ${book.url}`)
    console.log('---')
  })

  await browser.close()
}

main().catch(console.error)

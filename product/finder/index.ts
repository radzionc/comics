import { order } from '@lib/utils/array/order'
import { toBatches } from '@lib/utils/array/toBatches'
import { withoutDuplicates } from '@lib/utils/array/withoutDuplicates'
import { withoutUndefined } from '@lib/utils/array/withoutUndefined'
import { attempt } from '@lib/utils/attempt'
import { chainPromises } from '@lib/utils/promise/chainPromises'
import { addQueryParams } from '@lib/utils/query/addQueryParams'
import { Browser } from 'puppeteer'

import { getBookPagePrice, printBook } from './Book'
import { scrapeBookPage } from './scrape/scrapeBookPage'
import { scrapeSearchPage } from './scrape/scrapeSearchPage'
import { withBrowser } from './scrape/withBrowser'
import { makeWithPage } from './scrape/withPage'

const searchStrings = [
  'marvel комиксы',
  'бэтмен комиксы',
  'росомаха комиксы',
  'капитан америка комиксы',
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
      search: encodeURIComponent(searchString),
      priceU: [minPrice, maxPrice].map((v) => v * 100).join(';'),
      foriginal: '1',
    }),
  )

  const bookUrls = withoutDuplicates(
    await chainPromises(
      searchUrls.map(
        (url) => () => makeWithPage({ url, browser })(scrapeSearchPage),
      ),
    ),
  ).flat()

  console.log(`Found ${bookUrls.length} books total`)

  const batches = toBatches(bookUrls, batchSize)

  const books = withoutUndefined(
    (
      await chainPromises(
        batches.map((batch, index) => () => {
          console.log(`Scraping batch #${index + 1} of ${batches.length}`)
          return Promise.all(
            batch.map((url) => {
              const withPage = makeWithPage({ url, browser })
              return attempt(withPage(scrapeBookPage))
            }),
          )
        }),
      )
    )
      .flat()
      .flatMap(({ data }) => data),
  )

  const sortedBooks = order(books, getBookPagePrice, 'asc').slice(
    0,
    maxResultsToDisplay,
  )

  console.log('Top Deals:')
  sortedBooks.forEach((book, index) => {
    console.log(`${index + 1}. ${printBook(book)}`)
    console.log('---')
  })
}

withBrowser(findBooks).catch(console.error)

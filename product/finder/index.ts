import { order } from '@lib/utils/array/order'
import { toBatches } from '@lib/utils/array/toBatches'
import { withoutDuplicates } from '@lib/utils/array/withoutDuplicates'
import { withoutUndefined } from '@lib/utils/array/withoutUndefined'
import { attempt } from '@lib/utils/attempt'
import { getErrorMessage } from '@lib/utils/getErrorMessage'
import { chainPromises } from '@lib/utils/promise/chainPromises'
import { addQueryParams } from '@lib/utils/query/addQueryParams'
import { Browser } from 'puppeteer'

import { getBookPagePrice, printBook } from './Book'
import { productsToIgnore } from './productsToIgnore'
import { makeWithPage } from './scrape/makeWithPage'
import { scrapeBookPage } from './scrape/scrapeBookPage'
import { scrapeSearchPage } from './scrape/scrapeSearchPage'
import { withBrowser } from './scrape/withBrowser'

const searchStrings = [
  'dc',
  'бэтмен',
  'супермен',
  'marvel',
  'люди икс',
  'росомаха',
  'дэдпул',
  'сорвиголова',
  'человек паук',
  'халк',
  'черная пантера',
  'мстители',
  'капитан америка',
  'фантастическая четверка',
  'серебряный серфер',
].map((name) => `${name} комиксы`)

const maxPricePerPage = 0.11
const batchSize = 5

const minPrice = 20
const maxPrice = 100

const findBooks = async (browser: Browser) => {
  const searchUrls = searchStrings.map((searchString) =>
    addQueryParams(`https://www.wildberries.ru/catalog/0/search.aspx`, {
      page: 1,
      sort: 'popular',
      search: encodeURIComponent(searchString),
      priceU: [minPrice, maxPrice].map((v) => v * 100).join(';'),
      foriginal: '1',
      // С рейтингом от 4,7
      frating: '1',
      // with hard cover
      f1185: '1%3B10633',
      // The action number is associated with a specific sale and may change from time to time.
      action: '203668',
    }),
  )

  const bookUrls = withoutDuplicates(
    (
      await chainPromises(
        searchUrls.map((url) => async () => {
          const result = await attempt(
            makeWithPage({ url, browser })(scrapeSearchPage),
          )

          if ('error' in result) {
            console.error(getErrorMessage(result.error))
            return []
          }

          return result.data
        }),
      )
    ).flat(),
  )

  console.log(`Found ${bookUrls.length} books total`)

  const batches = toBatches(bookUrls, batchSize)

  const books = withoutUndefined(
    (
      await chainPromises(
        batches.map((batch, index) => () => {
          console.log(`Scraping batch #${index + 1} of ${batches.length}`)
          return Promise.all(
            batch.map(async (url) => {
              const result = await attempt(
                makeWithPage({ url, browser })(scrapeBookPage),
              )

              if ('error' in result) {
                console.error(getErrorMessage(result.error))
                return
              }

              return result.data
            }),
          )
        }),
      )
    )
      .flat()
      .flat(),
  ).filter(
    (book) =>
      !productsToIgnore.some((ignoreString) =>
        book.name.toLowerCase().includes(ignoreString),
      ),
  )

  const sortedBooks = order(books, getBookPagePrice, 'asc').filter(
    (book) => getBookPagePrice(book) <= maxPricePerPage,
  )

  console.log('Top Deals:')
  sortedBooks.forEach((book, index) => {
    console.log(`${index + 1}. ${printBook(book)}`)
    console.log('---')
  })
}

withBrowser(findBooks).catch(console.error)

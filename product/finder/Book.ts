export type Book = {
  name: string
  price: number
  numberOfPages: number
  url: string
}

export const getBookPagePrice = ({
  price,
  numberOfPages,
}: Pick<Book, 'price' | 'numberOfPages'>): number => {
  return price / numberOfPages
}

export const printBook = (book: Book) => {
  return [
    book.name,
    `Price: ${book.price}`,
    `Number of pages: ${book.numberOfPages}`,
    `Price per page: ${getBookPagePrice(book).toFixed(2)}`,
    `URL: ${book.url}`,
  ].join('\n')
}

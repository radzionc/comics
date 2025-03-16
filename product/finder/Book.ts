export type Book = {
  name: string
  price: number
  numberOfPages: number
  url: string
}

export const getBookPricePerPage = ({ price, numberOfPages }: Book): number => {
  return price / numberOfPages
}

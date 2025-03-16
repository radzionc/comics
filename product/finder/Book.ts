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

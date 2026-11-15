/** Brand profile > Manufacturer: the brand party card for the default manufacturer (`BrandPartyCard`). */
import type { ComponentProps } from 'react'
import { BrandPartyCard } from './party-card'

export function ManufacturerCard(props: Omit<ComponentProps<typeof BrandPartyCard>, 'role'>) {
  return <BrandPartyCard role="manufacturer" {...props} />
}

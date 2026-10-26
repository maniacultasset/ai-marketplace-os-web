/**
 * The company behind Kuinn, as on its Certificate of Incorporation and Terms (26 Oct 2026). Amazon's
 * developer website rules ask for the company name, a direct contact and the app name on the site,
 * so the footer, the pricing and contact section and both legal pages read from here.
 */
export const COMPANY = {
  product: 'Kuinn',
  legalName: 'Maniacult Technology Pvt Ltd',
  addressLines: ['RZ H-74, Street 9', 'Raghu Nagar, New Delhi 110045', 'India'],
  email: 'mukul@kuinn.in',
  phone: '+91 87004 24741',
  phoneHref: 'tel:+918700424741',
  website: 'https://kuinn.in',
} as const

export const COMPANY_ADDRESS = COMPANY.addressLines.join(', ')

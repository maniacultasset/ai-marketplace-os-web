import { describe, expect, it } from 'vitest'
import type { ChangeEvent } from 'react'
import type { z } from 'zod'
import {
  caretAfter,
  collapseSpaces,
  decimal,
  digitsOnly,
  email,
  filterInput,
  focusFirstInvalid,
  freeText,
  measure,
  money,
  nonNegativeInt,
  orgName,
  parseMoney,
  percentage,
  personName,
  phone,
  phoneChars,
  positiveInt,
  website,
} from './validation'

/** The first message, or null when the value passes. */
const msg = (schema: z.ZodType<string>, v: string) => {
  const r = schema.safeParse(v)
  return r.success ? null : (r.error.issues[0]?.message ?? '')
}

describe('personName', () => {
  const s = personName('your name', 200)
  it('accepts real names from many scripts', () => {
    for (const v of [
      'Meera Iyer',
      "D'Souza",
      'D’Souza',
      'Jean-Luc Picard',
      'J. R. Rao',
      'मीरा अय्यर',
      'श्रीनिवास',
      'ಅನನ್ಯಾ',
      'ശ്രീക്കുട്ടൻ', // Malayalam with ZWJ-free chillu
      'ক্ষ\u200Dমা', // Bengali with ZWJ
      'Zoë Saldaña',
      '李小龙',
      'محمد علي',
      '  Asha  ',
    ])
      expect(msg(s, v), v).toBeNull()
  })
  it('rejects digits with a plain fix', () => {
    expect(msg(s, '12345')).toBe('Use letters for your name, not numbers.')
    expect(msg(s, 'Meera2')).toBe('Use letters for your name, not numbers.')
    expect(msg(s, 'मीरा ४')).toBe('Use letters for your name, not numbers.') // Devanagari digit
  })
  it('rejects blanks, symbols, punctuation-only, control chars and long names', () => {
    expect(msg(s, '   ')).toBe('Enter your name.')
    expect(msg(s, 'Meera@Iyer')).toMatch(/^Use only letters/)
    expect(msg(s, 'Meera 🙂')).toMatch(/^Use only letters/)
    expect(msg(s, "-.'")).toBe('Enter your name using letters.')
    expect(msg(s, 'Me\u0000era')).toMatch(/control character/)
    expect(msg(s, 'Me\tera')).toMatch(/control character/)
    expect(msg(s, 'a'.repeat(201))).toBe('Shorten your name to 200 characters or fewer.')
    expect(msg(s, 'अ'.repeat(200))).toBeNull()
  })
  it('optional variant allows blank', () => {
    expect(msg(personName('the contact name', 200, { required: false }), '  ')).toBeNull()
  })
})

describe('orgName', () => {
  const s = orgName('the brand name', 200)
  it('accepts brand names with digits and punctuation', () => {
    for (const v of ['boAt 2.0', '7 Seas', 'H&M', "Levi's", 'Marks & Spencer', 'Yahoo!', 'Dr. Reddy’s', 'Kalakar Weaves™', 'फ़ैबइंडिया', 'Studio (North)/Delhi'])
      expect(msg(s, v), v).toBeNull()
  })
  it('rejects digits or symbols only, odd symbols, control chars and long names', () => {
    expect(msg(s, '12345')).toBe('Include at least one letter in the brand name, not only numbers or symbols.')
    expect(msg(s, '& - .')).toMatch(/^Include at least one letter/)
    expect(msg(s, 'Brand 🙂')).toMatch(/^Use letters, numbers and common punctuation/)
    expect(msg(s, 'Brand<script>')).toMatch(/^Use letters, numbers/)
    expect(msg(s, 'A\u0000B')).toMatch(/control character/)
    expect(msg(s, '')).toBe('Enter the brand name.')
    expect(msg(s, 'b'.repeat(201))).toMatch(/^Shorten/)
  })
})

describe('freeText', () => {
  it('allows line breaks, rejects other control chars, whitespace-only and long text', () => {
    const s = freeText('the reason', 10, { required: true })
    expect(msg(s, 'Line 1\nL2')).toBeNull()
    expect(msg(s, ' \n ')).toBe('Enter the reason.')
    expect(msg(s, 'a\u0007b')).toMatch(/control character/)
    expect(msg(s, 'x'.repeat(11))).toBe('Shorten the reason to 10 characters or fewer.')
    expect(msg(freeText('the note', 10), '')).toBeNull()
  })
})

describe('email and website', () => {
  it('mirrors the sign-up email rules', () => {
    const s = email()
    expect(msg(s, ' Founder@Kalakar.in ')).toBeNull()
    expect(msg(s, '')).toBe('Enter your email.')
    expect(msg(email({ label: 'the care email' }), '')).toBe('Enter the care email.')
    expect(msg(s, 'a@b@c')).toBe('Enter a valid email address.')
    expect(msg(s, 'meera kalakar.in')).toBe('Remove the spaces from the email.')
    expect(msg(s, 'mеera@kalakar.in')).toBe('Email must be plain ASCII.') // Cyrillic е
    expect(msg(s, `${'a'.repeat(250)}@b.in`)).toBe('Email is too long.')
    expect(msg(email({ required: false }), '')).toBeNull()
  })
  it('accepts a bare host and rejects other schemes', () => {
    expect(msg(website(), '')).toBeNull()
    expect(msg(website(), 'kalakar.in')).toBeNull()
    expect(msg(website(), 'localhost')).toMatch(/^Enter a full address/)
    expect(msg(website(), 'ftp://kalakar.in')).toMatch(/^Enter a full address/)
    expect(msg(website({ required: true }), ' ')).toBe('Enter a website address.')
  })
})

describe('phone', () => {
  const s = phone()
  it('accepts Indian and international formats', () => {
    for (const v of ['', '+91 98765 43210', '9876543210', '022 (4000)-1234', '+1-415-555-0100', '+44 20 7946 0958'])
      expect(msg(s, v), v).toBeNull()
  })
  it('explains letters, too few and too many digits, and the backend pattern', () => {
    expect(msg(s, '+91 abc')).toBe('Use digits for the phone number, not letters.')
    expect(msg(s, '12345')).toMatch(/too short/)
    expect(msg(s, '+91 98765 43210 12345')).toMatch(/at most 15 digits/)
    expect(msg(s, '(022) 4000-1234')).toMatch(/^Start with \+ or a digit/)
    expect(msg(phone({ required: true }), '')).toBe('Enter a phone number.')
  })
})

describe('numbers', () => {
  it('money: positive, 2 decimals, 10 whole digits, ₹ and commas ignored', () => {
    const s = money('the price')
    for (const v of ['', '1299', '1,299.50', '₹ 1,299', 'INR 999.9', '0.5']) expect(msg(s, v), v).toBeNull()
    expect(msg(s, 'abc')).toBe('Use numbers for the price, e.g. 1299 or 1299.50.')
    expect(msg(s, '0')).toBe('Enter the price as an amount above zero.')
    expect(msg(s, '-5')).toBe('Enter the price as an amount above zero.')
    expect(msg(s, '12.345')).toBe('Use at most 2 decimals in the price.')
    expect(msg(s, '12345678901')).toMatch(/as a number/)
    expect(msg(money('the MRP', { required: true }), '')).toBe('Enter the MRP.')
    expect(msg(money('the price', { max: 1000 }), '1000.01')).toMatch(/at or below 1,000/)
    expect(parseMoney('₹ 1,299.50')).toBe('1299.50')
    expect(parseMoney('  ')).toBeNull()
  })
  it('integers: stock is 0 or more, pieces are 1 or more', () => {
    const stock = nonNegativeInt('the stock')
    expect(msg(stock, '0')).toBeNull()
    expect(msg(stock, '1,200')).toBeNull()
    expect(msg(stock, 'ten')).toBe('Use digits for the stock, not letters.')
    expect(msg(stock, '1.5')).toBe('Enter the stock as a whole number.')
    expect(msg(stock, '-1')).toBe('Enter the stock as 0 or more.')
    expect(msg(positiveInt('the pieces'), '0')).toBe('Enter the pieces as 1 or more.')
    expect(msg(positiveInt('the pieces', { max: 99 }), '100')).toMatch(/at or below 99/)
  })
  it('percentage 0..100 and positive measures', () => {
    const tax = percentage('the tax rate')
    for (const v of ['0', '0.25', '5', '18', '100']) expect(msg(tax, v), v).toBeNull()
    expect(msg(tax, '100.5')).toBe('Keep the tax rate at or below 100%.')
    expect(msg(tax, '5.125')).toBe('Use at most 2 decimals in the tax rate.')
    const w = measure('the weight', { max: 50000 })
    expect(msg(w, '250')).toBeNull()
    expect(msg(w, '0')).toBe('Enter the weight as more than zero.')
    expect(msg(w, '12kg')).toBe('Use numbers for the weight, not letters.')
    expect(msg(w, '60000')).toBe('Keep the weight at or below 50000.')
  })
})

describe('sanitizers', () => {
  it('digitsOnly, decimal and phoneChars keep only what the field allows', () => {
    expect(digitsOnly('1a2 3-４')).toBe('1234')
    expect(decimal('₹1,299.505')).toBe('1299.50')
    expect(decimal('1.2.3')).toBe('1.23')
    expect(decimal('12.9', 0)).toBe('12')
    expect(decimal('abc')).toBe('')
    expect(phoneChars('+91 (98765) 43-210 ext')).toBe('+91 (98765) 43-210 ')
    expect(phoneChars('91+22')).toBe('9122')
    expect(phoneChars('Tel: +91-98765-43210')).toBe('+91-98765-43210')
    for (const f of [digitsOnly, (v: string) => decimal(v), phoneChars])
      for (const v of ['₹1,299.505', '+91 abc 12', '1.2.3']) expect(f(f(v))).toBe(f(v))
  })
  it('caretAfter keeps the caret next to the same character', () => {
    expect(caretAfter('12a3', 3, digitsOnly)).toBe(2)
    expect(caretAfter('1,299', 5, digitsOnly)).toBe(4)
  })
  it('collapseSpaces folds runs of whitespace', () => {
    expect(collapseSpaces('  Meera \n  Iyer ')).toBe('Meera Iyer')
  })
})

describe('filterInput', () => {
  it('cleans a paste in onChange and forwards the event, and forwards the ref', () => {
    const seen: string[] = []
    let refEl: HTMLInputElement | null = null
    const props = filterInput(
      { onChange: (e: ChangeEvent<HTMLInputElement>) => void seen.push(e.target.value), ref: (el: HTMLInputElement | null) => void (refEl = el) },
      digitsOnly,
    )
    const el = document.createElement('input')
    props.ref(el)
    expect(refEl).toBe(el)
    el.value = '12ab34'
    props.onChange({ target: el, nativeEvent: new Event('input') } as unknown as ChangeEvent<HTMLInputElement>)
    expect(el.value).toBe('1234')
    expect(seen).toEqual(['1234'])
  })
  it('refuses a typed character the filter would drop', () => {
    const rejected: string[] = []
    const props = filterInput({}, digitsOnly, { onReject: (s) => rejected.push(s) })
    const el = document.createElement('input')
    props.ref(el)
    el.value = '12'
    el.setSelectionRange(2, 2)
    const typeChar = (data: string) => {
      const e = new InputEvent('beforeinput', { data, inputType: 'insertText', cancelable: true })
      el.dispatchEvent(e)
      return e.defaultPrevented
    }
    expect(typeChar('a')).toBe(true)
    expect(typeChar('3')).toBe(false)
    expect(rejected).toEqual(['a'])
  })
})

describe('focusFirstInvalid', () => {
  it('focuses the first invalid control', () => {
    const root = document.createElement('form')
    root.innerHTML = '<input id="a"><input id="b" aria-invalid="true"><input id="c" aria-invalid="true">'
    document.body.append(root)
    expect(focusFirstInvalid(root)).toBe(true)
    expect(document.activeElement?.id).toBe('b')
    root.remove()
  })
})

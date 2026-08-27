import { describe, it, expect } from 'vitest'
import { cmToImperialStr } from './units'

describe('cmToImperialStr', () => {
  it('returns 0" for zero, negative, or non-finite input', () => {
    expect(cmToImperialStr(0)).toBe('0"')
    expect(cmToImperialStr(-10)).toBe('0"')
    expect(cmToImperialStr(NaN)).toBe('0"')
    expect(cmToImperialStr(Infinity)).toBe('0"')
  })

  it('formats a plain inches value with no feet promotion below 36"', () => {
    // 10cm = 3.937in -> 3 15/16" (useFeet has no effect this low)
    expect(cmToImperialStr(10)).toBe('3 15/16"')
  })

  it('promotes to feet only at/above 36 inches when useFeet is true', () => {
    // 35.5in in cm, just under the 36" feet-promotion threshold.
    const justBelow = 35.5 * 2.54
    expect(cmToImperialStr(justBelow)).not.toContain("'")

    // A real shortboard length, well past 36": e.g. 6'2" (74in) -> 188.0 cm approx.
    const sixTwo = 74 * 2.54
    expect(cmToImperialStr(sixTwo)).toBe(`6' 2"`)
  })

  it('never promotes to feet when useFeet is false, even for large values', () => {
    const sixTwo = 74 * 2.54
    expect(cmToImperialStr(sixTwo, false)).not.toContain("'")
    expect(cmToImperialStr(sixTwo, false)).toBe('74"')
  })

  it('rounds a fraction that lands on 16/16 up into the next whole inch', () => {
    // 1 inch minus a hair under 1/32" rounds the 16ths fraction up to 16/16,
    // which the implementation must carry into wholeInches, not print "1 16/16".
    const almostTwoInches = 1.999 * 2.54
    const result = cmToImperialStr(almostTwoInches, false)
    expect(result).not.toMatch(/16\/16/)
    expect(result).toBe('2"')
  })

  it('reduces the sixteenths fraction to lowest terms', () => {
    // 0.5in -> 8/16 must print as 1/2, not 8/16.
    const halfInch = 0.5 * 2.54
    expect(cmToImperialStr(halfInch, false)).toBe('0 1/2"')
  })

  it('carries a whole-inch rollover from 12 into an extra foot, printing the 0" (regression)', () => {
    // 11.999in worth past 5 feet: 5*12 + 11.999 ~ rounds the fraction up to
    // wholeInches=12, which must roll into feet=6, inches=0.
    // Before the fix, landing exactly on a foot boundary suppressed the
    // inches digit entirely (`6'"` — malformed, missing "0"), because the
    // digit was only printed when wholeInches>0 or a fraction was present.
    // The fix also prints it whenever feet are shown, so this is `6' 0"`.
    const fiveFeetAlmostTwelve = (5 * 12 + 11.999) * 2.54
    expect(cmToImperialStr(fiveFeetAlmostTwelve)).toBe(`6' 0"`)
  })
})

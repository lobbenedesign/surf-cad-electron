// Clean-room implementation of imperial surfboard unit conversion.
// Converts centimeters to standard feet, inches, and fractional 16ths format (e.g. 6' 2" 1/4).

export function cmToImperialStr(cm: number, useFeet: boolean = true): string {
  if (!Number.isFinite(cm) || cm <= 0) return '0"'

  const totalInches = cm / 2.54
  let feet = 0
  let inches = totalInches
  let hasFeet = false

  // Promote to feet only if >= 3 feet (36 inches)
  if (useFeet && totalInches >= 36) {
    feet = Math.floor(totalInches / 12)
    inches = totalInches - feet * 12
    hasFeet = true
  }

  let wholeInches = Math.floor(inches)
  let fractionFloat = inches - wholeInches

  // Round to nearest 1/16th
  let sixteenths = Math.round(fractionFloat * 16)
  if (sixteenths === 16) {
    wholeInches += 1
    sixteenths = 0
  }
  if (hasFeet && wholeInches === 12) {
    feet += 1
    wholeInches = 0
  }

  let fractionStr = ''
  if (sixteenths > 0) {
    let num = sixteenths
    let den = 16
    while (num % 2 === 0) {
      num /= 2
      den /= 2
    }
    fractionStr = `${num}/${den}`
  }

  let result = ''
  if (hasFeet && feet > 0) {
    result += `${feet}'`
  }

  if (wholeInches > 0 || fractionStr !== '' || hasFeet) {
    if (result.length > 0) {
      result += ' '
    }
    result += `${wholeInches}`
    if (fractionStr !== '') {
      result += ` ${fractionStr}`
    }
  } else if (result.length === 0) {
    result = '0'
  }

  result += '"'
  return result
}

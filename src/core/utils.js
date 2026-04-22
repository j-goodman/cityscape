const numberFormatter = new Intl.NumberFormat('en-US')

export const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(value, maximum))

export const lerp = (start, end, amount) => start + (end - start) * amount

export const easeInOutCubic = value => (
  value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2
)

export const shuffleArray = values => {
  const shuffledValues = [...values]

  for (let index = shuffledValues.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const currentValue = shuffledValues[index]

    shuffledValues[index] = shuffledValues[swapIndex]
    shuffledValues[swapIndex] = currentValue
  }

  return shuffledValues
}

export const pickRandomItem = values => values[Math.floor(Math.random() * values.length)]

export const splitText = (context, value, maxWidth) => {
  if (!value) {
    return ['']
  }

  const paragraphs = value.split('\n')
  const lines = []

  paragraphs.forEach(paragraph => {
    const words = paragraph.trim().split(/\s+/).filter(Boolean)

    if (words.length === 0) {
      lines.push('')
      return
    }

    let currentLine = words[0]

    words.slice(1).forEach(word => {
      const nextLine = `${currentLine} ${word}`

      if (context.measureText(nextLine).width <= maxWidth) {
        currentLine = nextLine
        return
      }

      lines.push(currentLine)
      currentLine = word
    })

    lines.push(currentLine)
  })

  return lines
}

export const formatNumber = value => numberFormatter.format(Math.round(value))

export const formatCurrency = value => `$${formatNumber(value)}`

export const quantizeOpacity = value => {
  if (value >= 0.82) {
    return 1
  }

  if (value >= 0.62) {
    return 0.75
  }

  if (value >= 0.42) {
    return 0.5
  }

  return 0.25
}

export const normalizeRange = (value, minimum, maximum) => {
  if (maximum === minimum) {
    return 0
  }

  return clamp((value - minimum) / (maximum - minimum), 0, 1)
}

export const distanceBetweenPoints = (first, second) => {
  const deltaX = first.x - second.x
  const deltaY = first.y - second.y

  return Math.sqrt(deltaX * deltaX + deltaY * deltaY)
}

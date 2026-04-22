import { pickRandomItem, shuffleArray } from './utils.js'

export const flagAspectRatio = 155 / 141

const flagColorChannels = ['b', 'g', 'r', 'k', 'w']
const midgroundShapeNames = ['chevron', 'easthalf', 'risingcircle', 'cross', 'bend', 'saltire', 'circle', 'topslash', 'triple', 'waves', 'teeth', 'net']
const foregroundShapeNames = [
  'arrow',
  'bear',
  'bee',
  'bison',
  'coinpair',
  'crow',
  'crownpair',
  'cup',
  'diamonds',
  'dog',
  'dragon',
  'eagle',
  'fish',
  'gull',
  'hand',
  'horse',
  'key',
  'moon',
  'moose',
  'mountainlion',
  'peacock',
  'pleiades',
  'seahorse',
  'serpent',
  'star',
  'starpair',
  'sun',
  'swan',
  'thistle',
  'twostars',
  'unstar',
  'wheel'
]
const validMidgroundShapeNameSet = new Set(midgroundShapeNames)
const validForegroundShapeNameSet = new Set(foregroundShapeNames)
export const heraldicForegroundShapeNames = [...foregroundShapeNames]
export const sanitizeFlagSpec = flagSpec => {
  if (!flagSpec) {
    return flagSpec
  }

  return {
    ...flagSpec,
    midground: flagSpec.midground && validMidgroundShapeNameSet.has(flagSpec.midground.shape)
      ? flagSpec.midground
      : null,
    foreground: flagSpec.foreground && validForegroundShapeNameSet.has(flagSpec.foreground.shape)
      ? flagSpec.foreground
      : null
  }
}
const midgroundShapeFrequency = {
  chevron: 4,
  easthalf: 9,
  risingcircle: 4,
  cross: 2,
  bend: 5,
  saltire: 3,
  circle: 4,
  topslash: 8,
  triple: 5,
  waves: 3,
  teeth: 2,
  net: 1
}
const weightedMidgroundShapes = midgroundShapeNames.flatMap(shape => (
  Array.from({ length: midgroundShapeFrequency[shape] }, () => shape)
))
const midgroundOpacityOptions = [0.58, 0.22]
const layeredMidgroundOpacityOptions = [0.72, 0.58]
const foregroundOpacityOptions = [0.9]
const flagMidgroundChance = 2 / 3
const flagForegroundChance = 2 / 3
const colorChannelValues = {
  b: [0, 0, 255],
  g: [0, 255, 0],
  r: [255, 0, 0],
  k: [0, 0, 0],
  w: [255, 255, 255]
}

const heraldicFlagPalette = [
  {
    name: 'gold',
    complements: ['navy blue', 'royal blue', 'burgundy', 'plum', 'charcoal', 'teal', 'forest green'],
    layers: [
      { key: 'w', alpha: 1 },
      { key: 'g', alpha: 0.56 },
      { key: 'r', alpha: 0.47 },
      { key: 'k', alpha: 0.03 }
    ]
  },
  {
    name: 'red',
    complements: ['silver', 'ivory', 'charcoal'],
    layers: [
      { key: 'w', alpha: 1 },
      { key: 'g', alpha: 0.12 },
      { key: 'r', alpha: 0.78 },
      { key: 'k', alpha: 0.16 }
    ]
  },
  {
    name: 'navy blue',
    complements: ['gold', 'saffron', 'silver', 'ivory', 'maroon', 'burgundy'],
    layers: [
      { key: 'w', alpha: 1 },
      { key: 'r', alpha: 0.04 },
      { key: 'b', alpha: 0.7 },
      { key: 'k', alpha: 0.34 }
    ]
  },
  {
    name: 'royal blue',
    complements: ['gold', 'saffron', 'silver', 'ivory', 'plum'],
    layers: [
      { key: 'w', alpha: 1 },
      { key: 'g', alpha: 0.22 },
      { key: 'b', alpha: 0.58 },
      { key: 'k', alpha: 0.12 }
    ]
  },
  {
    name: 'forest green',
    complements: ['silver', 'gold', 'ivory', 'saffron'],
    layers: [
      { key: 'k', alpha: 1 },
      { key: 'w', alpha: 0.1 },
      { key: 'g', alpha: 0.4 },
      { key: 'b', alpha: 0.08 }
    ]
  },
  {
    name: 'maroon',
    complements: ['silver', 'ivory', 'navy blue'],
    layers: [
      { key: 'w', alpha: 1 },
      { key: 'g', alpha: 0.05 },
      { key: 'r', alpha: 0.62 },
      { key: 'b', alpha: 0.05 },
      { key: 'k', alpha: 0.28 }
    ]
  },
  {
    name: 'burgundy',
    complements: ['gold', 'silver', 'ivory', 'navy blue', 'teal'],
    layers: [
      { key: 'w', alpha: 1 },
      { key: 'g', alpha: 0.02 },
      { key: 'r', alpha: 0.72 },
      { key: 'b', alpha: 0.18 },
      { key: 'k', alpha: 0.34 }
    ]
  },
  {
    name: 'saffron',
    complements: ['navy blue', 'royal blue', 'forest green', 'charcoal', 'teal', 'plum'],
    layers: [
      { key: 'w', alpha: 1 },
      { key: 'g', alpha: 0.66 },
      { key: 'r', alpha: 0.53 },
      { key: 'k', alpha: 0 }
    ]
  },
  {
    name: 'ivory',
    complements: ['navy blue', 'burgundy', 'forest green', 'maroon', 'teal', 'red', 'royal blue', 'charcoal'],
    layers: [
      { key: 'w', alpha: 1 },
      { key: 'r', alpha: 0.06 },
      { key: 'g', alpha: 0.04 },
      { key: 'k', alpha: 0.08 }
    ]
  },
  {
    name: 'teal',
    complements: ['gold', 'silver', 'saffron', 'ivory', 'burgundy', 'plum'],
    layers: [
      { key: 'w', alpha: 1 },
      { key: 'g', alpha: 0.42 },
      { key: 'b', alpha: 0.52 },
      { key: 'k', alpha: 0.22 }
    ]
  },
  {
    name: 'plum',
    complements: ['gold', 'silver', 'saffron', 'ivory', 'teal', 'royal blue'],
    layers: [
      { key: 'w', alpha: 1 },
      { key: 'r', alpha: 0.48 },
      { key: 'b', alpha: 0.42 },
      { key: 'k', alpha: 0.36 }
    ]
  },
  {
    name: 'charcoal',
    complements: ['gold', 'saffron', 'silver', 'red', 'ivory'],
    layers: [
      { key: 'k', alpha: 1 },
      { key: 'w', alpha: 0.08 },
      { key: 'b', alpha: 0.06 }
    ]
  },
  {
    name: 'silver',
    complements: ['maroon', 'burgundy', 'forest green', 'navy blue', 'red', 'plum', 'teal', 'royal blue', 'charcoal', 'gold'],
    layers: [
      { key: 'w', alpha: 1 },
      { key: 'k', alpha: 0.22 },
      { key: 'b', alpha: 0.04 }
    ]
  }
]
const recipeByName = Object.fromEntries(heraldicFlagPalette.map(recipe => [recipe.name, recipe]))
const heraldicRecipeNames = heraldicFlagPalette.map(recipe => recipe.name)

const backgroundAssetSources = Object.fromEntries(
  flagColorChannels.map(channel => [
    channel,
    new URL(`../../assets/flags/backgrounds/background-${channel}.png`, import.meta.url).href
  ])
)
const midgroundAssetSources = Object.fromEntries(
  midgroundShapeNames.map(shape => [
    shape,
    Object.fromEntries(
      flagColorChannels.map(channel => [
        channel,
        new URL(`../../assets/flags/midgrounds/${shape}-${channel}.png`, import.meta.url).href
      ])
    )
  ])
)
const foregroundAssetSources = Object.fromEntries(
  foregroundShapeNames.map(shape => [
    shape,
    Object.fromEntries(
      flagColorChannels.map(channel => [
        channel,
        new URL(`../../assets/flags/foregrounds/${shape}-${channel}.png`, import.meta.url).href
      ])
    )
  ])
)
const flagAssetSources = {
  tarnish: new URL('../../assets/crest-tarnish.png', import.meta.url).href,
  backgrounds: backgroundAssetSources,
  midgrounds: midgroundAssetSources,
  foregrounds: foregroundAssetSources
}

const loadImage = source => new Promise((resolve, reject) => {
  const image = new Image()
  image.decoding = 'async'
  image.onload = () => resolve(image)
  image.onerror = () => reject(new Error(`Failed to load image: ${source}`))
  image.src = source
})

const hashString = value => {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

const getDeterministicUnitValue = value => hashString(value) / 4294967295

const createDeterministicChooser = seed => ({
  pick: (items, key = 'pick') => {
    if (!items.length) {
      return null
    }

    const index = Math.min(
      items.length - 1,
      Math.floor(getDeterministicUnitValue(`${seed}|${key}`) * items.length)
    )

    return items[index]
  },
  chance: (threshold, key = 'chance') => getDeterministicUnitValue(`${seed}|${key}`) < threshold
})

const pickOption = (items, chooser = null, key = 'pick') => {
  if (!items.length) {
    return null
  }

  return chooser ? chooser.pick(items, key) : pickRandomItem(items)
}

const getRecipe = recipeName => recipeByName[recipeName]

const getRecipeColor = recipeName => getRecipe(recipeName).layers.reduce((currentColor, layer) => {
  const layerColor = colorChannelValues[layer.key]

  return currentColor.map((channelValue, index) => (
    layerColor[index] * layer.alpha + channelValue * (1 - layer.alpha)
  ))
}, [0, 0, 0])

const getRecipeSaturation = recipeName => {
  const [red, green, blue] = getRecipeColor(recipeName).map(channelValue => channelValue / 255)
  const maximum = Math.max(red, green, blue)
  const minimum = Math.min(red, green, blue)
  const lightness = (maximum + minimum) / 2

  if (maximum === minimum) {
    return 0
  }

  const delta = maximum - minimum

  return lightness > 0.5
    ? delta / (2 - maximum - minimum)
    : delta / (maximum + minimum)
}

const rgbToHsl = ([redChannel, greenChannel, blueChannel]) => {
  const red = redChannel / 255
  const green = greenChannel / 255
  const blue = blueChannel / 255
  const maximum = Math.max(red, green, blue)
  const minimum = Math.min(red, green, blue)
  const lightness = (maximum + minimum) / 2

  if (maximum === minimum) {
    return { hue: 0, saturation: 0, lightness }
  }

  const delta = maximum - minimum
  const saturation = lightness > 0.5
    ? delta / (2 - maximum - minimum)
    : delta / (maximum + minimum)
  let hue = 0

  if (maximum === red) {
    hue = (green - blue) / delta + (green < blue ? 6 : 0)
  } else if (maximum === green) {
    hue = (blue - red) / delta + 2
  } else {
    hue = (red - green) / delta + 4
  }

  return {
    hue: hue / 6,
    saturation,
    lightness
  }
}

const hueToRgb = (first, second, hue) => {
  let nextHue = hue

  if (nextHue < 0) {
    nextHue += 1
  }

  if (nextHue > 1) {
    nextHue -= 1
  }

  if (nextHue < 1 / 6) {
    return first + (second - first) * 6 * nextHue
  }

  if (nextHue < 1 / 2) {
    return second
  }

  if (nextHue < 2 / 3) {
    return first + (second - first) * (2 / 3 - nextHue) * 6
  }

  return first
}

const hslToRgb = ({ hue, saturation, lightness }) => {
  if (saturation === 0) {
    const channelValue = Math.round(lightness * 255)
    return [channelValue, channelValue, channelValue]
  }

  const second = lightness < 0.5
    ? lightness * (1 + saturation)
    : lightness + saturation - lightness * saturation
  const first = 2 * lightness - second

  return [
    Math.round(hueToRgb(first, second, hue + 1 / 3) * 255),
    Math.round(hueToRgb(first, second, hue) * 255),
    Math.round(hueToRgb(first, second, hue - 1 / 3) * 255)
  ]
}

const getKeyColorRgbForRecipeInternal = recipeName => {
  const baseColor = getRecipeColor(recipeName)
  const baseHsl = rgbToHsl(baseColor)

  return hslToRgb({
    hue: baseHsl.hue,
    saturation: Math.max(0.76, baseHsl.saturation),
    lightness: Math.min(0.56, Math.max(0.4, baseHsl.lightness))
  })
}

const getFlagKeyColorSurfacePreference = ({ layerRole, opacity = 1 }) => {
  if (layerRole === 'foreground') {
    return 1.45 + opacity * 0.2
  }

  if (layerRole === 'background') {
    return 1.28
  }

  return 0.22 + opacity * 0.45
}

export const getFlagKeyColorCandidates = flagSpec => {
  const candidateLayers = [
    flagSpec.foreground
      ? {
          recipeName: flagSpec.foreground.color,
          prominence: 3.4 + flagSpec.foreground.opacity * 1.05 + getRecipeSaturation(flagSpec.foreground.color),
          layerRoles: ['foreground'],
          surfacePreference: getFlagKeyColorSurfacePreference({
            layerRole: 'foreground',
            opacity: flagSpec.foreground.opacity
          })
        }
      : null,
    flagSpec.midground
      ? {
          recipeName: flagSpec.midground.color,
          prominence: 1.15 + flagSpec.midground.opacity * 0.45 + getRecipeSaturation(flagSpec.midground.color) * 0.45,
          layerRoles: ['midground'],
          surfacePreference: getFlagKeyColorSurfacePreference({
            layerRole: 'midground',
            opacity: flagSpec.midground.opacity
          })
        }
      : null,
    flagSpec.background
      ? {
          recipeName: flagSpec.background,
          prominence: 2.75 + getRecipeSaturation(flagSpec.background) * 0.65,
          layerRoles: ['background'],
          surfacePreference: getFlagKeyColorSurfacePreference({ layerRole: 'background' })
        }
      : null
  ].filter(Boolean)
  const candidateByRecipe = new Map()

  candidateLayers.forEach(candidate => {
    const existingCandidate = candidateByRecipe.get(candidate.recipeName)

    if (!existingCandidate) {
      candidateByRecipe.set(candidate.recipeName, candidate)
      return
    }

    candidateByRecipe.set(candidate.recipeName, {
      recipeName: candidate.recipeName,
      prominence: Math.max(existingCandidate.prominence, candidate.prominence),
      layerRoles: [...new Set([...existingCandidate.layerRoles, ...candidate.layerRoles])],
      surfacePreference: Math.max(existingCandidate.surfacePreference, candidate.surfacePreference)
    })
  })

  return [...candidateByRecipe.values()]
    .sort((firstCandidate, secondCandidate) => (
      secondCandidate.surfacePreference * 1.6 + secondCandidate.prominence
    ) - (
      firstCandidate.surfacePreference * 1.6 + firstCandidate.prominence
    ))
}

export const getFlagKeyColorRecipe = flagSpec => (
  flagSpec.keyColorRecipe ?? getFlagKeyColorCandidates(flagSpec)[0]?.recipeName ?? 'gold'
)

export const getKeyColorRgbForRecipe = recipeName => getKeyColorRgbForRecipeInternal(recipeName)

const getFlagHaloColor = flagSpec => {
  const haloColor = getKeyColorRgbForRecipeInternal(getFlagKeyColorRecipe(flagSpec))

  return `rgb(${haloColor[0]}, ${haloColor[1]}, ${haloColor[2]})`
}

const getRecipeLuminance = recipeName => {
  const [red, green, blue] = getRecipeColor(recipeName)
  return red * 0.2126 + green * 0.7152 + blue * 0.0722
}

const getValueBand = recipeName => {
  const luminance = getRecipeLuminance(recipeName)

  if (luminance <= 80) {
    return 'dark'
  }

  if (luminance >= 150) {
    return 'light'
  }

  return 'mid'
}

const getValueContrastScore = (firstRecipeName, secondRecipeName) => {
  const luminanceDifference = Math.abs(getRecipeLuminance(firstRecipeName) - getRecipeLuminance(secondRecipeName))
  const firstBand = getValueBand(firstRecipeName)
  const secondBand = getValueBand(secondRecipeName)
  const bandBonus = firstBand === secondBand
    ? 0
    : firstBand !== 'mid' && secondBand !== 'mid'
      ? 28
      : 14

  return luminanceDifference + bandBonus
}

const hasContrastingValue = (firstRecipeName, secondRecipeName) => {
  const firstBand = getValueBand(firstRecipeName)
  const secondBand = getValueBand(secondRecipeName)

  if (firstBand === secondBand && firstBand !== 'mid') {
    return false
  }

  return getValueContrastScore(firstRecipeName, secondRecipeName) >= 72
}

const hasHighForegroundContrast = (lowerRecipeName, upperRecipeName) => {
  const luminanceDifference = Math.abs(getRecipeLuminance(lowerRecipeName) - getRecipeLuminance(upperRecipeName))
  const lowerBand = getValueBand(lowerRecipeName)
  const upperBand = getValueBand(upperRecipeName)

  if (luminanceDifference < 108) {
    return false
  }

  if (
    (lowerBand === 'dark' && upperBand === 'light') ||
    (lowerBand === 'light' && upperBand === 'dark')
  ) {
    return true
  }

  return lowerBand !== upperBand
}

const hasVisibleForegroundContrast = (lowerRecipeName, upperRecipeName, lowerOpacity = 1) => {
  if (!hasContrastingValue(lowerRecipeName, upperRecipeName)) {
    return false
  }

  return lowerOpacity < 0.9
    ? true
    : hasHighForegroundContrast(lowerRecipeName, upperRecipeName)
}

const hasSoftLayerSeparation = (firstRecipeName, secondRecipeName) => (
  getValueContrastScore(firstRecipeName, secondRecipeName) >= 40
)

const hasComplementaryHuePair = (baseRecipeName, candidateRecipeName) => (
  recipeByName[baseRecipeName].complements?.includes(candidateRecipeName) ||
  recipeByName[candidateRecipeName].complements?.includes(baseRecipeName)
)

const rankCandidatesByValueContrast = (usedRecipeNames, candidateRecipeNames) => [...candidateRecipeNames]
  .sort((firstCandidateRecipeName, secondCandidateRecipeName) => {
    const firstScore = Math.min(...usedRecipeNames.map(usedRecipeName => getValueContrastScore(usedRecipeName, firstCandidateRecipeName)))
    const secondScore = Math.min(...usedRecipeNames.map(usedRecipeName => getValueContrastScore(usedRecipeName, secondCandidateRecipeName)))

    if (secondScore !== firstScore) {
      return secondScore - firstScore
    }

    const firstHueBonus = hasComplementaryHuePair(usedRecipeNames.at(-1), firstCandidateRecipeName) ? 1 : 0
    const secondHueBonus = hasComplementaryHuePair(usedRecipeNames.at(-1), secondCandidateRecipeName) ? 1 : 0

    return secondHueBonus - firstHueBonus
  })

const pickTopValueCandidate = (usedRecipeNames, candidateRecipeNames, chooser = null, key = 'top-value') => {
  if (candidateRecipeNames.length === 0) {
    return null
  }

  const rankedCandidates = rankCandidatesByValueContrast(usedRecipeNames, candidateRecipeNames)

  return pickOption(rankedCandidates.slice(0, Math.min(3, rankedCandidates.length)), chooser, key)
}

const getAccessibleFallbackForegroundColor = (usedRecipeNames, chooser = null, key = 'fallback-foreground') => {
  const candidates = heraldicFlagPalette
    .map(recipe => recipe.name)
    .filter(candidateRecipeName => (
      usedRecipeNames.every(usedRecipeName => (
        usedRecipeName !== candidateRecipeName &&
        hasContrastingValue(usedRecipeName, candidateRecipeName) &&
        hasHighForegroundContrast(usedRecipeName, candidateRecipeName)
      ))
    ))

  return pickTopValueCandidate(usedRecipeNames, candidates, chooser, key)
}

const getAccessibleFallbackMidgroundColor = (usedRecipeNames, chooser = null, key = 'fallback-midground') => {
  const baseRecipeName = usedRecipeNames.at(-1)
  const candidates = heraldicFlagPalette
    .map(recipe => recipe.name)
    .filter(candidateRecipeName => (
      usedRecipeNames.every(usedRecipeName => usedRecipeName !== candidateRecipeName) &&
      hasSoftLayerSeparation(baseRecipeName, candidateRecipeName)
    ))

  return pickTopValueCandidate([baseRecipeName], candidates, chooser, key)
}

const getAccessibleFallbackHighContrastMidgroundColor = (usedRecipeNames, chooser = null, key = 'fallback-high-contrast-midground') => {
  const candidates = heraldicFlagPalette
    .map(recipe => recipe.name)
    .filter(candidateRecipeName => (
      usedRecipeNames.every(usedRecipeName => (
        usedRecipeName !== candidateRecipeName &&
        hasContrastingValue(usedRecipeName, candidateRecipeName) &&
        hasHighForegroundContrast(usedRecipeName, candidateRecipeName)
      ))
    ))

  return pickTopValueCandidate(usedRecipeNames, candidates, chooser, key)
}

const getStrongForegroundCandidates = usedRecipeNames => heraldicFlagPalette
  .map(recipe => recipe.name)
  .filter(candidateRecipeName => (
    usedRecipeNames.every((usedRecipeName, index) => (
      usedRecipeName !== candidateRecipeName &&
      hasVisibleForegroundContrast(
        usedRecipeName,
        candidateRecipeName,
        index === 0 ? 1 : layeredMidgroundOpacityOptions[0]
      )
    ))
  ))

const getForegroundCompatibleMidgroundCandidates = usedRecipeNames => {
  const baseRecipeName = usedRecipeNames.at(-1)

  return heraldicFlagPalette
    .map(recipe => recipe.name)
    .filter(candidateRecipeName => (
      usedRecipeNames.every(usedRecipeName => usedRecipeName !== candidateRecipeName) &&
      hasSoftLayerSeparation(baseRecipeName, candidateRecipeName) &&
      getStrongForegroundCandidates([...usedRecipeNames, candidateRecipeName]).length > 0
    ))
}

const pickMidgroundColor = (usedRecipeNames, chooser = null, key = 'midground-color', { requireForegroundSupport = false } = {}) => {
  const baseRecipeName = usedRecipeNames.at(-1)
  const foregroundCompatibleCandidates = getForegroundCompatibleMidgroundCandidates(usedRecipeNames)

  if (requireForegroundSupport && foregroundCompatibleCandidates.length > 0) {
    return pickTopValueCandidate([baseRecipeName], foregroundCompatibleCandidates, chooser, `${key}:foreground-compatible`)
  }

  const softerCandidates = heraldicFlagPalette
    .map(recipe => recipe.name)
    .filter(candidateRecipeName => (
      usedRecipeNames.every(usedRecipeName => usedRecipeName !== candidateRecipeName) &&
      hasSoftLayerSeparation(baseRecipeName, candidateRecipeName)
    ))
  if (softerCandidates.length > 0) {
    return pickTopValueCandidate([baseRecipeName], softerCandidates, chooser, key)
  }

  return null
}

const pickHighContrastMidgroundColor = (usedRecipeNames, chooser = null, key = 'high-contrast-midground-color') => {
  const stronglyContrastingCandidates = heraldicFlagPalette
    .map(recipe => recipe.name)
    .filter(candidateRecipeName => (
      usedRecipeNames.every(usedRecipeName => (
        usedRecipeName !== candidateRecipeName &&
        hasContrastingValue(usedRecipeName, candidateRecipeName) &&
        hasHighForegroundContrast(usedRecipeName, candidateRecipeName)
      ))
    ))

  if (stronglyContrastingCandidates.length > 0) {
    return pickTopValueCandidate(usedRecipeNames, stronglyContrastingCandidates, chooser, key)
  }

  return null
}

const pickContrastingColor = (usedRecipeNames, chooser = null, key = 'contrasting-color') => {
  const contrastingCandidates = heraldicFlagPalette
    .map(recipe => recipe.name)
    .filter(candidateRecipeName => (
      usedRecipeNames.every(usedRecipeName => (
        usedRecipeName !== candidateRecipeName && hasContrastingValue(usedRecipeName, candidateRecipeName)
      ))
    ))
  if (contrastingCandidates.length > 0) {
    return pickTopValueCandidate(usedRecipeNames, contrastingCandidates, chooser, key)
  }

  return null
}

const pickForegroundColor = (usedRecipeNames, chooser = null, key = 'foreground-color') => {
  const stronglyContrastingCandidates = getStrongForegroundCandidates(usedRecipeNames)

  if (stronglyContrastingCandidates.length > 0) {
    return pickTopValueCandidate(usedRecipeNames, stronglyContrastingCandidates, chooser, key)
  }

  return null
}

const hasValidForegroundContrast = flagSpec => {
  if (!flagSpec.foreground) {
    return true
  }

  const lowerLayerRecipeNames = [
    flagSpec.background,
    flagSpec.midground?.color
  ].filter(Boolean)

  return lowerLayerRecipeNames.every(lowerRecipeName => (
    hasVisibleForegroundContrast(
      lowerRecipeName,
      flagSpec.foreground.color,
      lowerRecipeName === flagSpec.midground?.color ? flagSpec.midground.opacity : 1
    )
  ))
}

const hasValidMidgroundOnlyContrast = flagSpec => {
  if (!flagSpec.midground || flagSpec.foreground) {
    return true
  }

  return (
    hasContrastingValue(flagSpec.background, flagSpec.midground.color) &&
    hasHighForegroundContrast(flagSpec.background, flagSpec.midground.color)
  )
}

const hasValidFlagContrast = flagSpec => (
  hasValidForegroundContrast(flagSpec) && hasValidMidgroundOnlyContrast(flagSpec)
)

const heraldicHintGroups = {
  background: [
    { fragments: ['red', 'ruby', 'vermilion', 'scarlet', 'crimson'], outcomes: ['red'] },
    { fragments: ['gold', 'golden'], outcomes: ['gold'] },
    { fragments: ['yellow', 'amber'], outcomes: ['saffron', 'gold'] },
    { fragments: ['silver'], outcomes: ['silver'] },
    { fragments: ['blue', 'azure', 'sapphire'], outcomes: ['navy blue', 'royal blue'] },
    { fragments: ['green', 'emerald', 'jade'], outcomes: ['forest green'] },
    { fragments: ['burgundy'], outcomes: ['burgundy'] }
  ],
  midground: [
    { fragments: ['saltire'], outcomes: ['saltire'] },
    { fragments: ['cross'], outcomes: ['cross'] },
    { fragments: ['bend', 'diagonal'], outcomes: ['bend'] },
    { fragments: ['chevron'], outcomes: ['chevron'] },
    { fragments: ['circle', 'ring'], outcomes: ['circle', 'risingcircle'] }
  ],
  foreground: [
    { fragments: ['bear', 'grizzly'], outcomes: ['bear'] },
    { fragments: ['moose'], outcomes: ['moose'] },
    { fragments: ['dragon', 'drake'], outcomes: ['dragon'] },
    { fragments: ['eagle'], outcomes: ['eagle'] },
    { fragments: ['fish', 'pike', 'fathomer', 'pearldiver'], outcomes: ['fish'] },
    { fragments: ['gull', 'pelican'], outcomes: ['gull'] },
    { fragments: ['horse'], outcomes: ['horse'] },
    { fragments: ['moon'], outcomes: ['moon'] },
    { fragments: ['pleiades'], outcomes: ['pleiades'] },
    { fragments: ['sun'], outcomes: ['sun'] },
    { fragments: ['serpent', 'snake', 'sidewinder', 'cottonmouth'], outcomes: ['serpent'] },
    { fragments: ['star'], outcomes: ['star', 'unstar', 'starpair'] },
    { fragments: ['wheel'], outcomes: ['wheel'] },
    { fragments: ['lion', 'puma', 'cougar', 'mountaincat'], outcomes: ['mountainlion'] }
  ]
}

const directForegroundHintGroups = foregroundShapeNames.map(shape => ({
  fragments: [shape],
  outcomes: [shape]
}))

const normalizeHeraldicName = value => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const hasNameFragment = (tokens, searchText, fragment) => {
  const normalizedFragment = normalizeHeraldicName(fragment).replace(/\s+/g, '')

  if (!normalizedFragment) {
    return false
  }

  return tokens.includes(normalizedFragment) || searchText.includes(normalizedFragment)
}

const getDirectHintOutcomes = (name, groups) => {
  const tokens = normalizeHeraldicName(name).split(/\s+/).filter(Boolean)
  const searchText = tokens.join('')
  const exactMatches = []
  const substringMatches = []

  groups.forEach(group => {
    group.fragments.forEach(fragment => {
      const normalizedFragment = normalizeHeraldicName(fragment).replace(/\s+/g, '')

      if (!normalizedFragment) {
        return
      }

      if (tokens.includes(normalizedFragment) || searchText === normalizedFragment) {
        exactMatches.push({ outcomes: group.outcomes, fragmentLength: normalizedFragment.length })
        return
      }

      if (searchText.includes(normalizedFragment)) {
        substringMatches.push({ outcomes: group.outcomes, fragmentLength: normalizedFragment.length })
      }
    })
  })

  const matchesToUse = exactMatches.length > 0
    ? exactMatches
    : substringMatches.filter(match => match.fragmentLength === Math.max(...substringMatches.map(entry => entry.fragmentLength)))

  return matchesToUse
    .flatMap(match => match.outcomes)
    .filter((outcome, index, outcomes) => outcomes.indexOf(outcome) === index)
}

const getHintOutcomes = (name, groups) => {
  const tokens = normalizeHeraldicName(name).split(/\s+/).filter(Boolean)
  const searchText = tokens.join('')

  return groups
    .flatMap(group => (
      group.fragments.some(fragment => hasNameFragment(tokens, searchText, fragment))
        ? group.outcomes
        : []
    ))
    .filter((outcome, index, outcomes) => outcomes.indexOf(outcome) === index)
}

const getHeraldicNameHints = name => {
  const directForegrounds = getDirectHintOutcomes(name, directForegroundHintGroups)

  return {
    preferredBackgrounds: getHintOutcomes(name, heraldicHintGroups.background),
    preferredMidgrounds: getHintOutcomes(name, heraldicHintGroups.midground),
    preferredForegrounds: directForegrounds.length > 0
      ? directForegrounds
      : getHintOutcomes(name, heraldicHintGroups.foreground)
  }
}

const createRandomFlagSpec = (nameHints = null, chooser = null, seedKey = 'flag') => {
  const hints = nameHints ?? {
    preferredBackgrounds: [],
    preferredMidgrounds: [],
    preferredForegrounds: []
  }

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const attemptKey = `${seedKey}:attempt:${attempt}`
    const background = hints.preferredBackgrounds.length > 0
      ? pickOption(hints.preferredBackgrounds, chooser, `${attemptKey}:background:preferred`)
      : pickOption(heraldicRecipeNames, chooser, `${attemptKey}:background`)
    const usedRecipeNames = [background]
    const wantsForegroundByChance = hints.preferredForegrounds.length > 0 || (chooser
      ? chooser.chance(flagForegroundChance, `${attemptKey}:wants-foreground`)
      : Math.random() < flagForegroundChance)
    const wantsMidground = hints.preferredMidgrounds.length > 0 || (chooser
      ? chooser.chance(flagMidgroundChance, `${attemptKey}:wants-midground`)
      : Math.random() < flagMidgroundChance)
    const wantsForeground = wantsForegroundByChance || !wantsMidground
    const flagSpec = { background }

    if (wantsMidground) {
      const midgroundColor = pickMidgroundColor(
        usedRecipeNames,
        chooser,
        `${attemptKey}:midground-color`,
        { requireForegroundSupport: wantsForeground }
      )

      if (midgroundColor) {
        usedRecipeNames.push(midgroundColor)
        flagSpec.midground = {
          shape: hints.preferredMidgrounds.length > 0
            ? pickOption(hints.preferredMidgrounds, chooser, `${attemptKey}:midground-shape:preferred`)
            : pickOption(weightedMidgroundShapes, chooser, `${attemptKey}:midground-shape`),
          color: midgroundColor,
          opacity: pickOption(
            wantsForeground
              ? layeredMidgroundOpacityOptions
              : midgroundOpacityOptions,
            chooser,
            `${attemptKey}:midground-opacity`
          )
        }
      } else if (wantsForeground) {
        continue
      }
    }

    if (wantsForeground) {
      const foregroundColor = pickForegroundColor(usedRecipeNames, chooser, `${attemptKey}:foreground-color`)

      if (!foregroundColor) {
        if (hints.preferredForegrounds.length > 0) {
          continue
        }

        if (flagSpec.midground) {
          const highContrastMidgroundColor = pickHighContrastMidgroundColor([background], chooser, `${attemptKey}:fallback-midground-color`)

          if (highContrastMidgroundColor) {
            flagSpec.midground.color = highContrastMidgroundColor
          }

          if (hasValidFlagContrast(flagSpec)) {
            return flagSpec
          }

          continue
        }

        continue
      }

      flagSpec.foreground = {
        shape: hints.preferredForegrounds.length > 0
          ? pickOption(hints.preferredForegrounds, chooser, `${attemptKey}:foreground-shape:preferred`)
          : pickOption(foregroundShapeNames, chooser, `${attemptKey}:foreground-shape`),
        color: foregroundColor,
        opacity: pickOption(foregroundOpacityOptions, chooser, `${attemptKey}:foreground-opacity`)
      }
    }

    if ((flagSpec.foreground || (flagSpec.midground && hints.preferredForegrounds.length === 0)) && hasValidFlagContrast(flagSpec)) {
      return flagSpec
    }
  }

  if (hints.preferredForegrounds.length > 0) {
    const background = hints.preferredBackgrounds[0] ?? 'gold'
    const foregroundColor = pickForegroundColor([background], chooser, `${seedKey}:preferred-foreground-color`) ?? getAccessibleFallbackForegroundColor([background], chooser, `${seedKey}:preferred-fallback-foreground-color`) ?? 'silver'
    const flagSpec = {
      background,
      foreground: {
        shape: hints.preferredForegrounds[0],
        color: foregroundColor,
        opacity: 0.9
      }
    }

    if (hasValidFlagContrast(flagSpec)) {
      return flagSpec
    }

    return {
      background,
      foreground: {
        shape: hints.preferredForegrounds[0],
        color: getAccessibleFallbackForegroundColor([background], chooser, `${seedKey}:preferred-final-foreground-color`) ?? 'silver',
        opacity: 0.9
      }
    }
  }

  if (hints.preferredMidgrounds.length > 0) {
    const background = hints.preferredBackgrounds[0] ?? 'gold'

    return {
      background,
      midground: {
        shape: hints.preferredMidgrounds[0],
        color: pickHighContrastMidgroundColor([background], chooser, `${seedKey}:preferred-midground-color`)
          ?? getAccessibleFallbackHighContrastMidgroundColor([background], chooser, `${seedKey}:preferred-fallback-midground-color`)
          ?? 'silver',
        opacity: 0.75
      }
    }
  }

  const background = hints.preferredBackgrounds[0] ?? 'gold'
  const foregroundColor = pickForegroundColor([background], chooser, `${seedKey}:fallback-foreground-color`) ?? getAccessibleFallbackForegroundColor([background], chooser, `${seedKey}:fallback-foreground-fallback-color`) ?? 'silver'
  const fallbackFlagSpec = {
    background,
    foreground: {
      shape: 'star',
      color: foregroundColor,
      opacity: 0.9
    }
  }

  if (hasValidForegroundContrast(fallbackFlagSpec)) {
    return fallbackFlagSpec
  }

  return {
    background,
    foreground: {
      shape: 'star',
      color: getAccessibleFallbackForegroundColor([background], chooser, `${seedKey}:final-fallback-foreground-color`) ?? 'silver',
      opacity: 0.9
    }
  }
}

const buildFlagSpecKey = flagSpec => {
  const midgroundKey = flagSpec.midground
    ? `${flagSpec.midground.shape}:${flagSpec.midground.color}:${flagSpec.midground.opacity}`
    : 'none'
  const foregroundKey = flagSpec.foreground
    ? `${flagSpec.foreground.shape}:${flagSpec.foreground.color}:${flagSpec.foreground.opacity}`
    : 'none'

  return `${flagSpec.background}|${midgroundKey}|${foregroundKey}`
}

export const buildFlagSpecsForNames = names => {
  const usedKeys = new Set()

  return names.map((name, index) => {
    const nameHints = getHeraldicNameHints(name)
    const normalizedName = normalizeHeraldicName(name)
    const chooser = normalizedName ? createDeterministicChooser(normalizedName) : null
    const seedKey = normalizedName || `anonymous-${index}`

    for (let attempt = 0; attempt < 80; attempt += 1) {
      const flagSpec = createRandomFlagSpec(nameHints, chooser, `${seedKey}:named:${attempt}`)
      const flagSpecKey = buildFlagSpecKey(flagSpec)

      if (usedKeys.has(flagSpecKey)) {
        continue
      }

      usedKeys.add(flagSpecKey)
      return flagSpec
    }

    for (let attempt = 0; attempt < 80; attempt += 1) {
      const flagSpec = createRandomFlagSpec(null, chooser, `${seedKey}:fallback:${attempt}`)
      const flagSpecKey = buildFlagSpecKey(flagSpec)

      if (usedKeys.has(flagSpecKey)) {
        continue
      }

      usedKeys.add(flagSpecKey)
      return flagSpec
    }

    return createRandomFlagSpec(nameHints, chooser, `${seedKey}:final`)
  })
}

export const buildRandomFlagSpecs = count => {
  const anonymousNames = Array.from({ length: count }, () => '')

  return shuffleArray(buildFlagSpecsForNames(anonymousNames))
}

const drawColorRecipe = (targetContext, assetGroup, recipeName, opacity = 1) => {
  const recipe = getRecipe(recipeName)

  if (!assetGroup || !recipe) {
    return
  }

  recipe.layers.forEach(layer => {
    if (!assetGroup[layer.key]) {
      return
    }

    targetContext.globalAlpha = layer.alpha * opacity
    targetContext.drawImage(assetGroup[layer.key], 0, 0)
  })
}

const loadFlagAssets = async () => {
  const [loadedTarnish, loadedBackgroundEntries, loadedMidgroundEntries, loadedForegroundEntries] = await Promise.all([
    loadImage(flagAssetSources.tarnish),
    Promise.all(
      Object.entries(flagAssetSources.backgrounds).map(async ([key, source]) => [key, await loadImage(source)])
    ),
    Promise.all(
      Object.entries(flagAssetSources.midgrounds).map(async ([shape, sourcesByChannel]) => [
        shape,
        Object.fromEntries(
          await Promise.all(
            Object.entries(sourcesByChannel).map(async ([channel, source]) => [channel, await loadImage(source)])
          )
        )
      ])
    ),
    Promise.all(
      Object.entries(flagAssetSources.foregrounds).map(async ([shape, sourcesByChannel]) => [
        shape,
        Object.fromEntries(
          await Promise.all(
            Object.entries(sourcesByChannel).map(async ([channel, source]) => [channel, await loadImage(source)])
          )
        )
      ])
    )
  ])

  return {
    tarnish: loadedTarnish,
    backgrounds: Object.fromEntries(loadedBackgroundEntries),
    midgrounds: Object.fromEntries(loadedMidgroundEntries),
    foregrounds: Object.fromEntries(loadedForegroundEntries)
  }
}

export const createFlagRenderer = async () => {
  const assets = await loadFlagAssets()
  const spriteCache = new Map()
  const dataUrlCache = new Map()

  const renderFlagSprite = flagSpec => {
    const sanitizedFlagSpec = sanitizeFlagSpec(flagSpec)

    if (!sanitizedFlagSpec) {
      return null
    }

    const cacheKey = buildFlagSpecKey(sanitizedFlagSpec)

    if (spriteCache.has(cacheKey)) {
      return spriteCache.get(cacheKey)
    }

    const spriteCanvas = document.createElement('canvas')
    spriteCanvas.width = assets.tarnish.naturalWidth || 141
    spriteCanvas.height = assets.tarnish.naturalHeight || 155

    const spriteContext = spriteCanvas.getContext('2d')
    if (!spriteContext) {
      return null
    }

    drawColorRecipe(spriteContext, assets.backgrounds, sanitizedFlagSpec.background)

    if (sanitizedFlagSpec.midground) {
      drawColorRecipe(
        spriteContext,
        assets.midgrounds[sanitizedFlagSpec.midground.shape],
        sanitizedFlagSpec.midground.color,
        sanitizedFlagSpec.midground.opacity
      )
    }

    if (sanitizedFlagSpec.foreground) {
      drawColorRecipe(
        spriteContext,
        assets.foregrounds[sanitizedFlagSpec.foreground.shape],
        sanitizedFlagSpec.foreground.color,
        sanitizedFlagSpec.foreground.opacity
      )
    }

    spriteContext.globalAlpha = 1
    spriteContext.drawImage(assets.tarnish, 0, 0)

    spriteCache.set(cacheKey, spriteCanvas)

    return spriteCanvas
  }

  const getFlagDataUrl = flagSpec => {
    const sanitizedFlagSpec = sanitizeFlagSpec(flagSpec)

    if (!sanitizedFlagSpec) {
      return ''
    }

    const cacheKey = buildFlagSpecKey(sanitizedFlagSpec)

    if (dataUrlCache.has(cacheKey)) {
      return dataUrlCache.get(cacheKey)
    }

    const sprite = renderFlagSprite(sanitizedFlagSpec)
    const dataUrl = sprite ? sprite.toDataURL() : ''

    dataUrlCache.set(cacheKey, dataUrl)

    return dataUrl
  }

  return {
    renderFlagSprite,
    getFlagDataUrl,
    getFlagHaloColor,
    crestPixelWidth: assets.tarnish.naturalWidth || 141,
    crestPixelHeight: assets.tarnish.naturalHeight || 155
  }
}

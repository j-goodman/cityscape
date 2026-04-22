import { clamp, distanceBetweenPoints, normalizeRange, pickRandomItem, quantizeOpacity } from './utils.js'

export const terrainColumns = 34
export const terrainRows = 20
export const terrainBuildableBufferTiles = 4
export const terrainPalette = {
  desert: '#d2bc91',
  grassland: '#6a7b4f',
  forest: '#34452f',
  mountain: '#4c586a',
  bleached: '#ede4d2'
}

const featureFadeDistance = 0.58
const tilelessOpacityThreshold = 0.08
const mountainTileThreshold = 0.5
const cityClearingRadiusTiles = 2
const minimumCityClearingCount = 3
const maximumCityClearingCount = 7
export const lumberHarvestDurationWeeks = 20
const lumberHarvestOpacityStepWeeks = 5
const terrainOpacityStages = [0.25, 0.5, 0.75, 1]
const bleachedTerrainStartDistanceTiles = 0.8
const bleachedTerrainFullStrengthDistanceTiles = 3.8
const windDirectionOptions = [
  { x: 1, y: 0, fertileSide: 'west' },
  { x: -1, y: 0, fertileSide: 'east' },
  { x: 0.72, y: 0.42, fertileSide: 'northwest' },
  { x: -0.72, y: -0.42, fertileSide: 'southeast' }
]

const randomInRange = (minimum, maximum) => minimum + Math.random() * (maximum - minimum)

const normalizeVector = vector => {
  const length = Math.hypot(vector.x, vector.y) || 1

  return {
    x: vector.x / length,
    y: vector.y / length
  }
}

const normalizeHarvestWeeks = value => clamp(Math.floor(value ?? 0), 0, lumberHarvestDurationWeeks)

const getOpacityStageIndex = opacity => terrainOpacityStages.findIndex(stageOpacity => stageOpacity >= opacity)

const getReducedOpacityForHarvest = (baseOpacity, weeksHarvested) => {
  const baseStageIndex = Math.max(0, getOpacityStageIndex(baseOpacity))
  const reductionSteps = Math.floor(normalizeHarvestWeeks(weeksHarvested) / lumberHarvestOpacityStepWeeks)
  const nextStageIndex = Math.max(0, baseStageIndex - reductionSteps)

  return terrainOpacityStages[nextStageIndex] ?? terrainOpacityStages[0]
}

const normalizeLumberHarvestTileState = tileState => {
  const weeksHarvested = normalizeHarvestWeeks(tileState?.weeksHarvested)

  return {
    columnIndex: tileState?.columnIndex ?? 0,
    rowIndex: tileState?.rowIndex ?? 0,
    weeksHarvested,
    exhausted: Boolean(tileState?.exhausted) || weeksHarvested >= lumberHarvestDurationWeeks
  }
}

const rotateVector = (vector, angle) => ({
  x: vector.x * Math.cos(angle) - vector.y * Math.sin(angle),
  y: vector.x * Math.sin(angle) + vector.y * Math.cos(angle)
})

const addVector = (point, vector, magnitude = 1) => ({
  x: point.x + vector.x * magnitude,
  y: point.y + vector.y * magnitude
})

const clampPoint = point => ({
  x: clamp(point.x, 0.03, 0.97),
  y: clamp(point.y, 0.03, 0.97)
})

const createRidgeTrack = (rows, startX, phase) => Array.from({ length: rows }, (_, rowIndex) => (
  clamp(
    startX +
      Math.sin(rowIndex * 0.42 + phase) * 0.055 +
      Math.cos(rowIndex * 0.19 + phase * 0.7) * 0.025,
    0.14,
    0.86
  )
))

const projectPointToSegment = (point, start, end) => {
  const segmentX = end.x - start.x
  const segmentY = end.y - start.y
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY || 1
  const rawProjection = ((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) / segmentLengthSquared
  const projection = clamp(rawProjection, 0, 1)

  return {
    x: start.x + segmentX * projection,
    y: start.y + segmentY * projection
  }
}

const getNearestPolylineInfo = (point, polyline) => {
  if (polyline.length < 2) {
    return {
      distance: Infinity,
      point: polyline[0] ?? point
    }
  }

  return polyline.slice(1).reduce((bestMatch, endPoint, segmentIndex) => {
    const startPoint = polyline[segmentIndex]
    const nearestPoint = projectPointToSegment(point, startPoint, endPoint)
    const distance = distanceBetweenPoints(point, nearestPoint)

    if (distance < bestMatch.distance) {
      return {
        distance,
        point: nearestPoint
      }
    }

    return bestMatch
  }, {
    distance: Infinity,
    point: polyline[0]
  })
}

const buildRangeSpine = ({ center, orientation, length, bendAmplitude }) => {
  const perpendicular = { x: -orientation.y, y: orientation.x }
  const segmentCount = 6 + Math.floor(Math.random() * 4)
  const phase = Math.random() * Math.PI * 2
  const curveFrequency = 1.15 + Math.random() * 0.45

  return Array.from({ length: segmentCount + 1 }, (_, index) => {
    const ratio = segmentCount === 0 ? 0 : index / segmentCount
    const alongOffset = (ratio - 0.5) * length
    const bend = Math.sin(ratio * Math.PI * curveFrequency + phase) * bendAmplitude
    const jitter = randomInRange(-bendAmplitude * 0.12, bendAmplitude * 0.12)

    return clampPoint({
      x: center.x + orientation.x * alongOffset + perpendicular.x * (bend + jitter),
      y: center.y + orientation.y * alongOffset + perpendicular.y * (bend + jitter)
    })
  })
}

const buildMountainRanges = windDirection => {
  const baseAxis = normalizeVector({ x: -windDirection.y, y: windDirection.x })
  const mountainRanges = []
  const targetCount = 3 + Math.floor(Math.random() * 3)
  let attempts = 0

  while (mountainRanges.length < targetCount && attempts < targetCount * 12) {
    attempts += 1

    const center = {
      x: randomInRange(0.14, 0.86),
      y: randomInRange(0.14, 0.86)
    }

    if (mountainRanges.some(range => distanceBetweenPoints(center, range.center) < 0.11)) {
      continue
    }

    const orientation = normalizeVector(rotateVector(baseAxis, randomInRange(-0.72, 0.72)))
    const length = randomInRange(0.24, 0.42)
    const width = randomInRange(0.04, 0.068)
    const bendAmplitude = randomInRange(0.01, 0.026)

    mountainRanges.push({
      center,
      points: buildRangeSpine({ center, orientation, length, bendAmplitude }),
      width,
      intensity: randomInRange(0.86, 1.12),
      moistureBoost: randomInRange(0.42, 0.7),
      shadowStrength: randomInRange(0.58, 0.92)
    })
  }

  return mountainRanges
}

const buildRidges = () => {
  const primaryBase = 0.35 + Math.random() * 0.08
  const secondaryBase = 0.56 + Math.random() * 0.08

  return [
    createRidgeTrack(terrainRows, primaryBase, Math.random() * Math.PI),
    createRidgeTrack(terrainRows, secondaryBase, Math.random() * Math.PI)
  ]
}

const sampleTrack = (track, normalizedY) => {
  const clampedY = clamp(normalizedY, 0, 1)
  const scaledIndex = clampedY * (track.length - 1)
  const lowerIndex = Math.floor(scaledIndex)
  const upperIndex = Math.min(track.length - 1, lowerIndex + 1)
  const interpolation = scaledIndex - lowerIndex

  return track[lowerIndex] + (track[upperIndex] - track[lowerIndex]) * interpolation
}

const getBoundaryTargetPoint = (startPoint, direction) => {
  if (Math.abs(direction.x) >= Math.abs(direction.y)) {
    return {
      x: direction.x >= 0 ? 0.98 : 0.02,
      y: clamp(startPoint.y + direction.y * randomInRange(0.1, 0.38), 0.05, 0.95)
    }
  }

  return {
    x: clamp(startPoint.x + direction.x * randomInRange(0.1, 0.38), 0.05, 0.95),
    y: direction.y >= 0 ? 0.98 : 0.02
  }
}

const buildRiverPaths = ridges => riverSeedRows.map(seedRow => {
  const ridgeIndex = seedRow % ridges.length
  const ridgeTrack = ridges[ridgeIndex]
  let currentPoint = { x: ridgeTrack[Math.min(seedRow, terrainRows - 1)], y: (seedRow + 0.5) / terrainRows }
  const targetEdge = currentPoint.x < 0.5 ? 0.03 : 0.97
  const points = [currentPoint]

  for (let step = 0; step < 18; step += 1) {
    const nextX = clamp(
      currentPoint.x + (targetEdge - currentPoint.x) * 0.18 + Math.sin(step * 0.7 + seedRow) * 0.018,
      0.02,
      0.98
    )
    const nextY = clamp(
      currentPoint.y + Math.cos(step * 0.8 + seedRow * 0.4) * 0.028,
      0.03,
      0.97
    )

    currentPoint = { x: nextX, y: nextY }
    points.push(currentPoint)

    if (Math.abs(currentPoint.x - targetEdge) < 0.025) {
      break
    }
  }

  return points
})

const buildRangeRiverPaths = (mountainRanges, windDirection) => mountainRanges.flatMap(range => {
  const riverCount = Math.random() < 0.35 ? 2 : 1

  return Array.from({ length: riverCount }, (_, riverIndex) => {
    const sourcePoint = range.points[Math.floor(((riverIndex + 1) / (riverCount + 1)) * (range.points.length - 1))]
    const flowDirection = normalizeVector(rotateVector(windDirection, randomInRange(-0.9, 0.9)))
    const targetPoint = getBoundaryTargetPoint(sourcePoint, flowDirection)
    const points = [sourcePoint]
    let currentPoint = sourcePoint
    const meanderPhase = Math.random() * Math.PI * 2
    const perpendicular = { x: -flowDirection.y, y: flowDirection.x }

    for (let step = 0; step < 18; step += 1) {
      const towardEdge = normalizeVector({
        x: targetPoint.x - currentPoint.x,
        y: targetPoint.y - currentPoint.y
      })
      const forwardStep = 0.04 + step * 0.0025
      const sidewaysStep = Math.sin(step * 0.8 + meanderPhase) * 0.016

      currentPoint = clampPoint({
        x: currentPoint.x + towardEdge.x * forwardStep + perpendicular.x * sidewaysStep,
        y: currentPoint.y + towardEdge.y * forwardStep + perpendicular.y * sidewaysStep
      })
      points.push(currentPoint)

      if (
        currentPoint.x <= 0.03 ||
        currentPoint.x >= 0.97 ||
        currentPoint.y <= 0.03 ||
        currentPoint.y >= 0.97
      ) {
        break
      }
    }

    return points
  })
})

const getNearestTrackDistance = (point, track) => Math.min(
  ...track.map(trackPoint => distanceBetweenPoints(point, trackPoint))
)

const getWindwardMoisture = (point, windDirection) => clamp(
  0.54 - ((point.x - 0.5) * windDirection.x + (point.y - 0.5) * windDirection.y) * 1.18,
  0,
  1
)

const getDistanceFromPlayArea = point => {
  const deltaX = point.x < 0 ? -point.x : point.x > 1 ? point.x - 1 : 0
  const deltaY = point.y < 0 ? -point.y : point.y > 1 ? point.y - 1 : 0

  return Math.sqrt(deltaX * deltaX + deltaY * deltaY)
}

const getEnvironmentFade = point => clamp(1 - getDistanceFromPlayArea(point) / featureFadeDistance, 0, 1)

const getCorePoint = point => ({
  x: clamp(point.x, 0, 1),
  y: clamp(point.y, 0, 1)
})

const getTileType = ({ mountainStrength, forestPotential, grassPotential }) => {
  if (mountainStrength >= mountainTileThreshold) {
    return 'mountain'
  }

  if (forestPotential >= 0.67) {
    return 'forest'
  }

  if (grassPotential >= 0.45) {
    return 'grassland'
  }

  return 'desert'
}

const getTileKey = (columnIndex, rowIndex) => `${columnIndex}:${rowIndex}`

const getOutOfBoundsTileDistance = (terrain, columnIndex, rowIndex) => {
  const horizontalDistance = columnIndex < 0
    ? -columnIndex
    : columnIndex >= terrain.columns
      ? columnIndex - terrain.columns + 1
      : 0
  const verticalDistance = rowIndex < 0
    ? -rowIndex
    : rowIndex >= terrain.rows
      ? rowIndex - terrain.rows + 1
      : 0

  return Math.max(horizontalDistance, verticalDistance)
}

const getRoundedOutOfBoundsTileDistance = (terrain, columnIndex, rowIndex) => {
  const horizontalDistance = columnIndex < 0
    ? -columnIndex
    : columnIndex >= terrain.columns
      ? columnIndex - terrain.columns + 1
      : 0
  const verticalDistance = rowIndex < 0
    ? -rowIndex
    : rowIndex >= terrain.rows
      ? rowIndex - terrain.rows + 1
      : 0

  return Math.hypot(horizontalDistance, verticalDistance)
}

const getBleachedTransitionNoise = (columnIndex, rowIndex) => (
  Math.sin(columnIndex * 0.71 + rowIndex * 0.43) * 0.55 +
  Math.cos(columnIndex * 0.34 - rowIndex * 0.63) * 0.3 +
  Math.sin(columnIndex * 1.08 + rowIndex * 0.92) * 0.15
)

const getBleachedTerrainOpacity = (terrain, columnIndex, rowIndex) => {
  if (isTileWithinOfficialTerrain(terrain, columnIndex, rowIndex)) {
    return 0
  }

  const roundedDistance = getRoundedOutOfBoundsTileDistance(terrain, columnIndex, rowIndex)
  const noisyDistance = roundedDistance + getBleachedTransitionNoise(columnIndex, rowIndex) * 1.15
  const transition = normalizeRange(
    noisyDistance,
    bleachedTerrainStartDistanceTiles,
    bleachedTerrainFullStrengthDistanceTiles
  )

  if (transition <= 0) {
    return 0
  }

  return quantizeOpacity(clamp(0.32 + transition * 0.56, 0.32, 0.88))
}

export const isTileWithinOfficialTerrain = (terrain, columnIndex, rowIndex) => (
  getOutOfBoundsTileDistance(terrain, columnIndex, rowIndex) === 0
)

export const isTileWithinBuildableTerrain = (terrain, columnIndex, rowIndex) => (
  getOutOfBoundsTileDistance(terrain, columnIndex, rowIndex) <= terrainBuildableBufferTiles
)

export const isTileBleachedTerrain = (terrain, columnIndex, rowIndex) => (
  getOutOfBoundsTileDistance(terrain, columnIndex, rowIndex) > 0
)

const getTileCenter = (terrain, columnIndex, rowIndex) => ({
  x: (columnIndex + 0.5) / terrain.columns,
  y: (rowIndex + 0.5) / terrain.rows
})

const getLegacyTile = (terrain, columnIndex, rowIndex) => {
  if (!terrain.legacyTiles) {
    return null
  }

  const row = terrain.legacyTiles[rowIndex]

  if (!row) {
    return null
  }

  return row[columnIndex] ?? null
}

const getRangeTerrainTile = (terrain, point, environmentFade) => {
  const windDirection = normalizeVector(terrain.windDirection ?? { x: 1, y: 0 })
  const rangeEffects = terrain.mountainRanges.map(range => {
    const nearestRangeInfo = getNearestPolylineInfo(point, range.points)
    const downwindOffset = (
      (point.x - nearestRangeInfo.point.x) * windDirection.x +
      (point.y - nearestRangeInfo.point.y) * windDirection.y
    )
    const mountainContribution = clamp((1 - nearestRangeInfo.distance / range.width) * range.intensity, 0, 1)
    const lateralReach = range.width * 3.4
    const lateralInfluence = clamp(1 - nearestRangeInfo.distance / lateralReach, 0, 1)
    const upwindMoisture = downwindOffset < 0
      ? clamp(1 - (-downwindOffset) / (range.width * 7.2), 0, 1) * lateralInfluence * range.moistureBoost
      : 0
    const rainShadow = downwindOffset > 0
      ? clamp(1 - downwindOffset / (range.width * 8.6), 0, 1) * lateralInfluence * range.shadowStrength
      : 0

    return {
      mountainContribution,
      upwindMoisture,
      rainShadow
    }
  })

  const mountainStrength = rangeEffects.reduce((accumulator, effect) => (
    1 - (1 - accumulator) * (1 - effect.mountainContribution)
  ), 0) * environmentFade
  const upwindMoisture = clamp(
    rangeEffects.reduce((accumulator, effect) => accumulator + effect.upwindMoisture, 0),
    0,
    1.2
  ) * environmentFade
  const rainShadow = clamp(
    rangeEffects.reduce((accumulator, effect) => accumulator + effect.rainShadow, 0),
    0,
    1.3
  ) * environmentFade
  const riverDistance = terrain.riverPaths.length > 0
    ? Math.min(...terrain.riverPaths.map(path => getNearestTrackDistance(point, path)))
    : Infinity
  const riverStrength = clamp((1 - riverDistance / 0.11) * environmentFade, 0, 1)
  const baseWindMoisture = getWindwardMoisture(point, windDirection) * environmentFade
  const cityGrassBoost = terrain.cityPositions.reduce((accumulator, cityPoint) => {
    const cityDistance = distanceBetweenPoints(point, cityPoint)
    return accumulator + clamp(1 - cityDistance / 0.16, 0, 1) * 0.22 * environmentFade
  }, 0)
  const moistureBalance = clamp(
    baseWindMoisture * 0.62 +
      upwindMoisture * 0.94 +
      riverStrength * 0.82 +
      cityGrassBoost * 0.22 -
      rainShadow * 1.08,
    0,
    1
  )
  const forestPotential = clamp(
    moistureBalance * 1.04 + upwindMoisture * 0.18 + riverStrength * 0.16 - mountainStrength * 0.42,
    0,
    1
  )
  const grassPotential = clamp(
    moistureBalance * 0.76 + riverStrength * 0.34 + cityGrassBoost + upwindMoisture * 0.1 - mountainStrength * 0.2,
    0,
    1
  )
  const aridity = clamp(rainShadow * 0.92 + (1 - moistureBalance) * 0.7, 0, 1)
  const tileType = getTileType({ mountainStrength, forestPotential, grassPotential })
  const opacitySource = tileType === 'mountain'
    ? mountainStrength
    : tileType === 'forest'
      ? forestPotential
      : tileType === 'grassland'
        ? grassPotential
        : environmentFade * (0.22 + aridity * 0.28)

  return {
    type: tileType,
    opacity: opacitySource < tilelessOpacityThreshold ? 0 : quantizeOpacity(opacitySource),
    column: null,
    row: null
  }
}

const getRidgeTerrainTile = (terrain, point, corePoint, environmentFade) => {
  const ridgeDistance = Math.min(
    ...terrain.ridges.map(ridgeTrack => Math.abs(point.x - sampleTrack(ridgeTrack, corePoint.y)))
  )
  const mountainStrength = clamp((1 - ridgeDistance / 0.09) * environmentFade, 0, 1)
  const riverDistance = Math.min(...terrain.riverPaths.map(path => getNearestTrackDistance(point, path)))
  const riverStrength = clamp((1 - riverDistance / 0.13) * environmentFade, 0, 1)
  const edgeMoisture = (terrain.fertileSide === 'east' ? corePoint.x : 1 - corePoint.x) * environmentFade
  const cityGrassBoost = terrain.cityPositions.reduce((accumulator, cityPoint) => {
    const cityDistance = distanceBetweenPoints(point, cityPoint)
    return accumulator + clamp(1 - cityDistance / 0.16, 0, 1) * 0.22 * environmentFade
  }, 0)
  const forestPotential = clamp(
    edgeMoisture * 0.9 + riverStrength * 0.2 + mountainStrength * 0.18 - mountainStrength * 0.5,
    0,
    1
  )
  const grassPotential = clamp(
    edgeMoisture * 0.45 + riverStrength * 0.82 + cityGrassBoost + forestPotential * 0.15 - mountainStrength * 0.28,
    0,
    1
  )
  const tileType = getTileType({ mountainStrength, forestPotential, grassPotential })
  const opacitySource = tileType === 'mountain'
    ? mountainStrength
    : tileType === 'forest'
      ? forestPotential
      : tileType === 'grassland'
        ? grassPotential
        : environmentFade * (0.2 + edgeMoisture * 0.25)

  return {
    type: tileType,
    opacity: opacitySource < tilelessOpacityThreshold ? 0 : quantizeOpacity(opacitySource),
    column: null,
    row: null
  }
}

const getBaseTerrainTile = (terrain, columnIndex, rowIndex) => {
  if (!terrain.mountainRanges?.length && (!terrain.ridges?.length || !terrain.riverPaths?.length)) {
    return {
      type: 'desert',
      opacity: 0,
      column: columnIndex,
      row: rowIndex
    }
  }

  const point = {
    x: (columnIndex + 0.5) / terrain.columns,
    y: (rowIndex + 0.5) / terrain.rows
  }
  const corePoint = getCorePoint(point)
  const environmentFade = getEnvironmentFade(point)

  if (environmentFade <= 0) {
    return {
      type: 'desert',
      opacity: 0,
      column: columnIndex,
      row: rowIndex
    }
  }

  const tile = terrain.mountainRanges?.length
    ? getRangeTerrainTile(terrain, point, environmentFade)
    : getRidgeTerrainTile(terrain, point, corePoint, environmentFade)

  return {
    type: tile.type,
    opacity: tile.opacity,
    column: columnIndex,
    row: rowIndex
  }
}

const getCityClearingCandidates = (terrain, cityPoint) => {
  const vertexColumn = Math.round(cityPoint.x * terrain.columns)
  const vertexRow = Math.round(cityPoint.y * terrain.rows)
  const candidates = []

  for (let rowIndex = vertexRow - cityClearingRadiusTiles; rowIndex <= vertexRow + cityClearingRadiusTiles - 1; rowIndex += 1) {
    for (let columnIndex = vertexColumn - cityClearingRadiusTiles; columnIndex <= vertexColumn + cityClearingRadiusTiles - 1; columnIndex += 1) {
      if (columnIndex < 0 || columnIndex >= terrain.columns || rowIndex < 0 || rowIndex >= terrain.rows) {
        continue
      }

      candidates.push({
        columnIndex,
        rowIndex,
        distance: distanceBetweenPoints(cityPoint, getTileCenter(terrain, columnIndex, rowIndex))
      })
    }
  }

  return candidates.sort((firstCandidate, secondCandidate) => firstCandidate.distance - secondCandidate.distance)
}

const buildCityClearingTileKeys = terrain => {
  if (!terrain.cityPositions?.length || terrain.legacyTiles) {
    return []
  }

  const clearingKeys = new Set()

  terrain.cityPositions.forEach(cityPoint => {
    const candidates = getCityClearingCandidates(terrain, cityPoint)
    const immediateCandidates = candidates.slice(0, 8).map(candidate => ({
      ...candidate,
      tile: getBaseTerrainTile(terrain, candidate.columnIndex, candidate.rowIndex)
    }))
    const touchingCandidates = immediateCandidates.slice(0, 4)
    const touchingAllForest = touchingCandidates.length === 4 && touchingCandidates.every(candidate => (
      candidate.tile.type === 'forest' && candidate.tile.opacity > 0
    ))
    const immediateForestCandidates = immediateCandidates.filter(candidate => (
      candidate.tile.type === 'forest' && candidate.tile.opacity > 0
    ))

    if (!touchingAllForest || immediateForestCandidates.length < 6) {
      return
    }

    const clearingCount = clamp(
      immediateForestCandidates.length - 1,
      minimumCityClearingCount,
      maximumCityClearingCount
    )

    immediateForestCandidates.slice(0, clearingCount).forEach(candidate => {
      clearingKeys.add(getTileKey(candidate.columnIndex, candidate.rowIndex))
    })
  })

  return [...clearingKeys]
}

export const generateTerrain = cityPositions => {
  const prevailingWind = pickRandomItem(windDirectionOptions)
  const windDirection = normalizeVector(prevailingWind)
  const mountainRanges = buildMountainRanges(windDirection)
  const riverPaths = buildRangeRiverPaths(mountainRanges, windDirection)
  const terrain = {
    columns: terrainColumns,
    rows: terrainRows,
    fertileSide: prevailingWind.fertileSide,
    windDirection,
    mountainRanges,
    ridges: [],
    riverPaths,
    version: 0,
    cityPositions: Object.values(cityPositions),
    cityClearingTileKeys: [],
    lumberHarvestTileStates: []
  }

  terrain.cityClearingTileKeys = buildCityClearingTileKeys(terrain)

  return terrain
}

export const getTerrainTile = (terrain, columnIndex, rowIndex) => {
  const legacyTile = getLegacyTile(terrain, columnIndex, rowIndex)
  if (legacyTile) {
    return legacyTile
  }

  if (isTileBleachedTerrain(terrain, columnIndex, rowIndex)) {
    const bleachedOpacity = getBleachedTerrainOpacity(terrain, columnIndex, rowIndex)

    if (bleachedOpacity <= 0) {
      return getBaseTerrainTile(terrain, columnIndex, rowIndex)
    }

    return {
      type: 'bleached',
      opacity: bleachedOpacity,
      column: columnIndex,
      row: rowIndex
    }
  }

  const tile = getBaseTerrainTile(terrain, columnIndex, rowIndex)

  if (tile.type === 'forest' && terrain.cityClearingTileKeys?.includes(getTileKey(columnIndex, rowIndex))) {
    return {
      ...tile,
      type: 'grassland'
    }
  }

  if (tile.type === 'forest') {
    const lumberHarvestTileState = terrain.lumberHarvestTileStates?.find(entry => (
      entry.columnIndex === columnIndex && entry.rowIndex === rowIndex
    ))

    if (lumberHarvestTileState) {
      const reducedOpacity = getReducedOpacityForHarvest(tile.opacity, lumberHarvestTileState.weeksHarvested)

      return {
        ...tile,
        type: lumberHarvestTileState.exhausted ? 'grassland' : 'forest',
        opacity: reducedOpacity
      }
    }
  }

  return tile
}

export const scoreTerrainAroundCity = (terrain, position) => {
  const columnCenter = position.x * terrain.columns
  const rowCenter = position.y * terrain.rows
  const rowStart = Math.max(0, Math.floor(rowCenter - 2))
  const rowEnd = Math.min(terrain.rows - 1, Math.ceil(rowCenter + 2))
  const columnStart = Math.max(0, Math.floor(columnCenter - 2))
  const columnEnd = Math.min(terrain.columns - 1, Math.ceil(columnCenter + 2))

  let score = 0

  for (let rowIndex = rowStart; rowIndex <= rowEnd; rowIndex += 1) {
    for (let columnIndex = columnStart; columnIndex <= columnEnd; columnIndex += 1) {
      const tile = getTerrainTile(terrain, columnIndex, rowIndex)
      const tileCenter = {
        x: (columnIndex + 0.5) / terrain.columns,
        y: (rowIndex + 0.5) / terrain.rows
      }
      const distance = distanceBetweenPoints(position, tileCenter)
      const weight = clamp(1 - distance / 0.2, 0, 1)
      const typeWeight = tile.type === 'forest'
        ? 2.2
        : tile.type === 'grassland'
          ? 1.5
          : tile.type === 'mountain'
            ? 0.45
            : 0.08

      score += typeWeight * tile.opacity * weight
    }
  }

  return score
}

export const normalizeTerrainState = terrain => {
  if (!terrain) {
    return terrain
  }

  if (Array.isArray(terrain.tiles)) {
    return {
      columns: terrain.columns ?? terrainColumns,
      rows: terrain.rows ?? terrainRows,
      fertileSide: terrain.fertileSide ?? 'east',
      windDirection: terrain.windDirection ?? null,
      mountainRanges: [],
      legacyTiles: terrain.tiles,
      ridges: [],
      riverPaths: [],
      version: terrain.version ?? 0,
      cityPositions: [],
      cityClearingTileKeys: [],
      lumberHarvestTileStates: []
    }
  }

  const normalizedTerrain = {
    columns: terrain.columns ?? terrainColumns,
    rows: terrain.rows ?? terrainRows,
    fertileSide: terrain.fertileSide ?? 'east',
    windDirection: terrain.windDirection ?? null,
    mountainRanges: terrain.mountainRanges ?? [],
    ridges: terrain.ridges ?? [],
    riverPaths: terrain.riverPaths ?? [],
    version: terrain.version ?? 0,
    cityPositions: terrain.cityPositions ?? [],
    cityClearingTileKeys: terrain.cityClearingTileKeys ?? [],
    lumberHarvestTileStates: (terrain.lumberHarvestTileStates ?? []).map(normalizeLumberHarvestTileState)
  }

  if (normalizedTerrain.cityClearingTileKeys.length > 0 || normalizedTerrain.cityPositions.length === 0) {
    return normalizedTerrain
  }

  return {
    ...normalizedTerrain,
    cityClearingTileKeys: buildCityClearingTileKeys(normalizedTerrain)
  }
}

export const advanceLumberHarvestWeek = (terrain, structures) => {
  const lumberCampStructures = Array.isArray(structures)
    ? structures.filter(structure => structure.type === 'lumber-camp')
    : []

  if (!lumberCampStructures.length) {
    return []
  }

  const lumberHarvestTileStatesByKey = new Map((terrain.lumberHarvestTileStates ?? []).map(tileState => [
    getTileKey(tileState.columnIndex, tileState.rowIndex),
    normalizeLumberHarvestTileState(tileState)
  ]))
  const exhaustedTileStates = []
  let didChange = false

  lumberCampStructures.forEach(structure => {
    const tileKey = getTileKey(structure.columnIndex, structure.rowIndex)
    const previousState = lumberHarvestTileStatesByKey.get(tileKey) ?? {
      columnIndex: structure.columnIndex,
      rowIndex: structure.rowIndex,
      weeksHarvested: 0,
      exhausted: false
    }
    const nextState = normalizeLumberHarvestTileState({
      ...previousState,
      weeksHarvested: previousState.weeksHarvested + 1
    })

    if (
      nextState.weeksHarvested !== previousState.weeksHarvested ||
      nextState.exhausted !== previousState.exhausted
    ) {
      didChange = true
    }

    lumberHarvestTileStatesByKey.set(tileKey, nextState)

    if (nextState.exhausted && !previousState.exhausted) {
      exhaustedTileStates.push(nextState)
    }
  })

  if (!didChange) {
    return exhaustedTileStates
  }

  terrain.lumberHarvestTileStates = [...lumberHarvestTileStatesByKey.values()]
  terrain.version = (terrain.version ?? 0) + 1

  return exhaustedTileStates
}

export const pickStartingOptions = cities => {
  const byLabel = {
    'low resource access': cities.filter(city => city.resourceAccessLabel === 'low resource access'),
    'average resource access': cities.filter(city => city.resourceAccessLabel === 'average resource access'),
    'high resource access': cities.filter(city => city.resourceAccessLabel === 'high resource access')
  }

  return [
    pickRandomItem(byLabel['low resource access']),
    pickRandomItem(byLabel['average resource access']),
    pickRandomItem(byLabel['high resource access'])
  ].filter(Boolean)
}

export const pickStartingOptionsWithNeighborDiversity = (cities, distanceMatrix, closeNeighborDistanceKm = 800) => {
  if (!distanceMatrix) {
    return pickStartingOptions(cities)
  }

  const minimumStartingIsolationDistanceKm = 500
  const maximumStartingCloseNeighborCount = 3
  const closeNeighborCountByCityId = Object.fromEntries(cities.map(city => [
    city.id,
    Object.entries(distanceMatrix[city.id] ?? {}).filter(([otherCityId, distanceKm]) => (
      Number(otherCityId) !== city.id && distanceKm < closeNeighborDistanceKm
    )).length
  ]))
  const isolationEligibleStartingCities = cities.filter(city => !Object.entries(distanceMatrix[city.id] ?? {}).some(([otherCityId, distanceKm]) => (
    Number(otherCityId) !== city.id && distanceKm < minimumStartingIsolationDistanceKm
  )))
  const eligibleStartingCities = isolationEligibleStartingCities.filter(city => (
    (closeNeighborCountByCityId[city.id] ?? 0) <= maximumStartingCloseNeighborCount
  ))

  if (eligibleStartingCities.length < 3) {
    return isolationEligibleStartingCities.length >= 3
      ? pickStartingOptions(isolationEligibleStartingCities)
      : pickStartingOptions(cities)
  }

  let bestScore = -Infinity
  let bestCombinations = []

  eligibleStartingCities.forEach((firstCity, firstIndex) => {
    eligibleStartingCities.slice(firstIndex + 1).forEach((secondCity, secondOffset) => {
      eligibleStartingCities.slice(firstIndex + secondOffset + 2).forEach(thirdCity => {
        const combination = [firstCity, secondCity, thirdCity]
        const closeNeighborCounts = combination.map(city => closeNeighborCountByCityId[city.id])
        const minimumCount = Math.min(...closeNeighborCounts)
        const maximumCount = Math.max(...closeNeighborCounts)
        const distinctNeighborCount = new Set(closeNeighborCounts).size
        const distinctResourceLabelCount = new Set(combination.map(city => city.resourceAccessLabel)).size
        const spreadScore = maximumCount - minimumCount
        const pairwiseGapScore = Math.abs(closeNeighborCounts[0] - closeNeighborCounts[1]) +
          Math.abs(closeNeighborCounts[0] - closeNeighborCounts[2]) +
          Math.abs(closeNeighborCounts[1] - closeNeighborCounts[2])
        const score = distinctResourceLabelCount * 100 + spreadScore * 10 + distinctNeighborCount * 4 + pairwiseGapScore

        if (score > bestScore) {
          bestScore = score
          bestCombinations = [combination]
          return
        }

        if (score === bestScore) {
          bestCombinations.push(combination)
        }
      })
    })
  })

  return pickRandomItem(bestCombinations) ?? pickStartingOptions(eligibleStartingCities)
}

export const applyResourceAccessLabels = cities => {
  const sortedCities = [...cities].sort((firstCity, secondCity) => (
    firstCity.resourceAccessScore - secondCity.resourceAccessScore
  ))

  sortedCities.forEach((city, index) => {
    const ratio = normalizeRange(index, 0, Math.max(sortedCities.length - 1, 1))

    if (ratio <= 0.33) {
      city.resourceAccessLabel = 'low resource access'
      return
    }

    if (ratio >= 0.67) {
      city.resourceAccessLabel = 'high resource access'
      return
    }

    city.resourceAccessLabel = 'average resource access'
  })
}

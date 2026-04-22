import citySource from '../../northAmericanCities.js'
import cityNames from '../../cityNames.js'
import {
  City,
  explorationCostOpening,
  explorationCostBase,
  explorationCostMaximum,
  explorationGainBaseKm,
  explorationGainStepKm
} from './city.js'
import { buildFlagSpecsForNames, getFlagKeyColorCandidates, getKeyColorRgbForRecipe, heraldicForegroundShapeNames, sanitizeFlagSpec } from './flag-generator.js'
import { advanceLumberHarvestWeek, applyResourceAccessLabels, generateTerrain, getTerrainTile, isTileWithinBuildableTerrain, normalizeTerrainState, pickStartingOptionsWithNeighborDiversity, scoreTerrainAroundCity, terrainColumns, terrainRows } from './terrain.js'
import { clamp, normalizeRange, shuffleArray } from './utils.js'

const minimumKnowledgeRadiusKm = 250
const baseZoomAtMinimumKnowledge = 2.55
const baseZoomRange = 1.45
const explorationZoomDelaySteps = 3
const mapTabZoomOffset = 0.18
const kmPerLatitudeDegree = 111.32
const explorationOpeningCosts = [50, 100, 300, 1200, 2400, 6400]
const explorationCostMultiplier = 2
const explorationDurationScale = 0.85
const explorerTravelKmPerWeek = 2500
const daysPerWeek = 7
const closeNeighborDistanceKm = 800
const initialKnowledgeNeighborPaddingKm = 25
const worldCenterPoint = { x: 0.5, y: 0.5 }
const populationDisplayScale = 0.1
const minimumCityPopulation = 500
const cityPopulationCapHeadroomFactor = 1.4
const maximumCityPopulationCap = Math.round(15000000 * populationDisplayScale)
const weeklyPopulationDeclineRate = 0.002
const weeklyPopulationGrowthRate = 0.003
const weeklyPopulationElasticity = 0.004
const weeklyPopulationFarmSupportRatePerFarm = 0.0009
const weeklyPopulationNoFarmPenalty = 0.001
const cityKeyColorVisibilityRankBonus = 230
const cityKeyColorMultiLayerBonus = 42
export const farmingResearchCost = 500
export const farmingResearchDurationMs = 13000
export const fertilizerResearchCost = 20000
export const fertilizerResearchDurationMs = 13000
export const chemistryResearchCost = 35000
export const chemistryResearchDurationMs = farmingResearchDurationMs * 2
export const chemicalFertilizerResearchCost = 14000
export const chemicalFertilizerResearchDurationMs = fertilizerResearchDurationMs
export const engineeringResearchCost = 25000
export const engineeringResearchDurationMs = fertilizerResearchDurationMs
export const miningResearchCost = 30000
export const miningResearchDurationMs = farmingResearchDurationMs * 2
export const mineShaftsResearchCost = 20000
export const mineShaftsResearchDurationMs = fertilizerResearchDurationMs
export const lumberingResearchCost = 6000
export const lumberingResearchDurationMs = miningResearchDurationMs
const chemistryFarmCostDiscountFactor = 0.9
const engineeringStructureCostDiscountFactor = 0.9
const tradeRouteCostReferenceDistanceKm = 1000
const tradeRouteCostReferenceAmount = 2000
const tradeRouteIncomeReferenceDistanceKm = 1000
const tradeRouteDisplayReuseMaxDetourRatio = 2.45
const tradeRouteDisplayHopPenaltyKm = 45
const tradeRouteDisplayCurrentNetworkMaxDetourRatio = 4.8
const tradeRouteDisplayCurrentNetworkHopPenaltyKm = 0
const tradeRouteDisplayNearbyCityThresholdKm = 300
const foregroundRepeatAvoidanceDistanceKm = 2400
export const technologyIds = {
  farming: 'farming',
  fertilizer: 'fertilizer',
  chemistry: 'chemistry',
  chemicalFertilizer: 'chemical-fertilizer',
  engineering: 'engineering',
  mining: 'mining',
  mineShafts: 'mine-shafts',
  lumbering: 'lumbering'
}
export const structureTypeIds = {
  foragerCamp: 'solar-farm',
  farm: 'farm',
  mine: 'mine',
  lumberCamp: 'lumber-camp',
  derelict: 'derelict'
}
export const structureBuildDurationMsByType = {
  [structureTypeIds.foragerCamp]: 5000,
  [structureTypeIds.farm]: 9000,
  [structureTypeIds.mine]: 9000,
  [structureTypeIds.lumberCamp]: 9000
}
export const structureRangeRadiusTiles = 4

const structureBuildLimits = {
  [structureTypeIds.foragerCamp]: 3,
  [structureTypeIds.farm]: 2,
  [structureTypeIds.mine]: 2,
  [structureTypeIds.lumberCamp]: 2
}

const structureLimitBonusTechnologyIdsByType = {
  [structureTypeIds.farm]: [technologyIds.fertilizer, technologyIds.chemicalFertilizer],
  [structureTypeIds.mine]: [technologyIds.mineShafts]
}

const structureDefinitions = {
  [structureTypeIds.foragerCamp]: {
    label: 'forager camp',
    cost: 0,
    requiredTechnology: null,
    dailyIncome: 30,
    canBuildOnTile: tile => tile.opacity > 0 && tile.type !== 'forest' && tile.type !== 'mountain'
  },
  [structureTypeIds.farm]: {
    label: 'farm',
    cost: 3200,
    requiredTechnology: technologyIds.farming,
    dailyIncome: 120,
    canBuildOnTile: tile => tile.type === 'grassland' && tile.opacity > 0
  },
  [structureTypeIds.mine]: {
    label: 'mine',
    cost: 22400,
    requiredTechnology: technologyIds.mining,
    dailyIncome: 240,
    canBuildOnTile: tile => tile.type === 'mountain' && tile.opacity > 0
  },
  [structureTypeIds.lumberCamp]: {
    label: 'lumber camp',
    cost: 3200,
    requiredTechnology: technologyIds.lumbering,
    dailyIncome: 180,
    canBuildOnTile: tile => tile.type === 'forest' && tile.opacity > 0
  },
  [structureTypeIds.derelict]: {
    label: 'derelict',
    cost: 0,
    requiredTechnology: null,
    dailyIncome: 0,
    canBuildOnTile: tile => tile.opacity > 0
  }
}

const upgradeDiscountFactor = 0.85
const structureUpgradeTargetTypeIds = []
const upgradableStructureTypeIds = new Set()

const activeTabIds = new Set(['city', 'buy', 'research', 'diplomacy', 'calendar'])

const normalizeActiveTab = activeTab => {
  if (activeTab === 'map') {
    return 'calendar'
  }

  return activeTabIds.has(activeTab) ? activeTab : 'city'
}

const normalizePendingTaskList = (tasks, playerCityId) => {
  if (Array.isArray(tasks)) {
    return tasks
  }

  if (!tasks) {
    return []
  }

  return [
    'ownerCityId' in tasks
      ? tasks
      : {
          ...tasks,
          ownerCityId: playerCityId
        }
  ]
}

const normalizePendingTasks = (pendingTasks, playerCityId) => ({
  exploration: normalizePendingTaskList(pendingTasks?.exploration, playerCityId),
  farmingResearch: normalizePendingTaskList(pendingTasks?.farmingResearch, playerCityId),
  fertilizerResearch: normalizePendingTaskList(pendingTasks?.fertilizerResearch, playerCityId),
  chemistryResearch: normalizePendingTaskList(pendingTasks?.chemistryResearch, playerCityId),
  chemicalFertilizerResearch: normalizePendingTaskList(pendingTasks?.chemicalFertilizerResearch, playerCityId),
  engineeringResearch: normalizePendingTaskList(pendingTasks?.engineeringResearch, playerCityId),
  miningResearch: normalizePendingTaskList(pendingTasks?.miningResearch, playerCityId),
  mineShaftsResearch: normalizePendingTaskList(pendingTasks?.mineShaftsResearch, playerCityId),
  lumberingResearch: normalizePendingTaskList(pendingTasks?.lumberingResearch, playerCityId),
  tradeRouteBuilds: normalizePendingTaskList(pendingTasks?.tradeRouteBuilds, playerCityId),
  structureBuilds: normalizePendingTaskList(pendingTasks?.structureBuilds, playerCityId),
  weekPassages: normalizePendingTaskList(pendingTasks?.weekPassages, playerCityId)
})

const normalizeTradeRoutes = tradeRoutes => Array.isArray(tradeRoutes)
  ? tradeRoutes.map(tradeRoute => ({ ...tradeRoute }))
  : []

const normalizeTradeRouteOffers = (tradeRouteOffers, week = 0, dayOfWeek = 0) => Array.isArray(tradeRouteOffers)
  ? tradeRouteOffers.map(offer => ({
      ...offer,
      requestedWeek: typeof offer.requestedWeek === 'number' ? offer.requestedWeek : week,
      requestedDayOfWeek: typeof offer.requestedDayOfWeek === 'number' ? offer.requestedDayOfWeek : dayOfWeek
    }))
  : []

const stateVersionDefaults = Object.freeze({
  cities: 0,
  structures: 0,
  pendingTasks: 0,
  selection: 0,
  ui: 0
})

const ensureStateVersions = state => {
  if (!state.versions) {
    state.versions = { ...stateVersionDefaults }
    return state.versions
  }

  Object.entries(stateVersionDefaults).forEach(([key, value]) => {
    if (typeof state.versions[key] !== 'number') {
      state.versions[key] = value
    }
  })

  return state.versions
}

export const getStateVersion = (state, key) => ensureStateVersions(state)[key] ?? 0

export const bumpStateVersions = (state, ...keys) => {
  const versions = ensureStateVersions(state)

  keys.forEach(key => {
    versions[key] = (versions[key] ?? 0) + 1
  })

  return versions
}

const runtimeStateCache = new WeakMap()

const getStateRuntimeCache = state => {
  let cache = runtimeStateCache.get(state)

  if (!cache) {
    cache = {
      cityListSource: null,
      cityById: new Map(),
      structureVersion: -1,
      structuresByCity: new Map(),
      structureNetworkByCity: new Map(),
      buildRangeCandidateTilesByCity: new Map()
    }
    runtimeStateCache.set(state, cache)
  }

  if (cache.cityListSource !== state.cities) {
    cache.cityListSource = state.cities
    cache.cityById = new Map(state.cities.map(city => [city.id, city]))
  }

  if (cache.structureVersion !== getStateVersion(state, 'structures')) {
    cache.structureVersion = getStateVersion(state, 'structures')
    cache.structuresByCity = new Map()

    state.structures.forEach(structure => {
      const structures = cache.structuresByCity.get(structure.ownerCityId) ?? []
      structures.push(structure)
      cache.structuresByCity.set(structure.ownerCityId, structures)
    })

    cache.structureNetworkByCity = new Map()
    cache.buildRangeCandidateTilesByCity = new Map()
  }

  return cache
}

const getTileKey = (columnIndex, rowIndex) => `${columnIndex}:${rowIndex}`

const isTileInBounds = (terrain, columnIndex, rowIndex) => isTileWithinBuildableTerrain(terrain, columnIndex, rowIndex)

const getOwnedStructures = (state, cityId) => getStateRuntimeCache(state).structuresByCity.get(cityId) ?? []

export const getStructureBuildLimit = (structureType, state = null, cityId = null) => {
  const baseLimit = structureBuildLimits[structureType] ?? Infinity
  const bonusTechnologyIds = structureLimitBonusTechnologyIdsByType[structureType]

  if (!bonusTechnologyIds || !state || cityId == null) {
    return baseLimit
  }

  return baseLimit + bonusTechnologyIds.filter(technologyId => hasTechnology(state, technologyId, cityId)).length
}

const getQueuedStructureCount = (state, cityId, structureType) => (
  (state.pendingTasks?.structureBuilds ?? []).filter(task => (
    task.ownerCityId === cityId && task.structureType === structureType
  )).length
)

export const getStructureCount = (state, cityId, structureType, { includePending = false } = {}) => {
  const builtCount = getOwnedStructures(state, cityId)
    .filter(structure => structure.type === structureType)
    .length

  if (!includePending) {
    return builtCount
  }

  return builtCount + getQueuedStructureCount(state, cityId, structureType)
}

const getTileDistanceSquared = (firstTile, secondTile) => {
  const columnDelta = firstTile.columnIndex - secondTile.columnIndex
  const rowDelta = firstTile.rowIndex - secondTile.rowIndex

  return columnDelta * columnDelta + rowDelta * rowDelta
}

const maxStructureRangeDistanceSquared = structureRangeRadiusTiles * structureRangeRadiusTiles

const isTileWithinStructureRange = (sourceTile, targetTile) => (
  getTileDistanceSquared(sourceTile, targetTile) <= maxStructureRangeDistanceSquared
)

export const getCityBuildOriginTile = (state, cityId) => {
  const cityPoint = state.cityPositions[cityId]

  if (!cityPoint) {
    return { columnIndex: 0, rowIndex: 0 }
  }

  return {
    columnIndex: Math.round(cityPoint.x * state.terrain.columns),
    rowIndex: Math.round(cityPoint.y * state.terrain.rows)
  }
}

const isTileAdjacentToForeignCity = (state, cityId, columnIndex, rowIndex) => state.cities.some(otherCity => {
  if (otherCity.id === cityId) {
    return false
  }

  const cityOriginTile = getCityBuildOriginTile(state, otherCity.id)

  return columnIndex >= cityOriginTile.columnIndex - 1 &&
    columnIndex <= cityOriginTile.columnIndex &&
    rowIndex >= cityOriginTile.rowIndex - 1 &&
    rowIndex <= cityOriginTile.rowIndex
})

const getNearestRangeSource = (sources, targetTile) => sources.reduce((bestSource, source) => {
  const distanceSquared = getTileDistanceSquared(source, targetTile)

  if (distanceSquared > maxStructureRangeDistanceSquared) {
    return bestSource
  }

  if (!bestSource || distanceSquared < bestSource.distanceSquared) {
    return {
      source,
      distanceSquared
    }
  }

  return bestSource
}, null)

export const getStructureDailyIncome = structureType => structureDefinitions[structureType]?.dailyIncome ?? 0
export const getStructureWeeklyIncome = structureType => getStructureDailyIncome(structureType) * daysPerWeek

export const getStructureCost = (state, cityId, structureType) => {
  let baseCost = structureDefinitions[structureType]?.cost ?? 0

  if (structureType === structureTypeIds.foragerCamp) {
    const ownedForagerCampCount = getStructureCount(state, cityId, structureTypeIds.foragerCamp)
    const queuedForagerCampCount = getQueuedStructureCount(state, cityId, structureTypeIds.foragerCamp)

    baseCost = Math.min(1000, (ownedForagerCampCount + queuedForagerCampCount) * 100)
  }

  if (state && cityId != null) {
    let discountedCost = baseCost

    if (hasTechnology(state, technologyIds.engineering, cityId)) {
      discountedCost = Math.round(discountedCost * engineeringStructureCostDiscountFactor)
    }

    if (structureType === structureTypeIds.farm && hasTechnology(state, technologyIds.chemistry, cityId)) {
      discountedCost = Math.round(discountedCost * chemistryFarmCostDiscountFactor)
    }

    return Math.max(0, discountedCost)
  }

  return baseCost
}

export const getStructureUpgradeCost = (state, cityId, structureType) => Math.max(
  0,
  Math.round(getStructureCost(state, cityId, structureType) * upgradeDiscountFactor)
)

export const getStructureUpgradeTargetTypes = structure => {
  if (!structure || !upgradableStructureTypeIds.has(structure.type)) {
    return []
  }

  return structureUpgradeTargetTypeIds.filter(structureType => structureType !== structure.type)
}

const getTradeRouteCityPair = (firstCityId, secondCityId) => (
  firstCityId <= secondCityId
    ? { cityAId: firstCityId, cityBId: secondCityId }
    : { cityAId: secondCityId, cityBId: firstCityId }
)

const hasSameTradeRoutePair = (entry, firstCityId, secondCityId) => {
  const { cityAId, cityBId } = getTradeRouteCityPair(firstCityId, secondCityId)

  return entry.cityAId === cityAId && entry.cityBId === cityBId
}

const getTradeRouteDistanceKmBetweenCities = (state, firstCityId, secondCityId) => (
  state.distanceMatrix[firstCityId]?.[secondCityId] ?? 0
)

const getTradeRoutePathDistanceKm = (state, cityPathIds) => cityPathIds.reduce((distanceKm, cityId, index) => {
  if (index === 0) {
    return distanceKm
  }

  return distanceKm + getTradeRouteDistanceKmBetweenCities(state, cityPathIds[index - 1], cityId)
}, 0)

const buildTradeRouteAdjacency = (state, excludedTradeRoute = null) => {
  const adjacency = new Map(state.cities.map(city => [city.id, []]))

  state.tradeRoutes.forEach(tradeRoute => {
    if (excludedTradeRoute && hasSameTradeRoutePair(tradeRoute, excludedTradeRoute.cityAId, excludedTradeRoute.cityBId)) {
      return
    }

    const distanceKm = getTradeRouteDistanceKmBetweenCities(state, tradeRoute.cityAId, tradeRoute.cityBId)

    if (distanceKm <= 0) {
      return
    }

    adjacency.get(tradeRoute.cityAId)?.push({ cityId: tradeRoute.cityBId, distanceKm })
    adjacency.get(tradeRoute.cityBId)?.push({ cityId: tradeRoute.cityAId, distanceKm })
  })

  return adjacency
}

const findTradeRouteNetworkPathCityIds = (
  state,
  firstCityId,
  secondCityId,
  excludedTradeRoute = null,
  {
    maxDetourRatio = tradeRouteDisplayReuseMaxDetourRatio,
    hopPenaltyKm = tradeRouteDisplayHopPenaltyKm
  } = {}
) => {
  const directDistanceKm = getTradeRouteDistanceKmBetweenCities(state, firstCityId, secondCityId)

  if (directDistanceKm <= 0) {
    return null
  }

  const adjacency = buildTradeRouteAdjacency(state, excludedTradeRoute)

  if (!(adjacency.get(firstCityId)?.length) || !(adjacency.get(secondCityId)?.length)) {
    return null
  }

  const scoreByCityId = new Map([[firstCityId, 0]])
  const previousCityIdByCityId = new Map()
  const visitedCityIds = new Set()

  while (true) {
    const currentEntry = [...scoreByCityId.entries()]
      .filter(([cityId]) => !visitedCityIds.has(cityId))
      .sort((firstEntry, secondEntry) => firstEntry[1] - secondEntry[1])[0]

    if (!currentEntry) {
      break
    }

    const [currentCityId, currentScore] = currentEntry

    if (currentCityId === secondCityId) {
      break
    }

    visitedCityIds.add(currentCityId)

    ;(adjacency.get(currentCityId) ?? []).forEach(({ cityId: nextCityId, distanceKm }) => {
      if (visitedCityIds.has(nextCityId)) {
        return
      }

      const nextScore = currentScore + distanceKm + hopPenaltyKm

      if (nextScore < (scoreByCityId.get(nextCityId) ?? Infinity)) {
        scoreByCityId.set(nextCityId, nextScore)
        previousCityIdByCityId.set(nextCityId, currentCityId)
      }
    })
  }

  if (!previousCityIdByCityId.has(secondCityId)) {
    return null
  }

  const cityPathIds = [secondCityId]
  let currentCityId = secondCityId

  while (currentCityId !== firstCityId) {
    currentCityId = previousCityIdByCityId.get(currentCityId)

    if (!currentCityId) {
      return null
    }

    cityPathIds.unshift(currentCityId)
  }

  if (cityPathIds.length < 3) {
    return null
  }

  const pathDistanceKm = getTradeRoutePathDistanceKm(state, cityPathIds)

  if (pathDistanceKm > directDistanceKm * maxDetourRatio) {
    return null
  }

  return cityPathIds
}

const initializeTradeRouteDisplayPaths = state => {
  const seededState = {
    ...state,
    tradeRoutes: []
  }

  const orderedTradeRoutes = state.tradeRoutes
    .map((tradeRoute, index) => ({ tradeRoute, index }))
    .sort((firstEntry, secondEntry) => (
      (firstEntry.tradeRoute.builtWeek ?? 0) - (secondEntry.tradeRoute.builtWeek ?? 0) ||
      (firstEntry.tradeRoute.builtDayOfWeek ?? 0) - (secondEntry.tradeRoute.builtDayOfWeek ?? 0) ||
      firstEntry.index - secondEntry.index
    ))

  const initializedTradeRoutes = orderedTradeRoutes.map(({ tradeRoute }) => {
    const explicitPathCityIds = Array.isArray(tradeRoute.pathCityIds)
      ? tradeRoute.pathCityIds.filter(cityId => Boolean(getCityById(state, cityId)))
      : []
    const pathCityIds = explicitPathCityIds.length >= 2
      ? explicitPathCityIds
      : findTradeRouteNetworkPathCityIds(seededState, tradeRoute.cityAId, tradeRoute.cityBId) ?? [tradeRoute.cityAId, tradeRoute.cityBId]
    const initializedTradeRoute = {
      ...tradeRoute,
      pathCityIds
    }

    seededState.tradeRoutes = [...seededState.tradeRoutes, initializedTradeRoute]

    return initializedTradeRoute
  })

  state.tradeRoutes = initializedTradeRoutes
}

const getTradeRouteCostForDistanceKm = distanceKm => {
  const normalizedDistance = Math.max(120, distanceKm)
  const scaledCost = tradeRouteCostReferenceAmount * Math.pow(2, (normalizedDistance - tradeRouteCostReferenceDistanceKm) / tradeRouteCostReferenceDistanceKm)

  return Math.max(100, Math.round(scaledCost / 50) * 50) * 10
}

const getTradeRouteDailyIncomeForDistanceKm = distanceKm => Math.max(
  1,
  Math.round(distanceKm / tradeRouteIncomeReferenceDistanceKm)
) * 90

const getTradeRouteSplitSharesForCost = totalCost => {
  const requesterShare = Math.ceil(totalCost / 2 / 50) * 50

  return {
    requesterShare,
    recipientShare: totalCost - requesterShare
  }
}

const canCitiesTrade = (state, firstCityId, secondCityId) => {
  if (firstCityId === secondCityId) {
    return false
  }

  return Boolean(getCityById(state, firstCityId) && getCityById(state, secondCityId))
}

const clearTradeRouteOffersForPair = (state, firstCityId, secondCityId) => {
  state.tradeRouteOffers = state.tradeRouteOffers.filter(offer => !hasSameTradeRoutePair(offer, firstCityId, secondCityId))
}

const getAbsoluteDayIndex = (week = 0, dayOfWeek = 0) => week * daysPerWeek + dayOfWeek

const expireStaleTradeRouteOffers = state => {
  const currentAbsoluteDayIndex = getAbsoluteDayIndex(state.week, state.dayOfWeek ?? 0)
  const expiredOffers = []
  const activeOffers = []

  state.tradeRouteOffers.forEach(offer => {
    const requestedAbsoluteDayIndex = getAbsoluteDayIndex(offer.requestedWeek, offer.requestedDayOfWeek ?? 0)

    if (currentAbsoluteDayIndex - requestedAbsoluteDayIndex < daysPerWeek) {
      activeOffers.push(offer)
      return
    }

    const requester = getCityById(state, offer.fromCityId)

    if (requester) {
      requester.treasury += offer.requesterShare
    }

    expiredOffers.push(offer)
  })

  if (!expiredOffers.length) {
    return []
  }

  state.tradeRouteOffers = activeOffers
  bumpStateVersions(state, 'cities', 'ui')

  return expiredOffers
}

const createTradeRouteOfferRecord = (state, fromCityId, toCityId, requesterShare, recipientShare) => {
  const totalCost = requesterShare + recipientShare
  const offer = {
    ...getTradeRouteCityPair(fromCityId, toCityId),
    fromCityId,
    toCityId,
    totalCost,
    requesterShare,
    recipientShare,
    requestedWeek: state.week,
    requestedDayOfWeek: state.dayOfWeek ?? 0
  }

  state.tradeRouteOffers = [...state.tradeRouteOffers, offer]

  return offer
}

const createTradeRouteRecord = (state, firstCityId, secondCityId) => {
  const { cityAId, cityBId } = getTradeRouteCityPair(firstCityId, secondCityId)
  const tradeRoute = {
    cityAId,
    cityBId,
    builtWeek: state.week,
    builtDayOfWeek: state.dayOfWeek ?? 0,
    pathCityIds: findTradeRouteNetworkPathCityIds(state, cityAId, cityBId) ?? [cityAId, cityBId]
  }

  state.tradeRoutes = [...state.tradeRoutes, tradeRoute]
  clearTradeRouteOffersForPair(state, firstCityId, secondCityId)

  return tradeRoute
}

const getStructureTileKey = structure => `${structure.columnIndex}:${structure.rowIndex}`

const advanceWeeklyTerrainEffects = state => {
  const exhaustedLumberTileStates = advanceLumberHarvestWeek(state.terrain, state.structures)

  if (!exhaustedLumberTileStates.length) {
    return {
      exhaustedLumberCamps: []
    }
  }

  const exhaustedTileKeys = new Set(exhaustedLumberTileStates.map(tileState => `${tileState.columnIndex}:${tileState.rowIndex}`))
  const exhaustedLumberCamps = state.structures.filter(structure => (
    structure.type === structureTypeIds.lumberCamp && exhaustedTileKeys.has(getStructureTileKey(structure))
  ))

  if (exhaustedLumberCamps.length) {
    state.structures = state.structures.map(structure => (
      structure.type === structureTypeIds.lumberCamp && exhaustedTileKeys.has(getStructureTileKey(structure))
        ? {
            ...structure,
            type: structureTypeIds.derelict
          }
        : structure
    ))
    bumpStateVersions(state, 'structures')
  }

  return {
    exhaustedLumberCamps
  }
}

const applyPendingTaskUpfrontCosts = state => {
  ;[
    ...(state.pendingTasks?.exploration ?? []),
    ...(state.pendingTasks?.farmingResearch ?? []),
    ...(state.pendingTasks?.fertilizerResearch ?? []),
    ...(state.pendingTasks?.miningResearch ?? []),
    ...(state.pendingTasks?.mineShaftsResearch ?? []),
    ...(state.pendingTasks?.lumberingResearch ?? []),
    ...(state.pendingTasks?.structureBuilds ?? []),
    ...(state.pendingTasks?.weekPassages ?? [])
  ].forEach(task => {
    if (task.paidUpFront) {
      return
    }

    const city = state.cities.find(entry => entry.id === task.ownerCityId)

    if (city && (task.cost ?? 0) > 0) {
      city.treasury = Math.max(0, city.treasury - task.cost)
    }

    task.paidUpFront = true
  })
}

export const getStructureNetwork = (state, cityId) => {
  const cache = getStateRuntimeCache(state)
  const cachedNetwork = cache.structureNetworkByCity.get(cityId)

  if (cachedNetwork) {
    return cachedNetwork
  }

  const city = getCityById(state, cityId)

  if (!city) {
    return []
  }

  const connectedSources = [{
    kind: 'home',
    cityId,
    ...getCityBuildOriginTile(state, cityId)
  }]
  const remainingStructures = [...getOwnedStructures(state, cityId)]
  const network = []

  while (remainingStructures.length) {
    const nextConnection = remainingStructures.reduce((bestConnection, structure, structureIndex) => {
      const nearestSource = getNearestRangeSource(connectedSources, structure)

      if (!nearestSource) {
        return bestConnection
      }

      if (!bestConnection || nearestSource.distanceSquared < bestConnection.distanceSquared) {
        return {
          structureIndex,
          structure,
          parent: nearestSource.source,
          distanceSquared: nearestSource.distanceSquared
        }
      }

      return bestConnection
    }, null)

    if (!nextConnection) {
      break
    }

    const { structureIndex, structure, parent, distanceSquared } = nextConnection
    const networkEntry = {
      ...structure,
      parent,
      distanceSquared
    }

    network.push(networkEntry)
    connectedSources.push({
      kind: 'structure',
      ownerCityId: cityId,
      columnIndex: structure.columnIndex,
      rowIndex: structure.rowIndex
    })
    remainingStructures.splice(structureIndex, 1)
  }

  cache.structureNetworkByCity.set(cityId, network)

  return network
}

export const getBuildRangeSources = (state, cityId) => {
  const city = getCityById(state, cityId)

  if (!city) {
    return []
  }

  return [{
    kind: 'home',
    cityId,
    ...getCityBuildOriginTile(state, cityId)
  }, ...getStructureNetwork(state, cityId).map(structure => ({
    kind: 'structure',
    ownerCityId: cityId,
    columnIndex: structure.columnIndex,
    rowIndex: structure.rowIndex
  }))]
}

export const getBuildRangeCandidateTiles = (state, cityId) => {
  const cache = getStateRuntimeCache(state)
  const cachedTiles = cache.buildRangeCandidateTilesByCity.get(cityId)

  if (cachedTiles) {
    return cachedTiles
  }

  const candidateTilesByKey = new Map()

  getBuildRangeSources(state, cityId).forEach(source => {
    for (let rowIndex = source.rowIndex - structureRangeRadiusTiles; rowIndex <= source.rowIndex + structureRangeRadiusTiles; rowIndex += 1) {
      for (let columnIndex = source.columnIndex - structureRangeRadiusTiles; columnIndex <= source.columnIndex + structureRangeRadiusTiles; columnIndex += 1) {
        const candidateTile = { columnIndex, rowIndex }

        if (!isTileInBounds(state.terrain, columnIndex, rowIndex) || !isTileWithinStructureRange(source, candidateTile)) {
          continue
        }

        candidateTilesByKey.set(getTileKey(columnIndex, rowIndex), candidateTile)
      }
    }
  })

  const candidateTiles = [...candidateTilesByKey.values()]
  cache.buildRangeCandidateTilesByCity.set(cityId, candidateTiles)

  return candidateTiles
}

const haversineDistanceKm = (firstCity, secondCity) => {
  const degreesToRadians = degrees => degrees * (Math.PI / 180)
  const earthRadiusKm = 6371
  const latitudeDelta = degreesToRadians(secondCity.latitude - firstCity.latitude)
  const longitudeDelta = degreesToRadians(secondCity.longitude - firstCity.longitude)
  const firstLatitudeRadians = degreesToRadians(firstCity.latitude)
  const secondLatitudeRadians = degreesToRadians(secondCity.latitude)
  const a = Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
    Math.cos(firstLatitudeRadians) * Math.cos(secondLatitudeRadians) *
    Math.sin(longitudeDelta / 2) * Math.sin(longitudeDelta / 2)

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const getProjectedPointKm = (city, longitudeScale) => ({
  x: city.longitude * longitudeScale,
  y: city.latitude * kmPerLatitudeDegree
})

const getDistanceFromCityToTradeRouteSegmentKm = (firstCity, secondCity, candidateCity) => {
  const referenceLatitude = (firstCity.latitude + secondCity.latitude + candidateCity.latitude) / 3
  const longitudeScale = Math.max(
    kmPerLatitudeDegree * Math.cos((referenceLatitude * Math.PI) / 180),
    0.01
  )
  const firstPoint = getProjectedPointKm(firstCity, longitudeScale)
  const secondPoint = getProjectedPointKm(secondCity, longitudeScale)
  const candidatePoint = getProjectedPointKm(candidateCity, longitudeScale)
  const segmentDeltaX = secondPoint.x - firstPoint.x
  const segmentDeltaY = secondPoint.y - firstPoint.y
  const segmentLengthSquared = segmentDeltaX * segmentDeltaX + segmentDeltaY * segmentDeltaY

  if (segmentLengthSquared <= 0.0001) {
    return Math.hypot(candidatePoint.x - firstPoint.x, candidatePoint.y - firstPoint.y)
  }

  const projection = clamp(
    ((candidatePoint.x - firstPoint.x) * segmentDeltaX + (candidatePoint.y - firstPoint.y) * segmentDeltaY) / segmentLengthSquared,
    0,
    1
  )
  const nearestPoint = {
    x: firstPoint.x + segmentDeltaX * projection,
    y: firstPoint.y + segmentDeltaY * projection
  }

  return Math.hypot(candidatePoint.x - nearestPoint.x, candidatePoint.y - nearestPoint.y)
}

const findTradeRouteDisplayWaypointCityId = (state, firstCityId, secondCityId, excludedCityIds = new Set()) => {
  const firstCity = getCityById(state, firstCityId)
  const secondCity = getCityById(state, secondCityId)
  const directDistanceKm = getTradeRouteDistanceKmBetweenCities(state, firstCityId, secondCityId)

  if (!firstCity || !secondCity || directDistanceKm <= 0) {
    return null
  }

  const bestCandidate = state.cities.reduce((currentBestCandidate, candidateCity) => {
    if (
      candidateCity.id === firstCityId ||
      candidateCity.id === secondCityId ||
      excludedCityIds.has(candidateCity.id)
    ) {
      return currentBestCandidate
    }

    const segmentDistanceKm = getDistanceFromCityToTradeRouteSegmentKm(firstCity, secondCity, candidateCity)

    if (segmentDistanceKm > tradeRouteDisplayNearbyCityThresholdKm) {
      return currentBestCandidate
    }

    const detourDistanceKm = getTradeRouteDistanceKmBetweenCities(state, firstCityId, candidateCity.id) +
      getTradeRouteDistanceKmBetweenCities(state, candidateCity.id, secondCityId) -
      directDistanceKm
    const candidate = {
      cityId: candidateCity.id,
      segmentDistanceKm,
      detourDistanceKm
    }

    if (!currentBestCandidate) {
      return candidate
    }

    if (candidate.segmentDistanceKm !== currentBestCandidate.segmentDistanceKm) {
      return candidate.segmentDistanceKm < currentBestCandidate.segmentDistanceKm
        ? candidate
        : currentBestCandidate
    }

    return candidate.detourDistanceKm < currentBestCandidate.detourDistanceKm
      ? candidate
      : currentBestCandidate
  }, null)

  return bestCandidate?.cityId ?? null
}

const expandTradeRouteDisplayPathCityIds = (state, cityPathIds) => {
  let expandedPathCityIds = [...cityPathIds]

  for (let iteration = 0; iteration < state.cities.length; iteration += 1) {
    let insertedWaypoint = false
    const usedCityIds = new Set(expandedPathCityIds)
    const nextPathCityIds = [expandedPathCityIds[0]]

    for (let index = 1; index < expandedPathCityIds.length; index += 1) {
      const firstCityId = expandedPathCityIds[index - 1]
      const secondCityId = expandedPathCityIds[index]
      const waypointCityId = findTradeRouteDisplayWaypointCityId(state, firstCityId, secondCityId, usedCityIds)

      if (waypointCityId) {
        nextPathCityIds.push(waypointCityId)
        usedCityIds.add(waypointCityId)
        insertedWaypoint = true
      }

      nextPathCityIds.push(secondCityId)
    }

    expandedPathCityIds = nextPathCityIds

    if (!insertedWaypoint) {
      break
    }
  }

  return expandedPathCityIds
}

const pickUniqueRandomNames = count => {
  if (cityNames.length < count) {
    throw new Error('Not enough unique city names to populate the map')
  }

  return shuffleArray(cityNames).slice(0, count)
}

const buildBounds = cities => cities.reduce((accumulator, city) => ({
  minLat: Math.min(accumulator.minLat, city.latitude),
  maxLat: Math.max(accumulator.maxLat, city.latitude),
  minLon: Math.min(accumulator.minLon, city.longitude),
  maxLon: Math.max(accumulator.maxLon, city.longitude)
}), {
  minLat: Infinity,
  maxLat: -Infinity,
  minLon: Infinity,
  maxLon: -Infinity
})

const buildCityPositions = (cities, bounds) => {
  const longitudeSpan = bounds.maxLon - bounds.minLon || 1
  const latitudeSpan = bounds.maxLat - bounds.minLat || 1
  const occupiedVertices = new Set()

  const takeNearestOpenVertex = (rawX, rawY) => {
    const targetColumn = clamp(rawX * terrainColumns, 1, terrainColumns - 1)
    const targetRow = clamp(rawY * terrainRows, 1, terrainRows - 1)
    let bestVertex = null

    for (let rowIndex = 1; rowIndex < terrainRows; rowIndex += 1) {
      for (let columnIndex = 1; columnIndex < terrainColumns; columnIndex += 1) {
        const key = `${columnIndex}:${rowIndex}`

        if (occupiedVertices.has(key)) {
          continue
        }

        const distance = (columnIndex - targetColumn) ** 2 + (rowIndex - targetRow) ** 2

        if (!bestVertex || distance < bestVertex.distance) {
          bestVertex = {
            key,
            columnIndex,
            rowIndex,
            distance
          }
        }
      }
    }

    occupiedVertices.add(bestVertex.key)

    return {
      x: bestVertex.columnIndex / terrainColumns,
      y: bestVertex.rowIndex / terrainRows
    }
  }

  return Object.fromEntries(cities.map(city => {
    const rawX = (city.longitude - bounds.minLon) / longitudeSpan
    const rawY = 1 - (city.latitude - bounds.minLat) / latitudeSpan

    return [city.id, takeNearestOpenVertex(rawX, rawY)]
  }))
}

const buildDistanceMatrix = cities => {
  let maxDistanceKm = 0
  const distanceMatrix = Object.fromEntries(cities.map(city => [city.id, {}]))

  cities.forEach(firstCity => {
    cities.forEach(secondCity => {
      if (firstCity.id === secondCity.id) {
        distanceMatrix[firstCity.id][secondCity.id] = 0
        return
      }

      const distanceKm = haversineDistanceKm(firstCity, secondCity)
      distanceMatrix[firstCity.id][secondCity.id] = distanceKm
      maxDistanceKm = Math.max(maxDistanceKm, distanceKm)
    })
  })

  return {
    distanceMatrix,
    maxDistanceKm
  }
}

const applyInitialKnowledgeRadii = (cities, distanceMatrix) => {
  cities.forEach(city => {
    const neighborDistancesKm = Object.entries(distanceMatrix[city.id])
      .filter(([otherCityId]) => Number(otherCityId) !== city.id)
      .map(([, distanceKm]) => distanceKm)
    const nearestDistanceKm = neighborDistancesKm
      .sort((firstDistanceKm, secondDistanceKm) => firstDistanceKm - secondDistanceKm)[0] ?? 220
    const closeNeighborCount = neighborDistancesKm.filter(distanceKm => distanceKm < closeNeighborDistanceKm).length
    const firstContactRadiusKm = Math.ceil(nearestDistanceKm + initialKnowledgeNeighborPaddingKm)
    const isolatedCityStartingRadiusKm = Math.max(
      minimumKnowledgeRadiusKm,
      firstContactRadiusKm - getExplorationStandardGainKm(0) - getExplorationStandardGainKm(1)
    )

    city.knowledgeRadiusKm = closeNeighborCount === 0
      ? isolatedCityStartingRadiusKm
      : firstContactRadiusKm
  })
}

const getZoomKnowledgeUpperBound = state => Math.max(state.maxDistanceKm * 0.72, 800)

const getZoomAdjustedKnowledgeRadius = knowledgeRadiusKm => Math.max(
  minimumKnowledgeRadiusKm,
  knowledgeRadiusKm - (explorationZoomDelaySteps * explorationGainBaseKm + (explorationZoomDelaySteps * (explorationZoomDelaySteps - 1) * explorationGainStepKm) / 2)
)

const getTargetZoomForKnowledgeRadius = (state, knowledgeRadiusKm) => {
  const ratio = normalizeRange(getZoomAdjustedKnowledgeRadius(knowledgeRadiusKm), minimumKnowledgeRadiusKm, getZoomKnowledgeUpperBound(state))

  return baseZoomAtMinimumKnowledge - ratio * baseZoomRange
}

const getFullMapZoomKnowledgeThreshold = state => {
  const fullMapBaseZoom = 1 + mapTabZoomOffset
  const thresholdRatio = clamp((baseZoomAtMinimumKnowledge - fullMapBaseZoom) / baseZoomRange, 0, 1)

  return minimumKnowledgeRadiusKm + (getZoomKnowledgeUpperBound(state) - minimumKnowledgeRadiusKm) * thresholdRatio + (explorationZoomDelaySteps * explorationGainBaseKm + (explorationZoomDelaySteps * (explorationZoomDelaySteps - 1) * explorationGainStepKm) / 2)
}

const getRecenteringWindowKm = state => Math.max(260, state.maxDistanceKm * 0.14)

const getExplorationRecenteringProgress = (state, knowledgeRadiusKm) => {
  const fullZoomThresholdKm = getFullMapZoomKnowledgeThreshold(state)

  return normalizeRange(
    knowledgeRadiusKm,
    fullZoomThresholdKm,
    fullZoomThresholdKm + getRecenteringWindowKm(state)
  )
}

const getFocusPointForKnowledgeRadius = (state, city, knowledgeRadiusKm) => {
  if (!city) {
    return worldCenterPoint
  }

  const cityPoint = state.cityPositions[city.id] ?? worldCenterPoint
  const recenteringProgress = getExplorationRecenteringProgress(state, knowledgeRadiusKm)

  return {
    x: cityPoint.x + (worldCenterPoint.x - cityPoint.x) * recenteringProgress,
    y: cityPoint.y + (worldCenterPoint.y - cityPoint.y) * recenteringProgress
  }
}

const getCityIdsWithinKnowledgeRadius = (state, city, knowledgeRadiusKm = city?.knowledgeRadiusKm ?? 0) => {
  if (!city) {
    return []
  }

  return state.cities
    .filter(otherCity => otherCity.id !== city.id && state.distanceMatrix[city.id][otherCity.id] <= knowledgeRadiusKm)
    .map(otherCity => otherCity.id)
}

const getKnowledgeEllipseForCity = (state, city, knowledgeRadiusKm = city?.knowledgeRadiusKm ?? 0) => {
  if (!city || knowledgeRadiusKm <= 0) {
    return null
  }

  const center = state.cityPositions[city.id]

  if (!center) {
    return null
  }

  const longitudeSpan = state.bounds.maxLon - state.bounds.minLon || 1
  const latitudeSpan = state.bounds.maxLat - state.bounds.minLat || 1
  const longitudeScale = Math.max(
    kmPerLatitudeDegree * Math.cos((city.latitude * Math.PI) / 180),
    0.01
  )
  const fullRadiusWorldX = (city.knowledgeRadiusKm / longitudeScale) / longitudeSpan
  const fullRadiusWorldY = (city.knowledgeRadiusKm / kmPerLatitudeDegree) / latitudeSpan
  const correctionScale = Math.max(1, ...getCityIdsWithinKnowledgeRadius(state, city, city.knowledgeRadiusKm).map(cityId => {
    const point = state.cityPositions[cityId]

    if (!point || fullRadiusWorldX <= 0 || fullRadiusWorldY <= 0) {
      return 1
    }

    const normalizedX = (point.x - center.x) / fullRadiusWorldX
    const normalizedY = (point.y - center.y) / fullRadiusWorldY

    return Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY)
  }))

  return {
    center,
    radiusWorldX: ((knowledgeRadiusKm / longitudeScale) / longitudeSpan) * correctionScale,
    radiusWorldY: ((knowledgeRadiusKm / kmPerLatitudeDegree) / latitudeSpan) * correctionScale
  }
}

const isWorldPointInsideKnowledgeEllipse = (point, ellipse) => {
  if (!ellipse || ellipse.radiusWorldX <= 0 || ellipse.radiusWorldY <= 0) {
    return false
  }

  const normalizedX = (point.x - ellipse.center.x) / ellipse.radiusWorldX
  const normalizedY = (point.y - ellipse.center.y) / ellipse.radiusWorldY

  return normalizedX * normalizedX + normalizedY * normalizedY <= 1.0005
}

const getVisibleCityIdsForKnowledgeRadius = (state, city, knowledgeRadiusKm) => {
  if (!city) {
    return []
  }

  const zoom = Math.max(1, getTargetZoomForKnowledgeRadius(state, knowledgeRadiusKm) - mapTabZoomOffset)
  const center = getFocusPointForKnowledgeRadius(state, city, knowledgeRadiusKm)
  const halfVisibleWidth = 0.5 / zoom
  const halfVisibleHeight = 0.5 / zoom
  const knowledgeEllipse = getKnowledgeEllipseForCity(state, city, knowledgeRadiusKm)

  return state.cities
    .filter(otherCity => otherCity.id !== city.id)
    .filter(otherCity => {
      const point = state.cityPositions[otherCity.id]

      if (!point || !knowledgeEllipse || !isWorldPointInsideKnowledgeEllipse(point, knowledgeEllipse)) {
        return false
      }

      return (
        point.x >= center.x - halfVisibleWidth &&
        point.x <= center.x + halfVisibleWidth &&
        point.y >= center.y - halfVisibleHeight &&
        point.y <= center.y + halfVisibleHeight
      )
    })
    .map(otherCity => otherCity.id)
}

const doesTileIntersectKnowledgeEllipse = (terrain, columnIndex, rowIndex, ellipse) => {
  if (!ellipse) {
    return true
  }

  const left = columnIndex / terrain.columns
  const top = rowIndex / terrain.rows
  const right = (columnIndex + 1) / terrain.columns
  const bottom = (rowIndex + 1) / terrain.rows
  const nearestX = Math.max(left, Math.min(ellipse.center.x, right))
  const nearestY = Math.max(top, Math.min(ellipse.center.y, bottom))
  const normalizedX = (nearestX - ellipse.center.x) / ellipse.radiusWorldX
  const normalizedY = (nearestY - ellipse.center.y) / ellipse.radiusWorldY

  return normalizedX * normalizedX + normalizedY * normalizedY <= 1.0005
}

const getVisibleCityCountForKnowledgeRadius = (state, city, knowledgeRadiusKm) => {
  if (!city) {
    return 0
  }

  return 1 + getVisibleCityIdsForKnowledgeRadius(state, city, knowledgeRadiusKm).length
}

const getEdgePenalty = position => {
  const nearestEdgeDistance = Math.min(
    position.x,
    1 - position.x,
    position.y,
    1 - position.y
  )

  return Math.pow(clamp(1 - nearestEdgeDistance / 0.24, 0, 1), 1.2)
}

const scoreCityResourceAccess = (cities, cityPositions, terrain, distanceMatrix) => {
  cities.forEach(city => {
    const terrainScore = scoreTerrainAroundCity(terrain, cityPositions[city.id])
    const position = cityPositions[city.id]
    const neighboringCities = Object.entries(distanceMatrix[city.id])
      .filter(([otherCityId]) => Number(otherCityId) !== city.id)
      .map(([, distanceKm]) => distanceKm)
      .sort((firstDistanceKm, secondDistanceKm) => firstDistanceKm - secondDistanceKm)
      .slice(0, 4)
    const proximityScore = neighboringCities.reduce((accumulator, distanceKm, index) => (
      accumulator + clamp(1 - distanceKm / (2100 + index * 280), 0, 1) * (1.7 - index * 0.2)
    ), 0)
    const edgePenalty = getEdgePenalty(position)

    city.resourceAccessScore = terrainScore * 0.72 + proximityScore * 5.8 - edgePenalty * 5.6
  })

  applyResourceAccessLabels(cities)
}

const getRgbDistance = (firstColor, secondColor) => Math.hypot(
  firstColor[0] - secondColor[0],
  firstColor[1] - secondColor[1],
  firstColor[2] - secondColor[2]
)

const getCityColorPressureScore = (city, distanceMatrix) => Object.entries(distanceMatrix[city.id])
  .filter(([otherCityId]) => Number(otherCityId) !== city.id)
  .reduce((pressureScore, [, distanceKm]) => (
    pressureScore + 0.2 + Math.pow(clamp(1 - distanceKm / 3600, 0, 1), 2) * 3
  ), 0)

const getCityColorCandidateScore = ({
  city,
  candidate,
  cities,
  distanceMatrix,
  assignedRecipeByCityId,
  getRecipeRgb
}) => {
  const candidateColor = getRecipeRgb(candidate.recipeName)
  let nearestWeightedDistance = Infinity
  let totalWeightedDistance = 0
  let sameRecipePenalty = 0
  let globalReusePenalty = 0

  cities.forEach(otherCity => {
    if (otherCity.id === city.id) {
      return
    }

    const assignedRecipeName = assignedRecipeByCityId.get(otherCity.id)

    if (!assignedRecipeName) {
      return
    }

    const distanceKm = distanceMatrix[city.id][otherCity.id] ?? 0
    const proximityWeight = 0.2 + Math.pow(clamp(1 - distanceKm / 4200, 0, 1), 2) * 3.4
    const colorDistance = getRgbDistance(candidateColor, getRecipeRgb(assignedRecipeName))
    const weightedDistance = colorDistance * proximityWeight

    nearestWeightedDistance = Math.min(nearestWeightedDistance, weightedDistance)
    totalWeightedDistance += weightedDistance

    if (assignedRecipeName === candidate.recipeName) {
      sameRecipePenalty += 220 * proximityWeight
      globalReusePenalty += 16
    }
  })

  if (!Number.isFinite(nearestWeightedDistance)) {
    nearestWeightedDistance = 0
  }

  const visibilityRankBonus = Math.max(0, 3 - (candidate.visibilityRank ?? 0)) * cityKeyColorVisibilityRankBonus
  const multiLayerBonus = Math.max(0, (candidate.layerRoles?.length ?? 1) - 1) * cityKeyColorMultiLayerBonus

  return visibilityRankBonus + multiLayerBonus + (candidate.surfacePreference ?? 0) * 84 + candidate.prominence * 16 + nearestWeightedDistance * 2.8 + totalWeightedDistance * 0.08 - sameRecipePenalty - globalReusePenalty
}

const assignCityKeyColorRecipes = (cities, distanceMatrix) => {
  const recipeRgbCache = new Map()
  const getRecipeRgb = recipeName => {
    if (!recipeRgbCache.has(recipeName)) {
      recipeRgbCache.set(recipeName, getKeyColorRgbForRecipe(recipeName))
    }

    return recipeRgbCache.get(recipeName)
  }

  const orderedCities = [...cities]
    .sort((firstCity, secondCity) => getCityColorPressureScore(secondCity, distanceMatrix) - getCityColorPressureScore(firstCity, distanceMatrix))
  const assignedRecipeByCityId = new Map()
  const candidateEntriesByCityId = new Map(cities.map(city => [city.id, getFlagKeyColorCandidates(city.flag).map((candidate, index) => ({
    ...candidate,
    visibilityRank: index
  }))]))

  orderedCities.forEach(city => {
    const candidates = candidateEntriesByCityId.get(city.id) ?? []

    if (!candidates.length) {
      city.flag = {
        ...city.flag,
        keyColorRecipe: 'gold'
      }
      assignedRecipeByCityId.set(city.id, 'gold')
      return
    }

    const chosenCandidate = [...candidates].sort((firstCandidate, secondCandidate) => (
      getCityColorCandidateScore({
        city,
        candidate: secondCandidate,
        cities,
        distanceMatrix,
        assignedRecipeByCityId,
        getRecipeRgb
      }) - getCityColorCandidateScore({
        city,
        candidate: firstCandidate,
        cities,
        distanceMatrix,
        assignedRecipeByCityId,
        getRecipeRgb
      })
    ))[0]

    assignedRecipeByCityId.set(city.id, chosenCandidate.recipeName)
  })

  for (let iteration = 0; iteration < 6; iteration += 1) {
    let changedAnyRecipe = false

    orderedCities.forEach(city => {
      const candidates = candidateEntriesByCityId.get(city.id) ?? []

      if (candidates.length <= 1) {
        return
      }

      const currentRecipeName = assignedRecipeByCityId.get(city.id)
      const bestCandidate = [...candidates].sort((firstCandidate, secondCandidate) => (
        getCityColorCandidateScore({
          city,
          candidate: secondCandidate,
          cities,
          distanceMatrix,
          assignedRecipeByCityId,
          getRecipeRgb
        }) - getCityColorCandidateScore({
          city,
          candidate: firstCandidate,
          cities,
          distanceMatrix,
          assignedRecipeByCityId,
          getRecipeRgb
        })
      ))[0]

      if (bestCandidate.recipeName !== currentRecipeName) {
        assignedRecipeByCityId.set(city.id, bestCandidate.recipeName)
        changedAnyRecipe = true
      }
    })

    if (!changedAnyRecipe) {
      break
    }
  }

  cities.forEach(city => {
    city.flag = {
      ...city.flag,
      keyColorRecipe: assignedRecipeByCityId.get(city.id) ?? 'gold'
    }
  })
}

const getCityForegroundCandidateScore = ({
  city,
  candidateShape,
  cities,
  distanceMatrix,
  assignedShapeByCityId,
  originalShapeByCityId
}) => {
  let nearestSameShapeDistanceKm = Infinity
  let sameShapePenalty = 0
  let globalReusePenalty = 0

  cities.forEach(otherCity => {
    if (otherCity.id === city.id) {
      return
    }

    const assignedShape = assignedShapeByCityId.get(otherCity.id)

    if (!assignedShape || assignedShape !== candidateShape) {
      return
    }

    const distanceKm = distanceMatrix[city.id][otherCity.id] ?? Infinity
    const proximityWeight = 0.2 + Math.pow(clamp(1 - distanceKm / 4200, 0, 1), 2) * 4.4

    nearestSameShapeDistanceKm = Math.min(nearestSameShapeDistanceKm, distanceKm)
    sameShapePenalty += 190 * proximityWeight
    globalReusePenalty += 12

    if (distanceKm < foregroundRepeatAvoidanceDistanceKm) {
      sameShapePenalty += 10000 + (foregroundRepeatAvoidanceDistanceKm - distanceKm) * 3
    }
  })

  if (!Number.isFinite(nearestSameShapeDistanceKm)) {
    nearestSameShapeDistanceKm = 5200
  }

  return nearestSameShapeDistanceKm * 0.03 - sameShapePenalty - globalReusePenalty + (
    candidateShape === originalShapeByCityId.get(city.id)
      ? 22
      : 0
  )
}

const assignCityForegroundShapes = (cities, distanceMatrix) => {
  const citiesWithForeground = cities.filter(city => city.flag.foreground?.shape)

  if (citiesWithForeground.length <= 1) {
    return
  }

  const orderedCities = [...citiesWithForeground]
    .sort((firstCity, secondCity) => getCityColorPressureScore(secondCity, distanceMatrix) - getCityColorPressureScore(firstCity, distanceMatrix))
  const originalShapeByCityId = new Map(citiesWithForeground.map(city => [city.id, city.flag.foreground.shape]))
  const candidateShapesByCityId = new Map(citiesWithForeground.map(city => {
    const originalShape = city.flag.foreground.shape

    return [
      city.id,
      [
        originalShape,
        ...heraldicForegroundShapeNames.filter(shape => shape !== originalShape)
      ]
    ]
  }))
  const assignedShapeByCityId = new Map(citiesWithForeground.map(city => [city.id, city.flag.foreground.shape]))

  for (let iteration = 0; iteration < 8; iteration += 1) {
    let changedAnyShape = false

    orderedCities.forEach(city => {
      const candidateShapes = candidateShapesByCityId.get(city.id) ?? []
      const currentShape = assignedShapeByCityId.get(city.id)
      const bestShape = [...candidateShapes].sort((firstShape, secondShape) => (
        getCityForegroundCandidateScore({
          city,
          candidateShape: secondShape,
          cities: citiesWithForeground,
          distanceMatrix,
          assignedShapeByCityId,
          originalShapeByCityId
        }) - getCityForegroundCandidateScore({
          city,
          candidateShape: firstShape,
          cities: citiesWithForeground,
          distanceMatrix,
          assignedShapeByCityId,
          originalShapeByCityId
        })
      ))[0]

      if (bestShape && bestShape !== currentShape) {
        assignedShapeByCityId.set(city.id, bestShape)
        changedAnyShape = true
      }
    })

    if (!changedAnyShape) {
      break
    }
  }

  citiesWithForeground.forEach(city => {
    city.flag = {
      ...city.flag,
      foreground: {
        ...city.flag.foreground,
        shape: assignedShapeByCityId.get(city.id) ?? city.flag.foreground.shape
      }
    }
  })
}

const buildCities = () => {
  const omittedCityIds = new Set(
    shuffleArray(citySource).slice(0, 3).map(city => city.id)
  )
  const activeSourceCities = citySource.filter(city => !omittedCityIds.has(city.id))
  const randomizedNames = pickUniqueRandomNames(activeSourceCities.length)
  const randomizedFlags = buildFlagSpecsForNames(randomizedNames)

  return activeSourceCities.map((city, index) => new City({
    id: city.id,
    sourceId: city.id,
    name: randomizedNames[index],
    flag: randomizedFlags[index],
    latitude: city.latitude,
    longitude: city.longitude,
    population: Math.max(minimumCityPopulation, Math.round(city.population * populationDisplayScale)),
    country: city.country
  }))
}

const sourcePopulationByCityId = new Map(citySource.map(city => [city.id, city.population]))

const normalizeCityPopulation = city => {
  const sourcePopulation = sourcePopulationByCityId.get(city.sourceId ?? city.id)

  if (sourcePopulation && city.population === sourcePopulation) {
    city.population = Math.round(sourcePopulation * populationDisplayScale)
  }

  city.population = clamp(
    Math.round(city.population ?? minimumCityPopulation),
    minimumCityPopulation,
    maximumCityPopulationCap
  )

  return city
}

const getCityPopulationCap = city => {
  const sourcePopulation = sourcePopulationByCityId.get(city.sourceId ?? city.id)
  const baselinePopulation = sourcePopulation
    ? Math.round(sourcePopulation * populationDisplayScale)
    : city.population

  return clamp(
    Math.round(baselinePopulation * cityPopulationCapHeadroomFactor),
    minimumCityPopulation,
    maximumCityPopulationCap
  )
}

const stepCityPopulation = (state, city) => {
  const cap = getCityPopulationCap(city)
  const farmCount = Math.min(4, getStructureCount(state, city.id, structureTypeIds.farm))
  const roll = Math.ceil(Math.random() * 6)
  const declineThreshold = farmCount === 0
    ? 3
    : Math.max(1, 2 - Math.floor(farmCount / 2))
  const growthThreshold = farmCount === 0
    ? 6
    : Math.max(3, 5 - Math.floor((farmCount + 1) / 2))
  let delta = 0

  if (roll <= declineThreshold) {
    delta = -weeklyPopulationDeclineRate
  } else if (roll >= growthThreshold) {
    delta = farmCount === 0
      ? 0
      : weeklyPopulationGrowthRate
  }

  const pressure = 1 - (city.population / cap)
  const foodSecurityDelta = farmCount > 0
    ? farmCount * weeklyPopulationFarmSupportRatePerFarm
    : -weeklyPopulationNoFarmPenalty
  const nextPopulation = Math.round(city.population * (1 + delta + foodSecurityDelta + pressure * weeklyPopulationElasticity))

  city.population = clamp(nextPopulation, minimumCityPopulation, maximumCityPopulationCap)
}

const advanceWeeklyPopulation = state => {
  state.cities.forEach(city => stepCityPopulation(state, city))
}

const assembleState = ({
  cities,
  terrain,
  week = 0,
  dayOfWeek = 0,
  playerCityId = null,
  activeTab = 'city',
  startingOptionIds = [],
  introDismissed = false,
  researchedTechnologies = [],
  structures = [],
  pendingTasks = null,
  tradeRoutes = [],
  tradeRouteOffers = []
}) => {
  const bounds = buildBounds(cities)
  const cityPositions = buildCityPositions(cities, bounds)
  const { distanceMatrix, maxDistanceKm } = buildDistanceMatrix(cities)
  assignCityKeyColorRecipes(cities, distanceMatrix)

  const normalizedPendingTasks = normalizePendingTasks(pendingTasks, playerCityId)

  const state = {
    week,
    dayOfWeek,
    playerCityId,
    activeTab: normalizeActiveTab(activeTab),
    introDismissed,
    startingOptionIds,
    cities,
    bounds,
    cityPositions,
    terrain,
    researchedTechnologies,
    structures,
    tradeRoutes: normalizeTradeRoutes(tradeRoutes),
    tradeRouteOffers: normalizeTradeRouteOffers(tradeRouteOffers, week, dayOfWeek),
    pendingTasks: normalizedPendingTasks,
    distanceMatrix,
    maxDistanceKm,
    versions: { ...stateVersionDefaults }
  }

  initializeTradeRouteDisplayPaths(state)
  applyPendingTaskUpfrontCosts(state)

  return state
}

export const createNewGameState = () => {
  const cities = buildCities()
  const bounds = buildBounds(cities)
  const cityPositions = buildCityPositions(cities, bounds)
  const terrain = normalizeTerrainState(generateTerrain(cityPositions))
  const { distanceMatrix } = buildDistanceMatrix(cities)

  assignCityForegroundShapes(cities, distanceMatrix)
  applyInitialKnowledgeRadii(cities, distanceMatrix)
  scoreCityResourceAccess(cities, cityPositions, terrain, distanceMatrix)

  const startingOptionIds = shuffleArray(pickStartingOptionsWithNeighborDiversity(cities, distanceMatrix).map(city => city.id))

  return assembleState({
    cities,
    terrain,
    researchedTechnologies: [],
    structures: [],
    pendingTasks: {
      exploration: [],
      farmingResearch: [],
      fertilizerResearch: [],
      miningResearch: [],
      mineShaftsResearch: [],
      lumberingResearch: [],
      tradeRouteBuilds: [],
      structureBuilds: [],
      weekPassages: []
    },
    tradeRoutes: [],
    tradeRouteOffers: [],
    startingOptionIds
  })
}

export const hydrateGameState = payload => {
  const cities = payload.state.cities.map(cityData => normalizeCityPopulation(City.fromJSON({
    ...cityData,
    flag: sanitizeFlagSpec(cityData.flag)
  })))
  const playerCityId = payload.state.playerCityId
  const playerCity = cities.find(city => city.id === playerCityId)

  if (playerCity && (!Array.isArray(playerCity.researchedTechnologyIds) || playerCity.researchedTechnologyIds.length === 0) && Array.isArray(payload.state.researchedTechnologies)) {
    playerCity.researchedTechnologyIds = payload.state.researchedTechnologies
  }
  const bounds = buildBounds(cities)
  const cityPositions = buildCityPositions(cities, bounds)
  const hydratedTerrain = normalizeTerrainState(payload.state.terrain)
  const terrain = hydratedTerrain.legacyTiles
    ? hydratedTerrain
    : {
        ...hydratedTerrain,
        cityPositions: Object.values(cityPositions)
      }

  return assembleState({
    cities,
    terrain,
    week: payload.state.week,
    dayOfWeek: payload.state.dayOfWeek ?? 0,
    playerCityId,
    activeTab: normalizeActiveTab(payload.state.activeTab ?? 'city'),
    introDismissed: Boolean(payload.state.introDismissed),
    researchedTechnologies: payload.state.researchedTechnologies ?? [],
    structures: payload.state.structures ?? [],
    pendingTasks: payload.state.pendingTasks,
    tradeRoutes: payload.state.tradeRoutes ?? [],
    tradeRouteOffers: payload.state.tradeRouteOffers ?? [],
    startingOptionIds: payload.state.startingOptionIds ?? shuffleArray(pickStartingOptionsWithNeighborDiversity(cities, buildDistanceMatrix(cities).distanceMatrix).map(city => city.id))
  })
}

export const getCityById = (state, cityId) => getStateRuntimeCache(state).cityById.get(cityId) ?? null

export const getPlayerCity = state => getCityById(state, state.playerCityId)

export const getKnownCityIds = (state, cityId) => {
  const city = getCityById(state, cityId)

  if (!city) {
    return []
  }

  return getCityIdsWithinKnowledgeRadius(state, city, city.knowledgeRadiusKm)
}

export const getKnownCities = (state, cityId) => getKnownCityIds(state, cityId)
  .map(knownCityId => getCityById(state, knownCityId))
  .filter(Boolean)

export const getTradeRouteBetweenCities = (state, firstCityId, secondCityId) => (
  state.tradeRoutes.find(route => hasSameTradeRoutePair(route, firstCityId, secondCityId)) ?? null
)

export const getTradeRoutesForCity = (state, cityId) => state.tradeRoutes.filter(route => (
  route.cityAId === cityId || route.cityBId === cityId
))

export const getTradeRouteOfferBetweenCities = (state, firstCityId, secondCityId) => (
  state.tradeRouteOffers.find(offer => hasSameTradeRoutePair(offer, firstCityId, secondCityId)) ?? null
)

export const getTradeRouteBuildBetweenCities = (state, firstCityId, secondCityId) => (
  (state.pendingTasks?.tradeRouteBuilds ?? []).find(task => hasSameTradeRoutePair(task, firstCityId, secondCityId)) ?? null
)

export const getIncomingTradeRouteOffers = (state, cityId) => state.tradeRouteOffers.filter(offer => offer.toCityId === cityId)

export const getTradeRouteCost = (state, firstCityId, secondCityId) => (
  getTradeRouteCostForDistanceKm(getTradeRouteDistanceKmBetweenCities(state, firstCityId, secondCityId))
)

export const getTradeRouteSplitShares = (state, firstCityId, secondCityId) => (
  getTradeRouteSplitSharesForCost(getTradeRouteCost(state, firstCityId, secondCityId))
)

export const getTradeRouteDailyIncome = (state, firstCityId, secondCityId) => (
  getTradeRouteDailyIncomeForDistanceKm(getTradeRouteDistanceKmBetweenCities(state, firstCityId, secondCityId))
)

export const getTradeRouteBuildDurationDays = (state, firstCityId, secondCityId) => Math.max(
  1,
  Math.round(getTradeRouteDistanceKmBetweenCities(state, firstCityId, secondCityId) / 20)
)

export const getTradeRouteWeeklyIncome = (state, firstCityId, secondCityId) => (
  getTradeRouteDailyIncome(state, firstCityId, secondCityId) * daysPerWeek
)

export const getCityWeeklyIncomeSummary = (state, cityId) => {
  const ownedStructures = getOwnedStructures(state, cityId)
  const farmCount = ownedStructures.filter(structure => structure.type === structureTypeIds.farm).length
  const mineCount = ownedStructures.filter(structure => structure.type === structureTypeIds.mine).length
  const lumberCampCount = ownedStructures.filter(structure => structure.type === structureTypeIds.lumberCamp).length
  const foragerCampCount = ownedStructures.filter(structure => structure.type === structureTypeIds.foragerCamp).length
  const farmsWeeklyIncome = farmCount * getStructureWeeklyIncome(structureTypeIds.farm)
  const minesWeeklyIncome = mineCount * getStructureWeeklyIncome(structureTypeIds.mine)
  const lumberCampsWeeklyIncome = lumberCampCount * getStructureWeeklyIncome(structureTypeIds.lumberCamp)
  const foragerCampsWeeklyIncome = foragerCampCount * getStructureWeeklyIncome(structureTypeIds.foragerCamp)
  const tradeRoutes = getTradeRoutesForCity(state, cityId)
    .map(tradeRoute => {
      const otherCityId = tradeRoute.cityAId === cityId ? tradeRoute.cityBId : tradeRoute.cityAId
      const otherCity = getCityById(state, otherCityId)

      return {
        cityId: otherCityId,
        cityName: otherCity?.name ?? 'Unknown city-state',
        weeklyIncome: getTradeRouteWeeklyIncome(state, tradeRoute.cityAId, tradeRoute.cityBId)
      }
    })
    .sort((firstRoute, secondRoute) => firstRoute.cityName.localeCompare(secondRoute.cityName))
  const tradeRoutesWeeklyIncome = tradeRoutes.reduce((totalIncome, tradeRoute) => totalIncome + tradeRoute.weeklyIncome, 0)

  return {
    totalWeeklyIncome: farmsWeeklyIncome + minesWeeklyIncome + lumberCampsWeeklyIncome + foragerCampsWeeklyIncome + tradeRoutesWeeklyIncome,
    farms: {
      count: farmCount,
      weeklyIncome: farmsWeeklyIncome
    },
    mines: {
      count: mineCount,
      weeklyIncome: minesWeeklyIncome
    },
    lumberCamps: {
      count: lumberCampCount,
      weeklyIncome: lumberCampsWeeklyIncome
    },
    foragerCamps: {
      count: foragerCampCount,
      weeklyIncome: foragerCampsWeeklyIncome
    },
    tradeRoutesWeeklyIncome,
    tradeRoutes
  }
}

export const getTradeRouteDisplayPathCityIds = (state, tradeRoute) => {
  const recomputedPathCityIds = findTradeRouteNetworkPathCityIds(
    state,
    tradeRoute.cityAId,
    tradeRoute.cityBId,
    tradeRoute,
    {
      maxDetourRatio: tradeRouteDisplayCurrentNetworkMaxDetourRatio,
      hopPenaltyKm: tradeRouteDisplayCurrentNetworkHopPenaltyKm
    }
  )

  if (recomputedPathCityIds?.length >= 2) {
    return expandTradeRouteDisplayPathCityIds(state, recomputedPathCityIds)
  }

  const explicitPathCityIds = Array.isArray(tradeRoute.pathCityIds)
    ? tradeRoute.pathCityIds.filter(cityId => Boolean(getCityById(state, cityId)))
    : []

  if (explicitPathCityIds.length >= 2) {
    return expandTradeRouteDisplayPathCityIds(state, explicitPathCityIds)
  }

  return expandTradeRouteDisplayPathCityIds(state, [tradeRoute.cityAId, tradeRoute.cityBId])
}

export const getTradeRouteDisplaySegments = state => {
  const segmentsByKey = new Map()

  state.tradeRoutes.forEach(tradeRoute => {
    const cityPathIds = getTradeRouteDisplayPathCityIds(state, tradeRoute)

    for (let index = 1; index < cityPathIds.length; index += 1) {
      const firstCityId = cityPathIds[index - 1]
      const secondCityId = cityPathIds[index]

      if (firstCityId === secondCityId) {
        continue
      }

      const distanceKm = getTradeRouteDistanceKmBetweenCities(state, firstCityId, secondCityId)

      if (distanceKm <= 0) {
        continue
      }

      const { cityAId, cityBId } = getTradeRouteCityPair(firstCityId, secondCityId)
      const key = `${cityAId}:${cityBId}`

      if (!segmentsByKey.has(key)) {
        segmentsByKey.set(key, { cityAId, cityBId, distanceKm })
      }
    }
  })

  return [...segmentsByKey.values()]
}

export const buildTradeRoute = (state, payingCityId, otherCityId) => {
  const totalCost = getTradeRouteCost(state, payingCityId, otherCityId)
  const offer = offerTradeRouteSplit(state, payingCityId, otherCityId)

  if (!offer) {
    return null
  }

  return {
    offer,
    totalCost,
    dailyIncome: getTradeRouteDailyIncome(state, payingCityId, otherCityId)
  }
}

export const offerTradeRouteSplit = (state, fromCityId, toCityId) => {
  if (
    !canCitiesTrade(state, fromCityId, toCityId) ||
    getTradeRouteBetweenCities(state, fromCityId, toCityId) ||
    getTradeRouteBuildBetweenCities(state, fromCityId, toCityId) ||
    getTradeRouteOfferBetweenCities(state, fromCityId, toCityId)
  ) {
    return null
  }

  const requester = getCityById(state, fromCityId)
  const totalCost = getTradeRouteCost(state, fromCityId, toCityId)
  const { requesterShare, recipientShare } = getTradeRouteSplitSharesForCost(totalCost)

  if (!requester || requester.treasury < requesterShare) {
    return null
  }

  requester.treasury -= requesterShare
  const offer = createTradeRouteOfferRecord(state, fromCityId, toCityId, requesterShare, recipientShare)
  bumpStateVersions(state, 'cities', 'ui')

  return offer
}

export const acceptTradeRouteOffer = (state, requesterCityId, recipientCityId) => {
  const offer = state.tradeRouteOffers.find(entry => (
    entry.fromCityId === requesterCityId && entry.toCityId === recipientCityId
  ))
  const recipient = getCityById(state, recipientCityId)

  if (
    !offer ||
    !recipient ||
    recipient.treasury < offer.recipientShare ||
    getTradeRouteBetweenCities(state, requesterCityId, recipientCityId) ||
    getTradeRouteBuildBetweenCities(state, requesterCityId, recipientCityId)
  ) {
    return null
  }

  recipient.treasury -= offer.recipientShare
  clearTradeRouteOffersForPair(state, requesterCityId, recipientCityId)
  bumpStateVersions(state, 'cities', 'ui')

  return {
    offer,
    tradeRouteBuild: {
      ...getTradeRouteCityPair(requesterCityId, recipientCityId),
      requesterCityId,
      recipientCityId,
      durationDays: getTradeRouteBuildDurationDays(state, requesterCityId, recipientCityId)
    },
    dailyIncome: getTradeRouteDailyIncome(state, requesterCityId, recipientCityId)
  }
}

export const completeTradeRouteBuild = (state, firstCityId, secondCityId) => {
  if (
    !canCitiesTrade(state, firstCityId, secondCityId) ||
    getTradeRouteBetweenCities(state, firstCityId, secondCityId)
  ) {
    return null
  }

  const tradeRoute = createTradeRouteRecord(state, firstCityId, secondCityId)
  bumpStateVersions(state, 'ui')

  return {
    tradeRoute,
    dailyIncome: getTradeRouteDailyIncome(state, firstCityId, secondCityId)
  }
}

export const declineTradeRouteOffer = (state, requesterCityId, recipientCityId) => {
  const offer = state.tradeRouteOffers.find(entry => (
    entry.fromCityId === requesterCityId && entry.toCityId === recipientCityId
  ))

  if (!offer) {
    return null
  }

  const requester = getCityById(state, requesterCityId)

  if (requester) {
    requester.treasury += offer.requesterShare
  }

  clearTradeRouteOffersForPair(state, requesterCityId, recipientCityId)
  bumpStateVersions(state, 'cities', 'ui')

  return offer
}

export const choosePlayerCity = (state, cityId) => {
  state.playerCityId = cityId
  state.activeTab = 'city'
  state.introDismissed = true
  bumpStateVersions(state, 'selection', 'ui')
}

export const setActiveTab = (state, tabId) => {
  state.activeTab = normalizeActiveTab(tabId)
  bumpStateVersions(state, 'ui')
}

export const hasTechnology = (state, technologyId, cityId = state.playerCityId) => {
  const city = getCityById(state, cityId)

  return Boolean(city?.researchedTechnologyIds?.includes(technologyId))
}

export const getStructuresForCity = (state, cityId) => getOwnedStructures(state, cityId)

export const getFarmingResearchAvailability = (state, cityId) => {
  const city = getCityById(state, cityId)

  if (!city) {
    return {
      canResearch: false,
      reason: 'missing'
    }
  }

  if (hasTechnology(state, technologyIds.farming, cityId)) {
    return {
      canResearch: false,
      reason: 'researched'
    }
  }

  if (city.treasury < farmingResearchCost) {
    return {
      canResearch: false,
      reason: 'unaffordable'
    }
  }

  return {
    canResearch: true,
    reason: 'available'
  }
}

export const getFertilizerResearchAvailability = (state, cityId) => {
  const city = getCityById(state, cityId)

  if (!city) {
    return {
      canResearch: false,
      reason: 'missing'
    }
  }

  if (!hasTechnology(state, technologyIds.farming, cityId)) {
    return {
      canResearch: false,
      reason: 'locked'
    }
  }

  if (hasTechnology(state, technologyIds.fertilizer, cityId)) {
    return {
      canResearch: false,
      reason: 'researched'
    }
  }

  if (city.treasury < fertilizerResearchCost) {
    return {
      canResearch: false,
      reason: 'unaffordable'
    }
  }

  return {
    canResearch: true,
    reason: 'available'
  }
}

export const getEngineeringResearchAvailability = (state, cityId) => {
  const city = getCityById(state, cityId)

  if (!city) {
    return {
      canResearch: false,
      reason: 'missing'
    }
  }

  if (hasTechnology(state, technologyIds.engineering, cityId)) {
    return {
      canResearch: false,
      reason: 'researched'
    }
  }

  if (city.treasury < engineeringResearchCost) {
    return {
      canResearch: false,
      reason: 'unaffordable'
    }
  }

  return {
    canResearch: true,
    reason: 'available'
  }
}

export const getChemistryResearchAvailability = (state, cityId) => {
  const city = getCityById(state, cityId)

  if (!city) {
    return {
      canResearch: false,
      reason: 'missing'
    }
  }

  if (hasTechnology(state, technologyIds.chemistry, cityId)) {
    return {
      canResearch: false,
      reason: 'researched'
    }
  }

  if (city.treasury < chemistryResearchCost) {
    return {
      canResearch: false,
      reason: 'unaffordable'
    }
  }

  return {
    canResearch: true,
    reason: 'available'
  }
}

export const getChemicalFertilizerResearchAvailability = (state, cityId) => {
  const city = getCityById(state, cityId)

  if (!city) {
    return {
      canResearch: false,
      reason: 'missing'
    }
  }

  if (!hasTechnology(state, technologyIds.chemistry, cityId)) {
    return {
      canResearch: false,
      reason: 'locked'
    }
  }

  if (hasTechnology(state, technologyIds.chemicalFertilizer, cityId)) {
    return {
      canResearch: false,
      reason: 'researched'
    }
  }

  if (city.treasury < chemicalFertilizerResearchCost) {
    return {
      canResearch: false,
      reason: 'unaffordable'
    }
  }

  return {
    canResearch: true,
    reason: 'available'
  }
}

export const getMiningResearchAvailability = (state, cityId) => {
  const city = getCityById(state, cityId)

  if (!city) {
    return {
      canResearch: false,
      reason: 'missing'
    }
  }

  if (hasTechnology(state, technologyIds.mining, cityId)) {
    return {
      canResearch: false,
      reason: 'researched'
    }
  }

  if (city.treasury < miningResearchCost) {
    return {
      canResearch: false,
      reason: 'unaffordable'
    }
  }

  return {
    canResearch: true,
    reason: 'available'
  }
}

export const getMineShaftsResearchAvailability = (state, cityId) => {
  const city = getCityById(state, cityId)

  if (!city) {
    return {
      canResearch: false,
      reason: 'missing'
    }
  }

  if (!hasTechnology(state, technologyIds.mining, cityId)) {
    return {
      canResearch: false,
      reason: 'locked'
    }
  }

  if (hasTechnology(state, technologyIds.mineShafts, cityId)) {
    return {
      canResearch: false,
      reason: 'researched'
    }
  }

  if (city.treasury < mineShaftsResearchCost) {
    return {
      canResearch: false,
      reason: 'unaffordable'
    }
  }

  return {
    canResearch: true,
    reason: 'available'
  }
}

export const getLumberingResearchAvailability = (state, cityId) => {
  const city = getCityById(state, cityId)

  if (!city) {
    return {
      canResearch: false,
      reason: 'missing'
    }
  }

  if (hasTechnology(state, technologyIds.lumbering, cityId)) {
    return {
      canResearch: false,
      reason: 'researched'
    }
  }

  if (city.treasury < lumberingResearchCost) {
    return {
      canResearch: false,
      reason: 'unaffordable'
    }
  }

  return {
    canResearch: true,
    reason: 'available'
  }
}

export const researchFarming = state => {
  const playerCity = getPlayerCity(state)

  if (!playerCity) {
    return null
  }

  const availability = getFarmingResearchAvailability(state, playerCity.id)

  if (!availability.canResearch) {
    return null
  }

  const beforeTreasury = playerCity.treasury
  playerCity.treasury -= farmingResearchCost
  playerCity.researchedTechnologyIds = [...playerCity.researchedTechnologyIds, technologyIds.farming]
  bumpStateVersions(state, 'cities')

  return {
    beforeTreasury,
    afterTreasury: playerCity.treasury
  }
}

export const getStructurePlacementAvailability = (state, cityId, structureType, columnIndex, rowIndex) => {
  const city = getCityById(state, cityId)
  const structureDefinition = structureDefinitions[structureType]

  if (!city || !structureDefinition) {
    return {
      canPlace: false,
      reason: 'missing'
    }
  }

  if (!isTileInBounds(state.terrain, columnIndex, rowIndex)) {
    return {
      canPlace: false,
      reason: 'bounds'
    }
  }

  if (structureDefinition.requiredTechnology && !hasTechnology(state, structureDefinition.requiredTechnology, cityId)) {
    return {
      canPlace: false,
      reason: 'locked'
    }
  }

  if (getStructureCount(state, cityId, structureType, { includePending: true }) >= getStructureBuildLimit(structureType, state, cityId)) {
    return {
      canPlace: false,
      reason: 'limit'
    }
  }

  const occupiedTile = state.structures.some(structure => (
    structure.columnIndex === columnIndex && structure.rowIndex === rowIndex
  ))

  if (occupiedTile) {
    return {
      canPlace: false,
      reason: 'occupied'
    }
  }

  if (isTileAdjacentToForeignCity(state, cityId, columnIndex, rowIndex)) {
    return {
      canPlace: false,
      reason: 'city'
    }
  }

  const tile = getTerrainTile(state.terrain, columnIndex, rowIndex)

  if (!structureDefinition.canBuildOnTile(tile)) {
    return {
      canPlace: false,
      reason: 'terrain',
      tile
    }
  }

  const targetTile = { columnIndex, rowIndex }
  const inRange = getBuildRangeSources(state, cityId).some(source => isTileWithinStructureRange(source, targetTile))

  if (!inRange) {
    return {
      canPlace: false,
      reason: 'range',
      tile
    }
  }

  const knowledgeEllipse = getKnowledgeEllipseForCity(state, city)

  if (!doesTileIntersectKnowledgeEllipse(state.terrain, columnIndex, rowIndex, knowledgeEllipse)) {
    return {
      canPlace: false,
      reason: 'knowledge',
      tile
    }
  }

  return {
    canPlace: true,
    reason: 'available',
    tile
  }
}

export const getStructureAtTile = (state, columnIndex, rowIndex) => state.structures.find(structure => (
  structure.columnIndex === columnIndex && structure.rowIndex === rowIndex
)) ?? null

export const getStructureDemolitionAvailability = (state, cityId, columnIndex, rowIndex) => {
  const city = getCityById(state, cityId)

  if (!city) {
    return {
      canDemolish: false,
      reason: 'missing'
    }
  }

  if (!isTileInBounds(state.terrain, columnIndex, rowIndex)) {
    return {
      canDemolish: false,
      reason: 'bounds'
    }
  }

  const structure = getStructureAtTile(state, columnIndex, rowIndex)

  if (!structure) {
    return {
      canDemolish: false,
      reason: 'empty'
    }
  }

  if (structure.ownerCityId !== cityId) {
    return {
      canDemolish: false,
      reason: 'foreign',
      structure
    }
  }

  return {
    canDemolish: true,
    reason: 'available',
    structure
  }
}

export const getStructureUpgradeAvailability = (state, cityId, structure, targetStructureType) => {
  const city = getCityById(state, cityId)
  const sourceStructure = structure && typeof structure === 'object'
    ? getStructureAtTile(state, structure.columnIndex, structure.rowIndex)
    : null
  const structureDefinition = structureDefinitions[targetStructureType]

  if (!city || !sourceStructure || !structureDefinition) {
    return {
      canUpgrade: false,
      reason: 'missing'
    }
  }

  if (sourceStructure.ownerCityId !== cityId) {
    return {
      canUpgrade: false,
      reason: 'foreign',
      structure: sourceStructure
    }
  }

  if (!upgradableStructureTypeIds.has(sourceStructure.type)) {
    return {
      canUpgrade: false,
      reason: 'type',
      structure: sourceStructure
    }
  }

  if (!structureUpgradeTargetTypeIds.includes(targetStructureType) || targetStructureType === sourceStructure.type) {
    return {
      canUpgrade: false,
      reason: 'invalid-target',
      structure: sourceStructure
    }
  }

  if (structureDefinition.requiredTechnology && !hasTechnology(state, structureDefinition.requiredTechnology, cityId)) {
    return {
      canUpgrade: false,
      reason: 'locked',
      structure: sourceStructure
    }
  }

  if (getStructureCount(state, cityId, targetStructureType, { includePending: true }) >= getStructureBuildLimit(targetStructureType, state, cityId)) {
    return {
      canUpgrade: false,
      reason: 'limit',
      structure: sourceStructure
    }
  }

  const tile = getTerrainTile(state.terrain, sourceStructure.columnIndex, sourceStructure.rowIndex)

  if (!structureDefinition.canBuildOnTile(tile)) {
    return {
      canUpgrade: false,
      reason: 'terrain',
      structure: sourceStructure,
      tile
    }
  }

  const targetTile = {
    columnIndex: sourceStructure.columnIndex,
    rowIndex: sourceStructure.rowIndex
  }
  const inRange = getBuildRangeSources(state, cityId).some(source => isTileWithinStructureRange(source, targetTile))

  if (!inRange) {
    return {
      canUpgrade: false,
      reason: 'range',
      structure: sourceStructure,
      tile
    }
  }

  const knowledgeEllipse = getKnowledgeEllipseForCity(state, city)

  if (!doesTileIntersectKnowledgeEllipse(state.terrain, sourceStructure.columnIndex, sourceStructure.rowIndex, knowledgeEllipse)) {
    return {
      canUpgrade: false,
      reason: 'knowledge',
      structure: sourceStructure,
      tile
    }
  }

  const cost = getStructureUpgradeCost(state, cityId, targetStructureType)

  if (city.treasury < cost) {
    return {
      canUpgrade: false,
      reason: 'unaffordable',
      structure: sourceStructure,
      cost,
      tile
    }
  }

  return {
    canUpgrade: true,
    reason: 'available',
    structure: sourceStructure,
    targetStructureType,
    cost,
    tile
  }
}

export const placeStructure = (state, cityId, structureType, columnIndex, rowIndex) => {
  const availability = getStructurePlacementAvailability(state, cityId, structureType, columnIndex, rowIndex)

  if (!availability.canPlace) {
    return null
  }

  const structure = {
    ownerCityId: cityId,
    type: structureType,
    columnIndex,
    rowIndex
  }

  state.structures = [...state.structures, structure]
  bumpStateVersions(state, 'structures')

  return structure
}

export const upgradeStructure = (state, cityId, structure, targetStructureType) => {
  const availability = getStructureUpgradeAvailability(state, cityId, structure, targetStructureType)

  if (!availability.canUpgrade) {
    return null
  }

  const city = getCityById(state, cityId)

  if (!city) {
    return null
  }

  const beforeTreasury = city.treasury
  const upgradedStructure = {
    ...availability.structure,
    type: targetStructureType
  }

  state.structures = state.structures.map(entry => (
    entry === availability.structure
      ? upgradedStructure
      : entry
  ))
  city.treasury = Math.max(0, city.treasury - availability.cost)
  bumpStateVersions(state, 'cities', 'structures')

  return {
    upgradedStructure,
    cost: availability.cost,
    beforeTreasury,
    afterTreasury: city.treasury
  }
}

export const demolishStructure = (state, cityId, columnIndex, rowIndex) => {
  const availability = getStructureDemolitionAvailability(state, cityId, columnIndex, rowIndex)

  if (!availability.canDemolish) {
    return null
  }

  state.structures = state.structures.filter(structure => structure !== availability.structure)
  bumpStateVersions(state, 'structures')

  return availability.structure
}

const getUnknownCityCountForRadius = (state, city, knowledgeRadiusKm) => state.cities.filter(otherCity => (
  otherCity.id !== city.id && state.distanceMatrix[city.id][otherCity.id] > knowledgeRadiusKm
)).length

const getUnknownCityCount = (state, city) => getUnknownCityCountForRadius(state, city, city.knowledgeRadiusKm)

const getHiddenCityCountForRadius = (state, city, knowledgeRadiusKm) => (
  state.cities.length - getVisibleCityCountForKnowledgeRadius(state, city, knowledgeRadiusKm)
)

const getHiddenCityCount = (state, city) => getHiddenCityCountForRadius(state, city, city.knowledgeRadiusKm)

const getExplorationCumulativeGainKm = explorationLevel => (
  explorationLevel <= 0
    ? 0
    : explorationLevel * explorationGainBaseKm + (explorationLevel * (explorationLevel - 1) * explorationGainStepKm) / 2
)

const getExplorationStartingKnowledgeRadiusKm = city => Math.max(
  0,
  city.knowledgeRadiusKm - getExplorationCumulativeGainKm(city.explorationLevel)
)

const getExplorationStandardGainKm = explorationLevel => Math.round(
  explorationGainBaseKm + explorationLevel * explorationGainStepKm
)

const getFullMapRevealRadiusKmForCity = (state, city) => {
  const longitudeScale = Math.max(
    kmPerLatitudeDegree * Math.cos((city.latitude * Math.PI) / 180),
    0.01
  )
  const corners = [
    [state.bounds.minLat, state.bounds.minLon],
    [state.bounds.minLat, state.bounds.maxLon],
    [state.bounds.maxLat, state.bounds.minLon],
    [state.bounds.maxLat, state.bounds.maxLon]
  ]

  return Math.ceil(Math.max(...corners.map(([latitude, longitude]) => Math.hypot(
    (longitude - city.longitude) * longitudeScale,
    (latitude - city.latitude) * kmPerLatitudeDegree
  ))) + 24)
}

const isFullMapRevealedForCity = (state, city, knowledgeRadiusKm = city.knowledgeRadiusKm) => (
  knowledgeRadiusKm >= getFullMapRevealRadiusKmForCity(state, city) - 0.5
)

const getExplorationLevelTargetForFinalCityReveal = (state, city) => {
  let projectedKnowledgeRadiusKm = getExplorationStartingKnowledgeRadiusKm(city)
  let projectedExplorationLevel = 0

  while (projectedExplorationLevel < 200) {
    const unknownCityCount = getUnknownCityCountForRadius(state, city, projectedKnowledgeRadiusKm)

    if (unknownCityCount === 0) {
      break
    }

    projectedKnowledgeRadiusKm += getExplorationStandardGainKm(projectedExplorationLevel)
    projectedExplorationLevel += 1
  }

  return projectedExplorationLevel
}

const getExplorationCostForCity = (state, city) => {
  if (city.explorationLevel < explorationOpeningCosts.length) {
    return Math.min(
      explorationCostMaximum * explorationCostMultiplier,
      explorationOpeningCosts[city.explorationLevel] * explorationCostMultiplier
    )
  }

  const levelTarget = getExplorationLevelTargetForFinalCityReveal(state, city)
  const openingCost = explorationOpeningCosts[explorationOpeningCosts.length - 1] * explorationCostMultiplier
  const finalCost = explorationCostMaximum * explorationCostMultiplier
  const exponentialStepCount = Math.max(1, levelTarget - explorationOpeningCosts.length)
  const progress = clamp((city.explorationLevel - explorationOpeningCosts.length + 1) / exponentialStepCount, 0, 1)
  const scaledCost = openingCost * Math.pow(finalCost / openingCost, progress)

  return Math.min(
    finalCost,
    Math.round(scaledCost / 50) * 50
  )
}

const getExplorationGainKmForCity = (state, city) => getExplorationStandardGainKm(city.explorationLevel)

const getExplorationTravelDistanceKmForCity = (state, city) => {
  const projectedRadiusKm = city.knowledgeRadiusKm + getExplorationGainKmForCity(state, city)
  const circumferenceKm = projectedRadiusKm * Math.PI * 2

  return projectedRadiusKm * 2 + circumferenceKm
}

const getExplorationDurationDaysForCity = (state, city) => {
  const baseDurationDays = Math.max(
    1,
    Math.round((getExplorationTravelDistanceKmForCity(state, city) / explorerTravelKmPerWeek) * daysPerWeek)
  )

  const currentDurationDays = city.explorationLevel < 3
    ? baseDurationDays
    : Math.max(1, Math.round(baseDurationDays / 2))

  return Math.max(1, Math.round(currentDurationDays * explorationDurationScale))
}

const fundCityExploration = (state, city) => {
  const cost = getExplorationCostForCity(state, city)

  if (city.treasury < cost) {
    return null
  }

  const gainKm = getExplorationGainKmForCity(state, city)

  city.treasury -= cost
  city.explorationLevel += 1
  city.knowledgeRadiusKm += gainKm

  return {
    cost,
    gainKm,
    treasury: city.treasury,
    knowledgeRadiusKm: city.knowledgeRadiusKm,
    fullMapRevealed: isFullMapRevealedForCity(state, city)
  }
}

export const getExplorationCost = (state, cityId) => {
  const city = getCityById(state, cityId)

  return city ? getExplorationCostForCity(state, city) : explorationCostBase * explorationCostMultiplier
}

export const getExplorationGainKm = (state, cityId) => {
  const city = getCityById(state, cityId)

  return city ? getExplorationGainKmForCity(state, city) : explorationGainBaseKm
}

export const getExplorationDurationDays = (state, cityId) => {
  const city = getCityById(state, cityId)

  return city ? getExplorationDurationDaysForCity(state, city) : daysPerWeek
}

const getPotentialNewKnownCities = (state, city) => {
  const currentKnownCount = getKnownCityIds(state, city.id).length
  const projectedRadiusKm = city.knowledgeRadiusKm + getExplorationGainKmForCity(state, city)
  const projectedKnownCount = getVisibleCityIdsForKnowledgeRadius(state, city, projectedRadiusKm).length

  return Math.max(0, projectedKnownCount - currentKnownCount)
}

const getPotentialNewVisibleCities = (state, city) => {
  const currentVisibleCityCount = getVisibleCityCountForKnowledgeRadius(state, city, city.knowledgeRadiusKm)
  const projectedVisibleCityCount = getVisibleCityCountForKnowledgeRadius(
    state,
    city,
    city.knowledgeRadiusKm + getExplorationGainKmForCity(state, city)
  )

  return Math.max(0, projectedVisibleCityCount - currentVisibleCityCount)
}

export const getExplorationAvailability = (state, cityId) => {
  const city = getCityById(state, cityId)

  if (!city) {
    return {
      canExplore: false,
      reason: 'missing'
    }
  }

  const hiddenCityCount = getHiddenCityCount(state, city)
  const unknownCityCount = getUnknownCityCount(state, city)
  const potentialDiscoveries = getPotentialNewKnownCities(state, city)
  const potentialReveals = getPotentialNewVisibleCities(state, city)
  const fullMapRevealed = isFullMapRevealedForCity(state, city)

  if (unknownCityCount === 0) {
    return {
      canExplore: false,
      reason: 'exhausted',
      hiddenCityCount,
      unknownCityCount,
      potentialDiscoveries,
      potentialReveals,
      fullMapRevealed
    }
  }

  if (city.treasury < getExplorationCostForCity(state, city)) {
    return {
      canExplore: false,
      reason: 'unaffordable',
      hiddenCityCount,
      unknownCityCount,
      potentialDiscoveries,
      potentialReveals,
      fullMapRevealed
    }
  }

  return {
    canExplore: true,
    reason: 'available',
    hiddenCityCount,
    unknownCityCount,
    potentialDiscoveries,
    potentialReveals,
    fullMapRevealed
  }
}

const maybeRunAiExploration = (state, city, chanceScale = 1) => {
  const explorationAvailability = getExplorationAvailability(state, city.id)

  if (!explorationAvailability.canExplore) {
    return false
  }

  if (city.treasury < getExplorationCostForCity(state, city)) {
    return false
  }

  const potentialDiscoveries = explorationAvailability.potentialDiscoveries
  const treasuryPressure = normalizeRange(city.treasury, 250000, 1800000)
  const baseChance = clamp(0.22 + potentialDiscoveries * 0.18 + treasuryPressure * 0.3 - city.explorationLevel * 0.04, 0.12, 0.92)
  const chance = clamp(baseChance * chanceScale, 0.02, 0.92)

  if (Math.random() > chance) {
    return false
  }

  return Boolean(fundCityExploration(state, city))
}

const maybeAcceptAiTradeRouteOffers = (state, city) => {
  const acceptedTradeRouteBuilds = []

  getIncomingTradeRouteOffers(state, city.id).forEach(offer => {
    if (city.treasury < offer.recipientShare) {
      return
    }

    const result = acceptTradeRouteOffer(state, offer.fromCityId, city.id)

    if (result?.tradeRouteBuild) {
      acceptedTradeRouteBuilds.push(result.tradeRouteBuild)
    }
  })

  return acceptedTradeRouteBuilds
}

const getAiTradeRouteCandidateIds = (state, city) => {
  const playerCity = getPlayerCity(state)
  const playerKnownCityIds = playerCity ? new Set(getKnownCityIds(state, playerCity.id)) : null

  return getKnownCityIds(state, city.id).filter(targetCityId => {
    if (getTradeRouteBetweenCities(state, city.id, targetCityId) || getTradeRouteOfferBetweenCities(state, city.id, targetCityId)) {
      return false
    }

    if (targetCityId !== state.playerCityId) {
      return true
    }

    return Boolean(playerCity && playerKnownCityIds?.has(city.id))
  })
}

const maybeCreateAiTradeRouteOffer = (state, city) => {
  const candidates = getAiTradeRouteCandidateIds(state, city).map(targetCityId => {
    const distanceKm = getTradeRouteDistanceKmBetweenCities(state, city.id, targetCityId)
    const { requesterShare } = getTradeRouteSplitShares(state, city.id, targetCityId)
    const dailyIncome = getTradeRouteDailyIncome(state, city.id, targetCityId)
    const proximity = clamp(1 - distanceKm / 4200, 0, 1)
    const incomeAppeal = normalizeRange(dailyIncome, 1, 5)
    const splitTreasuryPressure = normalizeRange(city.treasury, requesterShare, requesterShare * 8)
    const splitChance = city.treasury >= requesterShare
      ? clamp(0.002 + splitTreasuryPressure * 0.011 + proximity * 0.008 + incomeAppeal * 0.006, 0.002, 0.03)
      : 0

    return {
      targetCityId,
      chance: splitChance,
      score: proximity * 0.52 + incomeAppeal * 0.28 + splitTreasuryPressure * 0.2
    }
  }).filter(candidate => candidate.chance > 0)

  if (!candidates.length) {
    return false
  }

  const bestCandidate = candidates.sort((firstCandidate, secondCandidate) => (
    secondCandidate.score - firstCandidate.score
  ))[0]

  if (Math.random() > bestCandidate.chance) {
    return false
  }

  return Boolean(offerTradeRouteSplit(state, city.id, bestCandidate.targetCityId))
}

export const advanceSimulationDay = state => {
  const expiredTradeRouteOffers = []
  const acceptedTradeRouteBuilds = []
  let exhaustedLumberCamps = []

  state.dayOfWeek = (state.dayOfWeek ?? 0) + 1

  if (state.dayOfWeek >= 7) {
    state.week += 1
    state.dayOfWeek = 0
    exhaustedLumberCamps = advanceWeeklyTerrainEffects(state).exhaustedLumberCamps
    advanceWeeklyPopulation(state)
  }

  expiredTradeRouteOffers.push(...expireStaleTradeRouteOffers(state))

  state.cities.forEach(city => {
    city.treasury += getOwnedStructures(state, city.id).reduce((income, structure) => (
      income + getStructureDailyIncome(structure.type)
    ), 0)
    city.treasury += getTradeRoutesForCity(state, city.id).reduce((income, tradeRoute) => (
      income + getTradeRouteDailyIncome(state, tradeRoute.cityAId, tradeRoute.cityBId)
    ), 0)

    if (city.id === state.playerCityId) {
      return
    }

    maybeRunAiExploration(state, city, 1 / 7)
    acceptedTradeRouteBuilds.push(...maybeAcceptAiTradeRouteOffers(state, city))
    maybeCreateAiTradeRouteOffer(state, city)
  })

  bumpStateVersions(state, 'cities')

  return {
    expiredTradeRouteOffers,
    acceptedTradeRouteBuilds,
    exhaustedLumberCamps
  }
}

export const performExplorationTurn = state => {
  const playerCity = getPlayerCity(state)

  if (!playerCity) {
    return null
  }

  const explorationAvailability = getExplorationAvailability(state, playerCity.id)

  if (!explorationAvailability.canExplore) {
    return null
  }

  const beforeTreasury = playerCity.treasury
  const result = fundCityExploration(state, playerCity)

  if (!result) {
    return null
  }

  state.week += 1
  const { exhaustedLumberCamps = [] } = advanceWeeklyTerrainEffects(state)
  advanceWeeklyPopulation(state)

  state.cities.forEach(city => {
    if (city.id === playerCity.id) {
      return
    }

    maybeRunAiExploration(state, city)
  })

  bumpStateVersions(state, 'cities')

  return {
    beforeTreasury,
    afterTreasury: playerCity.treasury,
    result,
    exhaustedLumberCamps
  }
}

export const getOfferedStartingCities = state => state.startingOptionIds
  .map(cityId => getCityById(state, cityId))
  .filter(Boolean)

export const getPlayerKnownCityCount = state => {
  const playerCity = getPlayerCity(state)

  if (!playerCity) {
    return 0
  }

  return getKnownCityIds(state, playerCity.id).length
}

export const getTargetZoom = state => {
  const playerCity = getPlayerCity(state)

  if (!playerCity) {
    return 1
  }

  return getTargetZoomForKnowledgeRadius(state, playerCity.knowledgeRadiusKm)
}

export const getFocusPoint = state => {
  const playerCity = getPlayerCity(state)

  if (!playerCity) {
    return worldCenterPoint
  }

  return getFocusPointForKnowledgeRadius(state, playerCity, playerCity.knowledgeRadiusKm)
}

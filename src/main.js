import { createFlagRenderer, getFlagKeyColorRecipe, getKeyColorRgbForRecipe } from './core/flag-generator.js'
import { clearLocalSave, loadFromLocalStorage, saveToLocalStorage } from './core/save.js'
import {
  acceptTradeRouteOffer,
  advanceSimulationDay,
  buildTradeRoute,
  bumpStateVersions,
  chemicalFertilizerResearchCost,
  chemicalFertilizerResearchDurationMs,
  chemistryResearchCost,
  chemistryResearchDurationMs,
  choosePlayerCity,
  completeTradeRouteBuild,
  createNewGameState,
  demolishStructure,
  declineTradeRouteOffer,
  engineeringResearchCost,
  engineeringResearchDurationMs,
  fertilizerResearchCost,
  fertilizerResearchDurationMs,
  farmingResearchCost,
  farmingResearchDurationMs,
  getBuildRangeCandidateTiles,
  getChemicalFertilizerResearchAvailability,
  getCityById,
  getCityWeeklyIncomeSummary,
  getChemistryResearchAvailability,
  getExplorationAvailability,
  getExplorationCost,
  getExplorationDurationDays,
  getExplorationGainKm,
  getEngineeringResearchAvailability,
  getFertilizerResearchAvailability,
  getFarmingResearchAvailability,
  getMineShaftsResearchAvailability,
  getMiningResearchAvailability,
  getLumberingResearchAvailability,
  getKnownCities,
  getOfferedStartingCities,
  getPlayerCity,
  getPlayerKnownCityCount,
  getStructureDemolitionAvailability,
  getStructureBuildLimit,
  getStructureCount,
  getStructureCost,
  getStructureNetwork,
  getStructurePlacementAvailability,
  getStructureUpgradeAvailability,
  getStructureUpgradeCost,
  getStructureUpgradeTargetTypes,
  getStateVersion,
  getTradeRouteBetweenCities,
  getTradeRouteCost,
  getTradeRouteDailyIncome,
  getTradeRouteOfferBetweenCities,
  getTradeRouteSplitShares,
  getStructuresForCity,
  hasTechnology,
  lumberingResearchCost,
  lumberingResearchDurationMs,
  mineShaftsResearchCost,
  mineShaftsResearchDurationMs,
  miningResearchCost,
  miningResearchDurationMs,
  offerTradeRouteSplit,
  placeStructure,
  structureBuildDurationMsByType,
  upgradeStructure,
  hydrateGameState,
  setActiveTab,
  structureTypeIds,
  technologyIds
} from './core/world.js'
import { MapRenderer } from './rendering/map-renderer.js'
import { AppUI } from './ui/app-ui.js'
import { getTerrainTile, isTileWithinBuildableTerrain } from './core/terrain.js'
import { formatCurrency } from './core/utils.js'

const canvas = document.getElementById('map')
const closeNeighborDistanceKm = 800
const dayDurationMs = 1000
const weekPassDurationMs = dayDurationMs * 7
const monthPassDurationMs = dayDurationMs * 31
const monthPassUnlockDay = 40
const perfHudStorageKey = 'cityscape-perf-hud'
const cameraDragClickThresholdPx = 6
const aiDerelictSoftLimit = 4
const aiDerelictCleanupChance = 0.32
const displayMoneyMinimumTickRate = 18
const displayMoneyMaximumTickRate = 240000
const displayMoneyAccelerationFloor = 160
const treasuryAlertDurationMs = 1600

const getStructureLabel = structureType => {
  if (structureType === structureTypeIds.derelict) {
    return 'derelict'
  }

  if (structureType === structureTypeIds.farm) {
    return 'farm'
  }

  if (structureType === structureTypeIds.mine) {
    return 'mine'
  }

  if (structureType === structureTypeIds.lumberCamp) {
    return 'lumber camp'
  }

  return 'forager camp'
}

const getCssRgbColor = rgb => `rgb(${rgb.join(', ')})`

const getStructureActionLabel = structureType => {
  if (structureType === structureTypeIds.derelict) {
    return 'Derelict'
  }

  if (structureType === structureTypeIds.farm) {
    return 'Farm'
  }

  if (structureType === structureTypeIds.mine) {
    return 'Mine'
  }

  if (structureType === structureTypeIds.lumberCamp) {
    return 'Lumber Camp'
  }

  return 'Forager Camp'
}

const getStructureUpgradeFailureMessage = (targetStructureType, reason, structureLimit = null) => {
  if (reason === 'locked') {
    if (targetStructureType === structureTypeIds.farm) {
      return 'Research farming before upgrading into a farm.'
    }

    if (targetStructureType === structureTypeIds.mine) {
      return 'Research mining before upgrading into a mine.'
    }

    if (targetStructureType === structureTypeIds.lumberCamp) {
      return 'Research logging before upgrading into a lumber camp.'
    }
  }

  if (reason === 'limit') {
    return `Your city only needs ${structureLimit ?? 0} ${getStructureLabel(targetStructureType)}${(structureLimit ?? 0) === 1 ? '' : 's'}.`
  }

  if (reason === 'terrain') {
    if (targetStructureType === structureTypeIds.farm) {
      return 'That structure can only upgrade into a farm on grassland.'
    }

    if (targetStructureType === structureTypeIds.mine) {
      return 'That structure can only upgrade into a mine on a mountain tile.'
    }

    if (targetStructureType === structureTypeIds.lumberCamp) {
      return 'That structure can only upgrade into a lumber camp on a forest tile.'
    }

    return 'That structure cannot upgrade into a forager camp on this tile.'
  }

  if (reason === 'unaffordable') {
    return `Your treasury cannot support that upgrade into a ${getStructureLabel(targetStructureType)} yet.`
  }

  return 'That upgrade is not available right now.'
}

const getPlacementFailureMessage = (structureType, reason, structureLimit = null) => {
  if (reason === 'occupied') {
    return 'That tile is already occupied.'
  }

  if (reason === 'terrain') {
    if (structureType === structureTypeIds.farm) {
      return 'Farms can only be placed on grassland.'
    }

    if (structureType === structureTypeIds.mine) {
      return 'Mines can only be placed on mountain tiles.'
    }

    if (structureType === structureTypeIds.lumberCamp) {
      return 'Lumber camps can only be placed on forest tiles.'
    }

    return 'Forager camps cannot be placed on forest or mountain tiles.'
  }

  if (reason === 'city') {
    return 'You cannot build in the four tiles surrounding another city.'
  }

  if (reason === 'range') {
    return 'That tile is outside the reach of your city network.'
  }

  if (reason === 'knowledge') {
    return 'That tile lies beyond your circle of knowledge.'
  }

  if (reason === 'limit') {
    if (structureType === structureTypeIds.farm) {
      return `Your city only needs ${structureLimit ?? 2} farms.`
    }

    if (structureType === structureTypeIds.mine) {
      return `Your city only needs ${structureLimit ?? 2} mines.`
    }

    if (structureType === structureTypeIds.lumberCamp) {
      return `Your city only needs ${structureLimit ?? 2} lumber camps.`
    }

    return 'Your city only needs three forager camps.'
  }

  if (reason === 'locked') {
    if (structureType === structureTypeIds.farm) {
      return 'Research farming before placing farms.'
    }

    if (structureType === structureTypeIds.mine) {
      return 'Research mining before placing mines.'
    }

    if (structureType === structureTypeIds.lumberCamp) {
      return 'Research logging before placing lumber camps.'
    }

    return 'Required research is still missing.'
  }

  return 'That tile cannot host a new structure.'
}

const getDemolitionFailureMessage = reason => {
  if (reason === 'empty') {
    return 'There is nothing there to demolish.'
  }

  if (reason === 'foreign') {
    return 'You can only demolish structures built by your own city.'
  }

  return 'That structure cannot be demolished.'
}

const getStructureAffordabilityMessage = (structureType, treasury, cost) => {
  const shortfall = Math.max(0, cost - treasury)

  return `You cannot start that ${getStructureLabel(structureType)} yet. Cost ${formatCurrency(cost)}; treasury ${formatCurrency(treasury)}; need ${formatCurrency(shortfall)} more.`
}

const getTradeRouteAffordabilityMessage = (cityName, treasury, cost, { split = false } = {}) => {
  const shortfall = Math.max(0, cost - treasury)
  const routeLabel = split ? 'cost-sharing request' : 'trade route'

  return `You cannot fund that ${routeLabel} to ${cityName} yet. Cost ${formatCurrency(cost)}; treasury ${formatCurrency(treasury)}; need ${formatCurrency(shortfall)} more.`
}

const getTradeRouteBuildDurationMs = durationDays => Math.max(dayDurationMs, durationDays * dayDurationMs)

const getTradeRouteTaskPairKey = (firstCityId, secondCityId) => (
  firstCityId <= secondCityId
    ? `${firstCityId}:${secondCityId}`
    : `${secondCityId}:${firstCityId}`
)

const createCalendarAdvanceTask = (ownerCityId, duration, durationDays, taskLabel) => ({
  ownerCityId,
  startedAt: performance.now(),
  duration,
  durationDays,
  taskLabel,
  paidUpFront: true
})

const buildProgressState = task => ({
  ...task,
  inProgress: true,
  elapsedMs: Math.min(task.duration, Math.max(0, performance.now() - task.startedAt)),
  durationMs: task.duration
})

const restoreRuntimeTasks = queuedTasks => (queuedTasks ?? []).map(queuedTask => ({
  ...queuedTask,
  startedAt: performance.now()
}))

const getTaskForCity = (tasks, cityId) => tasks.find(task => task.ownerCityId === cityId) ?? null

const formatLatitudeLabel = latitude => `${Math.abs(latitude).toFixed(1)}${latitude >= 0 ? 'N' : 'S'}`

const formatLongitudeLabel = longitude => `${Math.abs(longitude).toFixed(1)}${longitude >= 0 ? 'E' : 'W'}`

const getTaskLocationLatLongLabel = (state, columnIndex, rowIndex) => {
  const longitudeSpan = state.bounds.maxLon - state.bounds.minLon || 1
  const latitudeSpan = state.bounds.maxLat - state.bounds.minLat || 1
  const terrainColumns = Math.max(1, state.terrain?.columns ?? 1)
  const terrainRows = Math.max(1, state.terrain?.rows ?? 1)
  const longitude = state.bounds.minLon + ((columnIndex + 0.5) / terrainColumns) * longitudeSpan
  const latitude = state.bounds.maxLat - ((rowIndex + 0.5) / terrainRows) * latitudeSpan

  return `${formatLatitudeLabel(latitude)}, ${formatLongitudeLabel(longitude)}`
}

const getResearchTaskLabel = researchId => {
  if (researchId === technologyIds.farming) {
    return 'researching farming'
  }

  if (researchId === technologyIds.fertilizer) {
    return 'researching fertilizer'
  }

  if (researchId === technologyIds.chemistry) {
    return 'researching chemistry'
  }

  if (researchId === technologyIds.chemicalFertilizer) {
    return 'researching chemical fertilizer'
  }

  if (researchId === technologyIds.engineering) {
    return 'researching engineering'
  }

  if (researchId === technologyIds.mining) {
    return 'researching mining'
  }

  if (researchId === technologyIds.mineShafts) {
    return 'researching mine shafts'
  }

  if (researchId === technologyIds.lumbering) {
    return 'researching logging'
  }

  return 'researching'
}

const buildOfferedCitiesForUi = state => getOfferedStartingCities(state).map(city => ({
  ...city,
  closeNeighborCount: Object.values(state.distanceMatrix[city.id]).filter(distanceKm => (
    distanceKm > 0 && distanceKm < closeNeighborDistanceKm
  )).length
}))

const buildInitialState = () => {
  try {
    const savedPayload = loadFromLocalStorage()

    if (savedPayload) {
      return hydrateGameState(savedPayload)
    }
  } catch (error) {
    console.warn(error)
    clearLocalSave()
  }

  const freshState = createNewGameState()
  saveToLocalStorage(freshState)
  return freshState
}

const init = async () => {
  let ui = null
  const triggerTreasuryAlert = alertKey => {
    ui?.triggerTreasuryAlert(treasuryAlertDurationMs, alertKey)
  }

  ui = new AppUI({
    documentRoot: document,
    callbacks: {
      onCancelNewWorldConfirmation: () => {
        if (!state.confirmingNewWorld) {
          return
        }

        state.confirmingNewWorld = false
        uiDirty = true
      },
      onChooseCity: cityId => {
        state.confirmingNewWorld = false
        choosePlayerCity(state, cityId)
        setSelectedStructure(null)
        displayMoney = getPlayerCity(state)?.treasury ?? 0
        displayMoneyState = null
        placementMode = null
        setExplorationTasks([])
        setFarmingResearchTasks([])
        setFertilizerResearchTasks([])
        setChemistryResearchTasks([])
        setChemicalFertilizerResearchTasks([])
        setEngineeringResearchTasks([])
        setMiningResearchTasks([])
        setMineShaftsResearchTasks([])
        setLumberingResearchTasks([])
        setTradeRouteBuildTasks([])
        setStructureBuildTasks([])
        setWeekPassTasks([])
        dayAccumulatorMs = 0
        syncPendingTasksState()
        statusMessage = `${getPlayerCity(state)?.name}`
        persist()
        uiDirty = true
      },
      onSetTab: tabId => {
        state.confirmingNewWorld = false
        setActiveTab(state, tabId)
        setSelectedStructure(null)
        if (tabId !== 'buy') {
          placementMode = null
        }

        persist()
        uiDirty = true
      },
      onExplore: () => {
        state.confirmingNewWorld = false
        const playerCity = getPlayerCity(state)

        if (!playerCity || getTaskForCity(explorationTasks, playerCity.id)) {
          return
        }

        const explorationAvailability = playerCity
          ? getExplorationAvailabilityForUi(playerCity)
          : { canExplore: false, reason: 'missing' }

        if (!explorationAvailability.canExplore) {
          statusMessage = explorationAvailability.reason === 'exhausted'
            ? 'Every city-state on the continental plate is now known.'
            : 'Your treasury cannot support a new expedition yet.'
          if (explorationAvailability.reason === 'unaffordable') {
            triggerTreasuryAlert('explore')
          }
          uiDirty = true
          return
        }

        const startedAt = performance.now()
        const explorationCost = getExplorationCost(state, playerCity.id)
        const explorationDurationDays = getExplorationDurationDays(state, playerCity.id)
        playerCity.treasury -= explorationCost
        bumpStateVersions(state, 'cities')
        startDisplayMoneyCatchup(startedAt)

        setExplorationTasks([...explorationTasks, {
          ownerCityId: playerCity.id,
          startedAt,
          duration: explorationDurationDays * dayDurationMs,
          cost: explorationCost,
          gainKm: getExplorationGainKm(state, playerCity.id),
          paidUpFront: true
        }])
        syncPendingTasksState()
        persist()
        statusMessage = 'Scouts ride out across the plain.'
        uiDirty = true
      },
      onResearchFarming: () => {
        state.confirmingNewWorld = false
        const playerCity = getPlayerCity(state)

        if (!playerCity || getTaskForCity(farmingResearchTasks, playerCity.id)) {
          return
        }

        const farmingAvailability = playerCity
          ? getFarmingResearchAvailabilityForUi(playerCity)
          : { canResearch: false, reason: 'missing' }

        if (!farmingAvailability.canResearch) {
          statusMessage = farmingAvailability.reason === 'researched'
            ? 'Farming is already known.'
            : 'Your treasury cannot support farming research yet.'
          if (farmingAvailability.reason === 'unaffordable') {
            triggerTreasuryAlert('research-farming')
          }
          uiDirty = true
          return
        }

        const startedAt = performance.now()
        playerCity.treasury -= farmingResearchCost
        bumpStateVersions(state, 'cities')
        startDisplayMoneyCatchup(startedAt)

        setFarmingResearchTasks([...farmingResearchTasks, {
          ownerCityId: playerCity.id,
          startedAt,
          duration: farmingResearchDurationMs,
          cost: farmingResearchCost,
          paidUpFront: true
        }])
        syncPendingTasksState()
        persist()
        statusMessage = 'Farming scholars set to work.'
        uiDirty = true
      },
      onResearchFertilizer: () => {
        state.confirmingNewWorld = false
        const playerCity = getPlayerCity(state)

        if (!playerCity || getTaskForCity(fertilizerResearchTasks, playerCity.id)) {
          return
        }

        const fertilizerAvailability = playerCity
          ? getFertilizerResearchAvailabilityForUi(playerCity)
          : { canResearch: false, reason: 'missing' }

        if (!fertilizerAvailability.canResearch) {
          statusMessage = fertilizerAvailability.reason === 'researched'
            ? 'Fertilizer is already understood.'
            : fertilizerAvailability.reason === 'locked'
              ? 'Research farming before studying fertilizer.'
              : 'Your treasury cannot support fertilizer research yet.'
          if (fertilizerAvailability.reason === 'unaffordable') {
            triggerTreasuryAlert('research-fertilizer')
          }
          uiDirty = true
          return
        }

        const startedAt = performance.now()
        playerCity.treasury -= fertilizerResearchCost
        bumpStateVersions(state, 'cities')
        startDisplayMoneyCatchup(startedAt)

        setFertilizerResearchTasks([...fertilizerResearchTasks, {
          ownerCityId: playerCity.id,
          startedAt,
          duration: fertilizerResearchDurationMs,
          cost: fertilizerResearchCost,
          paidUpFront: true
        }])
        syncPendingTasksState()
        persist()
        statusMessage = 'Fertilizer experiments begin.'
        uiDirty = true
      },
      onResearchChemistry: () => {
        state.confirmingNewWorld = false
        const playerCity = getPlayerCity(state)

        if (!playerCity || getTaskForCity(chemistryResearchTasks, playerCity.id)) {
          return
        }

        const chemistryAvailability = playerCity
          ? getChemistryResearchAvailabilityForUi(playerCity)
          : { canResearch: false, reason: 'missing' }

        if (!chemistryAvailability.canResearch) {
          statusMessage = chemistryAvailability.reason === 'researched'
            ? 'Chemistry is already known.'
            : 'Your treasury cannot support chemistry research yet.'
          if (chemistryAvailability.reason === 'unaffordable') {
            triggerTreasuryAlert('research-chemistry')
          }
          uiDirty = true
          return
        }

        const startedAt = performance.now()
        playerCity.treasury -= chemistryResearchCost
        bumpStateVersions(state, 'cities')
        startDisplayMoneyCatchup(startedAt)

        setChemistryResearchTasks([...chemistryResearchTasks, {
          ownerCityId: playerCity.id,
          startedAt,
          duration: chemistryResearchDurationMs,
          cost: chemistryResearchCost,
          paidUpFront: true
        }])
        syncPendingTasksState()
        persist()
        statusMessage = 'Chemists begin testing new compounds.'
        uiDirty = true
      },
      onResearchChemicalFertilizer: () => {
        state.confirmingNewWorld = false
        const playerCity = getPlayerCity(state)

        if (!playerCity || getTaskForCity(chemicalFertilizerResearchTasks, playerCity.id)) {
          return
        }

        const chemicalFertilizerAvailability = playerCity
          ? getChemicalFertilizerResearchAvailabilityForUi(playerCity)
          : { canResearch: false, reason: 'missing' }

        if (!chemicalFertilizerAvailability.canResearch) {
          statusMessage = chemicalFertilizerAvailability.reason === 'researched'
            ? 'Chemical fertilizer is already understood.'
            : chemicalFertilizerAvailability.reason === 'locked'
              ? 'Research chemistry before studying chemical fertilizer.'
              : 'Your treasury cannot support chemical fertilizer research yet.'
          if (chemicalFertilizerAvailability.reason === 'unaffordable') {
            triggerTreasuryAlert('research-chemical-fertilizer')
          }
          uiDirty = true
          return
        }

        const startedAt = performance.now()
        playerCity.treasury -= chemicalFertilizerResearchCost
        bumpStateVersions(state, 'cities')
        startDisplayMoneyCatchup(startedAt)

        setChemicalFertilizerResearchTasks([...chemicalFertilizerResearchTasks, {
          ownerCityId: playerCity.id,
          startedAt,
          duration: chemicalFertilizerResearchDurationMs,
          cost: chemicalFertilizerResearchCost,
          paidUpFront: true
        }])
        syncPendingTasksState()
        persist()
        statusMessage = 'Chemical fertilizer trials begin.'
        uiDirty = true
      },
      onResearchEngineering: () => {
        state.confirmingNewWorld = false
        const playerCity = getPlayerCity(state)

        if (!playerCity || getTaskForCity(engineeringResearchTasks, playerCity.id)) {
          return
        }

        const engineeringAvailability = playerCity
          ? getEngineeringResearchAvailabilityForUi(playerCity)
          : { canResearch: false, reason: 'missing' }

        if (!engineeringAvailability.canResearch) {
          statusMessage = engineeringAvailability.reason === 'researched'
            ? 'Engineering is already known.'
            : 'Your treasury cannot support engineering research yet.'
          if (engineeringAvailability.reason === 'unaffordable') {
            triggerTreasuryAlert('research-engineering')
          }
          uiDirty = true
          return
        }

        const startedAt = performance.now()
        playerCity.treasury -= engineeringResearchCost
        bumpStateVersions(state, 'cities')
        startDisplayMoneyCatchup(startedAt)

        setEngineeringResearchTasks([...engineeringResearchTasks, {
          ownerCityId: playerCity.id,
          startedAt,
          duration: engineeringResearchDurationMs,
          cost: engineeringResearchCost,
          paidUpFront: true
        }])
        syncPendingTasksState()
        persist()
        statusMessage = 'Engineers begin drafting stronger, cheaper works.'
        uiDirty = true
      },
      onResearchMining: () => {
        state.confirmingNewWorld = false
        const playerCity = getPlayerCity(state)

        if (!playerCity || getTaskForCity(miningResearchTasks, playerCity.id)) {
          return
        }

        const miningAvailability = playerCity
          ? getMiningResearchAvailabilityForUi(playerCity)
          : { canResearch: false, reason: 'missing' }

        if (!miningAvailability.canResearch) {
          statusMessage = miningAvailability.reason === 'researched'
            ? 'Mining is already known.'
            : 'Your treasury cannot support mining research yet.'
          if (miningAvailability.reason === 'unaffordable') {
            triggerTreasuryAlert('research-mining')
          }
          uiDirty = true
          return
        }

        const startedAt = performance.now()
        playerCity.treasury -= miningResearchCost
        bumpStateVersions(state, 'cities')
        startDisplayMoneyCatchup(startedAt)

        setMiningResearchTasks([...miningResearchTasks, {
          ownerCityId: playerCity.id,
          startedAt,
          duration: miningResearchDurationMs,
          cost: miningResearchCost,
          paidUpFront: true
        }])
        syncPendingTasksState()
        persist()
        statusMessage = 'Mining engineers set to work.'
        uiDirty = true
      },
      onResearchMineShafts: () => {
        state.confirmingNewWorld = false
        const playerCity = getPlayerCity(state)

        if (!playerCity || getTaskForCity(mineShaftsResearchTasks, playerCity.id)) {
          return
        }

        const mineShaftsAvailability = playerCity
          ? getMineShaftsResearchAvailabilityForUi(playerCity)
          : { canResearch: false, reason: 'missing' }

        if (!mineShaftsAvailability.canResearch) {
          statusMessage = mineShaftsAvailability.reason === 'researched'
            ? 'Mine shafts are already understood.'
            : mineShaftsAvailability.reason === 'locked'
              ? 'Research mining before studying mine shafts.'
              : 'Your treasury cannot support mine shaft research yet.'
          if (mineShaftsAvailability.reason === 'unaffordable') {
            triggerTreasuryAlert('research-mine-shafts')
          }
          uiDirty = true
          return
        }

        const startedAt = performance.now()
        playerCity.treasury -= mineShaftsResearchCost
        bumpStateVersions(state, 'cities')
        startDisplayMoneyCatchup(startedAt)

        setMineShaftsResearchTasks([...mineShaftsResearchTasks, {
          ownerCityId: playerCity.id,
          startedAt,
          duration: mineShaftsResearchDurationMs,
          cost: mineShaftsResearchCost,
          paidUpFront: true
        }])
        syncPendingTasksState()
        persist()
        statusMessage = 'Mine shaft plans are drafted.'
        uiDirty = true
      },
      onResearchLumbering: () => {
        state.confirmingNewWorld = false
        const playerCity = getPlayerCity(state)

        if (!playerCity || getTaskForCity(lumberingResearchTasks, playerCity.id)) {
          return
        }

        const lumberingAvailability = playerCity
          ? getLumberingResearchAvailabilityForUi(playerCity)
          : { canResearch: false, reason: 'missing' }

        if (!lumberingAvailability.canResearch) {
          statusMessage = lumberingAvailability.reason === 'researched'
            ? 'Logging is already known.'
            : 'Your treasury cannot support logging research yet.'
          if (lumberingAvailability.reason === 'unaffordable') {
            triggerTreasuryAlert('research-lumbering')
          }
          uiDirty = true
          return
        }

        const startedAt = performance.now()
        playerCity.treasury -= lumberingResearchCost
        bumpStateVersions(state, 'cities')
        startDisplayMoneyCatchup(startedAt)

        setLumberingResearchTasks([...lumberingResearchTasks, {
          ownerCityId: playerCity.id,
          startedAt,
          duration: lumberingResearchDurationMs,
          cost: lumberingResearchCost,
          paidUpFront: true
        }])
        syncPendingTasksState()
        persist()
        statusMessage = 'Logging foresters set to work.'
        uiDirty = true
      },
      onPlaceStructure: structureType => {
        state.confirmingNewWorld = false
        const playerCity = getPlayerCity(state)

        if (!playerCity || state.activeTab !== 'buy') {
          return
        }

        if (structureType === structureTypeIds.farm && !hasTechnology(state, technologyIds.farming, playerCity.id)) {
          statusMessage = 'Research farming before placing farms.'
          uiDirty = true
          return
        }

        if (structureType === structureTypeIds.mine && !hasTechnology(state, technologyIds.mining, playerCity.id)) {
          statusMessage = 'Research mining before placing mines.'
          uiDirty = true
          return
        }

        if (structureType === structureTypeIds.lumberCamp && !hasTechnology(state, technologyIds.lumbering, playerCity.id)) {
          statusMessage = 'Research logging before placing lumber camps.'
          uiDirty = true
          return
        }

        if (getStructureCount(state, playerCity.id, structureType, { includePending: true }) >= getStructureBuildLimit(structureType, state, playerCity.id)) {
          statusMessage = getPlacementFailureMessage(structureType, 'limit', getStructureBuildLimit(structureType, state, playerCity.id))
          uiDirty = true
          return
        }

        if (placementMode?.structureType === structureType) {
          placementMode = null
          statusMessage = `${getStructureLabel(structureType)} placement cancelled.`
          uiDirty = true
          return
        }

        const structureCost = getStructureCost(state, playerCity.id, structureType)

        if (playerCity.treasury < structureCost) {
          statusMessage = getStructureAffordabilityMessage(structureType, playerCity.treasury, structureCost)
          triggerTreasuryAlert(`build-${structureType}`)
          uiDirty = true
          return
        }

        const validPlacementTiles = getValidPlacementTilesForStructure(playerCity.id, structureType)

        if (!validPlacementTiles.length) {
          statusMessage = `There's no in-range location that can currently support that structure.`
          uiDirty = true
          return
        }

        placementMode = {
          structureType,
          hoveredTile: null
        }
        setSelectedStructure(null)
        statusMessage = structureType === structureTypeIds.farm
          ? 'Placing farm within your network range.'
          : structureType === structureTypeIds.mine
            ? 'Placing mine within your network range.'
            : structureType === structureTypeIds.lumberCamp
              ? 'Placing lumber camp within your network range.'
            : 'Placing forager camp within your network range.'
        uiDirty = true
      },
      onDemolishStructure: () => {
        state.confirmingNewWorld = false
        const playerCity = getPlayerCity(state)

        if (!playerCity || state.activeTab !== 'buy') {
          return
        }

        if (!getStructuresForCity(state, playerCity.id).length) {
          statusMessage = 'You have no completed structures to demolish.'
          uiDirty = true
          return
        }

        if (placementMode?.mode === 'demolish') {
          placementMode = null
          statusMessage = 'Demolition cancelled.'
          uiDirty = true
          return
        }

        placementMode = {
          mode: 'demolish',
          hoveredTile: null
        }
        setSelectedStructure(null)
        statusMessage = 'Click one of your completed structures to demolish it.'
        uiDirty = true
      },
      onPassWeek: () => {
        state.confirmingNewWorld = false
        const playerCity = getPlayerCity(state)

        if (!playerCity || state.activeTab !== 'calendar' || getTaskForCity(weekPassTasks, playerCity.id)) {
          return
        }

        setWeekPassTasks([...weekPassTasks, createCalendarAdvanceTask(
          playerCity.id,
          weekPassDurationMs,
          7,
          'allowing a week to pass'
        )])
        syncPendingTasksState()
        persist()
        statusMessage = 'A week is set aside to pass.'
        uiDirty = true
      },
      onPassMonth: () => {
        state.confirmingNewWorld = false
        const playerCity = getPlayerCity(state)
        const elapsedDayCount = state.week * 7 + (state.dayOfWeek ?? 0)

        if (
          !playerCity ||
          state.activeTab !== 'calendar' ||
          elapsedDayCount < monthPassUnlockDay ||
          getTaskForCity(weekPassTasks, playerCity.id)
        ) {
          return
        }

        setWeekPassTasks([...weekPassTasks, createCalendarAdvanceTask(
          playerCity.id,
          monthPassDurationMs,
          31,
          'allowing a month to pass'
        )])
        syncPendingTasksState()
        persist()
        statusMessage = 'A month is set aside to pass.'
        uiDirty = true
      },
      onBuildTradeRoute: cityId => {
        state.confirmingNewWorld = false
        const playerCity = getPlayerCity(state)
        const targetCity = getCityById(state, Number(cityId))

        if (!playerCity || !targetCity || state.activeTab !== 'diplomacy') {
          return
        }

        const { requesterShare } = getTradeRouteSplitShares(state, playerCity.id, targetCity.id)

        if (playerCity.treasury < requesterShare) {
          statusMessage = getTradeRouteAffordabilityMessage(targetCity.name, playerCity.treasury, requesterShare, { split: true })
          triggerTreasuryAlert(`trade-route-build-${targetCity.id}`)
          uiDirty = true
          return
        }

        const startedAt = performance.now()
        const result = buildTradeRoute(state, playerCity.id, targetCity.id)

        if (!result) {
          return
        }

        startDisplayMoneyCatchup(startedAt)
        refreshDerivedState()
        persist()
        statusMessage = `A cost-sharing request is sent to ${targetCity.name}.`
        uiDirty = true
      },
      onOfferTradeRouteSplit: cityId => {
        state.confirmingNewWorld = false
        const playerCity = getPlayerCity(state)
        const targetCity = getCityById(state, Number(cityId))

        if (!playerCity || !targetCity || state.activeTab !== 'diplomacy') {
          return
        }

        const { requesterShare } = getTradeRouteSplitShares(state, playerCity.id, targetCity.id)

        if (playerCity.treasury < requesterShare) {
          statusMessage = getTradeRouteAffordabilityMessage(targetCity.name, playerCity.treasury, requesterShare, { split: true })
          triggerTreasuryAlert(`trade-route-split-${targetCity.id}`)
          uiDirty = true
          return
        }

        const startedAt = performance.now()
        const result = offerTradeRouteSplit(state, playerCity.id, targetCity.id)

        if (!result) {
          return
        }

        startDisplayMoneyCatchup(startedAt)
        refreshDerivedState()
        persist()
        statusMessage = `A cost-sharing request is sent to ${targetCity.name}.`
        uiDirty = true
      },
      onAcceptTradeRouteOffer: cityId => {
        state.confirmingNewWorld = false
        const playerCity = getPlayerCity(state)
        const targetCity = getCityById(state, Number(cityId))

        if (!playerCity || !targetCity || state.activeTab !== 'diplomacy') {
          return
        }

        const offer = getTradeRouteOfferBetweenCities(state, playerCity.id, targetCity.id)

        if (!offer || offer.toCityId !== playerCity.id) {
          return
        }

        if (playerCity.treasury < offer.recipientShare) {
          statusMessage = getTradeRouteAffordabilityMessage(targetCity.name, playerCity.treasury, offer.recipientShare, { split: true })
          triggerTreasuryAlert(`trade-route-accept-${targetCity.id}`)
          uiDirty = true
          return
        }

        const startedAt = performance.now()
        const result = acceptTradeRouteOffer(state, targetCity.id, playerCity.id)

        if (!result) {
          return
        }

        queueTradeRouteBuild(result.tradeRouteBuild, startedAt)
        syncPendingTasksState()

        startDisplayMoneyCatchup(startedAt)
        refreshDerivedState()
        persist()
        statusMessage = `A trade route to ${targetCity.name} enters construction.`
        uiDirty = true
      },
      onDeclineTradeRouteOffer: cityId => {
        state.confirmingNewWorld = false
        const playerCity = getPlayerCity(state)
        const targetCity = getCityById(state, Number(cityId))

        if (!playerCity || !targetCity || state.activeTab !== 'diplomacy') {
          return
        }

        const result = declineTradeRouteOffer(state, targetCity.id, playerCity.id)

        if (!result) {
          return
        }

        refreshDerivedState()
        persist()
        statusMessage = `You decline ${targetCity.name}'s trade route request.`
        uiDirty = true
      },
      onDismissStructurePopup: () => {
        setSelectedStructure(null)
        uiDirty = true
      },
      onStructurePopupAction: actionId => {
        state.confirmingNewWorld = false

        if (!actionId?.startsWith('upgrade:')) {
          return
        }

        const playerCity = getPlayerCity(state)
        const selectedStructure = getSelectedStructure()
        const targetStructureType = actionId.slice('upgrade:'.length)

        if (!playerCity || !selectedStructure) {
          return
        }

        const availability = getStructureUpgradeAvailability(state, playerCity.id, selectedStructure, targetStructureType)

        if (!availability.canUpgrade) {
          statusMessage = getStructureUpgradeFailureMessage(
            targetStructureType,
            availability.reason,
            getStructureBuildLimit(targetStructureType, state, playerCity.id)
          )

          if (availability.reason === 'unaffordable') {
            triggerTreasuryAlert()
          }

          uiDirty = true
          return
        }

        const startedAt = performance.now()
        const result = upgradeStructure(state, playerCity.id, selectedStructure, targetStructureType)

        if (!result) {
          statusMessage = 'That upgrade could not be completed.'
          uiDirty = true
          return
        }

        setSelectedStructure(result.upgradedStructure)
        startDisplayMoneyCatchup(startedAt)
        persist()
        statusMessage = `Your ${getStructureLabel(selectedStructure.type)} is upgraded into a ${getStructureLabel(targetStructureType)}.`
        uiDirty = true
      },
      onNewWorld: () => {
        if (!state.confirmingNewWorld) {
          state.confirmingNewWorld = true
          statusMessage = 'Click restart again to confirm.'
          uiDirty = true
          return
        }

        clearLocalSave()
        state = createNewGameState()
        setSelectedStructure(null)
        state.confirmingNewWorld = false
        displayMoney = 0
        displayMoneyState = null
        setExplorationTasks([])
        setFarmingResearchTasks([])
        setFertilizerResearchTasks([])
        setChemistryResearchTasks([])
        setChemicalFertilizerResearchTasks([])
        setEngineeringResearchTasks([])
        setMiningResearchTasks([])
        setMineShaftsResearchTasks([])
        setLumberingResearchTasks([])
        setStructureBuildTasks([])
        setWeekPassTasks([])
        dayAccumulatorMs = 0
        placementMode = null
        refreshDerivedState({ refreshOfferedCities: true })
        syncPendingTasksState()
        statusMessage = 'New world arranged.'
        persist()
        uiDirty = true
      }
    }
  })

  if (window.location.protocol === 'file:') {
    ui.showLocalRunNote()
    return
  }

  let state = buildInitialState()
  state.confirmingNewWorld = false
  let displayMoney = getPlayerCity(state)?.treasury ?? 0
  let displayMoneyState = null
  let explorationTasks = restoreRuntimeTasks(state.pendingTasks?.exploration)
  let farmingResearchTasks = restoreRuntimeTasks(state.pendingTasks?.farmingResearch)
  let fertilizerResearchTasks = restoreRuntimeTasks(state.pendingTasks?.fertilizerResearch)
  let chemistryResearchTasks = restoreRuntimeTasks(state.pendingTasks?.chemistryResearch)
  let chemicalFertilizerResearchTasks = restoreRuntimeTasks(state.pendingTasks?.chemicalFertilizerResearch)
  let engineeringResearchTasks = restoreRuntimeTasks(state.pendingTasks?.engineeringResearch)
  let miningResearchTasks = restoreRuntimeTasks(state.pendingTasks?.miningResearch)
  let mineShaftsResearchTasks = restoreRuntimeTasks(state.pendingTasks?.mineShaftsResearch)
  let lumberingResearchTasks = restoreRuntimeTasks(state.pendingTasks?.lumberingResearch)
  let tradeRouteBuildTasks = restoreRuntimeTasks(state.pendingTasks?.tradeRouteBuilds)
  let structureBuildTasks = restoreRuntimeTasks(state.pendingTasks?.structureBuilds)
  let weekPassTasks = restoreRuntimeTasks(state.pendingTasks?.weekPassages)
  let placementMode = null
  let dragCameraState = null
  let dayAccumulatorMs = 0
  let lastFrameAt = 0
  let statusMessage = ''
  let uiDirty = true
  let displayMoneyDirty = false
  let offeredCitiesForUi = buildOfferedCitiesForUi(state)
  let taskVersions = {
    exploration: 0,
    farmingResearch: 0,
    fertilizerResearch: 0,
    chemistryResearch: 0,
    chemicalFertilizerResearch: 0,
    engineeringResearch: 0,
    miningResearch: 0,
    mineShaftsResearch: 0,
    lumberingResearch: 0,
    tradeRouteBuilds: 0,
    structureBuilds: 0,
    weekPassages: 0
  }
  let reservedBuildTileVersion = -1
  let reservedBuildTileKeys = new Set()
  let pendingStructuresVersion = -1
  let pendingStructuresCache = []
  let validPlacementTilesCacheKey = ''
  let validPlacementTilesCache = []
  let selectedStructureTile = null
  let suppressNextCanvasClick = false
  let perfHudVisible = localStorage.getItem(perfHudStorageKey) === '1'
  let perfHudLastUpdatedAt = 0
  let perfHudLastFrameAt = 0
  let perfHudFrameSamples = []

  const perfHud = document.createElement('div')
  perfHud.className = 'perf-hud'
  perfHud.hidden = !perfHudVisible
  document.body.append(perfHud)

  const setExplorationTasks = tasks => {
    explorationTasks = tasks
    taskVersions.exploration += 1
  }

  const setFarmingResearchTasks = tasks => {
    farmingResearchTasks = tasks
    taskVersions.farmingResearch += 1
  }

  const setFertilizerResearchTasks = tasks => {
    fertilizerResearchTasks = tasks
    taskVersions.fertilizerResearch += 1
  }

  const setChemistryResearchTasks = tasks => {
    chemistryResearchTasks = tasks
    taskVersions.chemistryResearch += 1
  }

  const setChemicalFertilizerResearchTasks = tasks => {
    chemicalFertilizerResearchTasks = tasks
    taskVersions.chemicalFertilizerResearch += 1
  }

  const setEngineeringResearchTasks = tasks => {
    engineeringResearchTasks = tasks
    taskVersions.engineeringResearch += 1
  }

  const setMiningResearchTasks = tasks => {
    miningResearchTasks = tasks
    taskVersions.miningResearch += 1
  }

  const setMineShaftsResearchTasks = tasks => {
    mineShaftsResearchTasks = tasks
    taskVersions.mineShaftsResearch += 1
  }

  const setLumberingResearchTasks = tasks => {
    lumberingResearchTasks = tasks
    taskVersions.lumberingResearch += 1
  }

  const setTradeRouteBuildTasks = tasks => {
    tradeRouteBuildTasks = tasks
    taskVersions.tradeRouteBuilds += 1
  }

  const setStructureBuildTasks = tasks => {
    structureBuildTasks = tasks
    taskVersions.structureBuilds += 1
  }

  const setWeekPassTasks = tasks => {
    weekPassTasks = tasks
    taskVersions.weekPassages += 1
  }

  const refreshDerivedState = ({ refreshOfferedCities = false } = {}) => {
    if (refreshOfferedCities) {
      offeredCitiesForUi = buildOfferedCitiesForUi(state)
    }

    reservedBuildTileVersion = -1
    pendingStructuresVersion = -1
    validPlacementTilesCacheKey = ''
  }

  const persist = () => {
    saveToLocalStorage(state)
  }

  const updatePerfHud = now => {
    if (!perfHudVisible) {
      return
    }

    if (perfHudLastFrameAt > 0) {
      perfHudFrameSamples.push(now - perfHudLastFrameAt)
      if (perfHudFrameSamples.length > 180) {
        perfHudFrameSamples.shift()
      }
    }
    perfHudLastFrameAt = now

    if (now - perfHudLastUpdatedAt < 250) {
      return
    }

    perfHudLastUpdatedAt = now
    const samples = perfHudFrameSamples.length ? [...perfHudFrameSamples].sort((first, second) => first - second) : [0]
    const averageFrameMs = perfHudFrameSamples.length
      ? perfHudFrameSamples.reduce((total, value) => total + value, 0) / perfHudFrameSamples.length
      : 0
    const p95FrameMs = samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))] ?? 0
    const maxFrameMs = samples.at(-1) ?? 0
    const rendererDebug = renderer.getDebugSnapshot()

    perfHud.textContent = [
      `FPS ${averageFrameMs > 0 ? (1000 / averageFrameMs).toFixed(1) : '0.0'}`,
      `Frame ${averageFrameMs.toFixed(2)}ms avg`,
      `P95 ${p95FrameMs.toFixed(2)}ms`,
      `Max ${maxFrameMs.toFixed(2)}ms`,
      `Terrain ${rendererDebug.terrainRenderMode}`,
      `Tiles ${rendererDebug.terrainTileCount}`,
      `Settled ${rendererDebug.cameraSettledFrames}`,
      `Zoom ${rendererDebug.zoom}`,
      `Structures ${state.structures.length}`,
      `Pending ${structureBuildTasks.length}`,
      `Tab ${state.activeTab}`
    ].join('\n')
  }

  const togglePerfHud = () => {
    perfHudVisible = !perfHudVisible
    perfHud.hidden = !perfHudVisible
    localStorage.setItem(perfHudStorageKey, perfHudVisible ? '1' : '0')

    if (!perfHudVisible) {
      perfHudFrameSamples = []
      perfHudLastUpdatedAt = 0
      perfHudLastFrameAt = 0
      return
    }

    updatePerfHud(performance.now())
  }

  window.addEventListener('keydown', event => {
    if (!event.altKey || event.key.toLowerCase() !== 'p') {
      return
    }

    event.preventDefault()
    togglePerfHud()
  })

  const syncPendingTasksState = () => {
    state.pendingTasks = {
      exploration: explorationTasks.map(task => ({
        ownerCityId: task.ownerCityId,
        duration: task.duration,
        cost: task.cost,
        gainKm: task.gainKm,
        paidUpFront: task.paidUpFront
      })),
      farmingResearch: farmingResearchTasks.map(task => ({
        ownerCityId: task.ownerCityId,
        duration: task.duration,
        cost: task.cost,
        paidUpFront: task.paidUpFront
      })),
      fertilizerResearch: fertilizerResearchTasks.map(task => ({
        ownerCityId: task.ownerCityId,
        duration: task.duration,
        cost: task.cost,
        paidUpFront: task.paidUpFront
      })),
      chemistryResearch: chemistryResearchTasks.map(task => ({
        ownerCityId: task.ownerCityId,
        duration: task.duration,
        cost: task.cost,
        paidUpFront: task.paidUpFront
      })),
      chemicalFertilizerResearch: chemicalFertilizerResearchTasks.map(task => ({
        ownerCityId: task.ownerCityId,
        duration: task.duration,
        cost: task.cost,
        paidUpFront: task.paidUpFront
      })),
      engineeringResearch: engineeringResearchTasks.map(task => ({
        ownerCityId: task.ownerCityId,
        duration: task.duration,
        cost: task.cost,
        paidUpFront: task.paidUpFront
      })),
      miningResearch: miningResearchTasks.map(task => ({
        ownerCityId: task.ownerCityId,
        duration: task.duration,
        cost: task.cost,
        paidUpFront: task.paidUpFront
      })),
      mineShaftsResearch: mineShaftsResearchTasks.map(task => ({
        ownerCityId: task.ownerCityId,
        duration: task.duration,
        cost: task.cost,
        paidUpFront: task.paidUpFront
      })),
      lumberingResearch: lumberingResearchTasks.map(task => ({
        ownerCityId: task.ownerCityId,
        duration: task.duration,
        cost: task.cost,
        paidUpFront: task.paidUpFront
      })),
      tradeRouteBuilds: tradeRouteBuildTasks.map(task => ({
        ownerCityId: task.ownerCityId,
        duration: task.duration,
        durationDays: task.durationDays,
        requesterCityId: task.requesterCityId,
        recipientCityId: task.recipientCityId,
        cityAId: task.cityAId,
        cityBId: task.cityBId,
        paidUpFront: task.paidUpFront
      })),
      structureBuilds: structureBuildTasks.map(task => ({
        ownerCityId: task.ownerCityId,
        duration: task.duration,
        structureType: task.structureType,
        columnIndex: task.columnIndex,
        rowIndex: task.rowIndex,
        cost: task.cost,
        paidUpFront: task.paidUpFront
      })),
      weekPassages: weekPassTasks.map(task => ({
        ownerCityId: task.ownerCityId,
        duration: task.duration,
        durationDays: task.durationDays,
        taskLabel: task.taskLabel,
        paidUpFront: task.paidUpFront
      }))
    }

    bumpStateVersions(state, 'pendingTasks')
  }

  const hasActiveTimedTask = () => Boolean(
    explorationTasks.length ||
    farmingResearchTasks.length ||
    fertilizerResearchTasks.length ||
    chemistryResearchTasks.length ||
    chemicalFertilizerResearchTasks.length ||
    engineeringResearchTasks.length ||
    miningResearchTasks.length ||
    mineShaftsResearchTasks.length ||
    lumberingResearchTasks.length ||
    tradeRouteBuildTasks.length ||
    structureBuildTasks.length ||
    weekPassTasks.length
  )

  const hasActiveCalendarAdvancingTask = () => {
    const playerCity = getPlayerCity(state)

    if (!playerCity) {
      return false
    }

    return Boolean(
      getTaskForCity(explorationTasks, playerCity.id) ||
      getTaskForCity(farmingResearchTasks, playerCity.id) ||
      getTaskForCity(fertilizerResearchTasks, playerCity.id) ||
      getTaskForCity(chemistryResearchTasks, playerCity.id) ||
      getTaskForCity(chemicalFertilizerResearchTasks, playerCity.id) ||
      getTaskForCity(engineeringResearchTasks, playerCity.id) ||
      getTaskForCity(miningResearchTasks, playerCity.id) ||
      getTaskForCity(mineShaftsResearchTasks, playerCity.id) ||
      getTaskForCity(lumberingResearchTasks, playerCity.id) ||
      tradeRouteBuildTasks.some(task => task.requesterCityId === playerCity.id || task.recipientCityId === playerCity.id) ||
      getTaskForCity(structureBuildTasks, playerCity.id) ||
      getTaskForCity(weekPassTasks, playerCity.id)
    )
  }

  const getAvailableTreasury = city => city.treasury

  const getReservedBuildTileKeys = () => {
    if (reservedBuildTileVersion === taskVersions.structureBuilds) {
      return reservedBuildTileKeys
    }

    reservedBuildTileVersion = taskVersions.structureBuilds
    reservedBuildTileKeys = new Set(structureBuildTasks.map(task => `${task.columnIndex}:${task.rowIndex}`))

    return reservedBuildTileKeys
  }

  const getPendingStructures = () => {
    if (pendingStructuresVersion === taskVersions.structureBuilds) {
      return pendingStructuresCache
    }

    pendingStructuresVersion = taskVersions.structureBuilds
    pendingStructuresCache = structureBuildTasks.map(task => ({
      ownerCityId: task.ownerCityId,
      type: task.structureType,
      columnIndex: task.columnIndex,
      rowIndex: task.rowIndex,
      startedAt: task.startedAt,
      duration: task.duration
    }))

    return pendingStructuresCache
  }

  const setSelectedStructure = structure => {
    selectedStructureTile = structure
      ? {
          ownerCityId: structure.ownerCityId,
          columnIndex: structure.columnIndex,
          rowIndex: structure.rowIndex
        }
      : null
  }

  const getSelectedStructure = () => {
    if (!selectedStructureTile) {
      return null
    }

    const structure = state.structures.find(entry => (
      entry.ownerCityId === selectedStructureTile.ownerCityId &&
      entry.columnIndex === selectedStructureTile.columnIndex &&
      entry.rowIndex === selectedStructureTile.rowIndex
    )) ?? null

    if (!structure) {
      selectedStructureTile = null
    }

    return structure
  }

  const getStructurePopupData = structure => {
    const ownerCity = structure ? getCityById(state, structure.ownerCityId) : null
    const playerCity = getPlayerCity(state)

    if (!structure || !ownerCity || !playerCity || (placementMode && state.activeTab === 'buy')) {
      return null
    }

    const knowledgeEllipse = renderer.getKnowledgeEllipse(state, playerCity, playerCity.knowledgeRadiusKm)

    if (!renderer.doesTileIntersectKnowledgeEllipse(structure.columnIndex, structure.rowIndex, state.terrain, knowledgeEllipse)) {
      return null
    }

    const anchor = renderer.getStructurePopupAnchor(state.terrain, structure.columnIndex, structure.rowIndex, structure.type)

    if (!anchor) {
      return null
    }

    const actions = ownerCity.id === playerCity.id
      ? getStructureUpgradeTargetTypes(structure).map(targetStructureType => {
          const availability = getStructureUpgradeAvailability(state, playerCity.id, structure, targetStructureType)
          const discountedCost = availability.cost ?? getStructureUpgradeCost(state, playerCity.id, targetStructureType)

          return {
            id: `upgrade:${targetStructureType}`,
            label: `Upgrade to ${getStructureActionLabel(targetStructureType)} (${formatCurrency(discountedCost)})`,
            disabled: !availability.canUpgrade,
            title: availability.canUpgrade
              ? `Upgrade for ${formatCurrency(discountedCost)}`
              : getStructureUpgradeFailureMessage(
                  targetStructureType,
                  availability.reason,
                  getStructureBuildLimit(targetStructureType, state, playerCity.id)
                )
          }
        })
      : []

    return {
      structureLabel: getStructureLabel(structure.type),
      ownerName: ownerCity.name,
      ownerColor: getCssRgbColor(getKeyColorRgbForRecipe(getFlagKeyColorRecipe(ownerCity.flag))),
      anchor,
      viewport: renderer.viewport,
      actions
    }
  }

  const getExplorationAvailabilityForUi = playerCity => {
    const baseAvailability = getExplorationAvailability(state, playerCity.id)

    if (!baseAvailability.canExplore) {
      return baseAvailability
    }

    if (getTaskForCity(explorationTasks, playerCity.id)) {
      return {
        ...baseAvailability,
        canExplore: false,
        reason: 'in-progress'
      }
    }

    if (getAvailableTreasury(playerCity) < getExplorationCost(state, playerCity.id)) {
      return {
        ...baseAvailability,
        canExplore: false,
        reason: 'unaffordable'
      }
    }

    return baseAvailability
  }

  const getFarmingResearchAvailabilityForUi = playerCity => {
    const baseAvailability = getFarmingResearchAvailability(state, playerCity.id)

    if (!baseAvailability.canResearch) {
      return baseAvailability
    }

    if (getTaskForCity(farmingResearchTasks, playerCity.id)) {
      return {
        ...baseAvailability,
        canResearch: false,
        reason: 'in-progress'
      }
    }

    if (getAvailableTreasury(playerCity) < farmingResearchCost) {
      return {
        ...baseAvailability,
        canResearch: false,
        reason: 'unaffordable'
      }
    }

    return baseAvailability
  }

  const getFertilizerResearchAvailabilityForUi = playerCity => {
    const baseAvailability = getFertilizerResearchAvailability(state, playerCity.id)

    if (!baseAvailability.canResearch) {
      return baseAvailability
    }

    if (getTaskForCity(fertilizerResearchTasks, playerCity.id)) {
      return {
        ...baseAvailability,
        canResearch: false,
        reason: 'in-progress'
      }
    }

    if (getAvailableTreasury(playerCity) < fertilizerResearchCost) {
      return {
        ...baseAvailability,
        canResearch: false,
        reason: 'unaffordable'
      }
    }

    return baseAvailability
  }

  const getChemistryResearchAvailabilityForUi = playerCity => {
    const baseAvailability = getChemistryResearchAvailability(state, playerCity.id)

    if (!baseAvailability.canResearch) {
      return baseAvailability
    }

    if (getTaskForCity(chemistryResearchTasks, playerCity.id)) {
      return {
        ...baseAvailability,
        canResearch: false,
        reason: 'in-progress'
      }
    }

    if (getAvailableTreasury(playerCity) < chemistryResearchCost) {
      return {
        ...baseAvailability,
        canResearch: false,
        reason: 'unaffordable'
      }
    }

    return baseAvailability
  }

  const getChemicalFertilizerResearchAvailabilityForUi = playerCity => {
    const baseAvailability = getChemicalFertilizerResearchAvailability(state, playerCity.id)

    if (!baseAvailability.canResearch) {
      return baseAvailability
    }

    if (getTaskForCity(chemicalFertilizerResearchTasks, playerCity.id)) {
      return {
        ...baseAvailability,
        canResearch: false,
        reason: 'in-progress'
      }
    }

    if (getAvailableTreasury(playerCity) < chemicalFertilizerResearchCost) {
      return {
        ...baseAvailability,
        canResearch: false,
        reason: 'unaffordable'
      }
    }

    return baseAvailability
  }

  const getEngineeringResearchAvailabilityForUi = playerCity => {
    const baseAvailability = getEngineeringResearchAvailability(state, playerCity.id)

    if (!baseAvailability.canResearch) {
      return baseAvailability
    }

    if (getTaskForCity(engineeringResearchTasks, playerCity.id)) {
      return {
        ...baseAvailability,
        canResearch: false,
        reason: 'in-progress'
      }
    }

    if (getAvailableTreasury(playerCity) < engineeringResearchCost) {
      return {
        ...baseAvailability,
        canResearch: false,
        reason: 'unaffordable'
      }
    }

    return baseAvailability
  }

  const getMiningResearchAvailabilityForUi = playerCity => {
    const baseAvailability = getMiningResearchAvailability(state, playerCity.id)

    if (!baseAvailability.canResearch) {
      return baseAvailability
    }

    if (getTaskForCity(miningResearchTasks, playerCity.id)) {
      return {
        ...baseAvailability,
        canResearch: false,
        reason: 'in-progress'
      }
    }

    if (getAvailableTreasury(playerCity) < miningResearchCost) {
      return {
        ...baseAvailability,
        canResearch: false,
        reason: 'unaffordable'
      }
    }

    return baseAvailability
  }

  const getMineShaftsResearchAvailabilityForUi = playerCity => {
    const baseAvailability = getMineShaftsResearchAvailability(state, playerCity.id)

    if (!baseAvailability.canResearch) {
      return baseAvailability
    }

    if (getTaskForCity(mineShaftsResearchTasks, playerCity.id)) {
      return {
        ...baseAvailability,
        canResearch: false,
        reason: 'in-progress'
      }
    }

    if (getAvailableTreasury(playerCity) < mineShaftsResearchCost) {
      return {
        ...baseAvailability,
        canResearch: false,
        reason: 'unaffordable'
      }
    }

    return baseAvailability
  }

  const getLumberingResearchAvailabilityForUi = playerCity => {
    const baseAvailability = getLumberingResearchAvailability(state, playerCity.id)

    if (!baseAvailability.canResearch) {
      return baseAvailability
    }

    if (getTaskForCity(lumberingResearchTasks, playerCity.id)) {
      return {
        ...baseAvailability,
        canResearch: false,
        reason: 'in-progress'
      }
    }

    if (getAvailableTreasury(playerCity) < lumberingResearchCost) {
      return {
        ...baseAvailability,
        canResearch: false,
        reason: 'unaffordable'
      }
    }

    return baseAvailability
  }

  const isTileReservedByPendingBuild = (columnIndex, rowIndex) => (
    getReservedBuildTileKeys().has(`${columnIndex}:${rowIndex}`)
  )

  const getPlacementAvailabilityForUi = (cityId, structureType, columnIndex, rowIndex) => {
    const availability = getStructurePlacementAvailability(state, cityId, structureType, columnIndex, rowIndex)

    if (!availability.canPlace) {
      return availability
    }

    if (isTileReservedByPendingBuild(columnIndex, rowIndex)) {
      return {
        ...availability,
        canPlace: false,
        reason: 'occupied'
      }
    }

    return availability
  }

  const getDiplomacyEntryForUi = (playerCity, city) => {
    const distanceKm = state.distanceMatrix[playerCity.id][city.id]
    const tradeRoute = getTradeRouteBetweenCities(state, playerCity.id, city.id)
    const tradeRouteBuildTask = tradeRouteBuildTasks.find(task => (
      getTradeRouteTaskPairKey(task.cityAId, task.cityBId) === getTradeRouteTaskPairKey(playerCity.id, city.id)
    )) ?? null
    const tradeRouteBuildProgress = tradeRouteBuildTask
      ? buildProgressState(tradeRouteBuildTask)
      : null
    const tradeRouteOffer = getTradeRouteOfferBetweenCities(state, playerCity.id, city.id)
    const outgoingTradeRouteOffer = tradeRouteOffer?.fromCityId === playerCity.id
      ? tradeRouteOffer
      : null
    const incomingTradeRouteOffer = tradeRouteOffer?.toCityId === playerCity.id
      ? tradeRouteOffer
      : null
    const totalTradeRouteCost = getTradeRouteCost(state, playerCity.id, city.id)
    const splitShares = getTradeRouteSplitShares(state, playerCity.id, city.id)
    const tradeRouteDailyIncome = getTradeRouteDailyIncome(state, playerCity.id, city.id)

    return {
      city,
      distanceKm,
      tradeRoute,
      tradeRouteBuildTask,
      tradeRouteBuildProgress,
      outgoingTradeRouteOffer,
      incomingTradeRouteOffer,
      totalTradeRouteCost,
      splitShares,
      tradeRouteDailyIncome
    }
  }

  const createRuntimeTradeRouteBuildTask = (tradeRouteBuild, startedAt = performance.now()) => ({
    ...tradeRouteBuild,
    ownerCityId: tradeRouteBuild.requesterCityId,
    duration: getTradeRouteBuildDurationMs(tradeRouteBuild.durationDays),
    startedAt,
    paidUpFront: true
  })

  const queueTradeRouteBuild = (tradeRouteBuild, startedAt = performance.now()) => {
    if (!tradeRouteBuild) {
      return false
    }

    const tradeRoutePairKey = getTradeRouteTaskPairKey(tradeRouteBuild.cityAId, tradeRouteBuild.cityBId)

    if (tradeRouteBuildTasks.some(task => getTradeRouteTaskPairKey(task.cityAId, task.cityBId) === tradeRoutePairKey)) {
      return false
    }

    setTradeRouteBuildTasks([...tradeRouteBuildTasks, createRuntimeTradeRouteBuildTask(tradeRouteBuild, startedAt)])

    return true
  }

  const getValidPlacementTilesForStructure = (cityId, structureType) => getBuildRangeCandidateTiles(state, cityId)
    .filter(tile => getPlacementAvailabilityForUi(cityId, structureType, tile.columnIndex, tile.rowIndex).canPlace)

  const getDemolishableTilesForCity = cityId => getStructuresForCity(state, cityId).map(structure => ({
    columnIndex: structure.columnIndex,
    rowIndex: structure.rowIndex
  }))

  const getValidPlacementTiles = () => {
    if (!placementMode || state.activeTab !== 'buy') {
      return []
    }

    const playerCity = getPlayerCity(state)

    if (!playerCity) {
      return []
    }

    const cacheKey = [
      playerCity.id,
      placementMode.mode ?? 'build',
      placementMode.structureType ?? '',
      getStateVersion(state, 'structures'),
      getStateVersion(state, 'cities'),
      getStateVersion(state, 'pendingTasks'),
      state.terrain.version ?? 0
    ].join(':')

    if (validPlacementTilesCacheKey === cacheKey) {
      return validPlacementTilesCache
    }

    validPlacementTilesCacheKey = cacheKey
    validPlacementTilesCache = placementMode.mode === 'demolish'
      ? getDemolishableTilesForCity(playerCity.id)
      : getValidPlacementTilesForStructure(playerCity.id, placementMode.structureType)

    return validPlacementTilesCache
  }

  const flagRenderer = await createFlagRenderer()
  const renderer = await MapRenderer.create({ canvas, flagRenderer })

  const getDisplayMoneyTickRate = difference => Math.min(
    displayMoneyMaximumTickRate,
    displayMoneyMinimumTickRate + Math.pow(Math.max(1, Math.abs(difference)), 0.82) * 10
  )

  const startDisplayMoneyCatchup = now => {
    const playerCity = getPlayerCity(state)

    if (!playerCity) {
      displayMoney = 0
      displayMoneyState = null
      return
    }

    const difference = playerCity.treasury - displayMoney

    if (difference === 0) {
      displayMoney = playerCity.treasury
      displayMoneyState = null
      return
    }

    const direction = Math.sign(difference)

    if (!displayMoneyState || displayMoneyState.direction !== direction) {
      displayMoneyState = {
        direction,
        velocity: 0,
        carriedSteps: 0,
        lastUpdatedAt: now
      }

      return
    }

    displayMoneyState.lastUpdatedAt = now
  }

  const getCityHomeTile = cityId => {
    const point = state.cityPositions[cityId]

    if (!point) {
      return { columnIndex: 0, rowIndex: 0 }
    }

    return {
      columnIndex: Math.round(point.x * state.terrain.columns),
      rowIndex: Math.round(point.y * state.terrain.rows)
    }
  }

  const getNeighborTileTypeCount = (columnIndex, rowIndex, tileType) => {
    let count = 0

    for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
      for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
        if (rowOffset === 0 && columnOffset === 0) {
          continue
        }

        const neighborColumn = columnIndex + columnOffset
        const neighborRow = rowIndex + rowOffset

        if (neighborColumn < 0 || neighborRow < 0 || neighborColumn >= state.terrain.columns || neighborRow >= state.terrain.rows) {
          continue
        }

        if (getTerrainTile(state.terrain, neighborColumn, neighborRow).type === tileType) {
          count += 1
        }
      }
    }

    return count
  }

  const getNearestOwnedStructureDistance = (cityId, columnIndex, rowIndex) => {
    const ownedStructures = getStructuresForCity(state, cityId)

    if (!ownedStructures.length) {
      return null
    }

    return ownedStructures.reduce((nearestDistance, structure) => {
      const structureDistance = Math.abs(structure.columnIndex - columnIndex) + Math.abs(structure.rowIndex - rowIndex)

      return Math.min(nearestDistance, structureDistance)
    }, Infinity)
  }

  const getOwnedStructureAdjacencyCounts = (cityId, columnIndex, rowIndex) => {
    const ownedStructures = getStructuresForCity(state, cityId)

    return ownedStructures.reduce((counts, structure) => {
      const columnDistance = Math.abs(structure.columnIndex - columnIndex)
      const rowDistance = Math.abs(structure.rowIndex - rowIndex)

      if (columnDistance + rowDistance === 1) {
        counts.orthogonal += 1
      } else if (columnDistance === 1 && rowDistance === 1) {
        counts.diagonal += 1
      }

      return counts
    }, { orthogonal: 0, diagonal: 0 })
  }

  const getAiCandidateBuildTiles = cityId => {
    return getBuildRangeCandidateTiles(state, cityId)
  }

  const getAiDerelictDemolitionCandidates = cityId => {
    const network = getStructureNetwork(state, cityId)
    const networkEntryByTileKey = new Map(network.map(structure => [
      `${structure.columnIndex}:${structure.rowIndex}`,
      structure
    ]))
    const childCountByParentTileKey = network.reduce((counts, structure) => {
      if (structure.parent?.kind !== 'structure') {
        return counts
      }

      const parentTileKey = `${structure.parent.columnIndex}:${structure.parent.rowIndex}`
      counts.set(parentTileKey, (counts.get(parentTileKey) ?? 0) + 1)

      return counts
    }, new Map())

    return getStructuresForCity(state, cityId)
      .filter(structure => structure.type === structureTypeIds.derelict)
      .map(structure => {
        const tileKey = `${structure.columnIndex}:${structure.rowIndex}`
        const networkEntry = networkEntryByTileKey.get(tileKey) ?? null

        return {
          structure,
          childCount: childCountByParentTileKey.get(tileKey) ?? 0,
          connected: Boolean(networkEntry),
          distanceSquared: networkEntry?.distanceSquared ?? Number.POSITIVE_INFINITY
        }
      })
      .sort((firstCandidate, secondCandidate) => {
        if (firstCandidate.childCount !== secondCandidate.childCount) {
          return firstCandidate.childCount - secondCandidate.childCount
        }

        if (firstCandidate.connected !== secondCandidate.connected) {
          return firstCandidate.connected ? 1 : -1
        }

        return secondCandidate.distanceSquared - firstCandidate.distanceSquared
      })
  }

  const maybeDemolishAiDerelicts = city => {
    const initialCandidates = getAiDerelictDemolitionCandidates(city.id)

    if (!initialCandidates.length) {
      return false
    }

    let demolishedAny = false
    let remainingDerelictCount = initialCandidates.length

    while (remainingDerelictCount > aiDerelictSoftLimit) {
      const nextCandidate = getAiDerelictDemolitionCandidates(city.id)[0]

      if (!nextCandidate) {
        break
      }

      if (!demolishStructure(state, city.id, nextCandidate.structure.columnIndex, nextCandidate.structure.rowIndex)) {
        break
      }

      demolishedAny = true
      remainingDerelictCount -= 1
    }

    if (demolishedAny) {
      return true
    }

    if (remainingDerelictCount === 0 || Math.random() >= aiDerelictCleanupChance) {
      return false
    }

    const cleanupCandidate = getAiDerelictDemolitionCandidates(city.id)[0]

    if (!cleanupCandidate) {
      return false
    }

    return Boolean(demolishStructure(state, city.id, cleanupCandidate.structure.columnIndex, cleanupCandidate.structure.rowIndex))
  }

  const getBestStructurePlacement = (cityId, structureType, { temporaryTechnologyId = null } = {}) => {
    const city = getCityById(state, cityId)

    if (!city) {
      return null
    }

    const findBestCandidate = () => {
      const homeTile = getCityHomeTile(cityId)
      let bestCandidate = null

      getAiCandidateBuildTiles(cityId).forEach(({ columnIndex, rowIndex }) => {
        if (!isTileWithinBuildableTerrain(state.terrain, columnIndex, rowIndex)) {
          return
        }

        const availability = getPlacementAvailabilityForUi(cityId, structureType, columnIndex, rowIndex)

        if (!availability.canPlace) {
          return
        }

        const tile = getTerrainTile(state.terrain, columnIndex, rowIndex)
        const distanceFromHome = Math.abs(columnIndex - homeTile.columnIndex) + Math.abs(rowIndex - homeTile.rowIndex)
        const nearestOwnedStructureDistance = getNearestOwnedStructureDistance(cityId, columnIndex, rowIndex)
        const adjacencyCounts = getOwnedStructureAdjacencyCounts(cityId, columnIndex, rowIndex)
        const neighborGrasslandCount = getNeighborTileTypeCount(columnIndex, rowIndex, 'grassland')
        const neighborMountainCount = getNeighborTileTypeCount(columnIndex, rowIndex, 'mountain')
        const neighborForestCount = getNeighborTileTypeCount(columnIndex, rowIndex, 'forest')
        const homeClusteringScore = Math.max(0, 10 - distanceFromHome)
        const structureClusteringScore = nearestOwnedStructureDistance === null
          ? 0
          : Math.max(0, 7 - nearestOwnedStructureDistance)
        const adjacencyPreferenceScore = adjacencyCounts.diagonal * 6 - adjacencyCounts.orthogonal * 32
        const score = structureType === structureTypeIds.farm
          ? 160 + neighborGrasslandCount * 12 + homeClusteringScore * 9 + structureClusteringScore * 7 + adjacencyPreferenceScore
          : structureType === structureTypeIds.mine
            ? 180 + neighborMountainCount * 16 + homeClusteringScore * 7 + structureClusteringScore * 9 + adjacencyPreferenceScore
            : structureType === structureTypeIds.lumberCamp
              ? 150 + neighborForestCount * 14 + homeClusteringScore * 8 + structureClusteringScore * 8 + adjacencyPreferenceScore
              : neighborGrasslandCount * 18 + homeClusteringScore * 11 + structureClusteringScore * 9 + adjacencyPreferenceScore - (tile.type === 'grassland' ? 36 : 0)

        if (!bestCandidate || score > bestCandidate.score) {
          bestCandidate = {
            columnIndex,
            rowIndex,
            score
          }
        }
      })

      return bestCandidate
    }

    if (!temporaryTechnologyId || city.researchedTechnologyIds.includes(temporaryTechnologyId)) {
      return findBestCandidate()
    }

    const originalTechnologyIds = city.researchedTechnologyIds
    city.researchedTechnologyIds = [...originalTechnologyIds, temporaryTechnologyId]

    try {
      return findBestCandidate()
    } finally {
      city.researchedTechnologyIds = originalTechnologyIds
    }
  }

  const maybeQueueAiEconomicTask = city => {
    if (city.id === state.playerCityId) {
      return false
    }

    if (maybeDemolishAiDerelicts(city)) {
      return true
    }

    const hasPendingResearch = Boolean(
      getTaskForCity(farmingResearchTasks, city.id) ||
      getTaskForCity(fertilizerResearchTasks, city.id) ||
      getTaskForCity(chemistryResearchTasks, city.id) ||
      getTaskForCity(chemicalFertilizerResearchTasks, city.id) ||
      getTaskForCity(engineeringResearchTasks, city.id) ||
      getTaskForCity(miningResearchTasks, city.id) ||
      getTaskForCity(mineShaftsResearchTasks, city.id) ||
      getTaskForCity(lumberingResearchTasks, city.id)
    )
    const hasPendingBuild = structureBuildTasks.some(task => task.ownerCityId === city.id)
    const availableTreasury = getAvailableTreasury(city)
    const ownedStructureCount = getStructuresForCity(state, city.id).length
    const canUseFarming = hasTechnology(state, technologyIds.farming, city.id)
    const canUseChemistry = hasTechnology(state, technologyIds.chemistry, city.id)
    const canUseChemicalFertilizer = hasTechnology(state, technologyIds.chemicalFertilizer, city.id)
    const canUseEngineering = hasTechnology(state, technologyIds.engineering, city.id)
    const canUseMining = hasTechnology(state, technologyIds.mining, city.id)
    const canUseLumbering = hasTechnology(state, technologyIds.lumbering, city.id)
    const prospectiveMinePlacement = getBestStructurePlacement(city.id, structureTypeIds.mine, { temporaryTechnologyId: technologyIds.mining })
    const prospectiveLumberPlacement = getBestStructurePlacement(city.id, structureTypeIds.lumberCamp, { temporaryTechnologyId: technologyIds.lumbering })

    if (!canUseFarming && !hasPendingResearch && availableTreasury >= farmingResearchCost && (ownedStructureCount >= 2 || city.treasury >= 1500)) {
      city.treasury -= farmingResearchCost
      bumpStateVersions(state, 'cities')
      setFarmingResearchTasks([...farmingResearchTasks, {
        ownerCityId: city.id,
        startedAt: performance.now(),
        duration: farmingResearchDurationMs,
        cost: farmingResearchCost,
        paidUpFront: true
      }])
      return true
    }

    if (
      canUseFarming &&
      !hasTechnology(state, technologyIds.fertilizer, city.id) &&
      !hasPendingResearch &&
      availableTreasury >= fertilizerResearchCost &&
      getStructureCount(state, city.id, structureTypeIds.farm, { includePending: true }) >= 2
    ) {
      city.treasury -= fertilizerResearchCost
      bumpStateVersions(state, 'cities')
      setFertilizerResearchTasks([...fertilizerResearchTasks, {
        ownerCityId: city.id,
        startedAt: performance.now(),
        duration: fertilizerResearchDurationMs,
        cost: fertilizerResearchCost,
        paidUpFront: true
      }])
      return true
    }

    if (
      canUseFarming &&
      !canUseChemistry &&
      !hasPendingResearch &&
      availableTreasury >= chemistryResearchCost &&
      getStructureCount(state, city.id, structureTypeIds.farm, { includePending: true }) >= 1
    ) {
      city.treasury -= chemistryResearchCost
      bumpStateVersions(state, 'cities')
      setChemistryResearchTasks([...chemistryResearchTasks, {
        ownerCityId: city.id,
        startedAt: performance.now(),
        duration: chemistryResearchDurationMs,
        cost: chemistryResearchCost,
        paidUpFront: true
      }])
      return true
    }

    if (
      canUseChemistry &&
      !canUseChemicalFertilizer &&
      !hasPendingResearch &&
      availableTreasury >= chemicalFertilizerResearchCost &&
      getStructureCount(state, city.id, structureTypeIds.farm, { includePending: true }) >= 2
    ) {
      city.treasury -= chemicalFertilizerResearchCost
      bumpStateVersions(state, 'cities')
      setChemicalFertilizerResearchTasks([...chemicalFertilizerResearchTasks, {
        ownerCityId: city.id,
        startedAt: performance.now(),
        duration: chemicalFertilizerResearchDurationMs,
        cost: chemicalFertilizerResearchCost,
        paidUpFront: true
      }])
      return true
    }

    if (
      !canUseEngineering &&
      !hasPendingResearch &&
      availableTreasury >= engineeringResearchCost &&
      ownedStructureCount >= 3
    ) {
      city.treasury -= engineeringResearchCost
      bumpStateVersions(state, 'cities')
      setEngineeringResearchTasks([...engineeringResearchTasks, {
        ownerCityId: city.id,
        startedAt: performance.now(),
        duration: engineeringResearchDurationMs,
        cost: engineeringResearchCost,
        paidUpFront: true
      }])
      return true
    }

    if (
      !canUseMining &&
      prospectiveMinePlacement &&
      !hasPendingResearch &&
      availableTreasury >= miningResearchCost &&
      (ownedStructureCount >= 4 || city.treasury >= 45000)
    ) {
      city.treasury -= miningResearchCost
      bumpStateVersions(state, 'cities')
      setMiningResearchTasks([...miningResearchTasks, {
        ownerCityId: city.id,
        startedAt: performance.now(),
        duration: miningResearchDurationMs,
        cost: miningResearchCost,
        paidUpFront: true
      }])
      return true
    }

    if (
      canUseMining &&
      !hasTechnology(state, technologyIds.mineShafts, city.id) &&
      !hasPendingResearch &&
      availableTreasury >= mineShaftsResearchCost &&
      getStructureCount(state, city.id, structureTypeIds.mine, { includePending: true }) >= 2
    ) {
      city.treasury -= mineShaftsResearchCost
      bumpStateVersions(state, 'cities')
      setMineShaftsResearchTasks([...mineShaftsResearchTasks, {
        ownerCityId: city.id,
        startedAt: performance.now(),
        duration: mineShaftsResearchDurationMs,
        cost: mineShaftsResearchCost,
        paidUpFront: true
      }])
      return true
    }

    if (
      !canUseLumbering &&
      prospectiveLumberPlacement &&
      !hasPendingResearch &&
      availableTreasury >= lumberingResearchCost &&
      (ownedStructureCount >= 3 || city.treasury >= 36000)
    ) {
      city.treasury -= lumberingResearchCost
      bumpStateVersions(state, 'cities')
      setLumberingResearchTasks([...lumberingResearchTasks, {
        ownerCityId: city.id,
        startedAt: performance.now(),
        duration: lumberingResearchDurationMs,
        cost: lumberingResearchCost,
        paidUpFront: true
      }])
      return true
    }

    if (hasPendingBuild) {
      return false
    }

    const preferredMinePlacement = canUseMining ? getBestStructurePlacement(city.id, structureTypeIds.mine) : null
    const preferredLumberPlacement = canUseLumbering ? getBestStructurePlacement(city.id, structureTypeIds.lumberCamp) : null
    const preferredFarmPlacement = canUseFarming ? getBestStructurePlacement(city.id, structureTypeIds.farm) : null
    const fallbackForagerCampPlacement = getBestStructurePlacement(city.id, structureTypeIds.foragerCamp)
    const chosenPlacement = preferredMinePlacement ?? preferredLumberPlacement ?? preferredFarmPlacement ?? fallbackForagerCampPlacement
    const chosenStructureType = preferredMinePlacement
      ? structureTypeIds.mine
      : preferredLumberPlacement
        ? structureTypeIds.lumberCamp
      : preferredFarmPlacement
        ? structureTypeIds.farm
        : structureTypeIds.foragerCamp

    if (!chosenPlacement) {
      return false
    }

    const structureCost = getStructureCost(state, city.id, chosenStructureType)

    if (city.treasury < structureCost) {
      return false
    }

    city.treasury -= structureCost
    bumpStateVersions(state, 'cities')

    setStructureBuildTasks([...structureBuildTasks, {
      ownerCityId: city.id,
      startedAt: performance.now(),
      duration: structureBuildDurationMsByType[chosenStructureType],
      structureType: chosenStructureType,
      columnIndex: chosenPlacement.columnIndex,
      rowIndex: chosenPlacement.rowIndex,
      cost: structureCost,
      paidUpFront: true
    }])

    return true
  }

  const updatePlacementHover = event => {
    if (dragCameraState || !placementMode || state.activeTab !== 'buy') {
      return
    }

    const hoveredTile = renderer.getTileAtClientPoint(event.clientX, event.clientY, state.terrain)

    if (!hoveredTile) {
      if (placementMode.hoveredTile) {
        placementMode = {
          ...placementMode,
          hoveredTile: null
        }
      }
      return
    }

    const playerCity = getPlayerCity(state)
    const availability = !playerCity
      ? { valid: false, structureType: null }
      : placementMode.mode === 'demolish'
        ? (() => {
            const demolitionAvailability = getStructureDemolitionAvailability(state, playerCity.id, hoveredTile.columnIndex, hoveredTile.rowIndex)

            return {
              valid: demolitionAvailability.canDemolish,
              structureType: demolitionAvailability.structure?.type ?? null
            }
          })()
        : (() => {
            const placementAvailability = getPlacementAvailabilityForUi(playerCity.id, placementMode.structureType, hoveredTile.columnIndex, hoveredTile.rowIndex)

            return {
              valid: placementAvailability.canPlace,
              structureType: placementMode.structureType
            }
          })()

    if (
      placementMode.hoveredTile?.columnIndex === hoveredTile.columnIndex &&
      placementMode.hoveredTile?.rowIndex === hoveredTile.rowIndex &&
      placementMode.hoveredTile?.valid === availability.valid &&
      placementMode.hoveredTile?.structureType === availability.structureType
    ) {
      return
    }

    placementMode = {
      ...placementMode,
      hoveredTile: {
        ...hoveredTile,
        valid: availability.valid,
        structureType: availability.structureType
      }
    }
  }

  canvas.addEventListener('mousemove', updatePlacementHover)
  canvas.addEventListener('mouseleave', () => {
    if (dragCameraState) {
      return
    }

    if (!placementMode?.hoveredTile) {
      return
    }

    placementMode = {
      ...placementMode,
      hoveredTile: null
    }
  })
  canvas.addEventListener('contextmenu', event => {
    event.preventDefault()
  })
  canvas.addEventListener('wheel', event => {
    const zoomMultiplier = Math.exp(-event.deltaY * 0.0014)

    if (!renderer.zoomAtClientPoint(state, event.clientX, event.clientY, zoomMultiplier)) {
      return
    }

    event.preventDefault()
    uiDirty = true
  }, { passive: false })
  canvas.addEventListener('mousedown', event => {
    const allowPrimaryDrag = event.button === 0 && !(state.activeTab === 'buy' && placementMode)
    const allowAuxiliaryDrag = event.button === 1 || event.button === 2

    if (!allowPrimaryDrag && !allowAuxiliaryDrag) {
      return
    }

    dragCameraState = {
      button: event.button,
      clientX: event.clientX,
      clientY: event.clientY,
      pressClientX: event.clientX,
      pressClientY: event.clientY,
      didPan: false
    }
    canvas.style.cursor = 'grabbing'
    event.preventDefault()
  })
  window.addEventListener('mousemove', event => {
    if (!dragCameraState) {
      return
    }

    const moved = renderer.panByClientDelta(
      state,
      dragCameraState.clientX,
      dragCameraState.clientY,
      event.clientX,
      event.clientY
    )
    const dragDistance = Math.hypot(
      event.clientX - dragCameraState.pressClientX,
      event.clientY - dragCameraState.pressClientY
    )
    const didPan = dragCameraState.didPan || dragDistance >= cameraDragClickThresholdPx

    if (didPan && !dragCameraState.didPan && selectedStructureTile) {
      setSelectedStructure(null)
      uiDirty = true
    }

    dragCameraState = {
      ...dragCameraState,
      clientX: event.clientX,
      clientY: event.clientY,
      didPan
    }

    if (moved) {
      uiDirty = true
    }

    event.preventDefault()
  })
  window.addEventListener('mouseup', () => {
    if (!dragCameraState) {
      return
    }

    suppressNextCanvasClick = dragCameraState.didPan
    dragCameraState = null
    canvas.style.cursor = ''
  })
  canvas.addEventListener('click', event => {
    if (suppressNextCanvasClick) {
      suppressNextCanvasClick = false
      return
    }

    if (!placementMode || state.activeTab !== 'buy') {
      const clickedStructure = renderer.getStructureAtClientPoint(event.clientX, event.clientY, state.structures, state.terrain)

      if (clickedStructure && getStructurePopupData(clickedStructure)) {
        setSelectedStructure(clickedStructure)
        uiDirty = true
        return
      }

      if (selectedStructureTile) {
        setSelectedStructure(null)
        uiDirty = true
      }
      return
    }

    const playerCity = getPlayerCity(state)

    if (!playerCity) {
      return
    }

    const targetTile = renderer.getTileAtClientPoint(event.clientX, event.clientY, state.terrain)

    if (!targetTile) {
      return
    }

    if (placementMode.mode === 'demolish') {
      const demolitionAvailability = getStructureDemolitionAvailability(state, playerCity.id, targetTile.columnIndex, targetTile.rowIndex)

      if (!demolitionAvailability.canDemolish) {
        placementMode = {
          ...placementMode,
          hoveredTile: {
            ...targetTile,
            valid: false,
            structureType: demolitionAvailability.structure?.type ?? null
          }
        }
        statusMessage = getDemolitionFailureMessage(demolitionAvailability.reason)
        uiDirty = true
        return
      }

      const removedStructure = demolishStructure(state, playerCity.id, targetTile.columnIndex, targetTile.rowIndex)

      if (!removedStructure) {
        statusMessage = 'That structure could not be demolished.'
        uiDirty = true
        return
      }

      persist()
      statusMessage = `A ${getStructureLabel(removedStructure.type)} is demolished.`
      placementMode = null
      uiDirty = true
      return
    }

    const availability = getPlacementAvailabilityForUi(
      playerCity.id,
      placementMode.structureType,
      targetTile.columnIndex,
      targetTile.rowIndex
    )

    if (!availability.canPlace) {
      placementMode = {
        ...placementMode,
        hoveredTile: {
          ...targetTile,
          valid: false
        }
      }
      statusMessage = getPlacementFailureMessage(
        placementMode.structureType,
        availability.reason,
        getStructureBuildLimit(placementMode.structureType, state, playerCity.id)
      )
      uiDirty = true
      return
    }

    const structureCost = getStructureCost(state, playerCity.id, placementMode.structureType)

    if (playerCity.treasury < structureCost) {
      statusMessage = getStructureAffordabilityMessage(placementMode.structureType, playerCity.treasury, structureCost)
      triggerTreasuryAlert(`build-${placementMode.structureType}`)
      uiDirty = true
      return
    }

    const startedAt = performance.now()
    playerCity.treasury -= structureCost
    bumpStateVersions(state, 'cities')
    startDisplayMoneyCatchup(startedAt)

    setStructureBuildTasks([...structureBuildTasks, {
      ownerCityId: playerCity.id,
      startedAt,
      duration: structureBuildDurationMsByType[placementMode.structureType],
      structureType: placementMode.structureType,
      columnIndex: targetTile.columnIndex,
      rowIndex: targetTile.rowIndex,
      cost: structureCost,
      paidUpFront: true
    }])
    syncPendingTasksState()
    persist()
    statusMessage = placementMode.structureType === structureTypeIds.farm
      ? 'Builders begin laying out a farm.'
      : placementMode.structureType === structureTypeIds.mine
        ? 'Builders begin opening a mine.'
        : placementMode.structureType === structureTypeIds.lumberCamp
          ? 'Builders begin raising a lumber camp.'
        : 'Builders begin establishing a forager camp.'
    placementMode = null
    uiDirty = true
  })

  const updateDisplayedTreasury = now => {
    const previousDisplayMoney = displayMoney
    const playerCity = getPlayerCity(state)

    if (!playerCity) {
      displayMoney = 0
      displayMoneyState = null
      displayMoneyDirty = displayMoneyDirty || displayMoney !== previousDisplayMoney
      return
    }

    const difference = playerCity.treasury - displayMoney

    if (difference === 0) {
      displayMoney = playerCity.treasury
      displayMoneyState = null
      displayMoneyDirty = displayMoneyDirty || displayMoney !== previousDisplayMoney
      return
    }

    if (!displayMoneyState || displayMoneyState.direction !== Math.sign(difference)) {
      startDisplayMoneyCatchup(now)
    }

    const elapsedSeconds = displayMoneyState?.lastUpdatedAt
      ? Math.min((now - displayMoneyState.lastUpdatedAt) / 1000, 0.12)
      : 1 / 60

    if (!displayMoneyState) {
      return
    }

    displayMoneyState.lastUpdatedAt = now

    const targetTickRate = getDisplayMoneyTickRate(difference)
    const acceleration = displayMoneyAccelerationFloor + Math.pow(Math.max(1, Math.abs(difference)), 0.72) * 18

    if (displayMoneyState.velocity < targetTickRate) {
      displayMoneyState.velocity = Math.min(
        targetTickRate,
        displayMoneyState.velocity + acceleration * elapsedSeconds
      )
    }
    displayMoneyState.carriedSteps += displayMoneyState.velocity * elapsedSeconds

    const stepCount = Math.floor(displayMoneyState.carriedSteps)

    if (stepCount <= 0) {
      return
    }

    displayMoneyState.carriedSteps -= stepCount
    displayMoney += Math.sign(difference) * Math.min(Math.abs(difference), stepCount)

    if (displayMoney === playerCity.treasury) {
      displayMoney = playerCity.treasury
      displayMoneyState = null
    }

    displayMoneyDirty = displayMoneyDirty || displayMoney !== previousDisplayMoney
  }

  const updateTimedSimulation = now => {
    const elapsedMs = lastFrameAt > 0
      ? now - lastFrameAt
      : 0
    lastFrameAt = now

    if (!hasActiveCalendarAdvancingTask()) {
      dayAccumulatorMs = 0
      return
    }

    dayAccumulatorMs += elapsedMs
    let advancedDay = false
    let queuedAiTask = false
    let expiredPlayerOfferCityName = ''
    let acceptedPlayerTradeRouteCityName = ''

    while (dayAccumulatorMs >= dayDurationMs) {
      const {
        expiredTradeRouteOffers = [],
        acceptedTradeRouteBuilds = [],
        exhaustedLumberCamps = []
      } = advanceSimulationDay(state) ?? {}
      const simulationNow = performance.now()

      expiredTradeRouteOffers.forEach(offer => {
        if (offer.fromCityId !== state.playerCityId || expiredPlayerOfferCityName) {
          return
        }

        const targetCity = getCityById(state, offer.toCityId)
        expiredPlayerOfferCityName = targetCity?.name ?? 'that city'
      })

      acceptedTradeRouteBuilds.forEach(tradeRouteBuild => {
        if (!queueTradeRouteBuild(tradeRouteBuild, simulationNow)) {
          return
        }

        queuedAiTask = true

        if (
          !acceptedPlayerTradeRouteCityName &&
          (tradeRouteBuild.requesterCityId === state.playerCityId || tradeRouteBuild.recipientCityId === state.playerCityId)
        ) {
          const otherCityId = tradeRouteBuild.requesterCityId === state.playerCityId
            ? tradeRouteBuild.recipientCityId
            : tradeRouteBuild.requesterCityId
          const otherCity = getCityById(state, otherCityId)
          acceptedPlayerTradeRouteCityName = otherCity?.name ?? 'that city'
        }
      })

      state.cities.forEach(city => {
        queuedAiTask = maybeQueueAiEconomicTask(city) || queuedAiTask
      })

      if (!expiredPlayerOfferCityName) {
        const exhaustedPlayerLumberCampCount = exhaustedLumberCamps.filter(structure => structure.ownerCityId === state.playerCityId).length

        if (exhaustedPlayerLumberCampCount > 0) {
          statusMessage = exhaustedPlayerLumberCampCount === 1
            ? 'A lumber camp exhausted its forest, the tile faded into grassland, and the camp became a derelict.'
            : `${exhaustedPlayerLumberCampCount} lumber camps exhausted their forests, those tiles faded into grassland, and the camps became derelicts.`
        }
      }

      dayAccumulatorMs -= dayDurationMs
      advancedDay = true
      uiDirty = true
    }

    if (!advancedDay) {
      return
    }

    if (queuedAiTask) {
      syncPendingTasksState()
      refreshDerivedState()
    }

    if (acceptedPlayerTradeRouteCityName) {
      statusMessage = `Week ${state.week}, Day ${(state.dayOfWeek ?? 0) + 1}: ${acceptedPlayerTradeRouteCityName} accepts your trade route request. Construction begins.`
    } else if (expiredPlayerOfferCityName) {
      statusMessage = `Week ${state.week}, Day ${(state.dayOfWeek ?? 0) + 1}: ${expiredPlayerOfferCityName} did not answer your trade route request.`
    }

    persist()
  }

  const updateBackgroundTasks = now => {
    const playerCity = getPlayerCity(state)
    const treasuryBefore = playerCity?.treasury ?? 0
    let didCompleteTask = false
    let syncedPendingTasks = false
    let nextStatusMessage = ''

    const completedExplorationTasks = explorationTasks.filter(task => now - task.startedAt >= task.duration)

    if (completedExplorationTasks.length > 0) {
      setExplorationTasks(explorationTasks.filter(task => now - task.startedAt < task.duration))

      completedExplorationTasks.forEach(task => {
        const city = state.cities.find(entry => entry.id === task.ownerCityId)

        if (!city) {
          return
        }

        city.explorationLevel += 1
        city.knowledgeRadiusKm += task.gainKm

        if (city.id === playerCity?.id) {
          nextStatusMessage = task.fullMapRevealed || getExplorationAvailability(state, city.id).reason === 'exhausted'
            ? `Week ${state.week}, Day ${(state.dayOfWeek ?? 0) + 1}: the whole continental plate is revealed.`
            : `Week ${state.week}, Day ${(state.dayOfWeek ?? 0) + 1}: scouts range farther into the plain.`
        }
      })

      bumpStateVersions(state, 'cities')

      didCompleteTask = true
    }

    const completedFarmingResearchTasks = farmingResearchTasks.filter(task => now - task.startedAt >= task.duration)

    if (completedFarmingResearchTasks.length > 0) {
      setFarmingResearchTasks(farmingResearchTasks.filter(task => now - task.startedAt < task.duration))

      completedFarmingResearchTasks.forEach(task => {
        const city = state.cities.find(entry => entry.id === task.ownerCityId)

        if (!city) {
          return
        }

        if (!city.researchedTechnologyIds.includes(technologyIds.farming)) {
          city.researchedTechnologyIds = [...city.researchedTechnologyIds, technologyIds.farming]
        }

        if (city.id === playerCity?.id) {
          nextStatusMessage = `Week ${state.week}, Day ${(state.dayOfWeek ?? 0) + 1}: farming is now understood.`
        }
      })

      bumpStateVersions(state, 'cities')

      didCompleteTask = true
    }

    const completedFertilizerResearchTasks = fertilizerResearchTasks.filter(task => now - task.startedAt >= task.duration)

    if (completedFertilizerResearchTasks.length > 0) {
      setFertilizerResearchTasks(fertilizerResearchTasks.filter(task => now - task.startedAt < task.duration))

      completedFertilizerResearchTasks.forEach(task => {
        const city = state.cities.find(entry => entry.id === task.ownerCityId)

        if (!city) {
          return
        }

        if (!city.researchedTechnologyIds.includes(technologyIds.fertilizer)) {
          city.researchedTechnologyIds = [...city.researchedTechnologyIds, technologyIds.fertilizer]
        }

        if (city.id === playerCity?.id) {
          nextStatusMessage = `Week ${state.week}, Day ${(state.dayOfWeek ?? 0) + 1}: fertilizer techniques are now understood.`
        }
      })

      bumpStateVersions(state, 'cities')

      didCompleteTask = true
    }

    const completedMiningResearchTasks = miningResearchTasks.filter(task => now - task.startedAt >= task.duration)

    if (completedMiningResearchTasks.length > 0) {
      setMiningResearchTasks(miningResearchTasks.filter(task => now - task.startedAt < task.duration))

      completedMiningResearchTasks.forEach(task => {
        const city = state.cities.find(entry => entry.id === task.ownerCityId)

        if (!city) {
          return
        }

        if (!city.researchedTechnologyIds.includes(technologyIds.mining)) {
          city.researchedTechnologyIds = [...city.researchedTechnologyIds, technologyIds.mining]
        }

        if (city.id === playerCity?.id) {
          nextStatusMessage = `Week ${state.week}, Day ${(state.dayOfWeek ?? 0) + 1}: mining is now understood.`
        }
      })

      bumpStateVersions(state, 'cities')

      didCompleteTask = true
    }

    const completedMineShaftsResearchTasks = mineShaftsResearchTasks.filter(task => now - task.startedAt >= task.duration)

    if (completedMineShaftsResearchTasks.length > 0) {
      setMineShaftsResearchTasks(mineShaftsResearchTasks.filter(task => now - task.startedAt < task.duration))

      completedMineShaftsResearchTasks.forEach(task => {
        const city = state.cities.find(entry => entry.id === task.ownerCityId)

        if (!city) {
          return
        }

        if (!city.researchedTechnologyIds.includes(technologyIds.mineShafts)) {
          city.researchedTechnologyIds = [...city.researchedTechnologyIds, technologyIds.mineShafts]
        }

        if (city.id === playerCity?.id) {
          nextStatusMessage = `Week ${state.week}, Day ${(state.dayOfWeek ?? 0) + 1}: mine shafts are now understood.`
        }
      })

      bumpStateVersions(state, 'cities')

      didCompleteTask = true
    }

    const completedLumberingResearchTasks = lumberingResearchTasks.filter(task => now - task.startedAt >= task.duration)

    if (completedLumberingResearchTasks.length > 0) {
      setLumberingResearchTasks(lumberingResearchTasks.filter(task => now - task.startedAt < task.duration))

      completedLumberingResearchTasks.forEach(task => {
        const city = state.cities.find(entry => entry.id === task.ownerCityId)

        if (!city) {
          return
        }

        if (!city.researchedTechnologyIds.includes(technologyIds.lumbering)) {
          city.researchedTechnologyIds = [...city.researchedTechnologyIds, technologyIds.lumbering]
        }

        if (city.id === playerCity?.id) {
          nextStatusMessage = `Week ${state.week}, Day ${(state.dayOfWeek ?? 0) + 1}: logging is now understood.`
        }
      })

      bumpStateVersions(state, 'cities')

      didCompleteTask = true
    }

    const completedChemistryResearchTasks = chemistryResearchTasks.filter(task => now - task.startedAt >= task.duration)

    if (completedChemistryResearchTasks.length > 0) {
      setChemistryResearchTasks(chemistryResearchTasks.filter(task => now - task.startedAt < task.duration))

      completedChemistryResearchTasks.forEach(task => {
        const city = state.cities.find(entry => entry.id === task.ownerCityId)

        if (!city) {
          return
        }

        if (!city.researchedTechnologyIds.includes(technologyIds.chemistry)) {
          city.researchedTechnologyIds = [...city.researchedTechnologyIds, technologyIds.chemistry]
        }

        if (city.id === playerCity?.id) {
          nextStatusMessage = `Week ${state.week}, Day ${(state.dayOfWeek ?? 0) + 1}: chemistry is now understood. Farms cost 10% less.`
        }
      })

      bumpStateVersions(state, 'cities')

      didCompleteTask = true
    }

    const completedChemicalFertilizerResearchTasks = chemicalFertilizerResearchTasks.filter(task => now - task.startedAt >= task.duration)

    if (completedChemicalFertilizerResearchTasks.length > 0) {
      setChemicalFertilizerResearchTasks(chemicalFertilizerResearchTasks.filter(task => now - task.startedAt < task.duration))

      completedChemicalFertilizerResearchTasks.forEach(task => {
        const city = state.cities.find(entry => entry.id === task.ownerCityId)

        if (!city) {
          return
        }

        if (!city.researchedTechnologyIds.includes(technologyIds.chemicalFertilizer)) {
          city.researchedTechnologyIds = [...city.researchedTechnologyIds, technologyIds.chemicalFertilizer]
        }

        if (city.id === playerCity?.id) {
          nextStatusMessage = `Week ${state.week}, Day ${(state.dayOfWeek ?? 0) + 1}: chemical fertilizer is now understood. Your city can now support ${getStructureBuildLimit(structureTypeIds.farm, state, city.id)} farms.`
        }
      })

      bumpStateVersions(state, 'cities')

      didCompleteTask = true
    }

    const completedEngineeringResearchTasks = engineeringResearchTasks.filter(task => now - task.startedAt >= task.duration)

    if (completedEngineeringResearchTasks.length > 0) {
      setEngineeringResearchTasks(engineeringResearchTasks.filter(task => now - task.startedAt < task.duration))

      completedEngineeringResearchTasks.forEach(task => {
        const city = state.cities.find(entry => entry.id === task.ownerCityId)

        if (!city) {
          return
        }

        if (!city.researchedTechnologyIds.includes(technologyIds.engineering)) {
          city.researchedTechnologyIds = [...city.researchedTechnologyIds, technologyIds.engineering]
        }

        if (city.id === playerCity?.id) {
          nextStatusMessage = `Week ${state.week}, Day ${(state.dayOfWeek ?? 0) + 1}: engineering is now understood. Future structures cost 10% less.`
        }
      })

      bumpStateVersions(state, 'cities')

      didCompleteTask = true
    }

    const completedTradeRouteBuildTasks = tradeRouteBuildTasks.filter(task => now - task.startedAt >= task.duration)

    if (completedTradeRouteBuildTasks.length > 0) {
      setTradeRouteBuildTasks(tradeRouteBuildTasks.filter(task => now - task.startedAt < task.duration))

      if (!syncedPendingTasks) {
        syncPendingTasksState()
        syncedPendingTasks = true
      }

      completedTradeRouteBuildTasks.forEach(task => {
        completeTradeRouteBuild(state, task.cityAId, task.cityBId)
      })

      const completedPlayerTradeRouteBuild = completedTradeRouteBuildTasks.find(task => (
        task.requesterCityId === playerCity?.id || task.recipientCityId === playerCity?.id
      ))

      if (completedPlayerTradeRouteBuild) {
        const otherCityId = completedPlayerTradeRouteBuild.requesterCityId === playerCity?.id
          ? completedPlayerTradeRouteBuild.recipientCityId
          : completedPlayerTradeRouteBuild.requesterCityId
        const otherCity = getCityById(state, otherCityId)
        nextStatusMessage = `Week ${state.week}, Day ${(state.dayOfWeek ?? 0) + 1}: the trade route to ${otherCity?.name ?? 'that city'} is complete.`
      }

      didCompleteTask = true
    }

    const completedBuildTasks = structureBuildTasks.filter(task => now - task.startedAt >= task.duration)

    if (completedBuildTasks.length > 0) {
      setStructureBuildTasks(structureBuildTasks.filter(task => now - task.startedAt < task.duration))
      syncPendingTasksState()
      syncedPendingTasks = true

      completedBuildTasks.forEach(task => {
        placeStructure(state, task.ownerCityId, task.structureType, task.columnIndex, task.rowIndex)
      })

      const lastCompletedPlayerBuild = completedBuildTasks.filter(task => task.ownerCityId === playerCity?.id).at(-1)

      if (lastCompletedPlayerBuild) {
        nextStatusMessage = `Week ${state.week}, Day ${(state.dayOfWeek ?? 0) + 1}: a ${getStructureLabel(lastCompletedPlayerBuild.structureType)} is complete.`
      }

      didCompleteTask = true
    }

    const completedWeekPassTasks = weekPassTasks.filter(task => now - task.startedAt >= task.duration)

    if (completedWeekPassTasks.length > 0) {
      setWeekPassTasks(weekPassTasks.filter(task => now - task.startedAt < task.duration))

      if (!syncedPendingTasks) {
        syncPendingTasksState()
        syncedPendingTasks = true
      }

      const completedPlayerWeekPassTask = completedWeekPassTasks.find(task => task.ownerCityId === playerCity?.id)

      if (completedPlayerWeekPassTask && !nextStatusMessage) {
        nextStatusMessage = completedPlayerWeekPassTask.durationDays >= 365
          ? `Week ${state.week}, Day ${(state.dayOfWeek ?? 0) + 1}: a year has passed.`
          : `Week ${state.week}, Day ${(state.dayOfWeek ?? 0) + 1}: a week has passed.`
      }

      didCompleteTask = true
    }

    if (didCompleteTask) {
      if (!syncedPendingTasks) {
        syncPendingTasksState()
      }

      refreshDerivedState()
    }

    if (playerCity && playerCity.treasury !== treasuryBefore) {
      startDisplayMoneyCatchup(now)
    }

    if (didCompleteTask) {
      statusMessage = nextStatusMessage || statusMessage
      persist()
      uiDirty = true
    }
  }

  const renderUi = () => {
    const playerCity = getPlayerCity(state)
    const knownCities = playerCity ? getKnownCities(state, playerCity.id) : []
    const knownCitiesWithDistance = playerCity
      ? knownCities.map(city => getDiplomacyEntryForUi(playerCity, city))
      : []
    const explorationAvailability = playerCity
      ? getExplorationAvailabilityForUi(playerCity)
      : { canExplore: false, reason: 'missing' }
    const playerExplorationTask = playerCity ? getTaskForCity(explorationTasks, playerCity.id) : null
    const explorationProgress = playerExplorationTask
      ? buildProgressState(playerExplorationTask)
      : {
          inProgress: false,
          elapsedMs: 0,
          durationMs: 0
        }
    const farmingResearchAvailability = playerCity
      ? getFarmingResearchAvailabilityForUi(playerCity)
      : {
          canResearch: false,
          reason: 'missing'
        }
    const playerFarmingResearchTask = playerCity ? getTaskForCity(farmingResearchTasks, playerCity.id) : null
    const farmingResearchProgress = playerFarmingResearchTask
      ? buildProgressState(playerFarmingResearchTask)
      : {
          inProgress: false,
          elapsedMs: 0,
          durationMs: 0
        }
    const fertilizerResearchAvailability = playerCity
      ? getFertilizerResearchAvailabilityForUi(playerCity)
      : {
          canResearch: false,
          reason: 'missing'
        }
    const playerFertilizerResearchTask = playerCity ? getTaskForCity(fertilizerResearchTasks, playerCity.id) : null
    const fertilizerResearchProgress = playerFertilizerResearchTask
      ? buildProgressState(playerFertilizerResearchTask)
      : {
          inProgress: false,
          elapsedMs: 0,
          durationMs: 0
        }
    const chemistryResearchAvailability = playerCity
      ? getChemistryResearchAvailabilityForUi(playerCity)
      : {
          canResearch: false,
          reason: 'missing'
        }
    const playerChemistryResearchTask = playerCity ? getTaskForCity(chemistryResearchTasks, playerCity.id) : null
    const chemistryResearchProgress = playerChemistryResearchTask
      ? buildProgressState(playerChemistryResearchTask)
      : {
          inProgress: false,
          elapsedMs: 0,
          durationMs: 0
        }
    const chemicalFertilizerResearchAvailability = playerCity
      ? getChemicalFertilizerResearchAvailabilityForUi(playerCity)
      : {
          canResearch: false,
          reason: 'missing'
        }
    const playerChemicalFertilizerResearchTask = playerCity ? getTaskForCity(chemicalFertilizerResearchTasks, playerCity.id) : null
    const chemicalFertilizerResearchProgress = playerChemicalFertilizerResearchTask
      ? buildProgressState(playerChemicalFertilizerResearchTask)
      : {
          inProgress: false,
          elapsedMs: 0,
          durationMs: 0
        }
    const miningResearchAvailability = playerCity
      ? getMiningResearchAvailabilityForUi(playerCity)
      : {
          canResearch: false,
          reason: 'missing'
        }
    const playerMiningResearchTask = playerCity ? getTaskForCity(miningResearchTasks, playerCity.id) : null
    const miningResearchProgress = playerMiningResearchTask
      ? buildProgressState(playerMiningResearchTask)
      : {
          inProgress: false,
          elapsedMs: 0,
          durationMs: 0
        }
    const mineShaftsResearchAvailability = playerCity
      ? getMineShaftsResearchAvailabilityForUi(playerCity)
      : {
          canResearch: false,
          reason: 'missing'
        }
    const playerMineShaftsResearchTask = playerCity ? getTaskForCity(mineShaftsResearchTasks, playerCity.id) : null
    const mineShaftsResearchProgress = playerMineShaftsResearchTask
      ? buildProgressState(playerMineShaftsResearchTask)
      : {
          inProgress: false,
          elapsedMs: 0,
          durationMs: 0
        }
    const lumberingResearchAvailability = playerCity
      ? getLumberingResearchAvailabilityForUi(playerCity)
      : {
          canResearch: false,
          reason: 'missing'
        }
    const engineeringResearchAvailability = playerCity
      ? getEngineeringResearchAvailabilityForUi(playerCity)
      : {
          canResearch: false,
          reason: 'missing'
        }
    const playerLumberingResearchTask = playerCity ? getTaskForCity(lumberingResearchTasks, playerCity.id) : null
    const lumberingResearchProgress = playerLumberingResearchTask
      ? buildProgressState(playerLumberingResearchTask)
      : {
          inProgress: false,
          elapsedMs: 0,
          durationMs: 0
        }
    const playerEngineeringResearchTask = playerCity ? getTaskForCity(engineeringResearchTasks, playerCity.id) : null
    const engineeringResearchProgress = playerEngineeringResearchTask
      ? buildProgressState(playerEngineeringResearchTask)
      : {
          inProgress: false,
          elapsedMs: 0,
          durationMs: 0
        }
    const playerWeekPassTask = playerCity ? getTaskForCity(weekPassTasks, playerCity.id) : null
    const weekPassProgress = playerWeekPassTask
      ? buildProgressState(playerWeekPassTask)
      : {
          inProgress: false,
          elapsedMs: 0,
          durationMs: 0
        }
    const timePassingProgress = hasActiveCalendarAdvancingTask()
      ? {
          ...weekPassProgress,
          inProgress: true
        }
      : weekPassProgress
    const structureBuildProgress = structureBuildTasks.filter(task => task.ownerCityId === playerCity?.id).map(task => ({
      ...buildProgressState(task),
      label: getStructureLabel(task.structureType),
      locationLabel: `${task.columnIndex + 1}, ${task.rowIndex + 1}`
    }))
    const ongoingTasks = playerCity
      ? [
          ...tradeRouteBuildTasks
            .filter(task => task.requesterCityId === playerCity.id || task.recipientCityId === playerCity.id)
            .map(task => {
              const otherCityId = task.requesterCityId === playerCity.id
                ? task.recipientCityId
                : task.requesterCityId
              const otherCity = getCityById(state, otherCityId)

              return {
                label: `building a trade route to ${otherCity?.name ?? 'that city'}`,
                sortOrder: 9,
                startedAt: task.startedAt
              }
            }),
          ...structureBuildTasks
            .filter(task => task.ownerCityId === playerCity.id)
            .map(task => ({
              label: `building a ${getStructureLabel(task.structureType)} at ${getTaskLocationLatLongLabel(state, task.columnIndex, task.rowIndex)}`,
              sortOrder: 10,
              startedAt: task.startedAt
            })),
          ...[
            [getTaskForCity(explorationTasks, playerCity.id), 'exploring beyond the frontier'],
            [getTaskForCity(farmingResearchTasks, playerCity.id), getResearchTaskLabel(technologyIds.farming)],
            [getTaskForCity(fertilizerResearchTasks, playerCity.id), getResearchTaskLabel(technologyIds.fertilizer)],
            [getTaskForCity(chemistryResearchTasks, playerCity.id), getResearchTaskLabel(technologyIds.chemistry)],
            [getTaskForCity(chemicalFertilizerResearchTasks, playerCity.id), getResearchTaskLabel(technologyIds.chemicalFertilizer)],
            [getTaskForCity(engineeringResearchTasks, playerCity.id), getResearchTaskLabel(technologyIds.engineering)],
            [getTaskForCity(miningResearchTasks, playerCity.id), getResearchTaskLabel(technologyIds.mining)],
            [getTaskForCity(mineShaftsResearchTasks, playerCity.id), getResearchTaskLabel(technologyIds.mineShafts)],
            [getTaskForCity(lumberingResearchTasks, playerCity.id), getResearchTaskLabel(technologyIds.lumbering)],
            [getTaskForCity(weekPassTasks, playerCity.id), getTaskForCity(weekPassTasks, playerCity.id)?.taskLabel ?? 'allowing a week to pass']
          ]
            .filter(([task]) => Boolean(task))
            .map(([task, label], index) => ({
              label,
              sortOrder: 20 + index,
              startedAt: task.startedAt
            }))
        ].sort((firstTask, secondTask) => (
          firstTask.sortOrder - secondTask.sortOrder || firstTask.startedAt - secondTask.startedAt
        ))
      : []
    const cityWeeklyIncomeSummary = playerCity
      ? getCityWeeklyIncomeSummary(state, playerCity.id)
      : null

    ui.render({
      state,
      playerCity,
      offeredCities: offeredCitiesForUi,
      displayedTreasury: displayMoney,
      cityWeeklyIncomeSummary,
      knownCities,
      knownCitiesWithDistance,
      knownCityCount: getPlayerKnownCityCount(state),
      explorationAvailability,
      explorationProgress,
      hasFarmingTechnology: hasTechnology(state, technologyIds.farming, playerCity?.id),
      hasFertilizerTechnology: hasTechnology(state, technologyIds.fertilizer, playerCity?.id),
      hasChemistryTechnology: hasTechnology(state, technologyIds.chemistry, playerCity?.id),
      hasChemicalFertilizerTechnology: hasTechnology(state, technologyIds.chemicalFertilizer, playerCity?.id),
      hasEngineeringTechnology: hasTechnology(state, technologyIds.engineering, playerCity?.id),
      hasMiningTechnology: hasTechnology(state, technologyIds.mining, playerCity?.id),
      hasMineShaftsTechnology: hasTechnology(state, technologyIds.mineShafts, playerCity?.id),
      hasLumberingTechnology: hasTechnology(state, technologyIds.lumbering, playerCity?.id),
      farmingResearchAvailability,
      farmingResearchProgress,
      fertilizerResearchAvailability,
      fertilizerResearchProgress,
      chemistryResearchAvailability,
      chemistryResearchProgress,
      chemicalFertilizerResearchAvailability,
      chemicalFertilizerResearchProgress,
      engineeringResearchAvailability,
      engineeringResearchProgress,
      miningResearchAvailability,
      miningResearchProgress,
      mineShaftsResearchAvailability,
      mineShaftsResearchProgress,
      lumberingResearchAvailability,
      lumberingResearchProgress,
      weekPassProgress: timePassingProgress,
      ongoingTasks,
      structureBuildProgress,
      placementMode,
      flagRenderer,
      statusMessage
    })
  }

  const frame = now => {
    updateDisplayedTreasury(now)
    updateTimedSimulation(now)
    updateBackgroundTasks(now)
    const selectedStructure = getSelectedStructure()
    const visibleStructures = state.structures
    const pendingStructures = getPendingStructures()
    const validPlacementTiles = getValidPlacementTiles()
    const placementPreview = placementMode?.hoveredTile
      ? {
          structureType: placementMode.hoveredTile.structureType ?? placementMode.structureType ?? null,
          columnIndex: placementMode.hoveredTile.columnIndex,
          rowIndex: placementMode.hoveredTile.rowIndex,
          valid: placementMode.hoveredTile.valid
        }
      : null

    renderer.render(state, now, {
      structures: visibleStructures,
      pendingStructures,
      validPlacementTiles,
      placementPreview,
      demolitionMode: placementMode?.mode === 'demolish' && state.activeTab === 'buy'
    })
    ui.renderStructurePopup(getStructurePopupData(selectedStructure))
    updatePerfHud(now)

    if (uiDirty) {
      renderUi()
      uiDirty = false
      displayMoneyDirty = false
    } else if (displayMoneyDirty) {
      ui.updateDisplayedTreasury({
        displayedTreasury: displayMoney,
        activeTab: state.activeTab
      })
      displayMoneyDirty = false
    }

    window.requestAnimationFrame(frame)
  }

  renderUi()
  window.addEventListener('resize', () => {
    uiDirty = true
  })
  window.requestAnimationFrame(frame)
}

void init()

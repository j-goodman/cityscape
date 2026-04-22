const saveVersion = 1
const storageKey = 'cityscape-save-v1'

export const serializeState = state => ({
  version: saveVersion,
  savedAt: new Date().toISOString(),
  state: {
    week: state.week,
    dayOfWeek: state.dayOfWeek,
    playerCityId: state.playerCityId,
    activeTab: state.activeTab,
    introDismissed: state.introDismissed,
    startingOptionIds: state.startingOptionIds,
    researchedTechnologies: state.researchedTechnologies,
    structures: state.structures,
    tradeRoutes: state.tradeRoutes,
    tradeRouteOffers: state.tradeRouteOffers,
    pendingTasks: state.pendingTasks,
    cities: state.cities.map(city => city.toJSON()),
    terrain: state.terrain
  }
})

export const saveToLocalStorage = state => {
  localStorage.setItem(storageKey, JSON.stringify(serializeState(state)))
}

export const loadFromLocalStorage = () => {
  const rawValue = localStorage.getItem(storageKey)

  if (!rawValue) {
    return null
  }

  return validateSavePayload(JSON.parse(rawValue))
}

export const clearLocalSave = () => {
  localStorage.removeItem(storageKey)
}

export const validateSavePayload = payload => {
  if (!payload || payload.version !== saveVersion || !payload.state) {
    throw new Error('Save file format is not recognized')
  }

  const { state } = payload

  if (!Array.isArray(state.cities) || !state.terrain || typeof state.week !== 'number') {
    throw new Error('Save file is missing required game data')
  }

  return payload
}

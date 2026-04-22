const startingTreasury = 250
export const explorationCostOpening = 50
export const explorationCostBase = 3000
export const explorationCostMaximum = 250000
export const explorationGainBaseKm = 220
export const explorationGainStepKm = 35

export class City {
  constructor({
    id,
    sourceId,
    name,
    flag,
    latitude,
    longitude,
    population,
    country,
    treasury = startingTreasury,
    knowledgeRadiusKm = 0,
    explorationLevel = 0,
    researchedTechnologyIds = [],
    resourceAccessScore = 0,
    resourceAccessLabel = 'average resource access'
  }) {
    this.id = id
    this.sourceId = sourceId
    this.name = name
    this.flag = flag
    this.latitude = latitude
    this.longitude = longitude
    this.population = population
    this.country = country
    this.treasury = treasury
    this.knowledgeRadiusKm = knowledgeRadiusKm
    this.explorationLevel = explorationLevel
    this.researchedTechnologyIds = researchedTechnologyIds
    this.resourceAccessScore = resourceAccessScore
    this.resourceAccessLabel = resourceAccessLabel
  }

  getExplorationCost = () => explorationCostBase

  getExplorationGainKm = () => Math.round(explorationGainBaseKm + this.explorationLevel * explorationGainStepKm)

  canAffordExploration = () => this.treasury >= this.getExplorationCost()

  fundExploration = () => {
    const cost = this.getExplorationCost()

    if (this.treasury < cost) {
      return null
    }

    const gainKm = this.getExplorationGainKm()

    this.treasury -= cost
    this.explorationLevel += 1
    this.knowledgeRadiusKm += gainKm

    return {
      cost,
      gainKm,
      treasury: this.treasury,
      knowledgeRadiusKm: this.knowledgeRadiusKm
    }
  }

  toJSON = () => ({
    id: this.id,
    sourceId: this.sourceId,
    name: this.name,
    flag: this.flag,
    latitude: this.latitude,
    longitude: this.longitude,
    population: this.population,
    country: this.country,
    treasury: this.treasury,
    knowledgeRadiusKm: this.knowledgeRadiusKm,
    explorationLevel: this.explorationLevel,
    researchedTechnologyIds: this.researchedTechnologyIds,
    resourceAccessScore: this.resourceAccessScore,
    resourceAccessLabel: this.resourceAccessLabel
  })

  static fromJSON = data => new City(data)
}

export const getStartingTreasury = () => startingTreasury

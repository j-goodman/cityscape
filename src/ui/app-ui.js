import { textContent } from '../data/text-content.js'
import {
  chemicalFertilizerResearchCost,
  chemicalFertilizerResearchDurationMs,
  chemistryResearchCost,
  chemistryResearchDurationMs,
  farmingResearchCost,
  farmingResearchDurationMs,
  engineeringResearchCost,
  engineeringResearchDurationMs,
  fertilizerResearchCost,
  fertilizerResearchDurationMs,
  getExplorationCost,
  getExplorationDurationDays,
  getEngineeringResearchAvailability,
  getStructureBuildLimit,
  getStructureCount,
  getStructureCost,
  getStructureWeeklyIncome,
  getStructuresForCity,
  lumberingResearchCost,
  lumberingResearchDurationMs,
  miningResearchCost,
  miningResearchDurationMs,
  mineShaftsResearchCost,
  mineShaftsResearchDurationMs,
  structureTypeIds
} from '../core/world.js'
import { formatCurrency, formatNumber } from '../core/utils.js'

const tabs = ['city', 'buy', 'research', 'diplomacy', 'calendar']

const getOrdinalNumberLabel = value => {
  const absoluteValue = Math.abs(value)
  const remainderHundred = absoluteValue % 100

  if (remainderHundred >= 11 && remainderHundred <= 13) {
    return `${value}th`
  }

  const remainderTen = absoluteValue % 10

  if (remainderTen === 1) {
    return `${value}st`
  }

  if (remainderTen === 2) {
    return `${value}nd`
  }

  if (remainderTen === 3) {
    return `${value}rd`
  }

  return `${value}th`
}

const getCalendarDateLabel = state => {
  const dayNumber = (state.dayOfWeek ?? 0) + 1
  const weekNumber = (state.week ?? 0) + 1

  if (weekNumber <= 52) {
    return `It's the ${getOrdinalNumberLabel(dayNumber)} day of the ${getOrdinalNumberLabel(weekNumber)} week.`
  }

  const yearNumber = Math.floor((weekNumber - 1) / 52)
  const weekOfYear = ((weekNumber - 1) % 52) + 1

  return `It's the ${getOrdinalNumberLabel(dayNumber)} day of the ${getOrdinalNumberLabel(weekOfYear)} week of the ${getOrdinalNumberLabel(yearNumber)} year.`
}

const renderProgressTrack = progress => {
  const progressDelayMs = Math.round(-(progress?.elapsedMs ?? 0))
  const progressDurationMs = Math.max(0, Math.round(progress?.durationMs ?? 0))

  return `
    <div class="progress-track" aria-hidden="true">
      <div class="progress-fill progress-fill-animated" style="animation-duration: ${progressDurationMs}ms; animation-delay: ${progressDelayMs}ms;"></div>
    </div>
  `
}

const getResearchDurationDaysLabel = durationMs => {
  const durationDays = Math.max(1, Math.round(durationMs / 1000))

  return `${durationDays} ${durationDays === 1 ? 'day' : 'days'}`
}

const renderOngoingTaskList = ongoingTasks => {
  if (!ongoingTasks?.length) {
    return ''
  }

  return `
    <div class="project-list">
      ${ongoingTasks.map(task => `
        <div class="project-card">
          <p class="panel-copy">-> ${task.label}</p>
        </div>
      `).join('')}
    </div>
  `
}

const renderCityIncomeSummary = cityWeeklyIncomeSummary => {
  if (!cityWeeklyIncomeSummary) {
    return ''
  }

  return `
    <div class="income-summary">
      <div class="income-summary-header">
        <p class="income-summary-label">${textContent.cityWeeklyIncomeTotalLabel}</p>
        <p class="income-summary-total">${formatCurrency(cityWeeklyIncomeSummary.totalWeeklyIncome)}</p>
      </div>
      <div class="income-summary-list">
        <div class="income-summary-row">
          <span>${textContent.cityIncomeFarmsLabel} (${cityWeeklyIncomeSummary.farms.count})</span>
          <span>${formatCurrency(cityWeeklyIncomeSummary.farms.weeklyIncome)}</span>
        </div>
        <div class="income-summary-row">
          <span>${textContent.cityIncomeMinesLabel} (${cityWeeklyIncomeSummary.mines.count})</span>
          <span>${formatCurrency(cityWeeklyIncomeSummary.mines.weeklyIncome)}</span>
        </div>
        <div class="income-summary-row">
          <span>${textContent.cityIncomeLumberCampsLabel} (${cityWeeklyIncomeSummary.lumberCamps.count})</span>
          <span>${formatCurrency(cityWeeklyIncomeSummary.lumberCamps.weeklyIncome)}</span>
        </div>
        <div class="income-summary-row">
          <span>${textContent.cityIncomeForagerCampsLabel} (${cityWeeklyIncomeSummary.foragerCamps.count})</span>
          <span>${formatCurrency(cityWeeklyIncomeSummary.foragerCamps.weeklyIncome)}</span>
        </div>
        <div class="income-summary-row">
          <span>${textContent.cityIncomeTradeRoutesLabel} (${cityWeeklyIncomeSummary.tradeRoutes.length})</span>
          <span>${formatCurrency(cityWeeklyIncomeSummary.tradeRoutesWeeklyIncome)}</span>
        </div>
      </div>
      ${cityWeeklyIncomeSummary.tradeRoutes.length
        ? `
          <div class="income-summary-route-list">
            ${cityWeeklyIncomeSummary.tradeRoutes.map(tradeRoute => `
              <div class="income-summary-row income-summary-row-detail">
                <span>${tradeRoute.cityName}</span>
                <span>${formatCurrency(tradeRoute.weeklyIncome)}</span>
              </div>
            `).join('')}
          </div>
        `
        : `<p class="panel-copy">${textContent.cityIncomeNoTradeRoutesLabel}</p>`}
    </div>
  `
}

const getClassName = (...classNames) => classNames.filter(Boolean).join(' ')

const renderTreasuryAlertCopy = (content, alertKey) => `
  <p class="panel-copy" data-ui-role="treasury-alert-target" data-ui-alert-key="${alertKey}">${content}</p>
`

export class AppUI {
  constructor({ documentRoot, callbacks }) {
    this.documentRoot = documentRoot
    this.callbacks = callbacks
    this.localRunNote = documentRoot.getElementById('local-run-note')
    this.gameShell = documentRoot.getElementById('game-shell')
    this.canvasFrame = documentRoot.querySelector('.canvas-frame')
    this.mapCanvas = documentRoot.getElementById('map')
    this.structurePopup = documentRoot.getElementById('structure-popup')
    this.sidePanel = documentRoot.getElementById('side-panel')
    this.introOverlay = documentRoot.getElementById('intro-overlay')
    this.topStrip = documentRoot.getElementById('top-strip')
    this.playerSummary = documentRoot.getElementById('player-summary')
    this.tabBar = documentRoot.getElementById('tab-bar')
    this.panelBody = documentRoot.getElementById('panel-body')
    this.saveButton = documentRoot.querySelector('[data-action="new-world"]')
    this.statusLine = documentRoot.getElementById('status-line')
    this.renderedTabMarkup = ''
    this.treasuryAlertUntil = 0
    this.treasuryAlertKey = null
    this.treasuryAlertTimeoutId = null

    documentRoot.addEventListener('click', this.handleClick)
  }

  isTreasuryAlertActive = () => performance.now() < this.treasuryAlertUntil

  applyTreasuryAlertState = () => {
    const alertActive = this.isTreasuryAlertActive()
    const playerSummaryMoney = this.playerSummary.querySelector('[data-ui-role="player-summary-money"]')

    if (playerSummaryMoney) {
      playerSummaryMoney.classList.toggle('is-alerting', alertActive)
    }

    this.panelBody.querySelectorAll('[data-ui-role="treasury-alert-target"]').forEach(target => {
      const targetKey = target.dataset.uiAlertKey
      const shouldAlert = alertActive && (!this.treasuryAlertKey || targetKey === this.treasuryAlertKey)

      target.classList.toggle('is-alerting', shouldAlert)
    })
  }

  triggerTreasuryAlert = (durationMs = 1600, alertKey = null) => {
    this.treasuryAlertUntil = performance.now() + durationMs
    this.treasuryAlertKey = alertKey

    if (this.treasuryAlertTimeoutId) {
      window.clearTimeout(this.treasuryAlertTimeoutId)
    }

    this.applyTreasuryAlertState()

    this.treasuryAlertTimeoutId = window.setTimeout(() => {
      this.treasuryAlertTimeoutId = null
      this.treasuryAlertKey = null
      this.applyTreasuryAlertState()
    }, durationMs)
  }

  handleClick = event => {
    const actionElement = event.target.closest('[data-action]')

    if (!actionElement) {
      return
    }

    const { action, cityId, tabId } = actionElement.dataset

    if (action !== 'new-world') {
      this.callbacks.onCancelNewWorldConfirmation?.()
    }

    if (action === 'choose-city' && cityId) {
      this.callbacks.onChooseCity(Number(cityId))
      return
    }

    if (action === 'set-tab' && tabId) {
      this.callbacks.onSetTab(tabId)
      return
    }

    if (action === 'explore') {
      this.callbacks.onExplore()
      return
    }

    if (action === 'research-farming') {
      this.callbacks.onResearchFarming()
      return
    }

    if (action === 'research-fertilizer') {
      this.callbacks.onResearchFertilizer()
      return
    }

    if (action === 'research-chemistry') {
      this.callbacks.onResearchChemistry()
      return
    }

    if (action === 'research-chemical-fertilizer') {
      this.callbacks.onResearchChemicalFertilizer()
      return
    }

    if (action === 'research-engineering') {
      this.callbacks.onResearchEngineering()
      return
    }

    if (action === 'research-mining') {
      this.callbacks.onResearchMining()
      return
    }

    if (action === 'research-mine-shafts') {
      this.callbacks.onResearchMineShafts()
      return
    }

    if (action === 'research-lumbering') {
      this.callbacks.onResearchLumbering()
      return
    }

    if (action === 'place-structure') {
      this.callbacks.onPlaceStructure(actionElement.dataset.structureType)
      return
    }

    if (action === 'demolish-structure') {
      this.callbacks.onDemolishStructure()
      return
    }

    if (action === 'pass-week') {
      this.callbacks.onPassWeek()
      return
    }

    if (action === 'pass-month') {
      this.callbacks.onPassMonth()
      return
    }

    if (action === 'build-trade-route' && cityId) {
      this.callbacks.onBuildTradeRoute(Number(cityId))
      return
    }

    if (action === 'offer-trade-route-split' && cityId) {
      this.callbacks.onOfferTradeRouteSplit(Number(cityId))
      return
    }

    if (action === 'accept-trade-route-offer' && cityId) {
      this.callbacks.onAcceptTradeRouteOffer(Number(cityId))
      return
    }

    if (action === 'decline-trade-route-offer' && cityId) {
      this.callbacks.onDeclineTradeRouteOffer(Number(cityId))
      return
    }

    if (action === 'structure-popup-action') {
      this.callbacks.onStructurePopupAction?.(actionElement.dataset.structureActionId)
      return
    }

    if (action === 'new-world') {
      this.callbacks.onNewWorld()
      return
    }
  }

  renderStructurePopup = structurePopup => {
    if (!this.structurePopup || !this.canvasFrame || !this.mapCanvas) {
      return
    }

    if (!structurePopup?.anchor || !structurePopup?.viewport) {
      this.structurePopup.hidden = true
      this.structurePopup.innerHTML = ''
      this.structurePopup.dataset.placement = 'above'
      return
    }

    const actions = structurePopup.actions ?? []

    this.structurePopup.hidden = false
    this.structurePopup.innerHTML = `
      <p class="structure-popup-kicker">Structure</p>
      <h3 class="structure-popup-title">${structurePopup.structureLabel}</h3>
      <p class="structure-popup-copy"><span class="structure-popup-city" style="color: ${structurePopup.ownerColor};">${structurePopup.ownerName}</span></p>
      <div class="structure-popup-actions" ${actions.length ? '' : 'hidden'}>
        ${actions.map(action => `
          <button class="structure-popup-action" type="button" data-action="structure-popup-action" data-structure-action-id="${action.id}" ${action.disabled ? 'disabled' : ''} title="${action.title ?? ''}">
            ${action.label}
          </button>
        `).join('')}
      </div>
    `

    const canvasRectangle = this.mapCanvas.getBoundingClientRect()
    const frameRectangle = this.canvasFrame.getBoundingClientRect()

    if (!canvasRectangle.width || !canvasRectangle.height || !frameRectangle.width || !frameRectangle.height) {
      this.structurePopup.hidden = true
      return
    }

    const anchorX = canvasRectangle.left - frameRectangle.left + (structurePopup.anchor.x / structurePopup.viewport.width) * canvasRectangle.width
    const anchorY = canvasRectangle.top - frameRectangle.top + (structurePopup.anchor.y / structurePopup.viewport.height) * canvasRectangle.height
    const popupWidth = this.structurePopup.offsetWidth
    const popupHeight = this.structurePopup.offsetHeight
    const edgePadding = 10
    const pointerGap = 12
    const left = Math.max(edgePadding, Math.min(anchorX - popupWidth * 0.5, frameRectangle.width - popupWidth - edgePadding))
    const preferredTop = anchorY - popupHeight - pointerGap
    const top = preferredTop >= edgePadding
      ? preferredTop
      : Math.min(frameRectangle.height - popupHeight - edgePadding, anchorY + pointerGap)

    this.structurePopup.style.left = `${left}px`
    this.structurePopup.style.top = `${top}px`
    this.structurePopup.dataset.placement = preferredTop >= edgePadding ? 'above' : 'below'
  }

  showLocalRunNote = () => {
    this.localRunNote.hidden = false
    this.gameShell.hidden = true
  }

  renderIntro = ({ offeredCities, flagRenderer }) => {
    this.introOverlay.hidden = false
    this.introOverlay.innerHTML = `
      <div class="intro-card">
        <h1 class="intro-title">${textContent.title}</h1>
        <div class="intro-double-break" aria-hidden="true"></div>
        <p class="intro-copy intro-copy-special">${textContent.opening}</p>
        <div class="intro-double-break" aria-hidden="true"></div>
        <p class="intro-copy intro-copy-secondary">${textContent.introPrompt}</p>
        <div class="intro-options">
          ${offeredCities.map(city => `
            <button class="city-option" data-action="choose-city" data-city-id="${city.id}">
              <img class="city-option-crest" src="${flagRenderer.getFlagDataUrl(city.flag)}" alt="${city.name} crest">
              <span class="city-option-name">${city.name}</span>
              <span class="city-option-meta">${city.resourceAccessLabel}</span>
              <span class="city-option-meta">${city.closeNeighborCount ?? 0} close neighbor${(city.closeNeighborCount ?? 0) === 1 ? '' : 's'}.</span>
              <span class="city-option-meta">population ${formatNumber(city.population)}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `
  }

  renderTopStrip = ({ playerCity, knownCityCount, state }) => {
    this.topStrip.innerHTML = playerCity
      ? `
        <div class="strip-chip">Week ${state.week} Day ${(state.dayOfWeek ?? 0) + 1}</div>
        <div class="strip-chip">${playerCity.name}</div>
        <div class="strip-chip">Known cities ${knownCityCount}</div>
        <div class="strip-chip">Knowledge ${formatNumber(playerCity.knowledgeRadiusKm)} km</div>
      `
      : `
        <div class="strip-chip">Generated world</div>
        <div class="strip-chip">16 city-states</div>
        <div class="strip-chip">Choose your seat of rule</div>
      `
  }

  renderTabs = ({ playerCity, state }) => {
    const cityLabel = playerCity ? playerCity.name.toUpperCase() : 'CITY'
    const labelByTab = {
      city: cityLabel,
      buy: 'BUILD',
      research: 'RESEARCH',
      diplomacy: 'DIPLOMACY',
      calendar: 'CALENDAR'
    }

    const markup = tabs.map(tabId => `
      <button class="tab-button ${state.activeTab === tabId ? 'is-active' : ''}" data-action="set-tab" data-tab-id="${tabId}">
        ${labelByTab[tabId]}
      </button>
    `).join('')

    if (markup === this.renderedTabMarkup) {
      return
    }

    this.renderedTabMarkup = markup
    this.tabBar.innerHTML = markup
  }

  renderPlayerSummary = ({ playerCity, displayedTreasury, flagRenderer }) => {
    if (!playerCity) {
      this.playerSummary.hidden = true
      this.playerSummary.innerHTML = ''
      return
    }

    this.playerSummary.hidden = false
    this.playerSummary.innerHTML = `
      <img class="player-summary-crest" src="${flagRenderer.getFlagDataUrl(playerCity.flag)}" alt="${playerCity.name} crest">
      <div class="player-summary-copy">
        <p class="player-summary-name">${playerCity.name}</p>
        <p class="player-summary-money" data-ui-role="player-summary-money">${formatCurrency(displayedTreasury)}</p>
      </div>
    `

    this.applyTreasuryAlertState()
  }

  updateDisplayedTreasury = ({ displayedTreasury, activeTab }) => {
    const formattedTreasury = formatCurrency(displayedTreasury)
    const playerSummaryMoney = this.playerSummary.querySelector('[data-ui-role="player-summary-money"]')

    if (playerSummaryMoney) {
      playerSummaryMoney.textContent = formattedTreasury
    }

    this.applyTreasuryAlertState()

    if (activeTab !== 'city') {
      return
    }

    const cityTreasuryValue = this.panelBody.querySelector('[data-ui-role="city-treasury"]')

    if (cityTreasuryValue) {
      cityTreasuryValue.textContent = formattedTreasury
    }
  }

  renderPanelBody = ({
    state,
    playerCity,
    displayedTreasury,
    cityWeeklyIncomeSummary,
    knownCities,
    knownCitiesWithDistance,
    flagRenderer,
    explorationAvailability,
    explorationProgress,
    hasFarmingTechnology,
    hasFertilizerTechnology,
    hasChemistryTechnology,
    hasChemicalFertilizerTechnology,
    hasEngineeringTechnology,
    hasMiningTechnology,
    hasMineShaftsTechnology,
    hasLumberingTechnology,
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
    weekPassProgress,
    ongoingTasks,
    structureBuildProgress,
    placementMode
  }) => {
    if (!playerCity) {
      this.sidePanel.hidden = true
      this.playerSummary.hidden = true
      this.panelBody.innerHTML = ''
      this.tabBar.innerHTML = ''
      this.renderedTabMarkup = ''
      this.renderStructurePopup(null)
      return
    }

    this.sidePanel.hidden = false
    this.renderTabs({ playerCity, state })

    if (state.activeTab === 'city') {
      this.panelBody.innerHTML = `
        <section class="panel-section city-panel">
          <img class="panel-crest" src="${flagRenderer.getFlagDataUrl(playerCity.flag)}" alt="${playerCity.name} crest">
          <p class="panel-intro">${textContent.cityTabIntro}</p>
          <dl class="stat-grid">
            <div>
              <dt>Treasury</dt>
              <dd data-ui-role="city-treasury">${formatCurrency(displayedTreasury)}</dd>
            </div>
            <div>
              <dt>Population</dt>
              <dd>${formatNumber(playerCity.population)}</dd>
            </div>
            <div>
              <dt>Knowledge radius</dt>
              <dd>${formatNumber(playerCity.knowledgeRadiusKm)} km</dd>
            </div>
            <div>
              <dt>Known cities</dt>
              <dd>${knownCities.length}</dd>
            </div>
          </dl>
          <div class="income-summary-card">
            <p class="panel-intro">${textContent.cityWeeklyIncomeLabel}</p>
            ${renderCityIncomeSummary(cityWeeklyIncomeSummary)}
          </div>
        </section>
      `
      return
    }

    if (state.activeTab === 'buy') {
      const placingForagerCamp = placementMode?.structureType === structureTypeIds.foragerCamp
      const placingFarm = placementMode?.structureType === structureTypeIds.farm
      const placingMine = placementMode?.structureType === structureTypeIds.mine
      const placingLumberCamp = placementMode?.structureType === structureTypeIds.lumberCamp
      const demolishingStructure = placementMode?.mode === 'demolish'
      const foragerCampCostValue = getStructureCost(state, playerCity.id, structureTypeIds.foragerCamp)
      const farmCostValue = getStructureCost(state, playerCity.id, structureTypeIds.farm)
      const mineCostValue = getStructureCost(state, playerCity.id, structureTypeIds.mine)
      const lumberCampCostValue = getStructureCost(state, playerCity.id, structureTypeIds.lumberCamp)
      const foragerCampCost = formatCurrency(foragerCampCostValue)
      const farmCost = formatCurrency(farmCostValue)
      const mineCost = formatCurrency(mineCostValue)
      const lumberCampCost = formatCurrency(lumberCampCostValue)
      const foragerCampWeeklyIncome = formatCurrency(getStructureWeeklyIncome(structureTypeIds.foragerCamp))
      const farmWeeklyIncome = formatCurrency(getStructureWeeklyIncome(structureTypeIds.farm))
      const mineWeeklyIncome = formatCurrency(getStructureWeeklyIncome(structureTypeIds.mine))
      const lumberCampWeeklyIncome = formatCurrency(getStructureWeeklyIncome(structureTypeIds.lumberCamp))
      const foragerCampCount = getStructureCount(state, playerCity.id, structureTypeIds.foragerCamp, { includePending: true })
      const farmCount = getStructureCount(state, playerCity.id, structureTypeIds.farm, { includePending: true })
      const mineCount = getStructureCount(state, playerCity.id, structureTypeIds.mine, { includePending: true })
      const lumberCampCount = getStructureCount(state, playerCity.id, structureTypeIds.lumberCamp, { includePending: true })
      const ownedStructureCount = getStructuresForCity(state, playerCity.id).length
      const foragerCampLimit = getStructureBuildLimit(structureTypeIds.foragerCamp)
      const farmLimit = getStructureBuildLimit(structureTypeIds.farm, state, playerCity.id)
      const mineLimit = getStructureBuildLimit(structureTypeIds.mine, state, playerCity.id)
      const lumberCampLimit = getStructureBuildLimit(structureTypeIds.lumberCamp, state, playerCity.id)
      const canPlaceForagerCamp = foragerCampCount < foragerCampLimit
      const canPlaceFarm = farmCount < farmLimit
      const canPlaceMine = mineCount < mineLimit
      const canPlaceLumberCamp = lumberCampCount < lumberCampLimit
      const foragerCampUnaffordable = canPlaceForagerCamp && !placingForagerCamp && playerCity.treasury < foragerCampCostValue
      const farmUnaffordable = hasFarmingTechnology && canPlaceFarm && !placingFarm && playerCity.treasury < farmCostValue
      const mineUnaffordable = hasMiningTechnology && canPlaceMine && !placingMine && playerCity.treasury < mineCostValue
      const lumberCampUnaffordable = hasLumberingTechnology && canPlaceLumberCamp && !placingLumberCamp && playerCity.treasury < lumberCampCostValue

      this.panelBody.innerHTML = `
        <section class="panel-section">
          <p class="panel-intro">${textContent.buyTabIntro}</p>
          <div class="action-stack">
            <button class="${getClassName('action-button', placingForagerCamp && 'is-active', foragerCampUnaffordable && 'is-unaffordable')}" data-action="place-structure" data-structure-type="solar-farm" ${!placingForagerCamp && !canPlaceForagerCamp ? 'disabled' : ''}>
              ${placingForagerCamp ? 'Cancel Forager Camp' : `Build Forager Camp (${foragerCampCount}/${foragerCampLimit})`}
            </button>
            ${canPlaceForagerCamp
              ? renderTreasuryAlertCopy(`${textContent.buyPriceLabel} ${foragerCampCost} · ${textContent.buyWeeklyIncomeLabel} ${foragerCampWeeklyIncome}.`, `build-${structureTypeIds.foragerCamp}`)
              : `<p class="panel-copy">${textContent.buyForagerCampLimitReached}</p>`}
          </div>
          <div class="action-stack">
            <button class="${getClassName('action-button', placingFarm && 'is-active', farmUnaffordable && 'is-unaffordable')}" data-action="place-structure" data-structure-type="farm" ${hasFarmingTechnology && (placingFarm || canPlaceFarm) ? '' : 'disabled'}>
              ${placingFarm ? 'Cancel Farm' : `Build Farm (${farmCount}/${farmLimit})`}
            </button>
            ${hasFarmingTechnology
              ? canPlaceFarm
                ? renderTreasuryAlertCopy(`${textContent.buyPriceLabel} ${farmCost} · ${textContent.buyWeeklyIncomeLabel} ${farmWeeklyIncome}. ${textContent.buyFarmTerrainRequirement}`, `build-${structureTypeIds.farm}`)
                : `<p class="panel-copy">${textContent.buyFarmLimitReached(farmLimit)}</p>`
              : `<p class="panel-copy">${textContent.buyFarmUnlockRequirement}</p>`}
          </div>
          <div class="action-stack">
            <button class="${getClassName('action-button', placingMine && 'is-active', mineUnaffordable && 'is-unaffordable')}" data-action="place-structure" data-structure-type="mine" ${hasMiningTechnology && (placingMine || canPlaceMine) ? '' : 'disabled'}>
              ${placingMine ? 'Cancel Mine' : `Build Mine (${mineCount}/${mineLimit})`}
            </button>
            ${hasMiningTechnology
              ? canPlaceMine
                ? renderTreasuryAlertCopy(`${textContent.buyPriceLabel} ${mineCost} · ${textContent.buyWeeklyIncomeLabel} ${mineWeeklyIncome}. ${textContent.buyMineTerrainRequirement}`, `build-${structureTypeIds.mine}`)
                : `<p class="panel-copy">${textContent.buyMineLimitReached(mineLimit)}</p>`
              : `<p class="panel-copy">${textContent.buyMineUnlockRequirement}</p>`}
          </div>
          <div class="action-stack">
            <button class="${getClassName('action-button', placingLumberCamp && 'is-active', lumberCampUnaffordable && 'is-unaffordable')}" data-action="place-structure" data-structure-type="lumber-camp" ${hasLumberingTechnology && (placingLumberCamp || canPlaceLumberCamp) ? '' : 'disabled'}>
              ${placingLumberCamp ? 'Cancel Lumber Camp' : `Build Lumber Camp (${lumberCampCount}/${lumberCampLimit})`}
            </button>
            ${hasLumberingTechnology
              ? canPlaceLumberCamp
                ? renderTreasuryAlertCopy(`${textContent.buyPriceLabel} ${lumberCampCost} · ${textContent.buyWeeklyIncomeLabel} ${lumberCampWeeklyIncome}. ${textContent.buyLumberCampTerrainRequirement}`, `build-${structureTypeIds.lumberCamp}`)
                : `<p class="panel-copy">${textContent.buyLumberCampLimitReached(lumberCampLimit)}</p>`
              : `<p class="panel-copy">${textContent.buyLumberCampUnlockRequirement}</p>`}
          </div>
          <p class="panel-copy">${placementMode
            ? placementMode.mode === 'demolish'
              ? 'Click one of your structures to demolish it permanently.'
              : placementMode.structureType === structureTypeIds.farm
              ? 'Click a highlighted tile to place a farm.'
              : placementMode.structureType === structureTypeIds.mine
                ? 'Click a highlighted tile to place a mine.'
                : placementMode.structureType === structureTypeIds.lumberCamp
                  ? 'Click a highlighted tile to place a lumber camp.'
              : 'Click a highlighted tile to place a forager camp.'
            : ''}</p>
          ${structureBuildProgress.length
            ? `
              <div class="project-list">
                ${structureBuildProgress.map(task => `
                  <div class="project-card">
                    ${renderProgressTrack(task)}
                  </div>
                `).join('')}
              </div>
            `
            : ''}
          <div class="action-stack">
            <button class="action-button ${demolishingStructure ? 'is-active' : ''}" data-action="demolish-structure" ${!demolishingStructure && ownedStructureCount === 0 ? 'disabled' : ''}>
              ${demolishingStructure ? 'Cancel Demolition' : 'Demolish Existing Structure'}
            </button>
            <p class="panel-copy">${ownedStructureCount > 0
              ? 'Remove one completed structure you built. No refund.'
              : 'You have no completed structures available to demolish.'}</p>
          </div>
        </section>
      `
      return
    }

    if (state.activeTab === 'research') {
      const explorationCost = getExplorationCost(state, playerCity.id)
      const explorationDurationDays = explorationProgress?.durationMs
        ? Math.max(1, Math.round(explorationProgress.durationMs / 1000))
        : getExplorationDurationDays(state, playerCity.id)
      const canExplore = (explorationAvailability?.canExplore ?? false) && !explorationProgress?.inProgress
      const canTriggerExplore = canExplore || explorationAvailability?.reason === 'unaffordable'
      const showExplorationCostLine = explorationProgress?.inProgress || explorationAvailability?.reason !== 'exhausted'
      const explorationMessage = explorationAvailability?.reason === 'exhausted'
        ? textContent.researchExhaustedLabel
        : textContent.researchNoFundsLabel
      const explorationUnaffordable = explorationAvailability?.reason === 'unaffordable'
      const canResearchFarming = farmingResearchAvailability?.canResearch ?? false
      const canTriggerFarmingResearch = canResearchFarming || farmingResearchAvailability?.reason === 'unaffordable'
      const farmingUnaffordable = farmingResearchAvailability?.reason === 'unaffordable'
      const farmingMessage = hasFarmingTechnology
        ? textContent.farmingResearchDone
        : canResearchFarming
          ? textContent.farmingResearchReady
          : textContent.farmingResearchNoFunds
      const showFarmingResearch = farmingResearchProgress?.inProgress || !hasFarmingTechnology
      const farmingResearchSection = showFarmingResearch
        ? `
          <div class="action-stack">
            <button class="${getClassName('action-button', farmingUnaffordable && 'is-unaffordable')}" data-action="research-farming" ${canTriggerFarmingResearch ? '' : 'disabled'}>
              ${farmingResearchProgress?.inProgress ? 'Farming Underway' : textContent.farmingResearchLabel}
            </button>
            ${farmingResearchProgress?.inProgress
              ? `
                ${renderProgressTrack(farmingResearchProgress)}
                <p class="panel-copy">Farming research is underway.</p>
              `
              : ''}
            ${renderTreasuryAlertCopy(`Cost ${formatCurrency(farmingResearchCost)} · Time ${getResearchDurationDaysLabel(farmingResearchDurationMs)}`, 'research-farming')}
            ${!farmingResearchProgress?.inProgress && !farmingUnaffordable
              ? `<p class="panel-copy">${farmingMessage}</p>`
              : ''}
          </div>
        `
        : ''
      const fertilizerFarmLimit = getStructureBuildLimit(structureTypeIds.farm, state, playerCity.id)
      const canResearchFertilizer = fertilizerResearchAvailability?.canResearch ?? false
      const canTriggerFertilizerResearch = canResearchFertilizer || fertilizerResearchAvailability?.reason === 'unaffordable'
      const fertilizerUnaffordable = fertilizerResearchAvailability?.reason === 'unaffordable'
      const fertilizerMessage = hasFertilizerTechnology
        ? textContent.fertilizerResearchDone(fertilizerFarmLimit)
        : fertilizerResearchAvailability?.reason === 'locked'
          ? textContent.fertilizerResearchLocked
          : canResearchFertilizer
            ? textContent.fertilizerResearchReady
            : textContent.fertilizerResearchNoFunds
      const showFertilizerResearch = fertilizerResearchProgress?.inProgress || hasFarmingTechnology || hasFertilizerTechnology
      const fertilizerResearchSection = showFertilizerResearch
        ? `
          <div class="action-stack">
            <button class="${getClassName('action-button', fertilizerUnaffordable && 'is-unaffordable')}" data-action="research-fertilizer" ${canTriggerFertilizerResearch ? '' : 'disabled'}>
              ${fertilizerResearchProgress?.inProgress ? 'Fertilizer Underway' : textContent.fertilizerResearchLabel}
            </button>
            ${fertilizerResearchProgress?.inProgress
              ? `
                ${renderProgressTrack(fertilizerResearchProgress)}
                <p class="panel-copy">Fertilizer research is underway.</p>
              `
              : ''}
            ${renderTreasuryAlertCopy(`Cost ${formatCurrency(fertilizerResearchCost)} · Time ${getResearchDurationDaysLabel(fertilizerResearchDurationMs)}`, 'research-fertilizer')}
            ${!fertilizerResearchProgress?.inProgress && !fertilizerUnaffordable
              ? `<p class="panel-copy">${fertilizerMessage}</p>`
              : ''}
          </div>
        `
        : ''
      const canResearchChemistry = chemistryResearchAvailability?.canResearch ?? false
      const canTriggerChemistryResearch = canResearchChemistry || chemistryResearchAvailability?.reason === 'unaffordable'
      const chemistryUnaffordable = chemistryResearchAvailability?.reason === 'unaffordable'
      const chemistryMessage = hasChemistryTechnology
        ? textContent.chemistryResearchDone
        : canResearchChemistry
          ? textContent.chemistryResearchReady
          : textContent.chemistryResearchNoFunds
      const showChemistryResearch = chemistryResearchProgress?.inProgress || !hasChemistryTechnology
      const chemistryResearchSection = showChemistryResearch
        ? `
          <div class="action-stack">
            <button class="${getClassName('action-button', chemistryUnaffordable && 'is-unaffordable')}" data-action="research-chemistry" ${canTriggerChemistryResearch ? '' : 'disabled'}>
              ${chemistryResearchProgress?.inProgress ? 'Chemistry Underway' : textContent.chemistryResearchLabel}
            </button>
            ${chemistryResearchProgress?.inProgress
              ? `
                ${renderProgressTrack(chemistryResearchProgress)}
                <p class="panel-copy">Chemistry research is underway.</p>
              `
              : ''}
            ${renderTreasuryAlertCopy(`Cost ${formatCurrency(chemistryResearchCost)} · Time ${getResearchDurationDaysLabel(chemistryResearchDurationMs)}`, 'research-chemistry')}
            ${!chemistryResearchProgress?.inProgress && !chemistryUnaffordable
              ? `<p class="panel-copy">${chemistryMessage}</p>`
              : ''}
          </div>
        `
        : ''
      const chemicalFertilizerFarmLimit = getStructureBuildLimit(structureTypeIds.farm, state, playerCity.id)
      const canResearchChemicalFertilizer = chemicalFertilizerResearchAvailability?.canResearch ?? false
      const canTriggerChemicalFertilizerResearch = canResearchChemicalFertilizer || chemicalFertilizerResearchAvailability?.reason === 'unaffordable'
      const chemicalFertilizerUnaffordable = chemicalFertilizerResearchAvailability?.reason === 'unaffordable'
      const chemicalFertilizerMessage = hasChemicalFertilizerTechnology
        ? textContent.chemicalFertilizerResearchDone(chemicalFertilizerFarmLimit)
        : chemicalFertilizerResearchAvailability?.reason === 'locked'
          ? textContent.chemicalFertilizerResearchLocked
          : canResearchChemicalFertilizer
            ? textContent.chemicalFertilizerResearchReady
            : textContent.chemicalFertilizerResearchNoFunds
      const showChemicalFertilizerResearch = chemicalFertilizerResearchProgress?.inProgress || hasChemistryTechnology || hasChemicalFertilizerTechnology
      const chemicalFertilizerResearchSection = showChemicalFertilizerResearch
        ? `
          <div class="action-stack">
            <button class="${getClassName('action-button', chemicalFertilizerUnaffordable && 'is-unaffordable')}" data-action="research-chemical-fertilizer" ${canTriggerChemicalFertilizerResearch ? '' : 'disabled'}>
              ${chemicalFertilizerResearchProgress?.inProgress ? 'Chemical Fertilizer Underway' : textContent.chemicalFertilizerResearchLabel}
            </button>
            ${chemicalFertilizerResearchProgress?.inProgress
              ? `
                ${renderProgressTrack(chemicalFertilizerResearchProgress)}
                <p class="panel-copy">Chemical fertilizer research is underway.</p>
              `
              : ''}
            ${renderTreasuryAlertCopy(`Cost ${formatCurrency(chemicalFertilizerResearchCost)} · Time ${getResearchDurationDaysLabel(chemicalFertilizerResearchDurationMs)}`, 'research-chemical-fertilizer')}
            ${!chemicalFertilizerResearchProgress?.inProgress && !chemicalFertilizerUnaffordable
              ? `<p class="panel-copy">${chemicalFertilizerMessage}</p>`
              : ''}
          </div>
        `
        : ''
      const canResearchEngineering = engineeringResearchAvailability?.canResearch ?? false
      const canTriggerEngineeringResearch = canResearchEngineering || engineeringResearchAvailability?.reason === 'unaffordable'
      const engineeringUnaffordable = engineeringResearchAvailability?.reason === 'unaffordable'
      const engineeringMessage = hasEngineeringTechnology
        ? textContent.engineeringResearchDone
        : canResearchEngineering
          ? textContent.engineeringResearchReady
          : textContent.engineeringResearchNoFunds
      const showEngineeringResearch = engineeringResearchProgress?.inProgress || !hasEngineeringTechnology
      const engineeringResearchSection = showEngineeringResearch
        ? `
          <div class="action-stack">
            <button class="${getClassName('action-button', engineeringUnaffordable && 'is-unaffordable')}" data-action="research-engineering" ${canTriggerEngineeringResearch ? '' : 'disabled'}>
              ${engineeringResearchProgress?.inProgress ? 'Engineering Underway' : textContent.engineeringResearchLabel}
            </button>
            ${engineeringResearchProgress?.inProgress
              ? `
                ${renderProgressTrack(engineeringResearchProgress)}
                <p class="panel-copy">Engineering research is underway.</p>
              `
              : ''}
            ${renderTreasuryAlertCopy(`Cost ${formatCurrency(engineeringResearchCost)} · Time ${getResearchDurationDaysLabel(engineeringResearchDurationMs)}`, 'research-engineering')}
            ${!engineeringResearchProgress?.inProgress && !engineeringUnaffordable
              ? `<p class="panel-copy">${engineeringMessage}</p>`
              : ''}
          </div>
        `
        : ''
      const canResearchMining = miningResearchAvailability?.canResearch ?? false
      const canTriggerMiningResearch = canResearchMining || miningResearchAvailability?.reason === 'unaffordable'
      const miningUnaffordable = miningResearchAvailability?.reason === 'unaffordable'
      const miningMessage = hasMiningTechnology
        ? textContent.miningResearchDone
        : canResearchMining
          ? textContent.miningResearchReady
          : textContent.miningResearchNoFunds
      const showMiningResearch = miningResearchProgress?.inProgress || !hasMiningTechnology
      const miningResearchSection = showMiningResearch
        ? `
          <div class="action-stack">
            <button class="${getClassName('action-button', miningUnaffordable && 'is-unaffordable')}" data-action="research-mining" ${canTriggerMiningResearch ? '' : 'disabled'}>
              ${miningResearchProgress?.inProgress ? 'Mining Underway' : textContent.miningResearchLabel}
            </button>
            ${miningResearchProgress?.inProgress
              ? `
                ${renderProgressTrack(miningResearchProgress)}
                <p class="panel-copy">Mining research is underway.</p>
              `
              : ''}
            ${renderTreasuryAlertCopy(`Cost ${formatCurrency(miningResearchCost)} · Time ${getResearchDurationDaysLabel(miningResearchDurationMs)}`, 'research-mining')}
            ${!miningResearchProgress?.inProgress && !miningUnaffordable
              ? `<p class="panel-copy">${miningMessage}</p>`
              : ''}
          </div>
        `
        : ''
      const mineShaftsMineLimit = getStructureBuildLimit(structureTypeIds.mine, state, playerCity.id)
      const canResearchMineShafts = mineShaftsResearchAvailability?.canResearch ?? false
      const canTriggerMineShaftsResearch = canResearchMineShafts || mineShaftsResearchAvailability?.reason === 'unaffordable'
      const mineShaftsUnaffordable = mineShaftsResearchAvailability?.reason === 'unaffordable'
      const mineShaftsMessage = hasMineShaftsTechnology
        ? textContent.mineShaftsResearchDone(mineShaftsMineLimit)
        : mineShaftsResearchAvailability?.reason === 'locked'
          ? textContent.mineShaftsResearchLocked
          : canResearchMineShafts
            ? textContent.mineShaftsResearchReady
            : textContent.mineShaftsResearchNoFunds
      const showMineShaftsResearch = mineShaftsResearchProgress?.inProgress || hasMiningTechnology || hasMineShaftsTechnology
      const mineShaftsResearchSection = showMineShaftsResearch
        ? `
          <div class="action-stack">
            <button class="${getClassName('action-button', mineShaftsUnaffordable && 'is-unaffordable')}" data-action="research-mine-shafts" ${canTriggerMineShaftsResearch ? '' : 'disabled'}>
              ${mineShaftsResearchProgress?.inProgress ? 'Mine Shafts Underway' : textContent.mineShaftsResearchLabel}
            </button>
            ${mineShaftsResearchProgress?.inProgress
              ? `
                ${renderProgressTrack(mineShaftsResearchProgress)}
                <p class="panel-copy">Mine shaft research is underway.</p>
              `
              : ''}
            ${renderTreasuryAlertCopy(`Cost ${formatCurrency(mineShaftsResearchCost)} · Time ${getResearchDurationDaysLabel(mineShaftsResearchDurationMs)}`, 'research-mine-shafts')}
            ${!mineShaftsResearchProgress?.inProgress && !mineShaftsUnaffordable
              ? `<p class="panel-copy">${mineShaftsMessage}</p>`
              : ''}
          </div>
        `
        : ''
      const canResearchLumbering = lumberingResearchAvailability?.canResearch ?? false
      const canTriggerLumberingResearch = canResearchLumbering || lumberingResearchAvailability?.reason === 'unaffordable'
      const lumberingUnaffordable = lumberingResearchAvailability?.reason === 'unaffordable'
      const lumberingMessage = hasLumberingTechnology
        ? textContent.lumberingResearchDone
        : canResearchLumbering
          ? textContent.lumberingResearchReady
          : textContent.lumberingResearchNoFunds
      const showLumberingResearch = lumberingResearchProgress?.inProgress || !hasLumberingTechnology
      const lumberingResearchSection = showLumberingResearch
        ? `
          <div class="action-stack">
            <button class="${getClassName('action-button', lumberingUnaffordable && 'is-unaffordable')}" data-action="research-lumbering" ${canTriggerLumberingResearch ? '' : 'disabled'}>
              ${lumberingResearchProgress?.inProgress ? 'Logging Underway' : textContent.lumberingResearchLabel}
            </button>
            ${lumberingResearchProgress?.inProgress
              ? `
                ${renderProgressTrack(lumberingResearchProgress)}
                <p class="panel-copy">Logging research is underway.</p>
              `
              : ''}
            ${renderTreasuryAlertCopy(`Cost ${formatCurrency(lumberingResearchCost)} · Time ${getResearchDurationDaysLabel(lumberingResearchDurationMs)}`, 'research-lumbering')}
            ${!lumberingResearchProgress?.inProgress && !lumberingUnaffordable
              ? `<p class="panel-copy">${lumberingMessage}</p>`
              : ''}
          </div>
        `
        : ''

      this.panelBody.innerHTML = `
        <section class="panel-section">
          <p class="panel-intro">${textContent.researchTabIntro}</p>
          <div class="action-stack">
            <button class="${getClassName('action-button', explorationUnaffordable && 'is-unaffordable')}" data-action="explore" ${canTriggerExplore ? '' : 'disabled'}>
              ${textContent.researchActionLabel}
            </button>
            ${explorationProgress?.inProgress
              ? `
                ${renderProgressTrack(explorationProgress)}
                <p class="panel-copy">Expedition in progress.</p>
              `
              : canExplore
                ? ''
                : !explorationUnaffordable
                  ? `<p class="panel-copy">${explorationMessage}</p>`
                  : ''}
            ${showExplorationCostLine
              ? renderTreasuryAlertCopy(`Cost ${formatCurrency(explorationCost)} · Time: ${explorationDurationDays} ${explorationDurationDays === 1 ? 'day' : 'days'}`, 'explore')
              : ''}
          </div>
          ${farmingResearchSection}
          ${fertilizerResearchSection}
          ${chemistryResearchSection}
          ${chemicalFertilizerResearchSection}
          ${engineeringResearchSection}
          ${lumberingResearchSection}
          ${miningResearchSection}
          ${mineShaftsResearchSection}
        </section>
      `
      return
    }

    if (state.activeTab === 'diplomacy') {
      this.panelBody.innerHTML = `
        <section class="panel-section">
          <p class="panel-intro">${textContent.diplomacyTabIntro}</p>
          <div class="diplomacy-list">
            ${knownCitiesWithDistance.map(({ city, distanceKm, tradeRoute, tradeRouteBuildProgress, outgoingTradeRouteOffer, incomingTradeRouteOffer, totalTradeRouteCost, splitShares, tradeRouteDailyIncome }) => `
              <article class="diplomacy-card">
                <img class="diplomacy-crest" src="${flagRenderer.getFlagDataUrl(city.flag)}" alt="${city.name} crest">
                <div class="diplomacy-card-copy">
                  <div>
                    <h3>${city.name}</h3>
                    <p>${formatNumber(distanceKm)} km away · population ${formatNumber(city.population)}</p>
                  </div>
                  ${tradeRoute
                    ? ''
                    : tradeRouteBuildProgress
                      ? `
                        ${renderProgressTrack(tradeRouteBuildProgress)}
                        <p class="panel-copy">Trade route under construction.</p>
                        <p class="panel-copy">Income on completion: ${formatCurrency(tradeRouteDailyIncome)} per day. Time ${tradeRouteBuildProgress.durationDays} ${tradeRouteBuildProgress.durationDays === 1 ? 'day' : 'days'}.</p>
                      `
                    : incomingTradeRouteOffer
                      ? `
                        ${renderTreasuryAlertCopy(`${textContent.diplomacyTradeRouteIncoming} ${formatCurrency(incomingTradeRouteOffer.recipientShare)}.`, `trade-route-accept-${city.id}`)}
                        <div class="diplomacy-actions">
                          <button class="${getClassName('action-button', 'diplomacy-action-button', playerCity.treasury < incomingTradeRouteOffer.recipientShare && 'is-unaffordable')}" data-action="accept-trade-route-offer" data-city-id="${city.id}">
                            ${textContent.diplomacyTradeRouteAcceptLabel}
                          </button>
                          <button class="action-button diplomacy-action-button diplomacy-action-button-secondary" data-action="decline-trade-route-offer" data-city-id="${city.id}">
                            ${textContent.diplomacyTradeRouteDeclineLabel}
                          </button>
                        </div>
                      `
                      : outgoingTradeRouteOffer
                        ? `
                          <p class="panel-copy">${textContent.diplomacyTradeRouteWaitingLabel}</p>
                          <p class="panel-copy">${outgoingTradeRouteOffer.recipientShare > 0
                            ? `Their share would be ${formatCurrency(outgoingTradeRouteOffer.recipientShare)}.`
                            : 'You are covering the full cost.'}</p>
                        `
                        : `
                          <div class="diplomacy-actions">
                            <button class="${getClassName('action-button', 'diplomacy-action-button', playerCity.treasury < splitShares.requesterShare && 'is-unaffordable')}" data-action="offer-trade-route-split" data-city-id="${city.id}">
                              ${textContent.diplomacyTradeRouteSplitLabel}
                            </button>
                          </div>
                          <p class="panel-copy">Total cost ${formatCurrency(totalTradeRouteCost)}.</p>
                          ${renderTreasuryAlertCopy(`Your share now: ${formatCurrency(splitShares.requesterShare)}. Their share on acceptance: ${formatCurrency(splitShares.recipientShare)}.`, `trade-route-split-${city.id}`)}
                        `}
                </div>
              </article>
            `).join('') || `<p class="panel-copy">${textContent.diplomacyUnknown}</p>`}
          </div>
        </section>
      `
      return
    }

    if (state.activeTab === 'calendar') {
      const elapsedDayCount = state.week * 7 + (state.dayOfWeek ?? 0)
      const canPassMonth = elapsedDayCount >= 40

      this.panelBody.innerHTML = `
        <section class="panel-section">
          <p class="panel-intro">${textContent.calendarTabIntro}</p>
          <p class="panel-copy">${getCalendarDateLabel(state)}</p>
          <div class="action-stack">
            <button class="action-button" data-action="pass-week" ${weekPassProgress?.inProgress ? 'disabled' : ''}>
              ${weekPassProgress?.inProgress ? 'Time is Passing...' : 'Allow a week to pass.'}
            </button>
            ${canPassMonth && !weekPassProgress?.inProgress
              ? `<button class="action-button" data-action="pass-month">${textContent.calendarPassMonthLabel}</button>`
              : ''}
            ${weekPassProgress?.inProgress
              ? `
                ${renderProgressTrack(weekPassProgress)}
                <p class="panel-copy">Time is passing.</p>
                ${renderOngoingTaskList(ongoingTasks)}
              `
              : ''}
          </div>
        </section>
      `
      return
    }

    this.panelBody.innerHTML = ''
  }

  render = ({ state, playerCity, offeredCities, displayedTreasury, cityWeeklyIncomeSummary, knownCities, knownCitiesWithDistance, knownCityCount, explorationAvailability, explorationProgress, hasFarmingTechnology, hasFertilizerTechnology, hasChemistryTechnology, hasChemicalFertilizerTechnology, hasEngineeringTechnology, hasMiningTechnology, hasMineShaftsTechnology, hasLumberingTechnology, farmingResearchAvailability, farmingResearchProgress, fertilizerResearchAvailability, fertilizerResearchProgress, chemistryResearchAvailability, chemistryResearchProgress, chemicalFertilizerResearchAvailability, chemicalFertilizerResearchProgress, engineeringResearchAvailability, engineeringResearchProgress, miningResearchAvailability, miningResearchProgress, mineShaftsResearchAvailability, mineShaftsResearchProgress, lumberingResearchAvailability, lumberingResearchProgress, weekPassProgress, ongoingTasks, structureBuildProgress, placementMode, flagRenderer, statusMessage }) => {
    if (this.saveButton) {
      this.saveButton.textContent = state.confirmingNewWorld
        ? textContent.saveResetConfirmLabel
        : textContent.saveResetLabel
    }

    if (!playerCity) {
      this.gameShell.hidden = true
      this.renderIntro({ offeredCities, flagRenderer })
      return
    }

    this.gameShell.hidden = false
    this.renderTopStrip({ playerCity, knownCityCount, state })
    this.renderPlayerSummary({ playerCity, displayedTreasury, flagRenderer })
    this.renderPanelBody({
      state,
      playerCity,
      displayedTreasury,
      cityWeeklyIncomeSummary,
      knownCities,
      knownCitiesWithDistance,
      flagRenderer,
      explorationAvailability,
      explorationProgress,
      hasFarmingTechnology,
      hasFertilizerTechnology,
      hasChemistryTechnology,
      hasChemicalFertilizerTechnology,
      hasEngineeringTechnology,
      hasMiningTechnology,
      hasMineShaftsTechnology,
      hasLumberingTechnology,
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
      weekPassProgress,
      ongoingTasks,
      structureBuildProgress,
      placementMode
    })
    this.applyTreasuryAlertState()

    this.statusLine.textContent = statusMessage || ''
    this.introOverlay.hidden = true
    this.introOverlay.innerHTML = ''
  }
}

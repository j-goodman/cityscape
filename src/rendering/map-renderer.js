import { flagAspectRatio } from '../core/flag-generator.js'
import {
  getBuildRangeSources,
  getCityById,
  getStructureDemolitionAvailability,
  getFocusPoint,
  getKnownCityIds,
  getPlayerCity,
  getStructureNetwork,
  getTradeRouteDisplaySegments,
  getTargetZoom
} from '../core/world.js'
import { clamp, lerp, splitText } from '../core/utils.js'
import { getTerrainTile, terrainPalette } from '../core/terrain.js'

const mapCrestScale = 1.4
const labelFontSize = 15
const labelFontFamily = '"Silkscreen", monospace'
const labelFontWeight = 400
const labelLineHeight = 20
const labelMaxWidth = 132
const labelPaddingX = 8
const labelPaddingY = 6
const crestGap = 7
const textColor = '#f6e7c2'
const tradeRouteOuterStrokeColor = '#2f2114'
const tradeRouteInnerStrokeColor = '#b88a4b'
const tradeRouteOuterLineOpacity = 0.86
const tradeRouteInnerLineOpacity = 0.94
const tradeRouteOuterLineWidth = 7.6
const tradeRouteInnerLineWidth = 3.8
const tradeRouteArcSampleCount = 7
const cameraOverscrollViewportFactor = 1
const buyTabTokenBadgeScale = 1.3
const buyTabCityBadgeScale = 1.42
const buyTabCityBadgeLiftFactor = 1.16
const buyTabPlayerLabelScale = 1.4
const cityTabFocusedLabelScale = 1.65
const diplomacyLabelScale = 1.2
const diplomacyLabelDriftX = 10
const diplomacyLabelDriftY = 6
const placementValidColor = 'rgba(214, 178, 108, 0.94)'
const placementInvalidColor = 'rgba(177, 110, 88, 0.96)'
const placementTileFillColor = 'rgba(214, 178, 108, 0.14)'
const placementTileEdgeColor = 'rgba(247, 232, 196, 0.34)'
const frameColor = '#7a6043'
const fogNearColor = 'rgba(20, 24, 34, 0.74)'
const fogMidColor = 'rgba(11, 14, 22, 0.86)'
const fogFarColor = 'rgba(4, 6, 10, 0.95)'
const labelShadowColor = 'rgba(12, 9, 6, 0.64)'
const cityDotRingBaseWidth = 2
const buildProgressBackingColor = 'rgba(20, 15, 11, 0.88)'
const buildProgressTrackColor = 'rgba(89, 68, 47, 0.9)'
const buildProgressFillColor = '#e0be77'
const buildProgressEdgeColor = 'rgba(247, 232, 196, 0.3)'
const framePaddingX = 42
const framePaddingY = 38
const perspectiveTopCompression = 0.82
const perspectiveCompressionCurve = 1.35
const cityDotAspectRatio = 43 / 45
const mapTabZoomOffset = 0.18
const kmPerLatitudeDegree = 111.32
const simulationViewportWidth = 1400
const simulationViewportHeight = 860
const fogEllipseZoomOutPaddingFactor = 1.08
const maximumManualZoom = 5
const structureTokenScaleByType = {
  derelict: 0.82,
  farm: 0.85,
  mine: 0.85,
  'lumber-camp': 0.85,
  'solar-farm': 0.7
}

const cityDotSource = new URL('../../assets/city-dot.png', import.meta.url).href
const farmTokenSource = new URL('../../assets/farm-token.png', import.meta.url).href
const mineTokenSource = new URL('../../assets/mine-token.png', import.meta.url).href
const lumberCampTokenSource = new URL('../../assets/logging-camp-token.png', import.meta.url).href
const forageCampTokenSource = new URL('../../assets/forage-camp-token.png', import.meta.url).href
const derelictTokenSource = new URL('../../assets/derelict-token.png', import.meta.url).href
const tarnishOverlaySource = new URL('../../assets/tarnish-overlay.png', import.meta.url).href

const loadImage = source => new Promise((resolve, reject) => {
  const image = new Image()
  image.decoding = 'async'
  image.onload = () => resolve(image)
  image.onerror = () => reject(new Error(`Failed to load image: ${source}`))
  image.src = source
})

const getRectCenter = rectangle => ({
  x: rectangle.left + rectangle.width * 0.5,
  y: rectangle.top + rectangle.height * 0.5
})

const degreesToRadians = degrees => degrees * (Math.PI / 180)
const radiansToDegrees = radians => radians * (180 / Math.PI)

const getUnitVectorFromGeoPoint = (latitude, longitude) => {
  const latitudeRadians = degreesToRadians(latitude)
  const longitudeRadians = degreesToRadians(longitude)
  const cosineLatitude = Math.cos(latitudeRadians)

  return {
    x: cosineLatitude * Math.cos(longitudeRadians),
    y: Math.sin(latitudeRadians),
    z: cosineLatitude * Math.sin(longitudeRadians)
  }
}

const getGeoPointFromUnitVector = vector => {
  const magnitude = Math.hypot(vector.x, vector.y, vector.z) || 1
  const normalizedVector = {
    x: vector.x / magnitude,
    y: vector.y / magnitude,
    z: vector.z / magnitude
  }

  return {
    latitude: radiansToDegrees(Math.asin(clamp(normalizedVector.y, -1, 1))),
    longitude: radiansToDegrees(Math.atan2(normalizedVector.z, normalizedVector.x))
  }
}

const interpolateGreatCircleGeoPoint = (firstCity, secondCity, progress) => {
  const firstVector = getUnitVectorFromGeoPoint(firstCity.latitude, firstCity.longitude)
  const secondVector = getUnitVectorFromGeoPoint(secondCity.latitude, secondCity.longitude)
  const dotProduct = clamp(
    firstVector.x * secondVector.x + firstVector.y * secondVector.y + firstVector.z * secondVector.z,
    -1,
    1
  )
  const angle = Math.acos(dotProduct)

  if (angle <= 0.00001) {
    return {
      latitude: lerp(firstCity.latitude, secondCity.latitude, progress),
      longitude: lerp(firstCity.longitude, secondCity.longitude, progress)
    }
  }

  const sineAngle = Math.sin(angle)
  const firstWeight = Math.sin((1 - progress) * angle) / sineAngle
  const secondWeight = Math.sin(progress * angle) / sineAngle

  return getGeoPointFromUnitVector({
    x: firstVector.x * firstWeight + secondVector.x * secondWeight,
    y: firstVector.y * firstWeight + secondVector.y * secondWeight,
    z: firstVector.z * firstWeight + secondVector.z * secondWeight
  })
}

const getAveragePoint = points => ({
  x: points.reduce((total, point) => total + point.x, 0) / points.length,
  y: points.reduce((total, point) => total + point.y, 0) / points.length
})

const getDistanceBetweenPoints = (firstPoint, secondPoint) => (
  Math.hypot(secondPoint.x - firstPoint.x, secondPoint.y - firstPoint.y)
)

const roundCacheNumber = (value, precision = 4) => {
  const multiplier = 10 ** precision

  return Math.round(value * multiplier) / multiplier
}

const getPolygonBounds = points => points.reduce((bounds, point) => ({
  left: Math.min(bounds.left, point.x),
  right: Math.max(bounds.right, point.x),
  top: Math.min(bounds.top, point.y),
  bottom: Math.max(bounds.bottom, point.y)
}), {
  left: Infinity,
  right: -Infinity,
  top: Infinity,
  bottom: -Infinity
})

const rectangleIntersectsRectangle = (first, second) => (
  first.left < second.left + second.width &&
  first.left + first.width > second.left &&
  first.top < second.top + second.height &&
  first.top + first.height > second.top
)

const rectangleIntersectsCircle = (rectangle, circle) => {
  const nearestX = Math.max(rectangle.left, Math.min(circle.x, rectangle.left + rectangle.width))
  const nearestY = Math.max(rectangle.top, Math.min(circle.y, rectangle.top + rectangle.height))
  const deltaX = circle.x - nearestX
  const deltaY = circle.y - nearestY

  return deltaX * deltaX + deltaY * deltaY < circle.radius * circle.radius
}

const pointInsideRectangle = (point, rectangle) => (
  Boolean(rectangle) &&
  point.x >= rectangle.left &&
  point.x <= rectangle.left + rectangle.width &&
  point.y >= rectangle.top &&
  point.y <= rectangle.top + rectangle.height
)

const expandRectangle = (rectangle, padding) => ({
  left: rectangle.left - padding,
  top: rectangle.top - padding,
  width: rectangle.width + padding * 2,
  height: rectangle.height + padding * 2
})

export class MapRenderer {
  static create = async ({ canvas, flagRenderer }) => {
    const [cityDotImage, farmTokenImage, mineTokenImage, lumberCampTokenImage, forageCampTokenImage, derelictTokenImage, tarnishOverlayImage] = await Promise.all([
      loadImage(cityDotSource),
      loadImage(farmTokenSource),
      loadImage(mineTokenSource),
      loadImage(lumberCampTokenSource),
      loadImage(forageCampTokenSource),
      loadImage(derelictTokenSource),
      loadImage(tarnishOverlaySource)
    ])

    return new MapRenderer({ canvas, flagRenderer, cityDotImage, farmTokenImage, mineTokenImage, lumberCampTokenImage, forageCampTokenImage, derelictTokenImage, tarnishOverlayImage })
  }

  constructor({ canvas, flagRenderer, cityDotImage, farmTokenImage, mineTokenImage, lumberCampTokenImage, forageCampTokenImage, derelictTokenImage, tarnishOverlayImage }) {
    this.canvas = canvas
    this.context = canvas.getContext('2d')
    this.terrainCacheCanvas = document.createElement('canvas')
    this.terrainCacheContext = this.terrainCacheCanvas.getContext('2d')
    this.flagRenderer = flagRenderer
    this.cityDotImage = cityDotImage
    this.farmTokenImage = farmTokenImage
    this.mineTokenImage = mineTokenImage
    this.lumberCampTokenImage = lumberCampTokenImage
    this.forageCampTokenImage = forageCampTokenImage
    this.derelictTokenImage = derelictTokenImage
    this.tarnishOverlayImage = tarnishOverlayImage
    this.viewport = { width: simulationViewportWidth, height: simulationViewportHeight }
    this.currentCenter = { x: 0.5, y: 0.5 }
    this.currentZoom = 1
    this.labelVisibilityByCity = new Map()
    this.displayedKnowledgeRadiusKm = 0
    this.displayedKnowledgePlayerId = null
    this.displayedCityPresentation = 0
    this.displayedDiplomacyPresentation = 0
    this.displayedCalendarPresentation = 0
    this.displayedBuyPresentation = 0
    this.displayedTradeRouteVisibility = 1
    this.manualZoomFactor = 1
    this.manualCenterOffset = { x: 0, y: 0 }
    this.smoothedLabelLayoutsByCity = new Map()
    this.lastRenderedAt = 0
    this.canvasScale = 0
    this.cameraSettledFrames = 0
    this.projectionCache = null
    this.terrainCacheKey = null
    this.terrainCacheTerrainSource = null
    this.lastTerrainRenderMode = 'live'
    this.lastTerrainTileCount = 0
  }

  resizeRenderSurface = (surfaceCanvas, surfaceContext, ratio) => {
    surfaceCanvas.width = Math.round(simulationViewportWidth * ratio)
    surfaceCanvas.height = Math.round(simulationViewportHeight * ratio)
    surfaceContext.setTransform(ratio, 0, 0, ratio, 0, 0)
  }

  invalidateTerrainCache = () => {
    this.terrainCacheKey = null
    this.terrainCacheTerrainSource = null
  }

  resizeCanvasForDisplay = () => {
    const ratio = window.devicePixelRatio || 1
    const targetWidth = Math.round(simulationViewportWidth * ratio)
    const targetHeight = Math.round(simulationViewportHeight * ratio)

    this.viewport = {
      width: simulationViewportWidth,
      height: simulationViewportHeight
    }

    if (
      this.canvas.width === targetWidth &&
      this.canvas.height === targetHeight &&
      this.canvasScale === ratio
    ) {
      return
    }

    this.canvasScale = ratio
    this.resizeRenderSurface(this.canvas, this.context, ratio)
    this.resizeRenderSurface(this.terrainCacheCanvas, this.terrainCacheContext, ratio)
    this.projectionCache = null
    this.invalidateTerrainCache()
  }

  getPopulationScale = (city, cities) => {
    const populations = cities.map(entry => entry.population)
    const minimumPopulation = Math.min(...populations)
    const maximumPopulation = Math.max(...populations)

    return (city.population - minimumPopulation) / (maximumPopulation - minimumPopulation || 1)
  }

  getAutomaticTargetZoom = state => Math.max(1, getTargetZoom(state) - (state.activeTab === 'calendar' ? mapTabZoomOffset : 0))

  getAutomaticTargetCenter = state => getFocusPoint(state)

  getMinimumManualZoom = (state, center = null) => {
    const automaticZoom = this.getAutomaticTargetZoom(state)
    const playerCity = getPlayerCity(state)
    const knowledgeEllipse = this.getKnowledgeEllipse(state, playerCity, playerCity?.knowledgeRadiusKm ?? 0)
    const resolvedCenter = center ?? this.getAutomaticTargetCenter(state)
    const paddedAutomaticZoom = automaticZoom / fogEllipseZoomOutPaddingFactor

    if (!knowledgeEllipse) {
      return paddedAutomaticZoom
    }

    const requiredHalfWidth = (
      Math.abs(resolvedCenter.x - knowledgeEllipse.center.x) + knowledgeEllipse.radiusWorldX
    ) * fogEllipseZoomOutPaddingFactor
    const requiredHalfHeight = (
      Math.abs(resolvedCenter.y - knowledgeEllipse.center.y) + knowledgeEllipse.radiusWorldY
    ) * fogEllipseZoomOutPaddingFactor
    const fitZoomX = requiredHalfWidth > 0 ? 0.5 / requiredHalfWidth : automaticZoom
    const fitZoomY = requiredHalfHeight > 0 ? 0.5 / requiredHalfHeight : automaticZoom

    return Math.min(paddedAutomaticZoom, fitZoomX, fitZoomY)
  }

  clampCenterForZoom = (center, zoom) => {
    const halfVisibleWidth = 0.5 / zoom
    const halfVisibleHeight = 0.5 / zoom
    const overscrollWidth = (1 / zoom) * cameraOverscrollViewportFactor
    const overscrollHeight = (1 / zoom) * cameraOverscrollViewportFactor

    return {
      x: clamp(center.x, halfVisibleWidth - overscrollWidth, 1 - halfVisibleWidth + overscrollWidth),
      y: clamp(center.y, halfVisibleHeight - overscrollHeight, 1 - halfVisibleHeight + overscrollHeight)
    }
  }

  getRequestedCameraState = state => {
    const automaticZoom = this.getAutomaticTargetZoom(state)
    const automaticCenter = this.getAutomaticTargetCenter(state)
    const minimumManualZoom = this.getMinimumManualZoom(state, automaticCenter)
    const requestedZoom = clamp(automaticZoom * this.manualZoomFactor, minimumManualZoom, maximumManualZoom)
    const requestedCenter = this.clampCenterForZoom({
      x: automaticCenter.x + this.manualCenterOffset.x,
      y: automaticCenter.y + this.manualCenterOffset.y
    }, requestedZoom)

    return {
      automaticZoom,
      automaticCenter,
      requestedZoom,
      requestedCenter
    }
  }

  syncManualCameraOffset = (state, zoom = null, center = null) => {
    const automaticCenter = this.getAutomaticTargetCenter(state)
    const resolvedZoom = zoom ?? this.getRequestedCameraState(state).requestedZoom
    const resolvedCenter = center ?? this.clampCenterForZoom({
      x: automaticCenter.x + this.manualCenterOffset.x,
      y: automaticCenter.y + this.manualCenterOffset.y
    }, resolvedZoom)

    this.manualCenterOffset = {
      x: resolvedCenter.x - automaticCenter.x,
      y: resolvedCenter.y - automaticCenter.y
    }

    return resolvedCenter
  }

  getCenterForScreenAnchor = (screenPoint, worldPoint, zoom) => {
    const { usableWidth, usableHeight, centerX } = this.getUsableViewportMetrics()
    const perspectiveScale = this.getPerspectiveScaleAtScreenY(screenPoint.y) || 1
    const linearX = centerX + (screenPoint.x - centerX) / perspectiveScale
    const normalizedX = clamp((linearX - framePaddingX) / usableWidth, 0, 1)
    const normalizedY = clamp((screenPoint.y - framePaddingY) / usableHeight, 0, 1)
    const visibleWidth = 1 / zoom
    const visibleHeight = 1 / zoom

    return {
      x: worldPoint.x + (0.5 - normalizedX) * visibleWidth,
      y: worldPoint.y + (0.5 - normalizedY) * visibleHeight
    }
  }

  zoomAtClientPoint = (state, clientX, clientY, zoomMultiplier) => {
    const screenPoint = this.getScreenPointFromClientPoint(clientX, clientY)

    if (!screenPoint || !Number.isFinite(zoomMultiplier) || zoomMultiplier <= 0) {
      return false
    }

    const worldPoint = this.screenToWorld(screenPoint)
    const automaticZoom = this.getAutomaticTargetZoom(state)
    const minimumManualZoom = this.getMinimumManualZoom(state, this.currentCenter)
    const currentZoom = clamp(automaticZoom * this.manualZoomFactor, minimumManualZoom, maximumManualZoom)
    const nextZoom = clamp(currentZoom * zoomMultiplier, minimumManualZoom, maximumManualZoom)

    if (Math.abs(nextZoom - currentZoom) < 0.0001) {
      return false
    }

    this.manualZoomFactor = nextZoom / automaticZoom
    const anchoredCenter = this.getCenterForScreenAnchor(screenPoint, worldPoint, nextZoom)
    const nextCenter = this.clampCenterForZoom(anchoredCenter, nextZoom)

    this.syncManualCameraOffset(state, nextZoom, nextCenter)
    this.currentZoom = nextZoom
    this.currentCenter = nextCenter
    this.projectionCache = null
    this.invalidateTerrainCache()

    return true
  }

  panByClientDelta = (state, fromClientX, fromClientY, toClientX, toClientY) => {
    const fromScreenPoint = this.getScreenPointFromClientPoint(fromClientX, fromClientY)
    const toScreenPoint = this.getScreenPointFromClientPoint(toClientX, toClientY)

    if (!fromScreenPoint || !toScreenPoint) {
      return false
    }

    const fromWorldPoint = this.screenToWorld(fromScreenPoint)
    const toWorldPoint = this.screenToWorld(toScreenPoint)
    const nextCenter = this.clampCenterForZoom({
      x: this.currentCenter.x + (fromWorldPoint.x - toWorldPoint.x),
      y: this.currentCenter.y + (fromWorldPoint.y - toWorldPoint.y)
    }, this.currentZoom)

    this.syncManualCameraOffset(state, this.currentZoom, nextCenter)
    this.currentCenter = nextCenter
    this.projectionCache = null
    this.invalidateTerrainCache()

    return true
  }

  updateCamera = state => {
    const previousCenter = { ...this.currentCenter }
    const previousZoom = this.currentZoom
    const { requestedZoom, requestedCenter } = this.getRequestedCameraState(state)
    const targetZoom = requestedZoom
    const targetCenter = this.syncManualCameraOffset(state, requestedZoom, requestedCenter)

    this.currentCenter = {
      x: lerp(this.currentCenter.x, targetCenter.x, 0.08),
      y: lerp(this.currentCenter.y, targetCenter.y, 0.08)
    }
    this.currentZoom = lerp(this.currentZoom, targetZoom, 0.08)

    const positionError = Math.hypot(targetCenter.x - this.currentCenter.x, targetCenter.y - this.currentCenter.y)
    const positionMovement = Math.hypot(this.currentCenter.x - previousCenter.x, this.currentCenter.y - previousCenter.y)
    const zoomError = Math.abs(targetZoom - this.currentZoom)
    const zoomMovement = Math.abs(this.currentZoom - previousZoom)
    const cameraSettled = positionError < 0.0008 && positionMovement < 0.00045 && zoomError < 0.001 && zoomMovement < 0.0007

    this.cameraSettledFrames = cameraSettled
      ? this.cameraSettledFrames + 1
      : 0
  }

  updateProjectionCache = () => {
    const usableWidth = this.viewport.width - framePaddingX * 2
    const usableHeight = this.viewport.height - framePaddingY * 2
    const visibleWidth = 1 / this.currentZoom
    const visibleHeight = 1 / this.currentZoom
    const left = this.currentCenter.x - visibleWidth / 2
    const top = this.currentCenter.y - visibleHeight / 2

    this.projectionCache = {
      usableWidth,
      usableHeight,
      centerX: framePaddingX + usableWidth * 0.5,
      left,
      top,
      right: left + visibleWidth,
      bottom: top + visibleHeight,
      visibleWidth,
      visibleHeight
    }
  }

  getProjectionCache = () => {
    if (!this.projectionCache) {
      this.updateProjectionCache()
    }

    return this.projectionCache
  }

  getVisibleWorldBounds = () => {
    const { left, top, right, bottom, visibleWidth, visibleHeight } = this.getProjectionCache()

    return {
      left,
      top,
      right: left + visibleWidth,
      bottom: top + visibleHeight,
      visibleWidth,
      visibleHeight
    }
  }

  getUsableViewportMetrics = () => {
    const { usableWidth, usableHeight, centerX } = this.getProjectionCache()

    return {
      usableWidth,
      usableHeight,
      centerX
    }
  }

  getPerspectiveScaleAtScreenY = screenY => {
    const { usableHeight } = this.getUsableViewportMetrics()
    const normalizedY = clamp((screenY - framePaddingY) / usableHeight, 0, 1)

    return lerp(
      perspectiveTopCompression,
      1,
      Math.pow(normalizedY, perspectiveCompressionCurve)
    )
  }

  getLinearWorldToScreenPoint = point => {
    const { usableWidth, usableHeight, left, top, visibleWidth, visibleHeight } = this.getProjectionCache()

    return {
      x: framePaddingX + ((point.x - left) / visibleWidth) * usableWidth,
      y: framePaddingY + ((point.y - top) / visibleHeight) * usableHeight
    }
  }

  worldToScreen = point => {
    const linearPoint = this.getLinearWorldToScreenPoint(point)
    const { centerX } = this.getUsableViewportMetrics()
    const perspectiveScale = this.getPerspectiveScaleAtScreenY(linearPoint.y)

    return {
      x: centerX + (linearPoint.x - centerX) * perspectiveScale,
      y: linearPoint.y
    }
  }

  screenToWorld = point => {
    const { usableWidth, usableHeight, centerX, left, top, visibleWidth, visibleHeight } = this.getProjectionCache()
    const perspectiveScale = this.getPerspectiveScaleAtScreenY(point.y) || 1
    const linearX = centerX + (point.x - centerX) / perspectiveScale

    return {
      x: left + ((linearX - framePaddingX) / usableWidth) * visibleWidth,
      y: top + ((point.y - framePaddingY) / usableHeight) * visibleHeight
    }
  }

  getScreenPointFromClientPoint = (clientX, clientY) => {
    const rectangle = this.canvas.getBoundingClientRect()

    if (!rectangle.width || !rectangle.height) {
      return null
    }

    const x = ((clientX - rectangle.left) / rectangle.width) * this.viewport.width
    const y = ((clientY - rectangle.top) / rectangle.height) * this.viewport.height

    if (x < 0 || y < 0 || x > this.viewport.width || y > this.viewport.height) {
      return null
    }

    return { x, y }
  }

  getTileAtClientPoint = (clientX, clientY, terrain) => {
    const screenPoint = this.getScreenPointFromClientPoint(clientX, clientY)

    if (!screenPoint) {
      return null
    }

    const worldPoint = this.screenToWorld(screenPoint)

    const columnIndex = Math.floor(worldPoint.x * terrain.columns)
    const rowIndex = Math.floor(worldPoint.y * terrain.rows)

    return {
      columnIndex,
      rowIndex
    }
  }

  getWorldToScreenScale = (point = null) => {
    const { usableWidth, usableHeight, visibleWidth, visibleHeight } = this.getProjectionCache()
    const perspectiveScale = point
      ? this.getPerspectiveScaleAtScreenY(this.getLinearWorldToScreenPoint(point).y)
      : lerp(perspectiveTopCompression, 1, 0.5)

    return {
      x: (usableWidth / visibleWidth) * perspectiveScale,
      y: usableHeight / visibleHeight
    }
  }

  getWorldQuadScreenPoints = (columnIndex, rowIndex, terrain) => {
    const topLeft = this.worldToScreen({
      x: columnIndex / terrain.columns,
      y: rowIndex / terrain.rows
    })
    const topRight = this.worldToScreen({
      x: (columnIndex + 1) / terrain.columns,
      y: rowIndex / terrain.rows
    })
    const bottomRight = this.worldToScreen({
      x: (columnIndex + 1) / terrain.columns,
      y: (rowIndex + 1) / terrain.rows
    })
    const bottomLeft = this.worldToScreen({
      x: columnIndex / terrain.columns,
      y: (rowIndex + 1) / terrain.rows
    })

    return {
      topLeft,
      topRight,
      bottomRight,
      bottomLeft,
      points: [topLeft, topRight, bottomRight, bottomLeft]
    }
  }

  getTileWorldBounds = (columnIndex, rowIndex, terrain) => ({
    left: columnIndex / terrain.columns,
    top: rowIndex / terrain.rows,
    right: (columnIndex + 1) / terrain.columns,
    bottom: (rowIndex + 1) / terrain.rows
  })

  getTileWorldCenter = (columnIndex, rowIndex, terrain) => ({
    x: (columnIndex + 0.5) / terrain.columns,
    y: (rowIndex + 0.5) / terrain.rows
  })

  getWorldRectScreenBounds = (columnIndex, rowIndex, terrain) => {
    const quad = this.getWorldQuadScreenPoints(columnIndex, rowIndex, terrain)
    return this.getBoundsForQuad(quad)
  }

  getBoundsForQuad = quad => {
    const bounds = getPolygonBounds(quad.points)

    return {
      left: bounds.left,
      top: bounds.top,
      width: bounds.right - bounds.left,
      height: bounds.bottom - bounds.top
    }
  }

  doesTileIntersectKnowledgeEllipse = (columnIndex, rowIndex, terrain, knowledgeEllipse) => {
    if (!knowledgeEllipse) {
      return true
    }

    const bounds = this.getTileWorldBounds(columnIndex, rowIndex, terrain)
    const nearestX = Math.max(bounds.left, Math.min(knowledgeEllipse.center.x, bounds.right))
    const nearestY = Math.max(bounds.top, Math.min(knowledgeEllipse.center.y, bounds.bottom))
    const normalizedX = (nearestX - knowledgeEllipse.center.x) / knowledgeEllipse.radiusWorldX
    const normalizedY = (nearestY - knowledgeEllipse.center.y) / knowledgeEllipse.radiusWorldY

    return normalizedX * normalizedX + normalizedY * normalizedY <= 1.0005
  }

  doesSegmentIntersectKnowledgeEllipse = (fromPoint, toPoint, knowledgeEllipse) => {
    if (!knowledgeEllipse) {
      return true
    }

    if (
      this.isPointInsideKnowledgeEllipse(fromPoint, knowledgeEllipse) ||
      this.isPointInsideKnowledgeEllipse(toPoint, knowledgeEllipse)
    ) {
      return true
    }

    if (knowledgeEllipse.radiusWorldX <= 0 || knowledgeEllipse.radiusWorldY <= 0) {
      return false
    }

    const normalizedFrom = {
      x: (fromPoint.x - knowledgeEllipse.center.x) / knowledgeEllipse.radiusWorldX,
      y: (fromPoint.y - knowledgeEllipse.center.y) / knowledgeEllipse.radiusWorldY
    }
    const normalizedTo = {
      x: (toPoint.x - knowledgeEllipse.center.x) / knowledgeEllipse.radiusWorldX,
      y: (toPoint.y - knowledgeEllipse.center.y) / knowledgeEllipse.radiusWorldY
    }
    const delta = {
      x: normalizedTo.x - normalizedFrom.x,
      y: normalizedTo.y - normalizedFrom.y
    }
    const a = delta.x * delta.x + delta.y * delta.y
    const b = 2 * (normalizedFrom.x * delta.x + normalizedFrom.y * delta.y)
    const c = normalizedFrom.x * normalizedFrom.x + normalizedFrom.y * normalizedFrom.y - 1

    if (a <= 0.0000001) {
      return c <= 0
    }

    const discriminant = b * b - 4 * a * c

    if (discriminant < 0) {
      return false
    }

    const sqrtDiscriminant = Math.sqrt(discriminant)
    const firstIntersection = (-b - sqrtDiscriminant) / (2 * a)
    const secondIntersection = (-b + sqrtDiscriminant) / (2 * a)

    return (
      (firstIntersection >= 0 && firstIntersection <= 1) ||
      (secondIntersection >= 0 && secondIntersection <= 1)
    )
  }

  isBoundsOutsideViewport = bounds => (
    bounds.left > this.viewport.width ||
    bounds.top > this.viewport.height ||
    bounds.left + bounds.width < 0 ||
    bounds.top + bounds.height < 0
  )

  traceQuadPath = quad => {
    this.context.beginPath()
    this.context.moveTo(quad.topLeft.x, quad.topLeft.y)
    this.context.lineTo(quad.topRight.x, quad.topRight.y)
    this.context.lineTo(quad.bottomRight.x, quad.bottomRight.y)
    this.context.lineTo(quad.bottomLeft.x, quad.bottomLeft.y)
    this.context.closePath()
  }

  getCrestDimensions = (city, cities) => {
    const crestHeight = (38 + this.getPopulationScale(city, cities) * 18) * mapCrestScale

    return {
      crestWidth: crestHeight / flagAspectRatio,
      crestHeight
    }
  }

  getLabelScale = () => lerp(1, 1.9, clamp((this.currentZoom - 1.05) / 1.2, 0, 1))

  getLabelMetrics = (city, cities, scaleMultiplier = 1) => {
    const scale = this.getLabelScale() * scaleMultiplier
    const fontSize = Math.round(labelFontSize * scale)
    const lineHeight = Math.round(labelLineHeight * scale)
    const maxWidth = Math.round(labelMaxWidth * scale)
    const paddingX = Math.round(labelPaddingX * scale)
    const paddingY = Math.round(labelPaddingY * scale)
    const scaledCrestGap = Math.round(crestGap * scale)
    const { crestWidth, crestHeight } = this.getCrestDimensions(city, cities)

    return {
      scale,
      font: `${labelFontWeight} ${fontSize}px ${labelFontFamily}`,
      lineHeight,
      maxWidth,
      paddingX,
      paddingY,
      crestGap: scaledCrestGap,
      crestWidth: crestWidth * scale,
      crestHeight: crestHeight * scale
    }
  }

  getWrappedLabelLines = value => {
    this.context.save()
    this.context.font = `${labelFontWeight} ${labelFontSize}px ${labelFontFamily}`
    const lines = splitText(this.context, value, labelMaxWidth)
    this.context.restore()

    return lines
  }

  getCandidateBoxes = (marker, label) => {
    const gapSource = marker.isPlayer && this.displayedCityPresentation > 0.1
      ? [12, 28, 48, 76, 112, 156]
      : [10, 22, 36, 52]
    const gapSteps = gapSource.map(gap => Math.round(gap * Math.min(label.scale, 1.6)))
    const directions = [
      { horizontal: 'right', vertical: 'middle' },
      { horizontal: 'left', vertical: 'middle' },
      { horizontal: 'center', vertical: 'top' },
      { horizontal: 'center', vertical: 'bottom' },
      { horizontal: 'right', vertical: 'top' },
      { horizontal: 'left', vertical: 'top' },
      { horizontal: 'right', vertical: 'bottom' },
      { horizontal: 'left', vertical: 'bottom' }
    ]

    return gapSteps.flatMap(gap => directions.map(direction => {
      let left = marker.x - label.boxWidth / 2
      let top = marker.y - label.boxHeight / 2

      if (direction.horizontal === 'right') {
        left = marker.x + marker.radius + gap
      } else if (direction.horizontal === 'left') {
        left = marker.x - marker.radius - gap - label.boxWidth
      }

      if (direction.vertical === 'top') {
        top = marker.y - marker.radius - gap - label.boxHeight
      } else if (direction.vertical === 'bottom') {
        top = marker.y + marker.radius + gap
      }

      return {
        gap,
        left: clamp(left, 10, this.viewport.width - label.boxWidth - 10),
        top: clamp(top, 10, this.viewport.height - label.boxHeight - 10),
        width: label.boxWidth,
        height: label.boxHeight
      }
    }))
  }

  getLabelObstacleRectangles = (structures, terrain, state, knowledgeEllipse, getStructureAlpha, getBadgeAlpha) => {
    const obstacles = []
    const structureOverviewPresentation = this.getStructureOverviewPresentation()

    structures.forEach(structure => {
      const structureAlpha = clamp(getStructureAlpha ? getStructureAlpha(structure) : 1, 0, 1)

      if (structureAlpha <= 0.01 || !this.doesTileIntersectKnowledgeEllipse(structure.columnIndex, structure.rowIndex, terrain, knowledgeEllipse)) {
        return
      }

      const tokenLayout = this.getStructureTokenLayout(terrain, structure.columnIndex, structure.rowIndex, structure.type)

      if (tokenLayout) {
        obstacles.push(expandRectangle({
          left: tokenLayout.left,
          top: tokenLayout.top,
          width: tokenLayout.width,
          height: tokenLayout.height
        }, 10))
      }

      const badgeAlpha = clamp(getBadgeAlpha ? getBadgeAlpha(structure) : 1, 0, 1)

      if (badgeAlpha <= 0.01) {
        return
      }

      const badgeScale = lerp(1, buyTabTokenBadgeScale, structureOverviewPresentation)
      const badgeLayout = this.getStructureBadgeLayout(terrain, structure.columnIndex, structure.rowIndex, structure.type, badgeScale)

      if (badgeLayout) {
        obstacles.push(expandRectangle({
          left: badgeLayout.left,
          top: badgeLayout.top,
          width: badgeLayout.width,
          height: badgeLayout.height
        }, 6))
      }
    })

    return obstacles
  }

  layoutLabels = (markers, blockedRectangles = []) => {
    const placedLabels = []
    const prioritizedMarkers = [...markers].sort((firstMarker, secondMarker) => {
      const firstPriority = firstMarker.labelPriority ?? firstMarker.city.population
      const secondPriority = secondMarker.labelPriority ?? secondMarker.city.population

      return secondPriority - firstPriority
    })

    prioritizedMarkers.forEach(marker => {
      const metrics = this.getLabelMetrics(marker.city, marker.allCities, marker.labelScaleMultiplier ?? 1)
      this.context.font = metrics.font
      const lines = this.getWrappedLabelLines(marker.city.name)
      const textWidth = Math.max(...lines.map(line => this.context.measureText(line).width))
      const textHeight = lines.length * metrics.lineHeight
      const textTop = metrics.paddingY + metrics.crestHeight + metrics.crestGap
      const boxWidth = Math.max(textWidth, metrics.crestWidth) + metrics.paddingX * 2
      const boxHeight = textTop + textHeight + metrics.paddingY
      const label = {
        ...metrics,
        lines,
        textTop,
        textHeight,
        boxWidth,
        boxHeight
      }
      const candidates = this.getCandidateBoxes(marker, label)
      const getCandidatePenalty = candidate => {
        const labelOverlapPenalty = placedLabels.reduce((penalty, existingLabel) => (
          penalty + (rectangleIntersectsRectangle(candidate, existingLabel.box) ? 1000 : 0)
        ), 0)
        const markerOverlapPenalty = markers.reduce((penalty, otherMarker) => (
          penalty + (rectangleIntersectsCircle(candidate, otherMarker) ? 700 : 0)
        ), 0)
        const obstaclePenalty = blockedRectangles.reduce((penalty, blockedRectangle) => (
          penalty + (rectangleIntersectsRectangle(candidate, blockedRectangle) ? 900 : 0)
        ), 0)

        return labelOverlapPenalty + markerOverlapPenalty + obstaclePenalty - candidate.gap * 0.1
      }
      const chosenBox = candidates.reduce((bestCandidate, candidate) => {
        if (!bestCandidate) {
          return candidate
        }

        return getCandidatePenalty(candidate) < getCandidatePenalty(bestCandidate)
          ? candidate
          : bestCandidate
      }, null) ?? candidates[0]

      placedLabels.push({
        cityId: marker.city.id,
        box: {
          left: chosenBox.left,
          top: chosenBox.top,
          width: boxWidth,
          height: boxHeight
        },
        crestBox: {
          left: chosenBox.left + (boxWidth - label.crestWidth) * 0.5,
          top: chosenBox.top + label.paddingY,
          width: label.crestWidth,
          height: label.crestHeight
        },
        label
      })
    })

    return placedLabels
  }

  interpolateRectangle = (fromRectangle, toRectangle, amount) => ({
    left: lerp(fromRectangle.left, toRectangle.left, amount),
    top: lerp(fromRectangle.top, toRectangle.top, amount),
    width: lerp(fromRectangle.width, toRectangle.width, amount),
    height: lerp(fromRectangle.height, toRectangle.height, amount)
  })

  smoothPlacedLabels = (placedLabels, elapsedSeconds) => {
    const interpolationAmount = Math.min(1, elapsedSeconds * 10.5)
    const nextLayouts = new Map()

    const smoothed = placedLabels.map(placedLabel => {
      const current = this.smoothedLabelLayoutsByCity.get(placedLabel.cityId)

      if (!current) {
        nextLayouts.set(placedLabel.cityId, placedLabel)
        return placedLabel
      }

      const smoothedLabel = {
        ...placedLabel,
        box: this.interpolateRectangle(current.box, placedLabel.box, interpolationAmount),
        crestBox: this.interpolateRectangle(current.crestBox, placedLabel.crestBox, interpolationAmount)
      }

      nextLayouts.set(placedLabel.cityId, smoothedLabel)

      return smoothedLabel
    })

    this.smoothedLabelLayoutsByCity = nextLayouts

    return smoothed
  }

  drawTerrain = terrain => {
    let tileDrawCount = 0

    this.context.fillStyle = terrainPalette.desert
    this.context.fillRect(0, 0, this.viewport.width, this.viewport.height)

    const { left, top, right, bottom } = this.getVisibleWorldBounds()
    const columnStart = Math.floor(left * terrain.columns) - 1
    const columnEnd = Math.ceil(right * terrain.columns) + 1
    const rowStart = Math.floor(top * terrain.rows) - 1
    const rowEnd = Math.ceil(bottom * terrain.rows) + 1

    for (let rowIndex = rowStart; rowIndex <= rowEnd; rowIndex += 1) {
      for (let columnIndex = columnStart; columnIndex <= columnEnd; columnIndex += 1) {
        const tile = getTerrainTile(terrain, columnIndex, rowIndex)
        if (tile.opacity <= 0) {
          continue
        }

        const quad = this.getWorldQuadScreenPoints(columnIndex, rowIndex, terrain)
        const bounds = this.getBoundsForQuad(quad)

        if (this.isBoundsOutsideViewport(bounds)) {
          continue
        }

        this.context.globalAlpha = tile.opacity
        this.context.fillStyle = terrainPalette[tile.type]
        this.traceQuadPath(quad)
        this.context.fill()
        this.context.lineWidth = 1
        this.context.strokeStyle = terrainPalette[tile.type]
        this.context.stroke()
        tileDrawCount += 1
      }
    }

    this.context.globalAlpha = 1

    return tileDrawCount
  }

  getTerrainCacheKey = terrain => {
    const { left, top, right, bottom, visibleWidth, visibleHeight } = this.getProjectionCache()

    return [
      terrain.columns,
      terrain.rows,
      this.viewport.width,
      this.viewport.height,
      this.canvasScale,
      roundCacheNumber(left),
      roundCacheNumber(top),
      roundCacheNumber(right),
      roundCacheNumber(bottom),
      roundCacheNumber(visibleWidth),
      roundCacheNumber(visibleHeight),
      roundCacheNumber(this.currentZoom),
      terrain.version ?? 0
    ].join(':')
  }

  renderTerrainToCache = terrain => {
    const liveContext = this.context

    try {
      this.context = this.terrainCacheContext
      this.context.clearRect(0, 0, this.viewport.width, this.viewport.height)
      this.lastTerrainTileCount = this.drawTerrain(terrain)
    } finally {
      this.context = liveContext
    }
  }

  drawTerrainLayer = terrain => {
    if (this.terrainCacheTerrainSource !== terrain) {
      this.invalidateTerrainCache()
      this.terrainCacheTerrainSource = terrain
    }

    const canReuseTerrainLayer = this.cameraSettledFrames >= 2

    if (!canReuseTerrainLayer) {
      this.lastTerrainRenderMode = 'live'
      this.lastTerrainTileCount = this.drawTerrain(terrain)
      return
    }

    const terrainCacheKey = this.getTerrainCacheKey(terrain)

    if (this.terrainCacheKey !== terrainCacheKey) {
      this.renderTerrainToCache(terrain)
      this.terrainCacheKey = terrainCacheKey
      this.lastTerrainRenderMode = 'cache-refresh'
    } else {
      this.lastTerrainRenderMode = 'cache-hit'
    }

    this.context.drawImage(this.terrainCacheCanvas, 0, 0, this.viewport.width, this.viewport.height)
  }

  getDebugSnapshot = () => ({
    terrainRenderMode: this.lastTerrainRenderMode,
    terrainTileCount: this.lastTerrainTileCount,
    cameraSettledFrames: this.cameraSettledFrames,
    zoom: Number(this.currentZoom.toFixed(3)),
    centerX: Number(this.currentCenter.x.toFixed(3)),
    centerY: Number(this.currentCenter.y.toFixed(3))
  })

  getStructureTokenImage = structureType => {
    if (structureType === 'derelict') {
      return this.derelictTokenImage
    }

    if (structureType === 'farm') {
      return this.farmTokenImage
    }

    if (structureType === 'mine') {
      return this.mineTokenImage
    }

    if (structureType === 'lumber-camp') {
      return this.lumberCampTokenImage
    }

    if (structureType === 'solar-farm') {
      return this.forageCampTokenImage
    }

    return null
  }

  drawStructureToken = (terrain, columnIndex, rowIndex, structureType, alpha = 1) => {
    const layout = this.getStructureTokenLayout(terrain, columnIndex, rowIndex, structureType)

    if (!layout) {
      return
    }

    this.context.save()
    this.context.globalAlpha = alpha
    this.context.drawImage(layout.image, layout.left, layout.top, layout.width, layout.height)
    this.context.restore()
  }

  getStructureTokenLayout = (terrain, columnIndex, rowIndex, structureType) => {
    const tokenImage = this.getStructureTokenImage(structureType)

    if (!tokenImage) {
      return null
    }

    const quad = this.getWorldQuadScreenPoints(columnIndex, rowIndex, terrain)
    const bounds = this.getBoundsForQuad(quad)

    if (this.isBoundsOutsideViewport(bounds)) {
      return null
    }

    const tileCenter = getAveragePoint(quad.points)
    const imageAspectRatio = tokenImage.width / (tokenImage.height || 1)
    const scale = structureTokenScaleByType[structureType] ?? 1
    const maxWidth = bounds.width * scale
    const maxHeight = bounds.height * scale
    const width = maxWidth / maxHeight > imageAspectRatio
      ? maxHeight * imageAspectRatio
      : maxWidth
    const height = width / imageAspectRatio

    return {
      image: tokenImage,
      bounds,
      tileCenter,
      left: tileCenter.x - width * 0.5,
      top: tileCenter.y - height * 0.5,
      width,
      height
    }
  }

  getStructureAtClientPoint = (clientX, clientY, structures, terrain) => {
    const screenPoint = this.getScreenPointFromClientPoint(clientX, clientY)

    if (!screenPoint) {
      return null
    }

    for (let structureIndex = structures.length - 1; structureIndex >= 0; structureIndex -= 1) {
      const structure = structures[structureIndex]
      const tokenLayout = this.getStructureTokenLayout(terrain, structure.columnIndex, structure.rowIndex, structure.type)
      const badgeLayout = this.getStructureBadgeLayout(terrain, structure.columnIndex, structure.rowIndex, structure.type)

      if (pointInsideRectangle(screenPoint, tokenLayout) || pointInsideRectangle(screenPoint, badgeLayout)) {
        return structure
      }
    }

    return null
  }

  getStructurePopupAnchor = (terrain, columnIndex, rowIndex, structureType) => {
    const tokenLayout = this.getStructureTokenLayout(terrain, columnIndex, rowIndex, structureType)

    if (tokenLayout) {
      return {
        x: tokenLayout.tileCenter.x,
        y: tokenLayout.top
      }
    }

    const quad = this.getWorldQuadScreenPoints(columnIndex, rowIndex, terrain)
    const bounds = this.getBoundsForQuad(quad)

    if (this.isBoundsOutsideViewport(bounds)) {
      return null
    }

    const tileCenter = getAveragePoint(quad.points)

    return {
      x: tileCenter.x,
      y: bounds.top
    }
  }

  getStructureBadgeLayout = (terrain, columnIndex, rowIndex, structureType = 'farm', scaleMultiplier = 1) => {
    const quad = this.getWorldQuadScreenPoints(columnIndex, rowIndex, terrain)
    const bounds = this.getBoundsForQuad(quad)
    const tokenLayout = this.getStructureTokenLayout(terrain, columnIndex, rowIndex, structureType)

    if (this.isBoundsOutsideViewport(bounds)) {
      return null
    }

    const tileCenter = getAveragePoint(quad.points)
    const badgeHeight = Math.max(20, Math.min(34, bounds.height * 0.588)) * scaleMultiplier
    const badgeWidth = badgeHeight * (this.flagRenderer.crestPixelWidth / this.flagRenderer.crestPixelHeight)
    const left = tileCenter.x - badgeWidth * 0.5
    const anchorTop = tokenLayout?.top ?? bounds.top
    const top = Math.max(6, anchorTop - badgeHeight - 1)

    return {
      bounds,
      tileCenter,
      left,
      top,
      width: badgeWidth,
      height: badgeHeight
    }
  }

  drawStructureBadge = (structure, state, terrain, alpha = 1) => {
    const city = getCityById(state, structure.ownerCityId)
    const flagSprite = city ? this.flagRenderer.renderFlagSprite(city.flag) : null
    const badgeScale = lerp(1, buyTabTokenBadgeScale, this.getStructureOverviewPresentation())
    const layout = this.getStructureBadgeLayout(terrain, structure.columnIndex, structure.rowIndex, structure.type, badgeScale)

    if (!flagSprite || !layout) {
      return null
    }

    this.context.save()
    this.context.globalAlpha = alpha
    this.context.drawImage(flagSprite, layout.left, layout.top, layout.width, layout.height)
    this.context.restore()

    return layout
  }

  getMarkerBadgeLayout = marker => {
    const badgeHeight = Math.max(24, Math.min(44, marker.dotHeight * 0.92)) * lerp(1, buyTabCityBadgeScale, this.displayedBuyPresentation)
    const badgeWidth = badgeHeight * (this.flagRenderer.crestPixelWidth / this.flagRenderer.crestPixelHeight)

    return {
      left: marker.x - badgeWidth * 0.5,
      top: marker.y - badgeHeight * buyTabCityBadgeLiftFactor,
      width: badgeWidth,
      height: badgeHeight
    }
  }

  drawMarkerBadges = markers => {
    if (this.displayedBuyPresentation <= 0.01) {
      return
    }

    markers.forEach(marker => {
      if (!marker.visibleOnScreen || !marker.insideKnowledgeEllipse || !marker.known || marker.isPlayer) {
        return
      }

      const flagSprite = this.flagRenderer.renderFlagSprite(marker.city.flag)

      if (!flagSprite) {
        return
      }

      const layout = this.getMarkerBadgeLayout(marker)

      this.context.save()
      this.context.globalAlpha = this.displayedBuyPresentation
      this.context.drawImage(flagSprite, layout.left, layout.top, layout.width, layout.height)
      this.context.restore()
    })
  }

  drawStructureLink = (fromPoint, toPoint, color, alpha = 1) => {
    this.context.save()
    this.context.lineCap = 'round'

    this.context.beginPath()
    this.context.globalAlpha = 0.9 * alpha
    this.context.strokeStyle = color
    this.context.lineWidth = 2.2
    this.context.moveTo(fromPoint.x, fromPoint.y)
    this.context.lineTo(toPoint.x, toPoint.y)
    this.context.stroke()
    this.context.restore()
  }

  getWorldPointFromGeo = (state, latitude, longitude) => {
    const longitudeSpan = state.bounds.maxLon - state.bounds.minLon || 1
    const latitudeSpan = state.bounds.maxLat - state.bounds.minLat || 1

    return {
      x: clamp((longitude - state.bounds.minLon) / longitudeSpan, 0, 1),
      y: clamp(1 - (latitude - state.bounds.minLat) / latitudeSpan, 0, 1)
    }
  }

  getTradeRouteWorldPoints = (state, firstCity, secondCity, firstWorldPoint, secondWorldPoint) => {
    if (!firstCity || !secondCity) {
      return [firstWorldPoint, secondWorldPoint]
    }

    const worldPoints = [firstWorldPoint]

    for (let sampleIndex = 1; sampleIndex < tradeRouteArcSampleCount; sampleIndex += 1) {
      const progress = sampleIndex / tradeRouteArcSampleCount
      const geoPoint = interpolateGreatCircleGeoPoint(firstCity, secondCity, progress)
      worldPoints.push(this.getWorldPointFromGeo(state, geoPoint.latitude, geoPoint.longitude))
    }

    worldPoints.push(secondWorldPoint)

    return worldPoints
  }

  doesPolylineIntersectKnowledgeEllipse = (points, knowledgeEllipse) => {
    if (!knowledgeEllipse) {
      return true
    }

    for (let pointIndex = 0; pointIndex < points.length - 1; pointIndex += 1) {
      if (this.doesSegmentIntersectKnowledgeEllipse(points[pointIndex], points[pointIndex + 1], knowledgeEllipse)) {
        return true
      }
    }

    return false
  }

  tracePolyline = points => {
    if (points.length < 2) {
      return
    }

    this.context.beginPath()
    this.context.moveTo(points[0].x, points[0].y)

    for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
      this.context.lineTo(points[pointIndex].x, points[pointIndex].y)
    }
  }

  getTrimmedSegmentBetweenPoints = (fromPoint, toPoint, fromTrim = 0, toTrim = 0) => {
    const deltaX = toPoint.x - fromPoint.x
    const deltaY = toPoint.y - fromPoint.y
    const distance = Math.hypot(deltaX, deltaY)

    if (distance <= Math.max(0.001, fromTrim + toTrim + 0.001)) {
      return null
    }

    const unitX = deltaX / distance
    const unitY = deltaY / distance

    return {
      fromPoint: {
        x: fromPoint.x + unitX * fromTrim,
        y: fromPoint.y + unitY * fromTrim
      },
      toPoint: {
        x: toPoint.x - unitX * toTrim,
        y: toPoint.y - unitY * toTrim
      }
    }
  }

  drawTradeRoutes = (state, knowledgeEllipse = null, alpha = 1) => {
    if (alpha <= 0.001) {
      return
    }

    const playerCityId = getPlayerCity(state)?.id ?? null

    getTradeRouteDisplaySegments(state).forEach(tradeRouteSegment => {
      if (
        state.activeTab === 'city' &&
        playerCityId != null &&
        tradeRouteSegment.cityAId !== playerCityId &&
        tradeRouteSegment.cityBId !== playerCityId
      ) {
        return
      }

      const firstWorldPoint = state.cityPositions[tradeRouteSegment.cityAId]
      const secondWorldPoint = state.cityPositions[tradeRouteSegment.cityBId]

      if (
        !firstWorldPoint ||
        !secondWorldPoint
      ) {
        return
      }

      const firstCity = getCityById(state, tradeRouteSegment.cityAId)
      const secondCity = getCityById(state, tradeRouteSegment.cityBId)
      const worldPoints = this.getTradeRouteWorldPoints(state, firstCity, secondCity, firstWorldPoint, secondWorldPoint)

      if (!this.doesPolylineIntersectKnowledgeEllipse(worldPoints, knowledgeEllipse)) {
        return
      }

      const screenPoints = worldPoints.map(point => this.worldToScreen(point))

      this.context.save()
      this.context.lineCap = 'round'
      this.context.lineJoin = 'round'
      this.context.setLineDash([])

      this.context.globalAlpha = tradeRouteOuterLineOpacity * alpha
      this.context.strokeStyle = tradeRouteOuterStrokeColor
      this.context.lineWidth = tradeRouteOuterLineWidth
      this.tracePolyline(screenPoints)
      this.context.stroke()

      this.context.globalAlpha = tradeRouteInnerLineOpacity * alpha
      this.context.strokeStyle = tradeRouteInnerStrokeColor
      this.context.lineWidth = tradeRouteInnerLineWidth
      this.tracePolyline(screenPoints)
      this.context.stroke()
      this.context.restore()
    })
  }

  getStructureLinkParent = (state, structure) => {
    const sources = getBuildRangeSources(state, structure.ownerCityId)
    let bestSource = null

    sources.forEach(source => {
      const distance = Math.hypot(
        source.columnIndex - structure.columnIndex,
        source.rowIndex - structure.rowIndex
      )

      if (distance === 0) {
        return
      }

      if (!bestSource || distance < bestSource.distance) {
        bestSource = {
          source,
          distance
        }
      }
    })

    return bestSource?.source ?? null
  }

  getStructureLinkPoint = (state, terrain, source) => {
    if (!source) {
      return null
    }

    if (source.kind === 'home') {
      const cityPoint = state.cityPositions[source.cityId]

      return cityPoint ? this.worldToScreen(cityPoint) : null
    }

    const quad = this.getWorldQuadScreenPoints(source.columnIndex, source.rowIndex, terrain)

    return getAveragePoint(quad.points)
  }

  getStructureLinkWorldPoint = (state, terrain, source) => {
    if (!source) {
      return null
    }

    if (source.kind === 'home') {
      return state.cityPositions[source.cityId] ?? null
    }

    return this.getTileWorldCenter(source.columnIndex, source.rowIndex, terrain)
  }

  drawStructureNetworks = (state, terrain, pendingStructures = [], knowledgeEllipse = null, getCityAlpha = null) => {
    state.cities.forEach(city => {
      const cityAlpha = clamp(getCityAlpha ? getCityAlpha(city.id) : 1, 0, 1)

      if (cityAlpha <= 0.01) {
        return
      }

      const network = getStructureNetwork(state, city.id)

      if (!network.length) {
        return
      }

      const color = this.flagRenderer.getFlagHaloColor(city.flag)

      network.forEach(structure => {
        const childPoint = this.getStructureLinkPoint(state, terrain, structure)
        const parentPoint = this.getStructureLinkPoint(state, terrain, structure.parent)
        const childWorldPoint = this.getStructureLinkWorldPoint(state, terrain, structure)
        const parentWorldPoint = this.getStructureLinkWorldPoint(state, terrain, structure.parent)

        if (
          !childPoint ||
          !parentPoint ||
          !childWorldPoint ||
          !parentWorldPoint ||
          !this.doesSegmentIntersectKnowledgeEllipse(parentWorldPoint, childWorldPoint, knowledgeEllipse)
        ) {
          return
        }

        this.drawStructureLink(parentPoint, childPoint, color, cityAlpha)
      })
    })

    pendingStructures.forEach(structure => {
      const city = getCityById(state, structure.ownerCityId)
      const cityAlpha = clamp(getCityAlpha ? getCityAlpha(structure.ownerCityId) : 1, 0, 1)
      const parent = this.getStructureLinkParent(state, structure)
      const childPoint = this.getStructureLinkPoint(state, terrain, structure)
      const parentPoint = this.getStructureLinkPoint(state, terrain, parent)
      const childWorldPoint = this.getStructureLinkWorldPoint(state, terrain, structure)
      const parentWorldPoint = this.getStructureLinkWorldPoint(state, terrain, parent)

      if (
        cityAlpha <= 0.01 ||
        !city ||
        !childPoint ||
        !parentPoint ||
        !childWorldPoint ||
        !parentWorldPoint ||
        !this.doesSegmentIntersectKnowledgeEllipse(parentWorldPoint, childWorldPoint, knowledgeEllipse)
      ) {
        return
      }

      this.drawStructureLink(parentPoint, childPoint, this.flagRenderer.getFlagHaloColor(city.flag), 0.55 * cityAlpha)
    })
  }

  drawStructures = (structures, terrain, state, knowledgeEllipse = null, getStructureAlpha = null, getBadgeAlpha = null) => {
    structures.forEach(structure => {
      const structureAlpha = clamp(getStructureAlpha ? getStructureAlpha(structure) : 1, 0, 1)

      if (structureAlpha <= 0.01) {
        return
      }

      if (!this.doesTileIntersectKnowledgeEllipse(structure.columnIndex, structure.rowIndex, terrain, knowledgeEllipse)) {
        return
      }

      this.drawStructureToken(terrain, structure.columnIndex, structure.rowIndex, structure.type, 0.96 * structureAlpha)
    })

    structures.forEach(structure => {
      const badgeAlpha = clamp(getBadgeAlpha ? getBadgeAlpha(structure) : 1, 0, 1)

      if (badgeAlpha <= 0.01) {
        return
      }

      if (!this.doesTileIntersectKnowledgeEllipse(structure.columnIndex, structure.rowIndex, terrain, knowledgeEllipse)) {
        return
      }

      this.drawStructureBadge(structure, state, terrain, badgeAlpha)
    })
  }

  drawPendingStructures = (structures, terrain, now, state, knowledgeEllipse = null, getStructureAlpha = null, getBadgeAlpha = null) => {
    structures.forEach(structure => {
      const structureAlpha = clamp(getStructureAlpha ? getStructureAlpha(structure) : 1, 0, 1)

      if (structureAlpha <= 0.01) {
        return
      }

      if (!this.doesTileIntersectKnowledgeEllipse(structure.columnIndex, structure.rowIndex, terrain, knowledgeEllipse)) {
        return
      }

      this.drawStructureToken(terrain, structure.columnIndex, structure.rowIndex, structure.type, 0.5 * structureAlpha)
    })

    structures.forEach(structure => {
      const badgeAlpha = clamp(getBadgeAlpha ? getBadgeAlpha(structure) : 1, 0, 1)

      if (badgeAlpha <= 0.01) {
        return
      }

      if (!this.doesTileIntersectKnowledgeEllipse(structure.columnIndex, structure.rowIndex, terrain, knowledgeEllipse)) {
        return
      }

      this.drawStructureBadge(structure, state, terrain, 0.72 * badgeAlpha)
    })

    structures.forEach(structure => {
      const structureAlpha = clamp(getStructureAlpha ? getStructureAlpha(structure) : 1, 0, 1)

      this.drawPendingStructureProgress(structure, terrain, now, knowledgeEllipse, structureAlpha)
    })
  }

  drawPendingStructureProgress = (structure, terrain, now = performance.now(), knowledgeEllipse = null, alpha = 1) => {
    if (alpha <= 0.01) {
      return
    }

    if (!this.doesTileIntersectKnowledgeEllipse(structure.columnIndex, structure.rowIndex, terrain, knowledgeEllipse)) {
      return
    }

    const quad = this.getWorldQuadScreenPoints(structure.columnIndex, structure.rowIndex, terrain)
    const bounds = this.getBoundsForQuad(quad)

    if (this.isBoundsOutsideViewport(bounds)) {
      return
    }

    const tileCenter = getAveragePoint(quad.points)
    const tileWidth = Math.max(14, Math.min(bounds.width, this.viewport.width * 0.16))
    const barWidth = Math.max(18, tileWidth * 0.76)
    const barHeight = Math.max(4, Math.min(8, bounds.height * 0.12))
    const outerPadding = 2
    const progress = structure.duration > 0
      ? clamp((now - structure.startedAt) / structure.duration, 0, 1)
      : 0
    const barLeft = tileCenter.x - barWidth * 0.5
    const badgeScale = lerp(1, buyTabTokenBadgeScale, this.getStructureOverviewPresentation())
    const badgeLayout = this.getStructureBadgeLayout(terrain, structure.columnIndex, structure.rowIndex, structure.type, badgeScale)
    const barTop = badgeLayout
      ? Math.max(6, badgeLayout.top - barHeight - 6)
      : Math.max(6, bounds.top - barHeight - 8)

    this.context.save()
    this.context.globalAlpha = 0.96 * alpha
    this.context.fillStyle = buildProgressBackingColor
    this.context.fillRect(barLeft - outerPadding, barTop - outerPadding, barWidth + outerPadding * 2, barHeight + outerPadding * 2)
    this.context.strokeStyle = buildProgressEdgeColor
    this.context.lineWidth = 1
    this.context.strokeRect(barLeft - outerPadding + 0.5, barTop - outerPadding + 0.5, barWidth + outerPadding * 2 - 1, barHeight + outerPadding * 2 - 1)
    this.context.fillStyle = buildProgressTrackColor
    this.context.fillRect(barLeft, barTop, barWidth, barHeight)
    this.context.fillStyle = buildProgressFillColor
    this.context.fillRect(barLeft, barTop, barWidth * progress, barHeight)
    this.context.restore()
  }

  drawValidPlacementTiles = (tiles, terrain) => {
    if (!tiles.length) {
      return
    }

    this.context.save()
    this.context.fillStyle = placementTileFillColor
    this.context.strokeStyle = placementTileEdgeColor
    this.context.lineWidth = 1

    tiles.forEach(tile => {
      const quad = this.getWorldQuadScreenPoints(tile.columnIndex, tile.rowIndex, terrain)
      const bounds = this.getBoundsForQuad(quad)

      if (this.isBoundsOutsideViewport(bounds)) {
        return
      }

      this.traceQuadPath(quad)
      this.context.fill()
      this.context.stroke()
    })

    this.context.restore()
  }

  drawPlacementPreview = (placementPreview, terrain) => {
    if (!placementPreview) {
      return
    }

    const quad = this.getWorldQuadScreenPoints(placementPreview.columnIndex, placementPreview.rowIndex, terrain)

    if (placementPreview.structureType) {
      this.drawStructureToken(
        terrain,
        placementPreview.columnIndex,
        placementPreview.rowIndex,
        placementPreview.structureType,
        placementPreview.valid ? 0.78 : 0.28
      )
    }

    this.context.save()
    this.context.strokeStyle = placementPreview.valid
      ? placementValidColor
      : placementInvalidColor
    this.context.lineWidth = 2
    this.traceQuadPath(quad)
    this.context.stroke()
    this.context.restore()
  }

  getPlacementPreviewBounds = (placementPreview, terrain) => {
    if (!placementPreview) {
      return null
    }

    return this.getWorldRectScreenBounds(placementPreview.columnIndex, placementPreview.rowIndex, terrain)
  }

  drawFrame = () => {
    this.context.save()
    this.context.strokeStyle = frameColor
    this.context.lineWidth = 1
    this.context.strokeRect(0.5, 0.5, this.viewport.width - 1, this.viewport.height - 1)
    this.context.restore()
  }

  updateDisplayedKnowledgeRadius = (playerCity, elapsedSeconds) => {
    if (!playerCity) {
      this.displayedKnowledgePlayerId = null
      this.displayedKnowledgeRadiusKm = 0
      return
    }

    if (this.displayedKnowledgePlayerId !== playerCity.id) {
      this.displayedKnowledgePlayerId = playerCity.id
      this.displayedKnowledgeRadiusKm = playerCity.knowledgeRadiusKm
      return
    }

    if (playerCity.knowledgeRadiusKm <= this.displayedKnowledgeRadiusKm) {
      this.displayedKnowledgeRadiusKm = playerCity.knowledgeRadiusKm
      return
    }

    const animationRate = Math.min(1, elapsedSeconds * 5.4)
    this.displayedKnowledgeRadiusKm = lerp(this.displayedKnowledgeRadiusKm, playerCity.knowledgeRadiusKm, animationRate)

    if (Math.abs(playerCity.knowledgeRadiusKm - this.displayedKnowledgeRadiusKm) < 0.75) {
      this.displayedKnowledgeRadiusKm = playerCity.knowledgeRadiusKm
    }
  }

  getKnowledgeEllipse = (state, playerCity, knowledgeRadiusKm) => {
    if (!playerCity || knowledgeRadiusKm <= 0) {
      return null
    }

    const center = state.cityPositions[playerCity.id]

    if (!center) {
      return null
    }

    const longitudeSpan = state.bounds.maxLon - state.bounds.minLon || 1
    const latitudeSpan = state.bounds.maxLat - state.bounds.minLat || 1
    const longitudeScale = Math.max(
      kmPerLatitudeDegree * Math.cos((playerCity.latitude * Math.PI) / 180),
      0.01
    )
    const fullRadiusWorldX = (playerCity.knowledgeRadiusKm / longitudeScale) / longitudeSpan
    const fullRadiusWorldY = (playerCity.knowledgeRadiusKm / kmPerLatitudeDegree) / latitudeSpan
    const correctionScale = Math.max(1, ...getKnownCityIds(state, playerCity.id).map(cityId => {
      const point = state.cityPositions[cityId]

      if (!point || fullRadiusWorldX <= 0 || fullRadiusWorldY <= 0) {
        return 1
      }

      const normalizedX = (point.x - center.x) / fullRadiusWorldX
      const normalizedY = (point.y - center.y) / fullRadiusWorldY

      return Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY)
    }))
    const radiusWorldX = ((knowledgeRadiusKm / longitudeScale) / longitudeSpan) * correctionScale
    const radiusWorldY = ((knowledgeRadiusKm / kmPerLatitudeDegree) / latitudeSpan) * correctionScale

    return {
      center,
      radiusWorldX,
      radiusWorldY
    }
  }

  isPointInsideKnowledgeEllipse = (point, ellipse) => {
    if (!ellipse || ellipse.radiusWorldX <= 0 || ellipse.radiusWorldY <= 0) {
      return false
    }

    const normalizedX = (point.x - ellipse.center.x) / ellipse.radiusWorldX
    const normalizedY = (point.y - ellipse.center.y) / ellipse.radiusWorldY

    return normalizedX * normalizedX + normalizedY * normalizedY <= 1.0005
  }

  drawKnowledgeFog = knowledgeEllipse => {
    if (!knowledgeEllipse) {
      return
    }

    const center = this.worldToScreen(knowledgeEllipse.center)
    const scale = this.getWorldToScreenScale(knowledgeEllipse.center)
    const radiusX = knowledgeEllipse.radiusWorldX * scale.x
    const radiusY = knowledgeEllipse.radiusWorldY * scale.y

    if (radiusX < 6 || radiusY < 6) {
      return
    }

    this.context.save()
    this.context.beginPath()
    this.context.rect(0, 0, this.viewport.width, this.viewport.height)
    this.context.ellipse(center.x, center.y, radiusX, radiusY, 0, 0, Math.PI * 2)
    this.context.clip('evenodd')

    const fogGradient = this.context.createLinearGradient(0, 0, this.viewport.width, this.viewport.height)
    fogGradient.addColorStop(0, fogNearColor)
    fogGradient.addColorStop(0.52, fogMidColor)
    fogGradient.addColorStop(1, fogFarColor)
    this.context.fillStyle = fogGradient
    this.context.fillRect(0, 0, this.viewport.width, this.viewport.height)
    this.context.restore()
  }

  drawMarkers = markers => {
    markers.forEach(marker => {
      if (!marker.visibleOnScreen || !marker.insideKnowledgeEllipse) {
        return
      }

      const dotWidth = marker.known ? marker.dotWidth : marker.dotWidth * 0.62
      const dotHeight = marker.known ? marker.dotHeight : marker.dotHeight * 0.62
      const ringRadius = Math.max(2, (Math.max(dotWidth, dotHeight) * 0.5 + 0.75) * 0.5)
      const ringWidth = Math.max(cityDotRingBaseWidth * 2, Math.min(8, Math.max(dotWidth, dotHeight) * 0.09))

      this.context.globalAlpha = marker.known ? 1 : 0.76

      this.context.drawImage(
        this.cityDotImage,
        marker.x - dotWidth * 0.5,
        marker.y - dotHeight * 0.5,
        dotWidth,
        dotHeight
      )

      this.context.save()
      this.context.beginPath()
      this.context.arc(marker.x, marker.y, ringRadius, 0, Math.PI * 2)
      this.context.strokeStyle = this.flagRenderer.getFlagHaloColor(marker.city.flag)
      this.context.lineWidth = ringWidth
      this.context.stroke()
      this.context.restore()
    })

    this.context.globalAlpha = 1
  }

  isMarkerVisibleOnScreen = marker => (
    marker.x + marker.radius >= 0 &&
    marker.x - marker.radius <= this.viewport.width &&
    marker.y + marker.radius >= 0 &&
    marker.y - marker.radius <= this.viewport.height
  )

  updateLabelVisibility = (markers, elapsedSeconds) => {
    const fadeInStep = elapsedSeconds * 3.6
    const fadeOutStep = elapsedSeconds * 7.5

    markers.forEach(marker => {
      const currentAlpha = this.labelVisibilityByCity.get(marker.city.id) ?? 0
      const targetAlpha = marker.known && marker.visibleOnScreen && marker.insideKnowledgeEllipse ? 1 : 0
      const nextAlpha = targetAlpha > currentAlpha
        ? Math.min(targetAlpha, currentAlpha + fadeInStep)
        : Math.max(targetAlpha, currentAlpha - fadeOutStep)

      if (nextAlpha <= 0.01) {
        this.labelVisibilityByCity.delete(marker.city.id)
        marker.labelAlpha = 0
        return
      }

      this.labelVisibilityByCity.set(marker.city.id, nextAlpha)
      marker.labelAlpha = nextAlpha
    })
  }

  updateCityPresentation = (state, elapsedSeconds) => {
    const target = state.activeTab === 'city' ? 1 : 0
    const animationRate = Math.min(1, elapsedSeconds * 4.6)

    this.displayedCityPresentation = lerp(this.displayedCityPresentation, target, animationRate)

    if (Math.abs(target - this.displayedCityPresentation) < 0.01) {
      this.displayedCityPresentation = target
    }
  }

  getLabelScaleMultiplierForMarker = marker => {
    let scaleMultiplier = lerp(1, diplomacyLabelScale, this.displayedDiplomacyPresentation)

    if (!marker.isPlayer) {
      return scaleMultiplier
    }

    scaleMultiplier *= lerp(1, cityTabFocusedLabelScale, this.displayedCityPresentation)
    scaleMultiplier *= lerp(1, buyTabPlayerLabelScale, this.displayedBuyPresentation)

    return scaleMultiplier
  }

  getLabelPriorityForMarker = marker => {
    const basePriority = marker.city.population

    if (!marker.isPlayer) {
      return basePriority
    }

    return basePriority + this.displayedCityPresentation * 1000000
  }

  getStructureOverviewPresentation = () => Math.max(this.displayedBuyPresentation, this.displayedCalendarPresentation)

  getStructureVisibilityForCity = (ownerCityId, playerCityId, baseVisibility = 1) => {
    if (baseVisibility <= 0.01 || !playerCityId) {
      return baseVisibility
    }

    return ownerCityId === playerCityId
      ? baseVisibility
      : baseVisibility * (1 - this.displayedCityPresentation)
  }

  getStructureBadgeVisibilityForCity = (ownerCityId, playerCityId, baseVisibility = 1) => {
    const structureVisibility = this.getStructureVisibilityForCity(ownerCityId, playerCityId, baseVisibility)

    if (ownerCityId !== playerCityId) {
      return structureVisibility
    }

    return structureVisibility * (1 - this.displayedCityPresentation)
  }

  getStructureNetworkVisibilityForCity = (ownerCityId, playerCityId, baseVisibility = 1) => {
    const structureVisibility = this.getStructureVisibilityForCity(ownerCityId, playerCityId, baseVisibility)
    const structureOverviewPresentation = this.getStructureOverviewPresentation()

    if (ownerCityId === playerCityId) {
      return structureVisibility
    }

    return structureVisibility * (1 - structureOverviewPresentation)
  }

  updateDiplomacyPresentation = (state, elapsedSeconds) => {
    const target = state.activeTab === 'diplomacy' ? 1 : 0
    const animationRate = Math.min(1, elapsedSeconds * 4.2)

    this.displayedDiplomacyPresentation = lerp(this.displayedDiplomacyPresentation, target, animationRate)

    if (Math.abs(target - this.displayedDiplomacyPresentation) < 0.01) {
      this.displayedDiplomacyPresentation = target
    }
  }

  updateCalendarPresentation = (state, elapsedSeconds) => {
    const target = state.activeTab === 'calendar' ? 1 : 0
    const animationRate = Math.min(1, elapsedSeconds * 4.2)

    this.displayedCalendarPresentation = lerp(this.displayedCalendarPresentation, target, animationRate)

    if (Math.abs(target - this.displayedCalendarPresentation) < 0.01) {
      this.displayedCalendarPresentation = target
    }
  }

  updateBuyPresentation = (state, elapsedSeconds) => {
    const target = state.activeTab === 'buy' ? 1 : 0
    const animationRate = Math.min(1, elapsedSeconds * 4.6)

    this.displayedBuyPresentation = lerp(this.displayedBuyPresentation, target, animationRate)

    if (Math.abs(target - this.displayedBuyPresentation) < 0.01) {
      this.displayedBuyPresentation = target
    }
  }

  updateTradeRouteVisibility = (state, elapsedSeconds) => {
    const target = state.activeTab === 'buy' ? 0 : 1
    const animationRate = Math.min(1, elapsedSeconds * 5.2)

    this.displayedTradeRouteVisibility = lerp(this.displayedTradeRouteVisibility, target, animationRate)

    if (Math.abs(target - this.displayedTradeRouteVisibility) < 0.01) {
      this.displayedTradeRouteVisibility = target
    }
  }

  getDiplomacyLabelOffset = now => {
    const amplitude = this.displayedDiplomacyPresentation

    if (amplitude <= 0.001) {
      return { x: 0, y: 0 }
    }

    return {
      x: Math.sin(now / 850) * diplomacyLabelDriftX * amplitude,
      y: Math.cos(now / 1100) * diplomacyLabelDriftY * amplitude
    }
  }

  offsetPlacedLabels = (placedLabels, offset) => {
    if (Math.abs(offset.x) < 0.001 && Math.abs(offset.y) < 0.001) {
      return placedLabels
    }

    return placedLabels.map(placedLabel => ({
      ...placedLabel,
      box: {
        ...placedLabel.box,
        left: placedLabel.box.left + offset.x,
        top: placedLabel.box.top + offset.y
      },
      crestBox: {
        ...placedLabel.crestBox,
        left: placedLabel.crestBox.left + offset.x,
        top: placedLabel.crestBox.top + offset.y
      }
    }))
  }

  drawConnectors = (markers, placedLabels, alpha = 1) => {
    placedLabels.forEach(placedLabel => {
      const marker = markers.find(entry => entry.city.id === placedLabel.cityId)
      if (!marker) {
        return
      }

      const crestCenter = getRectCenter(placedLabel.crestBox)

      this.drawStructureLink(
        { x: marker.x, y: marker.y },
        crestCenter,
        this.flagRenderer.getFlagHaloColor(marker.city.flag),
        (marker.displayedLabelAlpha ?? marker.labelAlpha) * alpha
      )
    })

    this.context.globalAlpha = 1
  }

  drawLabels = (markers, placedLabels, obscuredTileBounds = null, alpha = 1) => {
    this.context.textBaseline = 'top'

    placedLabels.forEach(placedLabel => {
      const marker = markers.find(entry => entry.city.id === placedLabel.cityId)
      if (!marker) {
        return
      }

      this.context.font = placedLabel.label.font
      this.context.globalAlpha = (marker.displayedLabelAlpha ?? marker.labelAlpha) * alpha
      const flagSprite = this.flagRenderer.renderFlagSprite(marker.city.flag)
      if (flagSprite) {
        const crestOpacity = obscuredTileBounds && rectangleIntersectsRectangle(placedLabel.crestBox, obscuredTileBounds)
          ? 0.35
          : 1

        this.context.globalAlpha = (marker.displayedLabelAlpha ?? marker.labelAlpha) * crestOpacity * alpha
        this.context.drawImage(
          flagSprite,
          placedLabel.crestBox.left,
          placedLabel.crestBox.top,
          placedLabel.crestBox.width,
          placedLabel.crestBox.height
        )
      }

      this.context.globalAlpha = (marker.displayedLabelAlpha ?? marker.labelAlpha) * alpha
      this.context.fillStyle = textColor
      this.context.shadowColor = labelShadowColor
      this.context.shadowBlur = 0
      this.context.shadowOffsetX = 1
      this.context.shadowOffsetY = 1
      placedLabel.label.lines.forEach((line, index) => {
        this.context.fillText(
          line,
          placedLabel.box.left + placedLabel.label.paddingX,
          placedLabel.box.top + placedLabel.label.textTop + index * placedLabel.label.lineHeight
        )
      })
      this.context.shadowColor = 'transparent'
      this.context.shadowOffsetX = 0
      this.context.shadowOffsetY = 0
    })

    this.context.globalAlpha = 1
  }

  drawOverlay = () => {
    this.context.globalAlpha = 0.34
    this.context.drawImage(this.tarnishOverlayImage, 0, 0, this.viewport.width, this.viewport.height)
    this.context.globalAlpha = 1
  }

  render = (state, now, overlays = {}) => {
    this.resizeCanvasForDisplay()
    this.updateCamera(state)
    this.updateProjectionCache()
    const playerCity = getPlayerCity(state)
    const elapsedSeconds = this.lastRenderedAt > 0
      ? Math.min((now - this.lastRenderedAt) / 1000, 0.12)
      : 1 / 60
    this.updateDisplayedKnowledgeRadius(playerCity, elapsedSeconds)
    this.updateCityPresentation(state, elapsedSeconds)
    this.updateDiplomacyPresentation(state, elapsedSeconds)
    this.updateCalendarPresentation(state, elapsedSeconds)
    this.updateBuyPresentation(state, elapsedSeconds)
    this.updateTradeRouteVisibility(state, elapsedSeconds)
    const knowledgeEllipse = this.getKnowledgeEllipse(state, playerCity, this.displayedKnowledgeRadiusKm)
    const labeledCityIds = playerCity
      ? new Set([playerCity.id, ...getKnownCityIds(state, playerCity.id)])
      : new Set(state.startingOptionIds)

    const markers = state.cities.map(city => {
      const position = this.worldToScreen(state.cityPositions[city.id])
      const populationScale = this.getPopulationScale(city, state.cities)
      const dotWidth = (9 + populationScale * 9) * 6
      const dotHeight = dotWidth * cityDotAspectRatio
      const known = labeledCityIds.has(city.id)

      return {
        city,
        allCities: state.cities,
        worldPosition: state.cityPositions[city.id],
        x: position.x,
        y: position.y,
        radius: Math.max(dotWidth, dotHeight) * 0.5,
        dotWidth,
        dotHeight,
        labelPriority: 0,
        labelScaleMultiplier: 1,
        known,
        isPlayer: playerCity?.id === city.id
      }
    })

    markers.forEach(marker => {
      marker.visibleOnScreen = this.isMarkerVisibleOnScreen(marker)
      marker.insideKnowledgeEllipse = !knowledgeEllipse || this.isPointInsideKnowledgeEllipse(marker.worldPosition, knowledgeEllipse)
      marker.labelScaleMultiplier = this.getLabelScaleMultiplierForMarker(marker)
      marker.labelPriority = this.getLabelPriorityForMarker(marker)
    })
    this.updateLabelVisibility(markers, elapsedSeconds)
    markers.forEach(marker => {
      marker.displayedLabelAlpha = marker.labelAlpha * (marker.isPlayer ? 1 : 1 - this.displayedBuyPresentation)
    })
    this.lastRenderedAt = now

    const structureVisibility = 1 - this.displayedDiplomacyPresentation
    const playerCityId = playerCity?.id ?? null
    const demolitionMode = overlays.demolitionMode === true
    const getCityStructureAlpha = ownerCityId => this.getStructureVisibilityForCity(ownerCityId, playerCityId, structureVisibility)
    const getDemolitionStructureAlpha = structure => {
      const baseAlpha = getCityStructureAlpha(structure.ownerCityId)

      if (!demolitionMode || playerCityId == null) {
        return baseAlpha
      }

      const demolitionAvailability = getStructureDemolitionAvailability(
        state,
        playerCityId,
        structure.columnIndex,
        structure.rowIndex
      )

      return demolitionAvailability.canDemolish ? baseAlpha : baseAlpha * 0.35
    }
    const getCityStructureNetworkAlpha = ownerCityId => this.getStructureNetworkVisibilityForCity(ownerCityId, playerCityId, structureVisibility)
    const getStructureAlpha = structure => getDemolitionStructureAlpha(structure)
    const getStructureBadgeAlpha = structure => {
      const baseAlpha = this.getStructureBadgeVisibilityForCity(structure.ownerCityId, playerCityId, structureVisibility)

      if (!demolitionMode || playerCityId == null) {
        return baseAlpha
      }

      const demolitionAvailability = getStructureDemolitionAvailability(
        state,
        playerCityId,
        structure.columnIndex,
        structure.rowIndex
      )

      return demolitionAvailability.canDemolish ? baseAlpha : baseAlpha * 0.35
    }
    const labeledMarkers = markers.filter(marker => marker.known && marker.visibleOnScreen && marker.insideKnowledgeEllipse && marker.displayedLabelAlpha > 0.02)
    const blockedLabelRectangles = [
      ...this.getLabelObstacleRectangles(overlays.structures ?? [], state.terrain, state, knowledgeEllipse, getStructureAlpha, getStructureBadgeAlpha),
      ...this.getLabelObstacleRectangles(overlays.pendingStructures ?? [], state.terrain, state, knowledgeEllipse, getStructureAlpha, getStructureBadgeAlpha)
    ]
    const diplomacyLabelOffset = this.getDiplomacyLabelOffset(now)
    const placedLabels = this.offsetPlacedLabels(this.smoothPlacedLabels(this.layoutLabels(labeledMarkers, blockedLabelRectangles), elapsedSeconds), diplomacyLabelOffset)
    const obscuredTileBounds = this.getPlacementPreviewBounds(overlays.placementPreview ?? null, state.terrain)

    this.context.clearRect(0, 0, this.viewport.width, this.viewport.height)
    this.drawTerrainLayer(state.terrain)
    this.drawStructureNetworks(state, state.terrain, overlays.pendingStructures ?? [], knowledgeEllipse, getCityStructureNetworkAlpha)
    this.drawKnowledgeFog(knowledgeEllipse)
    this.drawValidPlacementTiles(overlays.validPlacementTiles ?? [], state.terrain)
    this.drawStructures(overlays.structures ?? [], state.terrain, state, knowledgeEllipse, getStructureAlpha, getStructureBadgeAlpha)
    this.drawPendingStructures(overlays.pendingStructures ?? [], state.terrain, now, state, knowledgeEllipse, getStructureAlpha, getStructureBadgeAlpha)
    this.drawTradeRoutes(state, knowledgeEllipse, this.displayedTradeRouteVisibility)
    this.drawPlacementPreview(overlays.placementPreview ?? null, state.terrain)
    this.drawFrame()

    this.drawConnectors(labeledMarkers, placedLabels)
    this.drawLabels(labeledMarkers, placedLabels, obscuredTileBounds)
    this.drawMarkers(markers)
    this.drawMarkerBadges(markers)
    this.drawOverlay()
  }
}

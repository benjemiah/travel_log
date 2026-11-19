const HEIGHT_PER_ALTITUDE = 7_000_000;
const MAP_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export class CesiumGlobe {
  constructor(container, { onGlobeClick, onPointClick, onReady } = {}) {
    const Cesium = window.Cesium;
    if (!Cesium) throw new Error('CesiumJS wurde nicht geladen.');
    this.Cesium = Cesium;
    this.onGlobeClick = onGlobeClick;
    this.onPointClick = onPointClick;
    this.lastInteraction = performance.now();
    this.reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.entityTrips = new Map();
    this.selectionEntityIds = new Set();
    this.selectedTripId = null;

    const textureUrl = Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII');
    const baseLayer = Cesium.ImageryLayer.fromProviderAsync(
      Cesium.TileMapServiceImageryProvider.fromUrl(textureUrl)
    );

    this.viewer = new Cesium.Viewer(container, {
      baseLayer,
      baseLayerPicker: false,
      animation: false,
      timeline: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      vrButton: false,
      infoBox: false,
      selectionIndicator: false,
      shouldAnimate: true,
      requestRenderMode: false,
      contextOptions: { webgl: { alpha: true, antialias: true } },
    });

    const { scene } = this.viewer;
    scene.backgroundColor = Cesium.Color.TRANSPARENT;
    scene.skyBox.show = false;
    scene.sun.show = false;
    scene.moon.show = false;
    scene.skyAtmosphere.show = true;
    scene.skyAtmosphere.atmosphereLightIntensity = 8;
    scene.globe.enableLighting = false;
    scene.globe.showGroundAtmosphere = true;
    scene.globe.baseColor = Cesium.Color.fromCssColorString('#12384a');
    scene.globe.maximumScreenSpaceError = 2;
    scene.fog.enabled = false;
    scene.highDynamicRange = true;

    baseLayer.readyEvent.addEventListener(() => {
      baseLayer.brightness = .72;
      baseLayer.contrast = 1.18;
      baseLayer.saturation = .72;
      baseLayer.gamma = .92;
      baseLayer.hue = -.03;
    });

    const streetProvider = new Cesium.UrlTemplateImageryProvider({
      url: MAP_TILE_URL,
      maximumLevel: 19,
      enablePickFeatures: false,
      hasAlphaChannel: false,
      credit: new Cesium.Credit(
        '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>',
        true,
      ),
    });
    this.streetLayer = new Cesium.ImageryLayer(streetProvider, {
      brightness: .78,
      contrast: 1.08,
      saturation: .72,
      gamma: .92,
    });
    this.viewer.imageryLayers.add(this.streetLayer);
    this.streetLayer.magnificationFilter = Cesium.TextureMagnificationFilter.LINEAR;
    this.streetLayer.minificationFilter = Cesium.TextureMinificationFilter.LINEAR;

    this.dataSource = new Cesium.CustomDataSource('atlas-trips');
    this.gridDataSource = new Cesium.CustomDataSource('atlas-grid');
    this.selectionDataSource = new Cesium.CustomDataSource('atlas-selection');
    this.createGrid();
    this.viewer.dataSources.add(this.gridDataSource);
    this.viewer.dataSources.add(this.dataSource);
    this.viewer.dataSources.add(this.selectionDataSource);
    this.bindPicking();
    this.bindRotation();

    let readyReported = false;
    const removeProgressListener = scene.globe.tileLoadProgressEvent.addEventListener(remaining => {
      if (!readyReported && remaining === 0) {
        readyReported = true;
        removeProgressListener();
        onReady?.();
      }
    });
    window.setTimeout(() => {
      if (!readyReported) {
        readyReported = true;
        removeProgressListener();
        onReady?.();
      }
    }, 3500);
  }

  bindPicking() {
    const { Cesium, viewer } = this;
    const handler = viewer.screenSpaceEventHandler;
    handler.setInputAction(movement => {
      this.lastInteraction = performance.now();
      const picked = viewer.scene.pick(movement.position);
      const pickedId = picked?.id?.id;
      if (pickedId && this.entityTrips.has(pickedId)) {
        const trip = this.entityTrips.get(pickedId);
        this.highlightTrip(trip);
        this.onPointClick?.(trip);
        return;
      }
      const cartesian = viewer.camera.pickEllipsoid(movement.position, viewer.scene.globe.ellipsoid);
      if (!cartesian) return;
      const coordinates = Cesium.Cartographic.fromCartesian(cartesian);
      this.onGlobeClick?.({
        lat: Cesium.Math.toDegrees(coordinates.latitude),
        lng: Cesium.Math.toDegrees(coordinates.longitude),
      });
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  createGrid() {
    const { Cesium } = this;
    const entities = this.gridDataSource.entities;
    const gridHeight = 28_000;
    const addLine = (id, coordinates, major) => entities.add({
      id,
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArrayHeights(coordinates),
        width: major ? 1.25 : .8,
        arcType: Cesium.ArcType.NONE,
        material: Cesium.Color.WHITE.withAlpha(major ? .25 : .13),
      },
    });

    entities.suspendEvents();
    for (let latitude = -75; latitude <= 75; latitude += 15) {
      const coordinates = [];
      for (let longitude = -180; longitude <= 180; longitude += 3) {
        coordinates.push(longitude, latitude, gridHeight);
      }
      addLine(`grid-lat-${latitude}`, coordinates, latitude % 30 === 0);
    }
    for (let longitude = -180; longitude < 180; longitude += 15) {
      const coordinates = [];
      for (let latitude = -87; latitude <= 87; latitude += 3) {
        coordinates.push(longitude, latitude, gridHeight);
      }
      addLine(`grid-lng-${longitude}`, coordinates, longitude % 30 === 0);
    }
    entities.resumeEvents();
  }

  bindRotation() {
    const { Cesium, viewer } = this;
    const markInteraction = () => { this.lastInteraction = performance.now(); };
    viewer.canvas.addEventListener('pointerdown', markInteraction, { passive: true });
    viewer.canvas.addEventListener('wheel', markInteraction, { passive: true });
    let previous = performance.now();
    viewer.scene.preUpdate.addEventListener(() => {
      const now = performance.now();
      const seconds = Math.min(.1, (now - previous) / 1000);
      previous = now;
      if (!this.reduceMotion && now - this.lastInteraction > 2600) {
        viewer.camera.rotate(Cesium.Cartesian3.UNIT_Z, -seconds * .025);
      }
    });
  }

  setData(trips) {
    const { Cesium } = this;
    this.dataSource.entities.removeAll();
    this.clearSelection(false);
    this.entityTrips.clear();
    const ordered = [...trips].sort((a, b) => a.startDate.localeCompare(b.startDate));

    for (const trip of ordered) {
      const id = `trip-${trip.id}`;
      this.entityTrips.set(id, trip);
      this.dataSource.entities.add({
        id,
        name: trip.name,
        position: Cesium.Cartesian3.fromDegrees(trip.lng, trip.lat, 16_000),
        point: {
          pixelSize: 13,
          color: Cesium.Color.fromCssColorString('#d9ff62'),
          outlineColor: Cesium.Color.fromCssColorString('#07131f'),
          outlineWidth: 3,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: new Cesium.NearFarScalar(1_000_000, 1.35, 24_000_000, .72),
        },
        label: {
          text: trip.name,
          font: '700 14px system-ui, sans-serif',
          fillColor: Cesium.Color.WHITE,
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString('#07131f').withAlpha(.78),
          backgroundPadding: new Cesium.Cartesian2(9, 6),
          pixelOffset: new Cesium.Cartesian2(0, -18),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 16_000_000),
          scaleByDistance: new Cesium.NearFarScalar(1_000_000, 1, 16_000_000, .68),
        },
      });
    }

    for (let index = 1; index < ordered.length; index += 1) {
      const first = ordered[index - 1];
      const second = ordered[index];
      this.dataSource.entities.add({
        id: `route-${first.id}-${second.id}`,
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray([
            first.lng, first.lat, second.lng, second.lat,
          ]),
          width: 2,
          arcType: Cesium.ArcType.GEODESIC,
          clampToGround: false,
          material: new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.fromCssColorString('#ff7658').withAlpha(.9),
            dashLength: 18,
          }),
        },
      });
    }

    const selectedTrip = ordered.find(trip => trip.id === this.selectedTripId);
    if (selectedTrip) this.highlightTrip(selectedTrip);
    else this.selectedTripId = null;
  }

  highlightTrip(trip) {
    if (!trip) return;
    const { Cesium } = this;
    this.clearSelection(false);
    this.selectedTripId = trip.id;
    const position = Cesium.Cartesian3.fromDegrees(trip.lng, trip.lat, 30_000);
    const pointerId = `selected-pointer-${trip.id}`;
    const ringId = `selected-ring-${trip.id}`;
    const pin = new Cesium.PinBuilder().fromColor(
      Cesium.Color.fromCssColorString('#ff7658'),
      52,
    );

    this.selectionDataSource.entities.add({
      id: ringId,
      position,
      point: {
        pixelSize: 38,
        color: Cesium.Color.TRANSPARENT,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 3,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new Cesium.NearFarScalar(500_000, 1.15, 18_000_000, .7),
      },
    });
    this.selectionDataSource.entities.add({
      id: pointerId,
      position,
      billboard: {
        image: pin,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -13),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new Cesium.NearFarScalar(500_000, 1, 18_000_000, .62),
      },
    });
    this.selectionEntityIds.add(pointerId);
    this.selectionEntityIds.add(ringId);
    this.entityTrips.set(pointerId, trip);
    this.entityTrips.set(ringId, trip);
  }

  clearSelection(resetSelectedId = true) {
    this.selectionDataSource?.entities.removeAll();
    for (const id of this.selectionEntityIds) this.entityTrips.delete(id);
    this.selectionEntityIds.clear();
    if (resetSelectedId) this.selectedTripId = null;
  }

  setGridVisible(visible) {
    this.gridDataSource.show = Boolean(visible);
  }

  setMapMode(mode) {
    this.streetLayer.show = mode === 'map';
  }

  pointOfView(view, duration = .6) {
    const { Cesium, viewer } = this;
    if (!view) {
      const position = viewer.camera.positionCartographic;
      return {
        lat: Cesium.Math.toDegrees(position.latitude),
        lng: Cesium.Math.toDegrees(position.longitude),
        altitude: position.height / HEIGHT_PER_ALTITUDE,
      };
    }
    this.lastInteraction = performance.now();
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        Number.isFinite(view.lng) ? view.lng : 15,
        Number.isFinite(view.lat) ? view.lat : 24,
        Math.max(.75, Math.min(3.7, view.altitude ?? 2.15)) * HEIGHT_PER_ALTITUDE,
      ),
      orientation: {
        heading: 0,
        pitch: Cesium.Math.toRadians(-90),
        roll: 0,
      },
      duration: this.reduceMotion ? 0 : Math.max(0, duration),
    });
    return this;
  }
}

const HEIGHT_PER_ALTITUDE = 7_000_000;
const MIN_HEIGHT = 250;
const MAX_HEIGHT = 26_000_000;
const IMAGERY_URL = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer';
const LABELS_URL = 'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';

export class CesiumGlobe {
  constructor(container, { onGlobeClick, onPointClick, onReady, onMapError } = {}) {
    const Cesium = window.Cesium;
    if (!Cesium) throw new Error('CesiumJS wurde nicht geladen.');
    this.Cesium = Cesium;
    this.onGlobeClick = onGlobeClick;
    this.onPointClick = onPointClick;
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
      shouldAnimate: false,
      requestRenderMode: true,
      maximumRenderTimeChange: Number.POSITIVE_INFINITY,
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
    scene.globe.baseColor = Cesium.Color.fromCssColorString('#235677');
    scene.globe.maximumScreenSpaceError = 2;
    scene.fog.enabled = false;
    scene.highDynamicRange = true;

    const controls = scene.screenSpaceCameraController;
    controls.minimumZoomDistance = MIN_HEIGHT;
    controls.maximumZoomDistance = MAX_HEIGHT;
    controls.zoomFactor = 3;
    controls.inertiaZoom = .65;
    controls.inertiaSpin = .75;
    controls.maximumMovementRatio = .08;
    controls.enableTilt = false;
    controls.enableLook = false;
    controls.zoomEventTypes = [Cesium.CameraEventType.WHEEL, Cesium.CameraEventType.PINCH];
    this.viewer.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

    // Keep the bundled earth texture underneath streaming imagery, including
    // when offline. Satellite tiles and transparent labels form one view.
    this.satelliteLayer = Cesium.ImageryLayer.fromProviderAsync(
      Cesium.ArcGisMapServerImageryProvider.fromUrl(IMAGERY_URL, {
        enablePickFeatures: false,
        maximumLevel: 19,
      }),
    );
    this.satelliteLayer.errorEvent.addEventListener(() => onMapError?.());
    this.satelliteLayer.readyEvent.addEventListener(provider => {
      provider.errorEvent.addEventListener(error => {
        if (error.timesRetried > 1 || !navigator.onLine) onMapError?.();
      });
    });
    this.viewer.imageryLayers.add(this.satelliteLayer);

    const labelsProvider = new Cesium.UrlTemplateImageryProvider({
      url: LABELS_URL,
      maximumLevel: 19,
      enablePickFeatures: false,
      hasAlphaChannel: true,
      credit: new Cesium.Credit(
        '<a href="https://www.arcgis.com/home/item.html?id=30e5fe3149c34df1ba922e6f5bbf808f" target="_blank" rel="noopener noreferrer">Ortsnamen: Esri, HERE, Garmin, © OpenStreetMap contributors, GIS community</a>',
      ),
    });
    this.viewer.imageryLayers.add(new Cesium.ImageryLayer(labelsProvider));

    this.dataSource = new Cesium.CustomDataSource('atlas-trips');
    this.selectionDataSource = new Cesium.CustomDataSource('atlas-selection');
    this.viewer.dataSources.add(this.dataSource);
    this.viewer.dataSources.add(this.selectionDataSource);
    this.bindPicking();
    this.viewer.canvas.addEventListener('pointerdown', () => {
      this.zoomTargetHeight = null;
      this.viewer.camera.cancelFlight();
    }, { passive: true });
    this.viewer.canvas.addEventListener('wheel', () => {
      this.zoomTargetHeight = null;
      this.viewer.camera.cancelFlight();
    }, { passive: true });

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
        position: Cesium.Cartesian3.fromDegrees(trip.lng, trip.lat, 10),
        point: {
          pixelSize: 13,
          color: Cesium.Color.fromCssColorString('#ed681c'),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 3,
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
          clampToGround: true,
          material: new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.fromCssColorString('#ed681c').withAlpha(.9),
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
    const position = Cesium.Cartesian3.fromDegrees(trip.lng, trip.lat, 10);
    const pointerId = `selected-pointer-${trip.id}`;
    const ringId = `selected-ring-${trip.id}`;
    const pin = new Cesium.PinBuilder().fromColor(
      Cesium.Color.fromCssColorString('#ed681c'),
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

  zoom(factor) {
    const { Cesium, viewer } = this;
    const center = new Cesium.Cartesian2(viewer.canvas.clientWidth / 2, viewer.canvas.clientHeight / 2);
    const target = viewer.camera.pickEllipsoid(center, viewer.scene.globe.ellipsoid);
    const position = target ? Cesium.Cartographic.fromCartesian(target) : viewer.camera.positionCartographic;
    const height = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT,
      (this.zoomTargetHeight ?? viewer.camera.positionCartographic.height) * factor));
    this.pointOfView({
      lat: Cesium.Math.toDegrees(position.latitude),
      lng: Cesium.Math.toDegrees(position.longitude),
      altitude: height / HEIGHT_PER_ALTITUDE,
    }, .3);
    this.zoomTargetHeight = height;
  }

  resetView(duration = .65) {
    const { viewer } = this;
    viewer.resize();
    const fieldOfView = Math.min(viewer.camera.frustum.fov, viewer.camera.frustum.fovy);
    const radius = viewer.scene.globe.ellipsoid.maximumRadius;
    const height = radius / (Math.sin(fieldOfView / 2) * .86) - radius;
    return this.pointOfView({ lat: 32, lng: 15, altitude: height / HEIGHT_PER_ALTITUDE }, duration);
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
    this.zoomTargetHeight = null;
    viewer.camera.cancelFlight();
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        Number.isFinite(view.lng) ? view.lng : 15,
        Number.isFinite(view.lat) ? view.lat : 24,
        Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, (view.altitude ?? 1.85) * HEIGHT_PER_ALTITUDE)),
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

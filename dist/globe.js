const DEG = Math.PI / 180;

// Deliberately simplified land silhouettes. They keep the globe lightweight,
// offline-capable and independent of map or tracking services.
const LAND = [
  [[-168,70],[-150,61],[-141,59],[-133,52],[-124,49],[-124,42],[-117,32],[-105,24],[-97,20],[-89,20],[-84,25],[-81,31],[-76,36],[-70,44],[-61,47],[-58,54],[-65,61],[-79,64],[-96,69],[-119,72],[-145,71]],
  [[-82,12],[-74,10],[-66,5],[-58,5],[-50,1],[-45,-8],[-39,-16],[-43,-23],[-50,-30],[-54,-38],[-63,-52],[-70,-55],[-74,-43],[-71,-30],[-76,-18],[-81,-4]],
  [[-53,82],[-27,83],[-19,75],[-25,68],[-41,60],[-51,64],[-59,72]],
  [[-17,36],[-6,36],[5,37],[14,32],[31,31],[40,15],[51,12],[49,2],[42,-12],[35,-23],[25,-34],[15,-35],[5,-30],[-4,-19],[-12,-5],[-17,15]],
  [[-11,36],[-9,43],[-2,48],[8,44],[14,49],[24,55],[31,59],[40,57],[50,51],[60,55],[72,55],[86,57],[98,54],[112,51],[124,53],[139,50],[151,59],[165,61],[177,52],[169,43],[150,38],[140,35],[132,42],[123,39],[119,31],[109,21],[105,10],[99,7],[91,21],[79,30],[69,24],[59,25],[50,29],[42,39],[32,42],[24,39],[16,42],[8,42],[1,44],[-5,43]],
  [[113,-22],[115,-34],[127,-38],[139,-36],[151,-28],[154,-17],[146,-12],[135,-13],[125,-15]],
  [[165,-35],[174,-37],[178,-43],[172,-47],[166,-45]],
  [[-180,-70],[-150,-72],[-120,-73],[-90,-71],[-60,-74],[-30,-72],[0,-75],[30,-73],[60,-74],[90,-71],[120,-73],[150,-72],[180,-70],[180,-88],[-180,-88]],
];

function vector(lat, lng) {
  const latitude = lat * DEG;
  const longitude = lng * DEG;
  const cosLat = Math.cos(latitude);
  return [cosLat * Math.sin(longitude), Math.sin(latitude), cosLat * Math.cos(longitude)];
}

function slerp(first, second, amount) {
  const dot = Math.max(-1, Math.min(1, first[0] * second[0] + first[1] * second[1] + first[2] * second[2]));
  const angle = Math.acos(dot);
  if (angle < .0001) return first;
  const sin = Math.sin(angle);
  const a = Math.sin((1 - amount) * angle) / sin;
  const b = Math.sin(amount * angle) / sin;
  return [first[0] * a + second[0] * b, first[1] * a + second[1] * b, first[2] * a + second[2] * b];
}

export class AtlasGlobe {
  constructor(container, { onGlobeClick, onPointClick } = {}) {
    this.container = container;
    this.onGlobeClick = onGlobeClick;
    this.onPointClick = onPointClick;
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-hidden', 'true');
    this.container.replaceChildren(this.canvas);
    this.context = this.canvas.getContext('2d');
    this.centerLat = 24;
    this.centerLng = 15;
    this.altitude = 2.15;
    this.points = [];
    this.drag = null;
    this.moved = false;
    this.lastInteraction = performance.now();
    this.reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.bind();
    this.resize();
    requestAnimationFrame(time => this.frame(time));
  }

  bind() {
    this.canvas.addEventListener('pointerdown', event => {
      this.canvas.setPointerCapture(event.pointerId);
      this.drag = { x: event.clientX, y: event.clientY, lat: this.centerLat, lng: this.centerLng };
      this.moved = false;
      this.lastInteraction = performance.now();
    });
    this.canvas.addEventListener('pointermove', event => {
      if (!this.drag) return;
      const dx = event.clientX - this.drag.x;
      const dy = event.clientY - this.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) this.moved = true;
      this.centerLng = this.drag.lng - dx * .28;
      this.centerLat = Math.max(-75, Math.min(75, this.drag.lat + dy * .22));
      this.lastInteraction = performance.now();
    });
    const release = event => {
      if (!this.drag) return;
      if (!this.moved) this.click(event);
      this.drag = null;
    };
    this.canvas.addEventListener('pointerup', release);
    this.canvas.addEventListener('pointercancel', () => { this.drag = null; });
    this.canvas.addEventListener('wheel', event => {
      event.preventDefault();
      this.altitude = Math.max(.75, Math.min(3.7, this.altitude * (event.deltaY > 0 ? 1.1 : .9)));
      this.lastInteraction = performance.now();
    }, { passive: false });
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    const pixelRatio = Math.min(2, devicePixelRatio || 1);
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.width * pixelRatio);
    this.canvas.height = Math.round(this.height * pixelRatio);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }

  setData(points) { this.points = [...points]; }

  pointOfView(view) {
    if (!view) return { lat: this.centerLat, lng: this.centerLng, altitude: this.altitude };
    if (Number.isFinite(view.lat)) this.centerLat = view.lat;
    if (Number.isFinite(view.lng)) this.centerLng = view.lng;
    if (Number.isFinite(view.altitude)) this.altitude = Math.max(.75, Math.min(3.7, view.altitude));
    this.lastInteraction = performance.now();
    return this;
  }

  project(lat, lng) {
    const phi = lat * DEG;
    const delta = (lng - this.centerLng) * DEG;
    const center = this.centerLat * DEG;
    const x = Math.cos(phi) * Math.sin(delta);
    const y = Math.sin(phi);
    const z = Math.cos(phi) * Math.cos(delta);
    const rotatedY = y * Math.cos(center) - z * Math.sin(center);
    const rotatedZ = y * Math.sin(center) + z * Math.cos(center);
    return { x: this.cx + this.radius * x, y: this.cy - this.radius * rotatedY, z: rotatedZ };
  }

  unproject(x, y) {
    const sphereX = (x - this.cx) / this.radius;
    const rotatedY = -(y - this.cy) / this.radius;
    const square = 1 - sphereX ** 2 - rotatedY ** 2;
    if (square < 0) return null;
    const rotatedZ = Math.sqrt(square);
    const center = this.centerLat * DEG;
    const sphereY = rotatedY * Math.cos(center) + rotatedZ * Math.sin(center);
    const sphereZ = -rotatedY * Math.sin(center) + rotatedZ * Math.cos(center);
    return {
      lat: Math.asin(Math.max(-1, Math.min(1, sphereY))) / DEG,
      lng: ((this.centerLng + Math.atan2(sphereX, sphereZ) / DEG + 540) % 360) - 180,
    };
  }

  click(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const hit = this.points.map(point => ({ point, screen: this.project(point.lat, point.lng) }))
      .filter(item => item.screen.z > 0)
      .sort((a, b) => ((a.screen.x - x) ** 2 + (a.screen.y - y) ** 2) - ((b.screen.x - x) ** 2 + (b.screen.y - y) ** 2))[0];
    if (hit && (hit.screen.x - x) ** 2 + (hit.screen.y - y) ** 2 < 17 ** 2) {
      this.onPointClick?.(hit.point);
      return;
    }
    const coordinates = this.unproject(x, y);
    if (coordinates) this.onGlobeClick?.(coordinates);
  }

  drawPath(samples, { stroke, fill, width = 1, close = false } = {}) {
    const context = this.context;
    let drawing = false;
    context.beginPath();
    for (const [lng, lat] of samples) {
      const point = this.project(lat, lng);
      if (point.z <= -.015) { drawing = false; continue; }
      if (!drawing) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
      drawing = true;
    }
    if (close && drawing) context.closePath();
    if (fill) { context.fillStyle = fill; context.fill(); }
    if (stroke) { context.strokeStyle = stroke; context.lineWidth = width; context.stroke(); }
  }

  drawGraticules() {
    for (let lat = -60; lat <= 60; lat += 30) {
      const samples = [];
      for (let lng = -180; lng <= 180; lng += 4) samples.push([lng, lat]);
      this.drawPath(samples, { stroke: 'rgba(157,220,218,.15)', width: .7 });
    }
    for (let lng = -180; lng < 180; lng += 30) {
      const samples = [];
      for (let lat = -88; lat <= 88; lat += 3) samples.push([lng, lat]);
      this.drawPath(samples, { stroke: 'rgba(157,220,218,.15)', width: .7 });
    }
  }

  drawLand() {
    for (const polygon of LAND) this.drawPath(polygon, {
      fill: 'rgba(62,126,133,.38)', stroke: 'rgba(166,226,213,.46)', width: 1, close: true,
    });
  }

  drawArcs() {
    if (this.points.length < 2) return;
    const ordered = [...this.points].sort((a, b) => a.startDate.localeCompare(b.startDate));
    for (let index = 1; index < ordered.length; index += 1) {
      const first = vector(ordered[index - 1].lat, ordered[index - 1].lng);
      const second = vector(ordered[index].lat, ordered[index].lng);
      const context = this.context;
      context.beginPath();
      let drawing = false;
      for (let step = 0; step <= 42; step += 1) {
        const point = slerp(first, second, step / 42);
        const lat = Math.asin(point[1]) / DEG;
        const lng = Math.atan2(point[0], point[2]) / DEG;
        const screen = this.project(lat, lng);
        if (screen.z <= 0) { drawing = false; continue; }
        if (!drawing) context.moveTo(screen.x, screen.y);
        else context.lineTo(screen.x, screen.y);
        drawing = true;
      }
      context.strokeStyle = 'rgba(255,118,88,.72)';
      context.lineWidth = 1.5;
      context.setLineDash([5, 7]);
      context.lineDashOffset = -performance.now() / 90;
      context.stroke();
      context.setLineDash([]);
    }
  }

  drawPoints() {
    const visible = this.points.map(point => ({ point, screen: this.project(point.lat, point.lng) })).filter(item => item.screen.z > 0);
    for (const { screen } of visible) {
      const size = 4 + 2 * screen.z;
      const glow = this.context.createRadialGradient(screen.x, screen.y, 0, screen.x, screen.y, size * 3);
      glow.addColorStop(0, 'rgba(217,255,98,.8)');
      glow.addColorStop(1, 'rgba(217,255,98,0)');
      this.context.fillStyle = glow;
      this.context.beginPath();
      this.context.arc(screen.x, screen.y, size * 3, 0, Math.PI * 2);
      this.context.fill();
      this.context.fillStyle = '#d9ff62';
      this.context.beginPath();
      this.context.arc(screen.x, screen.y, size, 0, Math.PI * 2);
      this.context.fill();
      this.context.strokeStyle = '#07131f';
      this.context.lineWidth = 1.5;
      this.context.stroke();
    }
  }

  draw() {
    const context = this.context;
    context.clearRect(0, 0, this.width, this.height);
    this.cx = this.width / 2;
    this.cy = this.height / 2;
    const baseRadius = Math.min(this.width, this.height) * .43;
    this.radius = baseRadius * (2.15 / this.altitude);

    context.save();
    context.shadowColor = 'rgba(73,205,221,.22)';
    context.shadowBlur = 42;
    const ocean = context.createRadialGradient(this.cx - this.radius * .3, this.cy - this.radius * .36, this.radius * .08, this.cx, this.cy, this.radius);
    ocean.addColorStop(0, '#285a6b');
    ocean.addColorStop(.5, '#12384a');
    ocean.addColorStop(1, '#06141e');
    context.fillStyle = ocean;
    context.beginPath();
    context.arc(this.cx, this.cy, this.radius, 0, Math.PI * 2);
    context.fill();
    context.restore();

    context.save();
    context.beginPath();
    context.arc(this.cx, this.cy, this.radius, 0, Math.PI * 2);
    context.clip();
    this.drawGraticules();
    this.drawLand();
    this.drawArcs();
    this.drawPoints();
    const shade = context.createRadialGradient(this.cx - this.radius * .32, this.cy - this.radius * .3, this.radius * .2, this.cx, this.cy, this.radius * 1.05);
    shade.addColorStop(.45, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,5,10,.62)');
    context.fillStyle = shade;
    context.fillRect(this.cx - this.radius, this.cy - this.radius, this.radius * 2, this.radius * 2);
    context.restore();
    context.strokeStyle = 'rgba(117,220,232,.45)';
    context.lineWidth = 1;
    context.beginPath();
    context.arc(this.cx, this.cy, this.radius, 0, Math.PI * 2);
    context.stroke();
  }

  frame(time) {
    if (!this.reduceMotion && !this.drag && time - this.lastInteraction > 2500) this.centerLng += .025;
    this.draw();
    requestAnimationFrame(next => this.frame(next));
  }
}

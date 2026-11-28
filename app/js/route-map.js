window.HVRouteMap = (() => {
  'use strict';

  const map = window.HVMap;
  const detail = window.HVMapDetail;
  const towns = new Map(detail?.towns.map((town) => [town.id, town]));
  const crimea = detail?.roads_named['М-2 «Крым»'] ?? [];
  const kholmogory = detail?.roads_named['М-8 «Холмогоры»'] ?? [];
  const corridor = [...crimea, ...kholmogory.slice(1)];
  const junction = corridor.indexOf('moscow');
  const width = 300;
  // Общая карта России спроецирована с центром на 105° в. д., поэтому в Центральной России север
  // смотрит вправо-вверх (~57°). Для карты маршрута разворачиваем всё севером вверх вокруг 38.5° в. д., 56° с. ш.
  const pivot = map.project(38.5, 56);
  const northTip = map.project(38.5, 57);
  const tilt = Math.atan2(northTip.x - pivot.x, pivot.y - northTip.y);
  const turn = -tilt, cosT = Math.cos(turn), sinT = Math.sin(turn);
  const turnDeg = turn * 180 / Math.PI;
  const rotate = ({ x, y }) => ({
    x: (x - pivot.x) * cosT - (y - pivot.y) * sinT + pivot.x,
    y: (x - pivot.x) * sinT + (y - pivot.y) * cosT + pivot.y,
  });
  const height = 248;
  // Подписи рек ставятся по координатам точки на реке (lon/lat), уже после разворота севером вверх.
  const riverLabels = [
    { name: 'Волга', lon: 38.9, lat: 57.95, dx: 0, dy: -6, angle: -8 },
    { name: 'Ока', lon: 38.6, lat: 54.75, dx: 6, dy: 14, angle: -20 },
  ];
  // Смещения в поле SVG оставляют место для маркера на линии и соседних подписей.
  const labelOffsets = {
    tula: [10, 4, 'start'],
    serpukhov: [-10, 4, 'end'],
    moscow: [-12, 4, 'end'],
    'sergiev-posad': [10, 4, 'start'],
    pereslavl: [-10, -2, 'end'],
    rostov: [10, 4, 'start'],
    yaroslavl: [-10, -6, 'end'],
  };

  function distance(from, to) {
    const radians = (value) => value * Math.PI / 180;
    const lat1 = radians(from.lat), lat2 = radians(to.lat);
    const dLat = lat2 - lat1, dLon = radians(to.lon - from.lon);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
  }

  function frame(points) {
    const xs = points.map(({ x }) => x);
    const ys = points.map(({ y }) => y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const scale = Math.min(width / Math.max(57, maxX - minX + 20), height / (maxY - minY + 22));
    const x = width / 2 - (minX + maxX) / 2 * scale;
    const y = height * 0.52 - (minY + maxY) / 2 * scale;
    return { scale, x, y, place: (point) => ({ x: point.x * scale + x, y: point.y * scale + y }) };
  }

  const xy = (point) => `${point.x.toFixed(3)} ${point.y.toFixed(3)}`;

  function curve(points) {
    // Каждый кубический сегмент Catmull–Rom проходит через две соседние остановки.
    const control = (anchor, from, to) => ({
      x: anchor.x + (to.x - from.x) / 6,
      y: anchor.y + (to.y - from.y) / 6,
    });
    const start = `M${xy(points[0])}`;
    const prefixes = points.slice(1).reduce((paths, end, i) => {
      const begin = points[i];
      const first = control(begin, points[i - 1] ?? begin, end);
      const second = control(end, points[i + 2] ?? end, begin);
      paths.push(`${paths.at(-1)} C${xy(first)} ${xy(second)} ${xy(end)}`);
      return paths;
    }, [start]);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const lengths = prefixes.map((d) => {
      path.setAttribute('d', d);
      return path.getTotalLength();
    });
    return { d: prefixes.at(-1), arrivals: lengths.map((length) => length / lengths.at(-1)) };
  }

  function geography(view) {
    return `<g class="map-geography" transform="translate(${view.x} ${view.y}) scale(${view.scale}) rotate(${turnDeg.toFixed(3)} ${pivot.x.toFixed(3)} ${pivot.y.toFixed(3)})">
      <path class="russia-shape" fill-rule="evenodd" d="${map.shape}"></path>
      ${detail.lakes.map(({ d }) => `<path class="map-lake" d="${d}"></path>`).join('')}
      <path class="map-rail" d="${detail.rail.map(({ d }) => d).join(' ')}"></path>
      ${detail.roads.map(({ type, d }) => `<path class="map-road${type === 'Major Highway' ? ' map-road-major' : ''}" d="${d}"></path>`).join('')}
      ${detail.rivers.map(({ name, d }) => `<path class="map-river${name === 'Volga' || name === 'Oka' ? ' map-river-major' : ''}" d="${d}"></path>`).join('')}
    </g>
    ${riverLabels.map(({ name, lon, lat, dx, dy, angle }) => {
      const point = view.place(rotate(map.project(lon, lat)));
      const labelX = point.x + dx, labelY = point.y + dy;
      if (labelX < 6 || labelX > width - 36 || labelY < 20 || labelY > height - 12) return '';
      return `<text class="map-river-name" transform="translate(${labelX} ${labelY}) rotate(${angle})">${name}</text>`;
    }).join('')}`;
  }

  function mapStop(town, point, arrival, endpoint) {
    const [dx, dy, anchor] = labelOffsets[town.id];
    const name = town.id === 'pereslavl'
      ? `<tspan x="${dx}">Переславль-</tspan><tspan x="${dx}" dy="1.4em">Залесский</tspan>`
      : town.name;
    const leaderX = Math.abs(dy) < 12 ? Math.sign(dx) * 5 : Math.sign(dx) * Math.min(Math.abs(dx), 16);
    const leaderY = Math.abs(dy) < 12 ? 0 : (dy < 0 ? dy + 5 : dy - 14);
    return `<g class="map-stop${endpoint ? ' map-stop-endpoint' : ''}${town.capital ? ' map-stop-capital' : ''}" data-route-stop="${arrival}" transform="translate(${xy(point)})">
      <path class="map-stop-leader" d="M0 0 ${leaderX} ${leaderY}"></path>
      <circle r="${endpoint ? 5.2 : 3.4}"></circle>
      ${town.capital ? '<g class="map-home-mark" transform="translate(0 -14)"><circle r="7.5"></circle><path class="map-house" d="M-4.5 0 0-4 4.5 0 M-3.2-.8V4H3.2V-.8 M0 4V1.8"></path></g>' : ''}
      <text class="map-town-name" x="${dx}" y="${dy}" text-anchor="${anchor}">${name}</text>
    </g>`;
  }

  function roadRoute(fromId, toId) {
    const from = corridor.indexOf(fromId), to = corridor.indexOf(toId);
    if (from === -1 || to === -1 || from === to) return null;
    const lower = Math.min(from, to), upper = Math.max(from, to);
    const stops = corridor.slice(lower, upper + 1).map((id) => towns.get(id));
    if (!stops.every(Boolean)) return null;
    if (from > to) stops.reverse();
    const roads = upper <= junction ? 'по трассе М-2' : lower >= junction ? 'по трассе М-8' : 'по трассам М-2 и М-8';
    const km = stops.slice(1).reduce((sum, stop, i) => sum + distance(stops[i], stop), 0);
    return { stops, roads, km };
  }

  function tripDistance(from, to) {
    const road = roadRoute(from.id, to.id);
    return road ? `≈ ${Math.round(road.km)} км ${road.roads}`
      : `≈ ${Math.round(distance(from.coordinates, to.coordinates))} км по прямой`;
  }

  function render(fromId, toId) {
    const road = roadRoute(fromId, toId);
    if (!road) return null;
    const { stops, roads, km } = road;
    const projected = stops.map(({ lon, lat }) => rotate(map.project(lon, lat)));
    const view = frame(projected);
    const points = projected.map(view.place);
    const { d, arrivals } = curve(points);
    const heading = `${stops[0].name} → ${stops.at(-1).name}`;
    return `<header class="route-header">
      <h2 id="sheet-title" tabindex="-1">${heading}</h2>
      <div class="route-meta">
        <p>≈ ${Math.round(km)} км ${roads} <span>(между городами по прямой)</span></p>
        <span class="route-percent" data-route-percent role="progressbar" aria-label="Пройдено" aria-valuenow="0">0%</span>
      </div>
    </header>
    <div class="route-map-frame">
      <svg class="route-map route-map-detailed" viewBox="0 0 ${width} ${height}" role="img" aria-label="${heading}, ${roads}">
        ${geography(view)}
        <path class="route-casing" d="${d}"></path>
        <path class="route-base" d="${d}"></path>
        <path class="route-progress" data-at-start d="${d}"></path>
        ${stops.map((town, i) => mapStop(town, points[i], arrivals[i], i === 0 || i === stops.length - 1)).join('')}
        <g class="route-marker map-pet" transform="translate(${xy(points[0])})">
          <circle class="map-pet-halo" r="14"></circle>
          <circle class="map-pet-disc" r="9.5"></circle>
          <path class="map-paw" d="M0-1c1.9 0 2.2 1.5 3.3 2.5C5.5 3.6 3.5 5.7 1.6 5L0 4.5l-1.6.5C-3.5 5.7-5.5 3.6-3.3 1.5-2.2.5-1.9-1 0-1Z"></path>
          <ellipse class="map-paw" cx="-4.5" cy="-1.8" rx="1.2" ry="1.6" transform="rotate(-24 -4.5 -1.8)"></ellipse>
          <ellipse class="map-paw" cx="-1.65" cy="-4.2" rx="1.2" ry="1.6"></ellipse>
          <ellipse class="map-paw" cx="1.65" cy="-4.2" rx="1.2" ry="1.6"></ellipse>
          <ellipse class="map-paw" cx="4.5" cy="-1.8" rx="1.2" ry="1.6" transform="rotate(24 4.5 -1.8)"></ellipse>
        </g>
      </svg>
    </div>
    <div class="route-details">
      <ol class="route-stops" role="list" aria-label="Остановки по маршруту">
        ${stops.map((town, i) => `<li data-route-stop="${arrivals[i]}"><span class="stop-status" aria-hidden="true"></span>${town.name}<span class="sr-only stop-visited">, пройдено</span></li>`).join('')}
      </ol>
      <p class="route-credit">Карта: Natural Earth · города: © участники OpenStreetMap</p>
    </div>`;
  }

  const central = ['moscow', 'tula', 'yaroslavl', 'suzdal'];
  const centralLabels = { moscow: [-42, -8], tula: [33, 0], yaroslavl: [42, -12], suzdal: [40, 0] };
  const overviewLabels = {
    kaliningrad: [55, 26], murmansk: [143, 39], spb: [125, 71],
    moscow: [70, 109], 'veliky-ustyug': [176, 108], kazan: [121, 144],
    sochi: [40, 151], novosibirsk: [148, 183], baikal: [217, 147], vladivostok: [241, 211],
  };

  function choiceMap(places, overview) {
    const coordinates = (city) => map.project(city.coordinates.lon, city.coordinates.lat);
    const centralPlaces = places.filter(({ id }) => central.includes(id));
    const view = frame(centralPlaces.map((city) => rotate(coordinates(city))));
    const markers = (overview ? places.filter(({ id }) => id === 'moscow' || !central.includes(id)) : centralPlaces)
      .map((city) => {
        const point = coordinates(city);
        if (overview) {
          return { city, point: { x: point.x * .29 + 5, y: point.y * .29 + 14 }, label: overviewLabels[city.id] };
        }
        const placed = view.place(rotate(point));
        const [dx, dy] = centralLabels[city.id];
        return { city, point: placed, label: [placed.x + dx, placed.y + dy] };
      });
    const land = overview
      ? `<g transform="translate(5 14) scale(.29)"><path class="russia-shape" fill-rule="evenodd" d="${map.shape}"></path></g>`
      : geography(view);
    return {
      markers, width, height,
      background: `<svg class="route-map route-map-detailed" viewBox="0 ${-height} ${width} ${3 * height}" aria-hidden="true">
        ${land}
        ${markers.map(({ point, label }) => label
          ? `<path class="map-choice-leader" d="M${xy(point)} L${label.join(' ')}"></path>` : '').join('')}
      </svg>`,
    };
  }

  return { distance, render, tripDistance, choiceMap };
})();

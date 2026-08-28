/** SimCity-style landmark massing at real London pins. Lazy Three.js. */

const COLORS = {
  glass: 0x8ec8d8,
  brick: 0xc17f59,
  cream: 0xe8dcc4,
  stone: 0xd4c4b0,
  gold: 0xe6b422,
  roof: 0x6b3a2a,
  steel: 0x8a9aa4,
  white: 0xf4ead8,
  grass: 0x6aa84f,
};

function mat(T, hex) {
  // Unlit + both sides: negative-scale mercator placement used to invert winding
  // so pitched landmarks looked hollow / inside-out.
  return new T.MeshBasicMaterial({ color: hex, toneMapped: false });
}

function buildMesh(T, kind, h) {
  const g = new T.Group();
  const add = (geom, color, y) => {
    const m = new T.Mesh(geom, mat(T, color));
    m.position.y = y || 0;
    g.add(m);
    return m;
  };
  const H = Math.max(12, h);
  if (kind === "shard") add(new T.ConeGeometry(18, H, 4), COLORS.glass, H / 2);
  else if (kind === "pickle") {
    const m = add(new T.SphereGeometry(1, 10, 12), COLORS.glass, H * 0.48);
    m.scale.set(22, H * 0.52, 22);
  } else if (kind === "walkie") add(new T.CylinderGeometry(10, 22, H, 8), COLORS.glass, H / 2);
  else if (kind === "wedge") add(new T.ConeGeometry(16, H, 3), COLORS.steel, H / 2);
  else if (kind === "pyramid-top") {
    add(new T.BoxGeometry(28, H * 0.88, 28), COLORS.white, H * 0.44);
    add(new T.ConeGeometry(10, H * 0.14, 4), COLORS.gold, H * 0.95);
  } else if (kind === "needle") {
    add(new T.CylinderGeometry(6, 10, H * 0.7, 8), COLORS.steel, H * 0.35);
    add(new T.CylinderGeometry(3, 6, H * 0.3, 8), COLORS.white, H * 0.85);
  }
  else if (kind === "clocktower") {
    add(new T.BoxGeometry(12, H * 0.72, 12), COLORS.cream, H * 0.36);
    add(new T.BoxGeometry(14, H * 0.14, 14), COLORS.gold, H * 0.8);
    add(new T.ConeGeometry(5, H * 0.16, 4), COLORS.roof, H * 0.94);
  } else if (kind === "dome") {
    add(new T.CylinderGeometry(22, 24, H * 0.55, 12), COLORS.stone, H * 0.28);
    add(new T.SphereGeometry(16, 12, 10), COLORS.cream, H * 0.72);
  } else if (kind === "dome-low") {
    const m = add(new T.SphereGeometry(1, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), COLORS.white, 0);
    m.scale.set(H * 0.9, H * 0.55, H * 0.9);
  } else if (kind === "palace") {
    add(new T.BoxGeometry(70, H, 24), COLORS.cream, H / 2);
    const l = add(new T.BoxGeometry(18, H * 1.2, 18), COLORS.stone, H * 0.6);
    l.position.x = -28;
    const r = add(new T.BoxGeometry(18, H * 1.2, 18), COLORS.stone, H * 0.6);
    r.position.x = 28;
  }
  else if (kind === "keep") {
    add(new T.BoxGeometry(32, H, 32), COLORS.brick, H / 2);
    add(new T.BoxGeometry(10, H * 0.35, 10), COLORS.roof, H * 1.05);
  } else if (kind === "abbey") {
    add(new T.BoxGeometry(48, H * 0.55, 22), COLORS.stone, H * 0.28);
    const a = add(new T.BoxGeometry(12, H, 12), COLORS.stone, H / 2);
    a.position.x = -16;
    const b = add(new T.BoxGeometry(12, H, 12), COLORS.stone, H / 2);
    b.position.x = 16;
  } else if (kind === "column") {
    add(new T.CylinderGeometry(3.5, 4.5, H * 0.88, 8), COLORS.stone, H * 0.44);
    add(new T.BoxGeometry(8, 4, 8), COLORS.gold, H * 0.95);
  } else if (kind === "arch") {
    const p = add(new T.BoxGeometry(6, H, 6), COLORS.stone, H / 2);
    p.position.x = -8;
    const q = add(new T.BoxGeometry(6, H, 6), COLORS.stone, H / 2);
    q.position.x = 8;
    add(new T.BoxGeometry(22, 5, 8), COLORS.stone, H * 0.85);
  }
  else if (kind === "bridge") {
    const p = add(new T.BoxGeometry(10, H, 10), COLORS.stone, H / 2);
    p.position.x = -28;
    const q = add(new T.BoxGeometry(10, H, 10), COLORS.stone, H / 2);
    q.position.x = 28;
    add(new T.BoxGeometry(56, 4, 14), COLORS.steel, H * 0.55);
    add(new T.BoxGeometry(56, 2, 18), COLORS.gold, 4);
  } else if (kind === "wheel") {
    const torus = new T.Mesh(new T.TorusGeometry(H * 0.42, 3.2, 8, 24), mat(T, COLORS.steel));
    torus.position.y = H * 0.5;
    g.add(torus);
    add(new T.BoxGeometry(6, H * 0.5, 6), COLORS.white, H * 0.25);
  } else if (kind === "stadium") {
    add(new T.TorusGeometry(H * 0.9, H * 0.22, 8, 20), COLORS.white, H * 0.2);
    add(new T.CircleGeometry(H * 0.7, 16), COLORS.grass, 1);
  } else if (kind === "battersea") {
    add(new T.BoxGeometry(80, H * 0.55, 36), COLORS.brick, H * 0.28);
    [-24, -8, 8, 24].forEach((x) => {
      const c = add(new T.CylinderGeometry(4, 5, H * 0.7, 8), COLORS.cream, H * 0.7);
      c.position.x = x;
    });
  } else if (kind === "orbit") {
    add(new T.CylinderGeometry(3, 8, H, 6), COLORS.steel, H / 2);
    const t = new T.Mesh(new T.TorusGeometry(18, 2.4, 6, 16), mat(T, COLORS.gold));
    t.position.y = H * 0.62;
    t.rotation.x = 0.6;
    g.add(t);
  } else {
    add(new T.BoxGeometry(22, H, 22), COLORS.glass, H / 2);
  }
  return g;
}

function placeMesh(maplibregl, mesh, lng, lat, bearingDeg) {
  const mc = maplibregl.MercatorCoordinate.fromLngLat({ lng: lng, lat: lat }, 0);
  const units = mc.meterInMercatorCoordinateUnits();
  mesh.position.set(mc.x, mc.y, mc.z);
  // Positive scale: meshes sit in mercator space. Rotation X maps Y-up metres to
  // MapLibre +Z altitude. A negative Y scale inverted winding, so pitching showed
  // the inside of the massing.
  mesh.scale.set(units, units, units);
  mesh.rotation.set(Math.PI / 2, 0, ((bearingDeg || 0) * Math.PI) / 180);
}

export function landmarksToGeoJSON(list) {
  return {
    type: "FeatureCollection",
    features: (list || []).map((lm) => ({
      type: "Feature",
      properties: { name: lm.name, id: lm.id, kind: lm.kind },
      geometry: { type: "Point", coordinates: [lm.lon, lm.lat] },
    })),
  };
}

function addLabels(map, list) {
  if (map.getSource("landmarks")) return;
  map.addSource("landmarks", { type: "geojson", data: landmarksToGeoJSON(list) });
  map.addLayer({
    id: "landmarks-labels",
    type: "symbol",
    source: "landmarks",
    minzoom: 11.2,
    layout: {
      "text-field": ["get", "name"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 12,
      "text-offset": [0, 1.1],
      "text-anchor": "top",
      "text-allow-overlap": false,
    },
    paint: {
      "text-color": "#2a2418",
      "text-halo-color": "#f4ead8",
      "text-halo-width": 1.4,
    },
  });
}

function makeLayer(T, maplibregl, list) {
  const group = new T.Group();
  list.forEach((lm) => {
    const mesh = buildMesh(T, lm.kind, lm.h);
    placeMesh(maplibregl, mesh, lm.lon, lm.lat, lm.bearing);
    group.add(mesh);
  });
  let camera, scene, renderer, ready = false;
  return {
    id: "london-landmarks-3d",
    type: "custom",
    renderingMode: "3d",
    onAdd(map, gl) {
      this._map = map;
      camera = new T.Camera();
      scene = new T.Scene();
      scene.add(new T.AmbientLight(0xffffff, 1));
      scene.add(group);
      renderer = new T.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
      renderer.shadowMap.enabled = false;
      ready = true;
    },
    render(gl, args) {
      if (!ready) return;
      const map = this._map;
      group.visible = !map || map.getZoom() >= 12.2;
      camera.projectionMatrix = new T.Matrix4().fromArray(args.defaultProjectionData.mainMatrix);
      renderer.resetState();
      renderer.render(scene, camera);
    },
    onRemove() {
      ready = false;
    },
  };
}

export async function attachLandmarks(map, maplibregl) {
  if (!map || !maplibregl) return;
  let list = [];
  try {
    const res = await fetch("./data/london-landmarks.json");
    const json = await res.json();
    list = json.landmarks || [];
  } catch (err) {
    return;
  }
  if (!list.length) return;
  try { addLabels(map, list); } catch (err) {}
  const threeUrl = 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';
  let T;
  try {
    T = await import(threeUrl);
  } catch (err) {
    return;
  }
  if (map.getLayer("london-landmarks-3d")) return;
  const layer = makeLayer(T, maplibregl, list);
  layer._map = map;
  map.addLayer(layer);
}

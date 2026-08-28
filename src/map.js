import { bboxOf, makeProjector, geomPath } from "./geo.js";

let focusLad = "E09000030";

export function createMap(svg, data) {
  const boroughs = data.boroughs.features;
  let th = boroughs.find((f) => f.properties.LAD25CD === focusLad);
  const constraints = data.constraints?.features || [];
  let apps = data.applications || [];
  let focusName = data.pack?.name || data.baseline?.borough || "Tower Hamlets";

  let width = 800;
  let height = 640;
  let project = makeProjector(bboxOf(th ? [th] : boroughs), width, height, 36);
  const layers = { conservation: true, listed: true, article4: true, brownfield: true, apps: true };

  function size() {
    const rect = svg.getBoundingClientRect();
    width = Math.max(320, rect.width || 800);
    height = Math.max(320, rect.height || 640);
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    project = makeProjector(bboxOf(th ? [th] : boroughs), width, height, 36);
  }

  function draw(currentId, opts = {}) {
    const hop = !!opts.hop;
    size();
    const ns = "http://www.w3.org/2000/svg";
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const defs = document.createElementNS(ns, "defs");
    defs.innerHTML = `
      <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
        <line x1="0" y1="0" x2="0" y2="6" stroke="#5b6d9b" stroke-width="1.2" opacity="0.55"/>
      </pattern>
      <clipPath id="thClip"><path d="${geomPath(th.geometry, project)}"/></clipPath>
    `;
    svg.appendChild(defs);

    const root = document.createElementNS(ns, "g");
    svg.appendChild(root);

    const city = document.createElementNS(ns, "g");
    city.setAttribute("class", "layer-city");
    for (const f of boroughs) {
      const p = document.createElementNS(ns, "path");
      p.setAttribute("d", geomPath(f.geometry, project));
      p.setAttribute("class", f.properties.LAD25CD === focusLad ? "borough th" : "borough");
      p.setAttribute("data-name", f.properties.LAD25NM);
      city.appendChild(p);
    }
    root.appendChild(city);

    const clip = document.createElementNS(ns, "g");
    clip.setAttribute("clip-path", "url(#thClip)");

    if (layers.conservation) {
      const g = document.createElementNS(ns, "g");
      g.setAttribute("class", "layer-ca");
      for (const f of constraints) {
        if (f.properties.layer !== "conservation-area" && f.properties.dataset !== "conservation-area") continue;
        const p = document.createElementNS(ns, "path");
        p.setAttribute("d", geomPath(f.geometry, project));
        p.setAttribute("class", "conservation");
        p.setAttribute("title", f.properties.name || "Conservation area");
        g.appendChild(p);
      }
      clip.appendChild(g);
    }

    if (layers.article4) {
      const g = document.createElementNS(ns, "g");
      g.setAttribute("class", "layer-a4");
      for (const f of constraints) {
        if (
          f.properties.layer !== "article-4-direction-area" &&
          f.properties.dataset !== "article-4-direction-area"
        )
          continue;
        const p = document.createElementNS(ns, "path");
        p.setAttribute("d", geomPath(f.geometry, project));
        p.setAttribute("class", "article4");
        g.appendChild(p);
      }
      clip.appendChild(g);
    }

    root.appendChild(clip);

    if (layers.listed) {
      const g = document.createElementNS(ns, "g");
      g.setAttribute("class", "layer-lb");
      for (const f of constraints) {
        if (f.properties.layer !== "listed-building" && f.properties.dataset !== "listed-building") continue;
        const geom = f.geometry;
        if (!geom) continue;
        let lon, lat;
        if (geom.type === "Point") {
          lon = geom.coordinates[0];
          lat = geom.coordinates[1];
        } else {
          continue;
        }
        const [x, y] = project(lon, lat);
        const c = document.createElementNS(ns, "circle");
        c.setAttribute("cx", x.toFixed(1));
        c.setAttribute("cy", y.toFixed(1));
        c.setAttribute("r", "1.15");
        c.setAttribute("class", "listed");
        g.appendChild(c);
      }
      root.appendChild(g);
    }

    if (layers.brownfield) {
      const g = document.createElementNS(ns, "g");
      g.setAttribute("class", "layer-bf");
      for (const f of constraints) {
        if (f.properties.layer !== "brownfield-land" && f.properties.dataset !== "brownfield-land") continue;
        const geom = f.geometry;
        if (geom?.type !== "Point") continue;
        const [x, y] = project(geom.coordinates[0], geom.coordinates[1]);
        const r = document.createElementNS(ns, "rect");
        r.setAttribute("x", (x - 3.2).toFixed(1));
        r.setAttribute("y", (y - 3.2).toFixed(1));
        r.setAttribute("width", "6.4");
        r.setAttribute("height", "6.4");
        r.setAttribute("class", "brownfield");
        g.appendChild(r);
      }
      root.appendChild(g);
    }

    if (layers.apps) {
      const g = document.createElementNS(ns, "g");
      g.setAttribute("class", "layer-apps");
      for (const app of apps) {
        const lon = app.centroid?.lon;
        const lat = app.centroid?.lat;
        if (lon == null || lat == null) continue;
        const [x, y] = project(lon, lat);
        const c = document.createElementNS(ns, "circle");
        c.setAttribute("cx", x.toFixed(1));
        c.setAttribute("cy", y.toFixed(1));
        const current = app.id === currentId || app.lpa_app_no === currentId;
        c.setAttribute("r", current ? "6.5" : app.game?.playable ? "2.4" : "1.4");
        c.setAttribute("class", current ? (hop ? "app current hop" : "app current") : app.game?.playable ? "app playable" : "app");
        g.appendChild(c);
        if (current) {
          const ping = document.createElementNS(ns, "circle");
          ping.setAttribute("cx", x.toFixed(1));
          ping.setAttribute("cy", y.toFixed(1));
          ping.setAttribute("r", "11");
          ping.setAttribute("class", "app-ping");
          g.appendChild(ping);
          const ring = document.createElementNS(ns, "circle");
          ring.setAttribute("cx", x.toFixed(1));
          ring.setAttribute("cy", y.toFixed(1));
          ring.setAttribute("r", "11");
          ring.setAttribute("class", "app-ring");
          g.appendChild(ring);
        }
      }
      root.appendChild(g);
    }

    const label = document.createElementNS(ns, "text");
    label.setAttribute("x", (width * 0.06).toFixed(1));
    label.setAttribute("y", (height * 0.08).toFixed(1));
    label.setAttribute("class", "map-label");
    label.textContent = String(focusName || "").toUpperCase();
    root.appendChild(label);
  }

  function setLayer(name, on) {
    layers[name] = on;
  }

  function setFocus(lad, name) {
    focusLad = lad || focusLad;
    th = boroughs.find((f) => f.properties.LAD25CD === focusLad) || th;
    if (name) focusName = name;
  }

  function setApplications(list) {
    apps = list || [];
  }

  return { draw, setLayer, setFocus, setApplications, layers, size };
}

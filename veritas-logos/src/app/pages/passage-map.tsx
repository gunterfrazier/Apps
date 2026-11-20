import { useId, useMemo, useRef, useState, type PointerEvent } from "react";
import type { Basemap, MapPoint, PlaceCandidate } from "../../core/study-resources";

const WIDTH = 720;
const HEIGHT = 420;
const INITIAL_VIEW = { scale: 1, x: 0, y: 0 };
type View = typeof INITIAL_VIEW;

function mapProjection(coords: MapPoint[]) {
  const longs = coords.map(([lon]) => lon);
  const lats = coords.map(([, lat]) => lat);
  const left = Math.min(...longs), right = Math.max(...longs);
  const bottom = Math.min(...lats), top = Math.max(...lats);
  const centerLon = (left + right) / 2, centerLat = (bottom + top) / 2;
  const longitudeScale = Math.cos(centerLat * Math.PI / 180);
  const scale = Math.min((WIDTH - 120) / Math.max((right - left) * longitudeScale, 4), (HEIGHT - 120) / Math.max(top - bottom, 2.8));
  return ([lon, lat]: MapPoint): MapPoint => [
    WIDTH / 2 + (lon - centerLon) * longitudeScale * scale, HEIGHT / 2 - (lat - centerLat) * scale,
  ];
}

function boundedView(scale: number, x: number, y: number): View {
  return {
    scale,
    x: Math.min(0, Math.max(WIDTH * (1 - scale), x)),
    y: Math.min(0, Math.max(HEIGHT * (1 - scale), y)),
  };
}

export function PassageMap({ basemap, markers, selected, onSelect, detailsId }: {
  basemap: Basemap;
  markers: PlaceCandidate[];
  selected?: string;
  onSelect: (id: string) => void;
  detailsId: string;
}) {
  const helpId = useId();
  const [view, setView] = useState(INITIAL_VIEW);
  const drag = useRef<{ pointer: number; clientX: number; clientY: number; view: View } | null>(null);
  const map = useMemo(() => {
    const project = mapProjection(markers.map((marker) => marker.point));
    const path = (rings: MapPoint[][]) => rings.map((ring) => ring.map((point, i) => {
      const [x, y] = project(point);
      return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join("") + "Z").join("");
    return { land: path(basemap.land), lakes: path(basemap.lakes), points: markers.map((marker) => ({ ...marker, xy: project(marker.point) })) };
  }, [basemap, markers]);

  function zoom(factor: number) {
    setView((previous) => {
      const scale = Math.max(1, Math.min(8, previous.scale * factor));
      const ratio = scale / previous.scale;
      const point = map.points.find(({ id }) => id === selected);
      const [x, y] = point?.xy ?? [WIDTH / 2, HEIGHT / 2];
      const anchorX = previous.x + x * previous.scale;
      const anchorY = previous.y + y * previous.scale;
      const visible = anchorX >= 0 && anchorX <= WIDTH && anchorY >= 0 && anchorY <= HEIGHT;
      const [cx, cy] = visible ? [anchorX, anchorY] : [WIDTH / 2, HEIGHT / 2];
      return boundedView(scale, cx + (previous.x - cx) * ratio, cy + (previous.y - cy) * ratio);
    });
  }

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (view.scale === 1 || event.button !== 0 || drag.current || (event.target as Element).closest("button")) return;
    drag.current = { pointer: event.pointerId, clientX: event.clientX, clientY: event.clientY, view };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (start?.pointer !== event.pointerId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const dx = (event.clientX - start.clientX) * WIDTH / bounds.width;
    const dy = (event.clientY - start.clientY) * HEIGHT / bounds.height;
    setView(boundedView(start.view.scale, start.view.x + dx, start.view.y + dy));
  }

  function stopDrag(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointer === event.pointerId) drag.current = null;
  }

  return (
    <section className="place-map-panel" aria-label="Passage map">
      <div className="map-toolbar">
        <span>{markers.length} mapped {markers.length === 1 ? "location" : "locations"}</span>
        <div className="map-controls" role="group" aria-label="Map zoom controls">
          <button className="btn small" type="button" aria-label="Zoom out" disabled={view.scale === 1} onClick={() => zoom(0.5)}>−</button>
          <button className="btn small" type="button" aria-label="Zoom in" disabled={view.scale === 8} onClick={() => zoom(2)}>+</button>
          <button className="btn small" type="button" disabled={view.scale === 1} onClick={() => setView(INITIAL_VIEW)}>Reset map</button>
        </div>
      </div>
      <div className={`passage-map${view.scale > 1 ? " zoomed" : ""}`} role="group" aria-label="Map locations"
        aria-describedby={helpId} tabIndex={0} onPointerDown={startDrag} onPointerMove={moveDrag}
        onPointerUp={stopDrag} onPointerCancel={stopDrag} onLostPointerCapture={stopDrag}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget || view.scale === 1) return;
          const pan: Record<string, MapPoint> = { ArrowLeft: [48, 0], ArrowRight: [-48, 0], ArrowUp: [0, 48], ArrowDown: [0, -48] };
          const direction = pan[event.key];
          if (!direction) return;
          event.preventDefault();
          const [dx, dy] = direction;
          setView((previous) => boundedView(previous.scale, previous.x + dx, previous.y + dy));
        }}>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
          <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
            <path className="map-land" d={map.land} />
            <path className="map-water" d={map.lakes} />
          </g>
        </svg>
        {map.points.map(({ id, xy, name }) => {
          const x = (view.x + xy[0] * view.scale) / WIDTH * 100;
          const y = (view.y + xy[1] * view.scale) / HEIGHT * 100;
          if (x < 0 || x > 100 || y < 0 || y > 100) return null;
          return <button key={id} className="map-marker" type="button" aria-label={name} title={name}
            aria-pressed={selected === id} aria-controls={detailsId}
            style={{ left: `${x}%`, top: `${y}%` }} onClick={() => onSelect(id)}>
            {selected === id && <span className={`map-pin-label${x > 50 ? " left" : ""}`} aria-hidden="true">{name}</span>}
          </button>;
        })}
      </div>
      <p className="fine map-help" id={helpId}>Select a marker or choose a place. Zoom in to pan by dragging or using the arrow keys.</p>
    </section>
  );
}

import { useId, useMemo, useState, type FormEvent } from "react";
import { refOf, verseCount } from "../../core/bible";
import { formatSegment, parseReference } from "../../core/references";
import { getBasemap, getPassagePlaces, getTyndaleNotes, type Basemap, type MapPoint, type PlaceCandidate } from "../../core/study-resources";
import { hashForReference, readHash } from "../routes";
import { Empty, ErrorNote, Loading, RefText, useAsync } from "../ui";
import { navigate } from "../store";

export const TYNDALE_SOURCE = "https://tyndaleopenresources.com/";
const GEO = "https://www.openbible.info/geo/";
const NATURAL_EARTH = "https://www.naturalearthdata.com/about/terms-of-use/";

export function TyndaleNotes({ reference }: { reference: string }) {
  const { data, loading, error } = useAsync(() => getTyndaleNotes(reference), [reference]);
  const [shown, setShown] = useState(8);
  if (!loading && !error && !data?.length) return null;
  return (
    <section className="resource-section">
      <h3>Study notes</h3>
      {loading ? <Loading label="Loading study notes" /> : <ErrorNote error={error} />}
      {!loading && !error && data?.slice(0, shown).map((note, i) => (
        <details key={`${reference}:${note.sourceReference}:${i}`} className="doctrine">
          <summary>{formatSegment(note.range)} · Tyndale</summary>
          {note.paragraphs.map((paragraph, index) => <p key={index}><RefText text={paragraph} /></p>)}
        </details>
      ))}
      {!loading && (data?.length ?? 0) > shown && (
        <button type="button" className="btn small" onClick={() => setShown(shown + 8)}>Show more study notes</button>
      )}
      <p className="fine">Adapted from Tyndale Open Study Notes. Copyright © 2022 Tyndale House Publishers. Converted to plain text and indexed by passage. The original is available from <a href={TYNDALE_SOURCE}>Tyndale Open Resources</a>. <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>.</p>
    </section>
  );
}

const WIDTH = 720;
const HEIGHT = 420;

function mapProjection(coords: MapPoint[]) {
  const longs = coords.map(([lon]) => lon);
  const lats = coords.map(([, lat]) => lat);
  const left = Math.min(...longs), right = Math.max(...longs);
  const bottom = Math.min(...lats), top = Math.max(...lats);
  const centerLon = (left + right) / 2, centerLat = (bottom + top) / 2;
  const longitudeScale = Math.cos(centerLat * Math.PI / 180);
  const scale = Math.min((WIDTH - 68) / Math.max((right - left) * longitudeScale, 4), (HEIGHT - 68) / Math.max(top - bottom, 2.8));
  return ([lon, lat]: MapPoint): MapPoint => [
    WIDTH / 2 + (lon - centerLon) * longitudeScale * scale, HEIGHT / 2 - (lat - centerLat) * scale,
  ];
}

function PassageMap({ basemap, markers, selected }: { basemap: Basemap; markers: PlaceCandidate[]; selected: string }) {
  const titleId = useId();
  const map = useMemo(() => {
    const project = mapProjection(markers.map((marker) => marker.point));
    const path = (rings: MapPoint[][]) => rings.map((ring) => ring.map((point, i) => {
      const [x, y] = project(point);
      return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join("") + "Z").join("");
    return { land: path(basemap.land), lakes: path(basemap.lakes), points: markers.map((marker) => ({ ...marker, xy: project(marker.point) })) };
  }, [basemap, markers]);
  return (
    <svg className="passage-map" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-labelledby={titleId}>
      <title id={titleId}>Map of proposed locations. The place list below gives each location and its source.</title>
      <path className="map-land" d={map.land} />
      <path className="map-water" d={map.lakes} />
      {map.points.map(({ id, xy: [x, y], name }) => <circle key={id} className={`map-marker${id === selected ? " selected" : ""}`} cx={x} cy={y} r={id === selected ? 9 : 5}><title>{name}</title></circle>)}
    </svg>
  );
}

export function PlacesPage({ reference }: { reference: string }) {
  const [draft, setDraft] = useState(reference);
  const [invalid, setInvalid] = useState(false);
  const [selected, setSelected] = useState("");
  const { data: places, loading, error } = useAsync(() => getPassagePlaces(reference), [reference]);
  const { data: basemap, error: mapError } = useAsync(getBasemap, []);
  const markers = useMemo(() => [...new Map((places ?? []).flatMap((place) => place.candidates).map((point) => [point.id, point])).values()], [places]);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = draft.trim();
    const segments = parseReference(value);
    if (!segments || segments.length !== 1 || segments[0].chapter !== segments[0].chapterEnd) {
      setInvalid(true);
      return;
    }
    const { book, chapter, verseStart: verse, verseEnd } = segments[0];
    const count = await verseCount(book, chapter).catch(() => 0);
    if (!count || (verseEnd ?? verse ?? 1) > count) { setInvalid(true); return; }
    setInvalid(false);
    navigate(`places-${readHash({ book, chapter, verse, verseEnd }).slice(5)}`);
  };
  return (
    <div className="page">
      <p className="eyebrow"><a href="#explore">Explore</a></p>
      <h1 className="page-title">Places in this passage</h1>
      <form className="ps-form" onSubmit={submit}>
        <input className="input" aria-label="Bible passage" aria-invalid={invalid} value={draft}
          onChange={(e) => { setDraft(e.target.value); setInvalid(false); }} placeholder="John 3:23" />
        <button type="submit" className="btn primary">Find places</button>
      </form>
      {invalid && <p role="alert" className="note warn">Enter a chapter or a range within one chapter, such as John 3:22–26.</p>}
      <h2>{reference}</h2>
      {loading ? <Loading label="Finding places" /> : <ErrorNote error={error} />}
      {mapError && <p className="fine">The basemap is unavailable. Place records are listed below.</p>}
      {!loading && markers.length > 0 && basemap && <PassageMap basemap={basemap} markers={markers} selected={selected} />}
      {!loading && places?.length === 0 && <Empty>OpenBible has no places indexed for this passage.</Empty>}
      {!loading && places?.map((place) => (
        <article className="place-card" key={place.id}>
          <h3><a href={`${GEO}ancient/${place.id}/${place.slug}`}>{place.name}</a></h3>
          <p className="fine">{place.types.join(", ")}</p>
          <div className="chips">{place.mentions.map(([book, chapter, verse, wording]) => {
            const ref = refOf(book, chapter, verse);
            return <a className="chip" key={ref} href={`#${hashForReference(ref)}`}>{ref}{wording === "varies" ? " (wording varies)" : wording === "context" ? " (contextual link)" : ""}</a>;
          })}</div>
          {place.candidates.length > 0 ? (
            <>
              <p>{place.candidates.length === 1 ? "Mapped location proposed by OpenBible" : "Proposed locations in OpenBible"}</p>
              <ul className="link-list">{place.candidates.map((candidate) => (
                <li key={candidate.id}>
                  <button className="btn small" type="button" aria-pressed={candidate.id === selected}
                    disabled={!basemap} onClick={() => setSelected(candidate.id === selected ? "" : candidate.id)}>{candidate.name}</button>
                  {" "}<a className="fine" href={`${GEO}modern/${candidate.id}/${candidate.slug}`} aria-label={`Source for ${candidate.name}`}>Source</a>
                </li>
              ))}</ul>
            </>
          ) : <p className="fine">No point location is plotted. See the OpenBible entry for details on the place or region.</p>}
        </article>
      ))}
      <p className="fine">Place names, verse references and selected point records adapted from <a href={GEO}>OpenBible.info</a> (<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>). Basemap from <a href={NATURAL_EARTH}>Natural Earth</a> (public domain).</p>
    </div>
  );
}

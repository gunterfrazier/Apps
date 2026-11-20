import { useId, useMemo, useState, type FormEvent } from "react";
import { refOf, verseCount } from "../../core/bible";
import { formatSegment, parseReference } from "../../core/references";
import { getBasemap, getPassagePlaces, getPleiadesIndex, getTyndaleNotes, type PassagePlace } from "../../core/study-resources";
import { getTyndaleDictionaryIndex } from "../../core/tyndale-dictionary";
import { hashForReference, readHash } from "../routes";
import { Empty, ErrorNote, Loading, RefText, useAsync } from "../ui";
import { navigate } from "../store";
import { PassageMap } from "./passage-map";

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

function PlaceReferences({ mentions }: { mentions: PassagePlace["mentions"] }) {
  return <div className="chips">{mentions.map(([book, chapter, verse, wording]) => {
    const ref = refOf(book, chapter, verse);
    return <a className="chip" key={ref} href={`#${hashForReference(ref)}`}>
      {ref}{wording === "varies" ? " (wording varies)" : wording === "context" ? " (contextual link)" : ""}
    </a>;
  })}</div>;
}

export function PlacesPage({ reference }: { reference: string }) {
  const [draft, setDraft] = useState(reference);
  const [invalid, setInvalid] = useState(false);
  const [selection, setSelection] = useState<{ placeId: string; candidateId?: string }>();
  const detailsId = useId();
  const { data: places, loading, error } = useAsync(() => getPassagePlaces(reference), [reference]);
  const { data: basemap, error: mapError } = useAsync(getBasemap, []);
  const { data: pleiades } = useAsync(getPleiadesIndex, []);
  const { data: dictionary } = useAsync(getTyndaleDictionaryIndex, []);
  const markers = useMemo(() => [...new Map((places ?? []).flatMap((place) => place.candidates).map((point) => [point.id, point])).values()], [places]);
  const place = places?.find(({ id }) => id === selection?.placeId) ??
    places?.find(({ candidates }) => candidates.length > 0) ?? places?.[0];
  const candidate = place?.candidates.find(({ id }) => id === selection?.candidateId) ?? place?.candidates[0];
  const history = candidate ? pleiades?.locations[candidate.id] : undefined;
  const dictionaryEntry = place && dictionary?.find(([, title, , , at]) =>
    at && title.toLowerCase() === place.name.toLowerCase() &&
    (place.mentions.some((mention) => at.every((number, i) => number === mention[i])) ||
      place.otherMentions.some((mention) => at.every((number, i) => number === mention[i]))));

  function selectMarker(candidateId: string) {
    const match = place?.candidates.some(({ id }) => id === candidateId) ? place :
      places?.find(({ candidates }) => candidates.some(({ id }) => id === candidateId));
    if (match) setSelection({ placeId: match.id, candidateId });
  }

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
    <div className="page places-page">
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
      {!loading && places?.length === 0 && <Empty>OpenBible has no places indexed for this passage.</Empty>}
      {!loading && place && (
        <div className="places-workspace">
          {markers.length > 0 && basemap && <PassageMap basemap={basemap} markers={markers} selected={candidate?.id} onSelect={selectMarker} detailsId={detailsId} />}
          {mapError && <p className="fine">The basemap is unavailable. You can still browse the places in this passage.</p>}
          <div className="place-browser">
            <label className="place-picker">
              <span>Choose a place</span>
              <select className="input" value={place.id} onChange={(event) => setSelection({ placeId: event.target.value })}>
                {places?.map((option) => <option key={option.id} value={option.id}>
                  {option.name}{places.some((other) => other.id !== option.id && other.name === option.name)
                    ? ` — ${option.candidates[0]?.name ?? refOf(option.mentions[0][0], option.mentions[0][1], option.mentions[0][2])}` : ""}
                </option>)}
              </select>
            </label>
            <article className="place-card" id={detailsId} aria-label="Place details">
              <div role="status" className="sr-only">{place.name}{candidate && candidate.name !== place.name ? ` — ${candidate.name}` : ""}</div>
              <h3>{place.name}</h3>
              {place.types.length > 0 && <p className="fine">{place.types.join(", ")}</p>}
              <section>
                <h4>In this passage</h4>
                <PlaceReferences mentions={place.mentions} />
              </section>
              <section>
                <h4>{place.candidates.length > 1 ? "Proposed locations" : "Location"}</h4>
                {place.candidates.length > 1 && (
                  <>
                    <p className="fine">OpenBible lists multiple possible sites for this place.</p>
                    <div className="place-candidates" role="group" aria-label="Proposed locations">
                      {place.candidates.map((option) => <button type="button" className="btn small" key={option.id}
                        aria-pressed={candidate?.id === option.id}
                        onClick={() => setSelection({ placeId: place.id, candidateId: option.id })}>{option.name}</button>)}
                    </div>
                  </>
                )}
                {candidate ? (
                  <p className="place-location"><strong>{candidate.name}</strong><br />
                    <span className="fine">OpenBible point · {candidate.point[1].toFixed(3)}°, {candidate.point[0].toFixed(3)}° (lat, lon)</span><br />
                    <a className="fine" href={`${GEO}modern/${candidate.id}/${candidate.slug}`}>Location source</a>
                  </p>
                ) : <p className="fine">OpenBible has no point plotted for this place or region.</p>}
              </section>
              {pleiades && history && (
                <section>
                  <h4>Historical context</h4>
                  {history.map((id) => {
                    const record = pleiades.records[id];
                    return <div key={id} className="place-history">
                      <strong>{record.title}</strong>
                      <p>{record.description}</p>
                      <p className="fine">{record.authors && `${record.authors} · `}
                        <a href={`https://pleiades.stoa.org/places/${id}`}>Pleiades entry</a>
                      </p>
                    </div>;
                  })}
                </section>
              )}
              {place.otherMentions.length > 0 && (
                <details className="place-other-mentions">
                  <summary>Other Bible references ({place.otherMentions.length})</summary>
                  <PlaceReferences mentions={place.otherMentions} />
                </details>
              )}
              <p className="fine place-sources">
                {dictionaryEntry && <><a href={`#dictionary-${dictionaryEntry[0]}`}>Tyndale Bible Dictionary</a> · </>}
                <a href={`${GEO}ancient/${place.id}/${place.slug}`}>OpenBible place entry</a>
              </p>
            </article>
          </div>
        </div>
      )}
      <p className="fine">Place names, verse references and selected point records adapted from <a href={GEO}>OpenBible.info</a> (<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>). Basemap from <a href={NATURAL_EARTH}>Natural Earth</a> (public domain). Historical excerpts from <a href="https://pleiades.stoa.org/downloads">Pleiades</a> (<a href="https://creativecommons.org/licenses/by/3.0/">CC BY 3.0</a>).</p>
    </div>
  );
}

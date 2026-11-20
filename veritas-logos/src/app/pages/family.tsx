import { useEffect, useState, type FormEvent } from "react";
import { getPassage } from "../../core/bible";
import { AGE_GROUPS, FAMILY_THEMES, type FamilyProfile, type FamilySettings } from "../../core/family";
import { FAMILY_STORIES, type FamilyStory, type StoryActivity, type StoryImage } from "../../core/family-stories";
import { account, useAccount } from "../account";
import { Loading, useAsync } from "../ui";

const previewId = (age: string) => `preview-${age}`;
const kidsHash = (id: string, story?: string) => `#kids-${id}${story ? "/" + story : ""}`;
const mediaPath = (file: string) => `family/${file}`;
const defaultSettings: FamilySettings = { nickname: "", ageGroup: "young", theme: "ocean" };
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function FamilyPage() {
  const { status, user } = useAccount();
  return (
    <div className="page family-page">
      <p className="eyebrow"><a href="#study">Study</a></p>
      <section className="family-welcome">
        <div>
          <h1 className="page-title">Family library</h1>
          <p>Bible stories, art, and questions for kids and teens. Set up a space for each reader or browse by age.</p>
          <button className="btn primary" type="button" onClick={() => {
            const heading = document.getElementById("family-age-title");
            heading?.focus({ preventScroll: true });
            heading?.scrollIntoView({ block: "start" });
          }}>Browse by age</button>
        </div>
        <img src={mediaPath("noah.webp")} alt="Animals gather around Noah’s ark in Edward Hicks’s painting." />
      </section>
      <section className="family-section" aria-labelledby="family-profiles-title">
        <h2 id="family-profiles-title">Family profiles</h2>
        {status === "loading" && <Loading label="Checking your account" />}
        {status === "signed-in" && user && <FamilyProfiles key={user.id} owner={user.id} />}
        {status === "signed-out" && <p><a href="#account">Sign in with your adult account</a> to create profiles for your family.</p>}
        {(status === "off" || status === "unavailable") && <p>Family profile sign-in is unavailable here. You can browse all three age groups below.</p>}
      </section>
      <section className="family-section" aria-labelledby="family-age-title">
        <h2 id="family-age-title" tabIndex={-1}>Browse by age</h2>
        <div className="family-age-grid">
          {AGE_GROUPS.map((group) => (
            <a key={group.id} className={`family-age-card family-age-${group.id}`} href={kidsHash(previewId(group.id))}>
              <strong>{group.label}</strong><span>{group.description}</span>
            </a>
          ))}
        </div>
      </section>
      <details className="family-section family-media-credits">
        <summary>About the artwork and video</summary>
        <p>The first collection pairs Bible stories with paintings, book illustrations, a photograph of the Sea of Galilee, and a captioned story video. Each story includes its media credits.</p>
        <a href="https://bibleproject.com/videos/torah-genesis-1/" target="_blank" rel="noopener noreferrer">BibleProject’s Genesis 1–11 video for further study</a>
        <p><a href="https://bibleproject.com/" target="_blank" rel="noopener noreferrer">BibleProject</a> is the author and owner of the Genesis 1–11 video.</p>
      </details>
      <section className="family-section">
        <h2>Activities for home</h2>
        <p>Find parent guides and coloring pages to use alongside Bible stories.</p>
        <a href="https://bibleappforkids.com/parents" target="_blank" rel="noopener noreferrer">Bible App for Kids resources from YouVersion</a>
      </section>
    </div>
  );
}

function FamilyProfiles({ owner }: { owner: string }) {
  const [refresh, setRefresh] = useState(0);
  const { data, loading, error } = useAsync(async () => account().family.list(owner), [owner, refresh]);
  const [editing, setEditing] = useState<"new" | FamilyProfile | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [operationError, setOperationError] = useState("");
  async function remove(profile: FamilyProfile) {
    if (!confirm(`Remove ${profile.nickname}’s family profile?`)) return;
    setRemoving(profile.id);
    setOperationError("");
    try {
      await account().family.remove(owner, profile.id);
      setRefresh((value) => value + 1);
    } catch (e) {
      setOperationError(e instanceof Error ? e.message : "The profile couldn’t be removed. Try again.");
    } finally {
      setRemoving(null);
    }
  }
  if (error) return <div role="alert">
    <p>{error.cause && (error.cause as { code?: string }).code === "PGRST205"
      ? "Saved family profiles aren’t available on this site yet. You can still browse by age."
      : "Family profiles couldn’t load. You can still browse by age."}</p>
    <button type="button" className="btn" onClick={() => setRefresh((value) => value + 1)}>Try again</button>
  </div>;
  if (!data) return <Loading label="Loading family profiles" />;

  return <>
    {data.length === 0 && <p>Create your first profile with a nickname, an age group, and a favorite color.</p>}
    <div className="family-profile-grid">
      {data.map((profile) => (
        <article className="family-profile-card" key={profile.id}>
          <div>
            <h3>{profile.nickname}</h3>
            <p className="fine">{AGE_GROUPS.find((group) => group.id === profile.ageGroup)?.label}</p>
          </div>
          <div className="action-row">
            <a className="btn primary" href={kidsHash(profile.id)} aria-label={`Open ${profile.nickname}’s profile`}>Open profile</a>
            <button className="btn" type="button" disabled={loading || Boolean(removing) || Boolean(editing)} onClick={() => setEditing(profile)}>Edit<span className="family-sr"> {profile.nickname}’s profile</span></button>
            <button className="btn" type="button" disabled={loading || Boolean(removing) || Boolean(editing)} onClick={() => remove(profile)}>Remove<span className="family-sr"> {profile.nickname}’s profile</span></button>
          </div>
        </article>
      ))}
    </div>
    {operationError && <p className="form-error" role="alert">{operationError}</p>}
    {editing ? (
      <ProfileForm key={editing === "new" ? "new" : editing.id} owner={owner} profile={editing === "new" ? undefined : editing}
        onCancel={() => setEditing(null)}
        onSaved={() => { setEditing(null); setRefresh((value) => value + 1); }} />
    ) : <button type="button" className="btn" disabled={loading || Boolean(removing)} onClick={() => setEditing("new")}>Add a profile</button>}
    <p className="fine">Profiles are part of your adult account. Use a nickname. Kids can open a story space without their own login.</p>
  </>;
}

function ProfileForm({ owner, profile, onCancel, onSaved }: { owner: string; profile?: FamilyProfile; onCancel: () => void; onSaved: () => void }) {
  const [settings, setSettings] = useState<FamilySettings>(profile ?? defaultSettings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!settings.nickname.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await account().family.save(owner, settings, profile?.id);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The profile couldn’t be saved. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="family-profile-form form" onSubmit={submit} aria-label={profile ? "Edit family profile" : "New family profile"}>
      <h3>{profile ? "Edit profile" : "New profile"}</h3>
      <label className="family-field">Nickname
        <input className="input" maxLength={32} required autoComplete="off" value={settings.nickname}
          onChange={(event) => setSettings({ ...settings, nickname: event.target.value })} />
      </label>
      <label className="family-field">Age group
        <select className="input" value={settings.ageGroup}
          onChange={(event) => setSettings({ ...settings, ageGroup: event.target.value as FamilySettings["ageGroup"] })}>
          {AGE_GROUPS.map((group) => <option key={group.id} value={group.id}>{group.label}</option>)}
        </select>
      </label>
      <label className="family-field">Color theme
        <select className="input" value={settings.theme}
          onChange={(event) => setSettings({ ...settings, theme: event.target.value as FamilySettings["theme"] })}>
          {FAMILY_THEMES.map((theme) => <option key={theme.id} value={theme.id}>{theme.label}</option>)}
        </select>
      </label>
      <div className="action-row">
        <button className="btn primary" type="submit" disabled={busy || !settings.nickname.trim()}>Save profile</button>
        <button className="btn" type="button" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  );
}

function ImageCredit({ image }: { image: StoryImage }) {
  return <p>{image.credit}. <a href={image.source} target="_blank" rel="noopener noreferrer">Image source</a>{" · "}
    <a href={image.licenseUrl} target="_blank" rel="noopener noreferrer">{image.license}</a>. Resized for display.</p>;
}

function StoryScripture({ reference }: { reference: string }) {
  const [expanded, setExpanded] = useState(false);
  const { data, loading } = useAsync(() => expanded ? getPassage("BSB", reference) : Promise.resolve(null), [expanded, reference]);
  return (
    <details className="kids-scripture" onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary>Read the Bible passage</summary>
      {expanded && (loading ? <Loading label="Opening the Bible" /> :
        data ? <>
          {data.parts.map((part) => <section key={part.label}>
            <h2>{part.label}</h2>
            <p>{part.verses.map((line) => <span key={line.verse}><sup>{line.verse}</sup>{line.text} </span>)}</p>
          </section>)}
          <p className="fine">Berean Standard Bible</p>
        </> : <p>The passage couldn’t load. Check your connection and try again.</p>)}
    </details>
  );
}

function StoryCheck({ activity }: { activity: StoryActivity }) {
  const [choice, setChoice] = useState<number | null>(null);
  return (
    <section className="kids-question kids-activity" aria-labelledby="story-activity-heading">
      <h2 id="story-activity-heading">Try the activity</h2>
      <p id="story-activity-prompt">{activity.prompt}</p>
      <div className="kids-answer-options" role="group" aria-labelledby="story-activity-prompt">
        {activity.options.map((label, index) => (
          <button key={label} type="button" className="kids-control" aria-pressed={choice === index} onClick={() => setChoice(index)}>{label}</button>
        ))}
      </div>
      <p role="status">{choice === null ? "" : choice === activity.answer ? activity.explanation : "Try another answer. You can go back to the story for a clue."}</p>
    </section>
  );
}

function StoryDetail({ story, profile }: { story: FamilyStory; profile: FamilyProfile }) {
  const [scene, setScene] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const edition = story.editions[profile.ageGroup];
  if (!edition) return null;
  const { image, illustrations, video } = story;
  const storybook = profile.ageGroup !== "teen";
  const paged = storybook && !showAll;
  const last = edition.paragraphs.length - 1;
  const art = paged ? illustrations?.[scene - 1] ?? image : image;
  return (
    <article className="kids-story">
      <a className="kids-back" href={kidsHash(profile.id)}>← All stories</a>
      <div className="kids-detail-grid">
        <header className="kids-story-heading">
          <p className="kids-reference">{story.reference}</p>
          <h1>{story.title}</h1>
        </header>
        <figure className={`kids-feature-art${paged ? " kids-paged-art" : ""}`}>
          <img src={mediaPath(art.file)} alt={art.alt} />
          <figcaption>{art.credit}</figcaption>
        </figure>
        <div className="kids-story-body">
          {paged ? (
            <section className="kids-scene" aria-label="Story pages">
              <div aria-live="polite" aria-atomic="true">
                <p className="kids-reference kids-scene-count">Page {scene + 1} of {last + 1}</p>
                <p className="kids-story-text">{edition.paragraphs[scene]}</p>
              </div>
              <div className="kids-scene-nav" role="group" aria-label="Story page controls">
                <button type="button" className="kids-control" disabled={scene === 0} onClick={() => setScene(scene - 1)}>Previous page</button>
                <button type="button" className="kids-control next" disabled={scene === last} onClick={() => setScene(scene + 1)}>Next page</button>
              </div>
            </section>
          ) : edition.paragraphs.map((paragraph) => <p className="kids-story-text" key={paragraph}>{paragraph}</p>)}
          {storybook && <button type="button" className="kids-reading-mode" onClick={() => setShowAll(!showAll)}>
            {showAll ? "Read page by page" : "Read the whole story"}
          </button>}
          {(!paged || scene === last) && <>
            {storybook && <StoryCheck activity={story.activity} />}
            <section className="kids-question">
              <h2>{profile.ageGroup === "young" ? "Talk about it" : "Think it through"}</h2>
              <p>{edition.question}</p>
            </section>
          </>}
          <StoryScripture reference={profile.ageGroup === "teen" ? story.teenReading ?? story.reading : story.reading} />
        </div>
        <div className="kids-story-media">
          {video && <section className="kids-video">
            <h2>{video.title}</h2>
            <video controls preload="metadata" playsInline poster={mediaPath(image.file)} aria-label={video.title}>
              <source src={mediaPath(video.file)} type="video/mp4" />
              <track kind="captions" src={mediaPath(video.captions)} label="English" srcLang="en" default />
            </video>
            <details><summary>Read the transcript</summary>{video.transcript.map((line) => <p key={line}>{line}</p>)}</details>
          </section>}
          {illustrations && <details className="kids-illustrations">
            <summary>More illustrations</summary>
            {illustrations.map((item) => <figure key={item.file}>
              <img src={mediaPath(item.file)} alt={item.alt} loading="lazy" />
              <figcaption>{item.credit}</figcaption>
            </figure>)}
          </details>}
          <details className="family-media-credits">
            <summary>Media credits</summary>
            <ImageCredit image={image} />
            {illustrations?.map((item) => <ImageCredit key={item.file} image={item} />)}
            {video && <p>Story video by Veritas Logos with synthetic narration. The credited images are resized and combined with titles, narration, and captions. Video and captions are shared under <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 3.0</a>.</p>}
          </details>
        </div>
      </div>
    </article>
  );
}

function KidsStories({ profile, storyId }: { profile: FamilyProfile; storyId?: string }) {
  const group = AGE_GROUPS.find(({ id }) => id === profile.ageGroup);
  const stories = FAMILY_STORIES.filter((story) => story.editions[profile.ageGroup]);
  const story = stories.find(({ id }) => id === storyId);
  return (
    <div className={`kids-app kids-${profile.ageGroup}`} data-kids-theme={profile.theme}>
      <header className="kids-header">
        <a className="kids-brand" href={kidsHash(profile.id)}>Veritas Logos</a>
        <a className="kids-finish" href="#family">Back to family</a>
      </header>
      <main className="kids-main" key={storyId || "stories"}>
        {story ? <StoryDetail story={story} profile={profile} /> : (
          <>
            <header className="kids-intro">
              <p className="kids-reference">{group?.label}</p>
              <h1>{profile.nickname ? `${profile.nickname}’s stories` : profile.ageGroup === "teen" ? "Bible stories and studies" : "Bible stories"}</h1>
              <p>{group?.description}</p>
            </header>
            {storyId && <p role="status">That story is unavailable in this age group. Choose a story below.</p>}
            <div className="kids-grid">
              {stories.map((entry) => (
                <a className="kids-card" key={entry.id} href={kidsHash(profile.id, entry.id)}>
                  <img src={mediaPath(entry.image.file)} alt="" />
                  <div>
                    <p className="kids-reference">{entry.reference}</p>
                    <h2>{entry.title}</h2>
                    <p>{entry.topic}</p>
                  </div>
                </a>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function SavedKidsStories({ owner, id, story }: { owner: string; id: string; story?: string }) {
  const { data, loading, error } = useAsync(async () => account().family.get(owner, id), [owner, id]);
  if (data) return <KidsStories profile={data} storyId={story} />;
  if (loading) return <main className="page"><Loading label="Opening profile" /></main>;
  return <main className="page">
    <h1 className="page-title">Family profile unavailable</h1>
    {error && <p>Check your connection and try opening the profile again.</p>}
    <a className="btn" href="#family">Back to family</a>
  </main>;
}

export function KidsPage({ route }: { route: string }) {
  const [id, story] = route.split("/");
  const { status, user } = useAccount();
  const group = AGE_GROUPS.find((age) => previewId(age.id) === id);
  useEffect(() => { window.scrollTo(0, 0); }, [id, story]);
  if (group) return <KidsStories profile={{ id, nickname: "", ageGroup: group.id, theme: "ocean" }} storyId={story} />;
  if (uuid.test(id) && status === "signed-in" && user) return <SavedKidsStories key={`${user.id}/${id}`} owner={user.id} id={id} story={story} />;
  return <main className="page">
    {status === "loading" && uuid.test(id) ? <Loading label="Checking your account" /> : <h1 className="page-title">Family profile unavailable</h1>}
    <a className="btn" href="#family">Back to family</a>
  </main>;
}

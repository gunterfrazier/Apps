import { useEffect, useState, type FormEvent } from "react";
import { getPassage } from "../../core/bible";
import { AGE_GROUPS, FAMILY_THEMES, type AgeGroup, type FamilyProfile, type FamilySettings } from "../../core/family";
import { FAMILY_STORIES, type FamilyStory, type StoryActivity } from "../../core/family-stories";
import { STORY_COLLECTIONS } from "../../core/family-collections";
import { FAMILY_VIDEO_CHANNELS, familyStoryVideos } from "../../core/family-videos";
import { account, useAccount } from "../account";
import { Loading, useAsync } from "../ui";
import { CraftArt, FamilyArt, FAMILY_SPACES } from "./family-art";
import { FamilyResourceIndex, FamilyWorksheet, StoryResourceList } from "./family-worksheets";

const previewId = (age: string) => `preview-${age}`;
const kidsHash = (id: string, story?: string) => `#kids-${id}${story ? "/" + story : ""}`;
const worksheetHash = (id: string, story: string) => `${kidsHash(id, story)}/worksheet`;
const defaultSettings: FamilySettings = { nickname: "", ageGroup: "young", theme: "ocean" };
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

const themeIcons = { ocean: "≈", orchard: "✿", grove: "❧" };
const featuredStories: Record<AgeGroup, string[]> = {
  young: ["creation", "noah", "burning-bush", "david", "jonah", "galilee", "jesus-welcomes-children", "feeding-the-crowd", "resurrection"],
  middle: ["joseph", "burning-bush", "ruth", "jonah", "esther", "daniel", "samaritan", "prodigal-son", "feeding-the-crowd"],
  teen: ["creation", "burning-bush", "ruth", "esther", "daniel", "samaritan", "prodigal-son", "resurrection"],
};
const welcomeStory = FAMILY_STORIES.find((story) => story.id === "noah")!;

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
        <div className="family-welcome-art"><FamilyArt story={welcomeStory} age="young" /></div>
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
              <span className="family-age-icon" aria-hidden="true">{FAMILY_SPACES[group.id].icon}</span>
              <strong>{FAMILY_SPACES[group.id].name}</strong>
              <span>{group.label} · {group.description}</span>
            </a>
          ))}
        </div>
      </section>
      <FamilyResourceIndex worksheetLink={(story, age) => worksheetHash(previewId(age), story)} />
      <details className="family-section family-media-credits">
        <summary>Video creators for families</summary>
        <p>Browse the official channels and playlist on YouTube.</p>
        <ul className="link-list">
          {FAMILY_VIDEO_CHANNELS.map((channel) => <li key={channel.url}>
            <a href={channel.url} target="_blank" rel="noopener noreferrer">{channel.name}</a>
          </li>)}
        </ul>
      </details>
      <details className="family-section family-media-credits">
        <summary>About the artwork and video</summary>
        <p>The story and activity illustrations were created for Veritas Logos. Watch links include the creator’s name.</p>
      </details>
      <section className="family-section">
        <h2>Activities for home</h2>
        <ul className="story-resource-list">
          <li><a href="https://bibleappforkids.com/parents" target="_blank" rel="noopener noreferrer">Bible App for Kids resources from YouVersion</a><span>Parent guides and coloring pages by story</span></li>
          <li><a href="https://open.life.church/preschool" target="_blank" rel="noopener noreferrer">Bible App for Kids curriculum from Life.Church</a><span>Preschool ministry lessons and activities</span></li>
          <li><a href="https://open.life.church/partners/fresh-life-church" target="_blank" rel="noopener noreferrer">Fresh Life Church kids resources</a><span>Coloring pages, prayer guides, and seasonal activities</span></li>
        </ul>
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
        <article className="family-profile-card" key={profile.id} data-profile-theme={profile.theme}>
          <div className="family-profile-identity">
            <span className="family-profile-avatar" aria-hidden="true">{themeIcons[profile.theme]}</span>
            <div>
              <h3>{profile.nickname}</h3>
              <p className="fine">{FAMILY_SPACES[profile.ageGroup].name} · {AGE_GROUPS.find((group) => group.id === profile.ageGroup)?.label}</p>
            </div>
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
      <fieldset className="family-theme-field">
        <legend>Choose a theme</legend>
        <div className="family-theme-grid">
          {FAMILY_THEMES.map((theme) => (
            <label key={theme.id} className="family-theme-option" data-profile-theme={theme.id}>
              <input type="radio" name="family-theme" value={theme.id} checked={settings.theme === theme.id}
                onChange={() => setSettings({ ...settings, theme: theme.id })} />
              <span className="family-profile-avatar" aria-hidden="true">{themeIcons[theme.id]}</span>
              <span>{theme.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="action-row">
        <button className="btn primary" type="submit" disabled={busy || !settings.nickname.trim()}>Save profile</button>
        <button className="btn" type="button" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  );
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
      <h3 id="story-activity-heading">Check what you remember</h3>
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

function StoryWatch({ storyId }: { storyId: string }) {
  const videos = familyStoryVideos(storyId);
  const [showAnimation, setShowAnimation] = useState(false);
  return <>
    {storyId === "burning-bush" && <details className="kids-original-short" onToggle={(event) => setShowAnimation(event.currentTarget.open)}>
      <summary>The bush that kept burning · Veritas Logos animated short</summary>
      {showAnimation && <video controls preload="metadata" playsInline aria-label="The bush that kept burning, a silent animated short with on-screen text">
        <source src="family/burning-bush-short.mp4" type="video/mp4" />
      </video>}
      <p className="fine">A short, silent animation with on-screen story text.</p>
    </details>}
    <p>Creator links open on the publisher’s site or YouTube. Younger children can watch with an adult.</p>
    <ul className="kids-watch-list">
      {videos.map((video) => <li key={video.id}>
        <a className="kids-watch-link" href={video.url ?? `https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noopener noreferrer">
          <span className="kids-watch-icon" aria-hidden="true">▶</span>
          <span><strong>{video.title}</strong><small>{video.creator} · {video.format}</small></span>
        </a>
      </li>)}
    </ul>
  </>;
}

function StoryDetail({ story, profile }: { story: FamilyStory; profile: FamilyProfile }) {
  const [scene, setScene] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const edition = story.editions[profile.ageGroup];
  if (!edition) return null;
  const collection = STORY_COLLECTIONS[story.id];
  const activity = collection?.play[profile.ageGroup];
  const craft = collection?.craft;
  const sections = ["Read", "Play", ...(craft ? ["Make"] : []), ...(familyStoryVideos(story.id).length ? ["Watch"] : [])];
  const storybook = profile.ageGroup !== "teen";
  const paged = storybook && !showAll;
  const last = edition.paragraphs.length - 1;
  return (
    <article className="kids-story">
      <a className="kids-back" href={kidsHash(profile.id)}>← All stories</a>
      <header className="kids-story-heading">
        <p className="kids-reference">{story.reference}</p>
        <h1>{story.title}</h1>
      </header>
      <nav className="kids-story-jump" aria-label="Story sections">
        {sections.map((section) => <button key={section} className="kids-control" type="button" onClick={() => {
          const heading = document.getElementById(`story-${section.toLowerCase()}`);
          heading?.focus({ preventScroll: true });
          heading?.scrollIntoView({ block: "start" });
        }}>{section}</button>)}
      </nav>
      <section className="kids-story-section" aria-labelledby="story-read">
        <h2 id="story-read" tabIndex={-1}>Read</h2>
        <div className="kids-detail-grid">
          <figure className="kids-feature-art"><FamilyArt story={story} age={profile.ageGroup} /></figure>
          <div className="kids-story-body">
            {paged ? (
              <section className="kids-scene" aria-label="Story pages">
                <div aria-live="polite" aria-atomic="true">
                  <p className="kids-reference kids-scene-count">Page {scene + 1} of {last + 1}</p>
                  <h3 className="kids-scene-title">{story.sceneTitles[scene]}</h3>
                  <p className="kids-story-text">{edition.paragraphs[scene]}</p>
                </div>
                <div className="kids-scene-nav" role="group" aria-label="Story page controls">
                  <button type="button" className="kids-control" disabled={scene === 0} onClick={() => setScene(scene - 1)}>Previous page</button>
                  <button type="button" className="kids-control next" disabled={scene === last} onClick={() => setScene(scene + 1)}>Next page</button>
                </div>
              </section>
            ) : edition.paragraphs.map((paragraph, index) => <section className="kids-reading-scene" key={story.sceneTitles[index]}>
              <h3 className="kids-scene-title">{story.sceneTitles[index]}</h3>
              <p className="kids-story-text">{paragraph}</p>
            </section>)}
            {storybook && <button type="button" className="kids-reading-mode" onClick={() => setShowAll(!showAll)}>
              {showAll ? "Read page by page" : "Read the whole story"}
            </button>}
            {(!paged || scene === last) && <section className="kids-question">
                <h3>{profile.ageGroup === "young" ? "Talk about it" : "Think it through"}</h3>
                <p>{edition.question}</p>
            </section>}
            <StoryScripture reference={profile.ageGroup === "teen" ? story.teenReading ?? story.reading : story.reading} />
          </div>
        </div>
      </section>
      <section className="kids-story-section kids-collection-panel" aria-labelledby="story-play">
        <h2 id="story-play" tabIndex={-1}>Play</h2>
        {activity && <div className="kids-offscreen-activity">
          <h3>{activity.title}</h3>
          <p>{activity.instructions}</p>
        </div>}
        {storybook && <StoryCheck activity={story.activity} />}
        <StoryResourceList story={story} age={profile.ageGroup} worksheet={worksheetHash(profile.id, story.id)} />
      </section>
      {craft && <section className="kids-story-section kids-collection-panel" aria-labelledby="story-make">
        <h2 id="story-make" tabIndex={-1}>Make</h2>
        <div className="kids-craft">
          <CraftArt tile={craft.artTile} alt={craft.artAlt} />
          <div>
            <h3>{craft.title}</h3>
            <p className="kids-reference">About {craft.minutes} minutes</p>
            <p><strong>Supplies</strong> · {craft.supplies.join(", ")}</p>
            {profile.ageGroup === "young" && <p>Ask an adult to help with scissors and small supplies.</p>}
            <ol>{craft.steps[profile.ageGroup].map((step) => <li key={step}>{step}</li>)}</ol>
          </div>
        </div>
      </section>}
      {familyStoryVideos(story.id).length > 0 && <section className="kids-story-section kids-collection-panel kids-watch" aria-labelledby="story-watch">
        <h2 id="story-watch" tabIndex={-1}>Watch</h2>
        <StoryWatch storyId={story.id} />
      </section>}
    </article>
  );
}

function StoryCards({ stories, profile }: { stories: FamilyStory[]; profile: FamilyProfile }) {
  return <div className="kids-grid">
    {stories.map((story) => (
      <a className="kids-card" key={story.id} href={kidsHash(profile.id, story.id)}>
        <FamilyArt story={story} age={profile.ageGroup} decorative />
        <div>
          <p className="kids-reference">{story.reference}</p>
          <h3>{story.title}</h3>
          <p>{story.topic}</p>
          <span className="kids-card-action" aria-hidden="true">{FAMILY_SPACES[profile.ageGroup].action} →</span>
        </div>
      </a>
    ))}
  </div>;
}

function KidsStories({ profile, storyId, worksheet }: { profile: FamilyProfile; storyId?: string; worksheet: boolean }) {
  const group = AGE_GROUPS.find(({ id }) => id === profile.ageGroup);
  const stories = FAMILY_STORIES.filter((story) => story.editions[profile.ageGroup]);
  const story = stories.find(({ id }) => id === storyId);
  const featuredIds = featuredStories[profile.ageGroup];
  const featured = featuredIds.map((id) => stories.find((entry) => entry.id === id)).filter((entry) => entry !== undefined);
  const more = stories.filter((entry) => !featuredIds.includes(entry.id));
  const space = FAMILY_SPACES[profile.ageGroup];
  return (
    <div className={`kids-app kids-${profile.ageGroup}`} data-kids-theme={profile.theme}>
      <header className="kids-header">
        <a className="kids-brand" href={kidsHash(profile.id)}>Veritas Logos</a>
        <a className="kids-finish" href="#family">Back to family</a>
      </header>
      <main className="kids-main" key={worksheet ? `${storyId}/worksheet` : storyId || "stories"}>
        {story && worksheet ? <FamilyWorksheet story={story} age={profile.ageGroup} back={kidsHash(profile.id, story.id)} /> :
          story ? <StoryDetail story={story} profile={profile} /> : (
          <>
            <header className="kids-intro" data-profile-theme={profile.nickname ? profile.theme : undefined}>
              <span className="kids-space-icon" aria-hidden="true">{profile.nickname ? themeIcons[profile.theme] : space.icon}</span>
              <div>
                <p className="kids-reference">{group?.label}</p>
                <h1>{profile.nickname ? `${profile.nickname}’s ${space.name}` : space.name}</h1>
                <p>{group?.description}</p>
              </div>
            </header>
            {storyId && <p role="status">That story is unavailable in this age group. Choose a story below.</p>}
            {(["old", "new"] as const).map((testament) => {
              const matches = featured.filter((entry) => entry.testament === testament);
              if (!matches.length) return null;
              return (
                <section className="kids-catalog-section" key={testament} aria-labelledby={`kids-${testament}-testament`}>
                  <h2 id={`kids-${testament}-testament`}>{testament === "old" ? "Old Testament" : "New Testament"}</h2>
                  <StoryCards stories={matches} profile={profile} />
                </section>
              );
            })}
            {more.length > 0 && <details className="kids-more-stories">
              <summary>More stories ({more.length})</summary>
              <StoryCards stories={more} profile={profile} />
            </details>}
          </>
        )}
      </main>
    </div>
  );
}

function SavedKidsStories({ owner, id, story, worksheet }: { owner: string; id: string; story?: string; worksheet: boolean }) {
  const { data, loading, error } = useAsync(async () => account().family.get(owner, id), [owner, id]);
  if (data) return <KidsStories profile={data} storyId={story} worksheet={worksheet} />;
  if (loading) return <main className="page"><Loading label="Opening profile" /></main>;
  return <main className="page">
    <h1 className="page-title">Family profile unavailable</h1>
    {error && <p>Check your connection and try opening the profile again.</p>}
    <a className="btn" href="#family">Back to family</a>
  </main>;
}

export function KidsPage({ route }: { route: string }) {
  const [id, story, view] = route.split("/");
  const worksheet = view === "worksheet";
  const { status, user } = useAccount();
  const group = AGE_GROUPS.find((age) => previewId(age.id) === id);
  useEffect(() => { window.scrollTo(0, 0); }, [id, story, worksheet]);
  if (group) return <KidsStories profile={{ id, nickname: "", ageGroup: group.id, theme: "ocean" }} storyId={story} worksheet={worksheet} />;
  if (uuid.test(id) && status === "signed-in" && user) return <SavedKidsStories key={`${user.id}/${id}`} owner={user.id} id={id} story={story} worksheet={worksheet} />;
  return <main className="page">
    {status === "loading" && uuid.test(id) ? <Loading label="Checking your account" /> : <h1 className="page-title">Family profile unavailable</h1>}
    <a className="btn" href="#family">Back to family</a>
  </main>;
}

import { useEffect, useState } from "react";
import { AGE_GROUPS, type AgeGroup } from "../../core/family";
import { STORY_COLLECTIONS } from "../../core/family-collections";
import { familyStoryAnimation, familyStoryVideos } from "../../core/family-videos";
import { getFamilyResources } from "../../core/family-resources";
import { FAMILY_STORIES, type FamilyStory } from "../../core/family-stories";
import { FamilyArt } from "./family-art";

export function StoryResourceList({ story, age, worksheet, forAdults = false, showWorksheet = true, showPublisher = true }: {
  story: FamilyStory;
  age: AgeGroup;
  worksheet: string;
  forAdults?: boolean;
  showWorksheet?: boolean;
  showPublisher?: boolean;
}) {
  const resources = showPublisher ? getFamilyResources(story.id, age, forAdults) : [];
  return <ul className="story-resource-list">
    {showWorksheet && <li>
      <a href={worksheet}>Open Veritas Logos worksheet</a>
      <span>{age === "young" ? "Coloring page" : age === "middle" ? "Illustrated story activity" : "Scripture study sheet"} · Print or save as PDF</span>
    </li>}
    {resources.map((item) => (
      <li key={item.url}>
        <a href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a>
        <span>{item.provider} · {item.format}{item.detail && ` · ${item.detail}`}</span>
        {item.provider === "BibleProject" && item.format === "Video" && <span>
          <a href="https://bibleproject.com/" target="_blank" rel="noopener noreferrer">BibleProject</a> is the author and owner of this video.
        </span>}
      </li>
    ))}
  </ul>;
}

export type FamilyResourceView = "worksheet" | "play" | "make" | "watch";

const resourceTypes = [
  { id: "all", label: "All resource types" },
  { id: "worksheet", label: "Printables" },
  { id: "play", label: "Activities" },
  { id: "make", label: "Crafts" },
  { id: "watch", label: "Videos and animations" },
  { id: "publisher", label: "Publisher resources" },
] as const;

type ResourceType = typeof resourceTypes[number]["id"];

export function FamilyResourceIndex({ resourceLink }: {
  resourceLink: (story: string, age: AgeGroup, view: FamilyResourceView) => string;
}) {
  const [age, setAge] = useState<AgeGroup>("young");
  const [type, setType] = useState<ResourceType>("all");
  const [duration, setDuration] = useState(0);
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const includes = (kind: ResourceType) => type === "all" || type === kind;
  const matches = FAMILY_STORIES.flatMap((story) => {
    if (!story.editions[age]) return [];
    const collection = STORY_COLLECTIONS[story.id];
    const activity = includes("play") ? collection?.play[age] : undefined;
    const craft = includes("make") && collection?.craft.steps[age] ? collection.craft : undefined;
    const videos = includes("watch") ? familyStoryVideos(story.id) : [];
    const animation = includes("watch") ? familyStoryAnimation(story.id) : undefined;
    const publisher = includes("publisher") ? getFamilyResources(story.id, age, true) : [];
    const printable = includes("worksheet");
    if (type === "make" && (!craft || (duration > 0 && craft.minutes > duration))) return [];
    if (!activity && !craft && !videos.length && !animation && !publisher.length && !printable) return [];
    const terms = [
      story.title, story.reference, story.topic,
      printable ? "worksheet printable coloring page Scripture study sheet" : "",
      activity?.title, craft?.title, ...(craft?.supplies ?? []),
      ...videos.flatMap((video) => [video.title, video.creator]),
      animation?.title,
      ...publisher.flatMap((item) => [item.title, item.provider, item.format]),
    ];
    if (query && !terms.some((term) => term?.toLowerCase().includes(query))) return [];
    return [{ story, activity, craft, watchCount: videos.length + Number(Boolean(animation)), printable, hasPublisher: publisher.length > 0 }];
  });

  return <section className="family-section family-resource-index" aria-labelledby="family-print-resources">
    <h2 id="family-print-resources" tabIndex={-1}>Resource browser</h2>
    <div className="family-resource-filters">
      <label className="family-field">Search resources
        <input className="input" type="search" placeholder="Story, craft, or creator" value={search} onChange={(event) => setSearch(event.target.value)} />
      </label>
      <label className="family-field">Resource age group
        <select className="input" value={age} onChange={(event) => setAge(event.target.value as AgeGroup)}>
          {AGE_GROUPS.map((group) => <option key={group.id} value={group.id}>{group.label}</option>)}
        </select>
      </label>
      <label className="family-field">Resource type
        <select className="input" value={type} onChange={(event) => setType(event.target.value as ResourceType)}>
          {resourceTypes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      {type === "make" && <label className="family-field">Craft time
        <select className="input" value={duration} onChange={(event) => setDuration(Number(event.target.value))}>
          <option value={0}>Any length</option>
          <option value={15}>15 minutes or less</option>
          <option value={20}>20 minutes or less</option>
        </select>
      </label>}
    </div>
    <p className="fine family-resource-count" role="status">{matches.length ? `${matches.length} ${matches.length === 1 ? "story" : "stories"}` : "No matching resources. Try another age group, resource type, or search."}</p>
    <div className="family-resource-stories">
      {matches.map(({ story, activity, craft, watchCount, printable, hasPublisher }) => (
        <details key={`${age}/${type}/${story.id}`} open={type === "all" ? undefined : true}>
          <summary>{story.title} <span className="fine">{story.reference}</span></summary>
          {(craft || activity || watchCount > 0) && <ul className="story-resource-list">
            {activity && <li><a href={resourceLink(story.id, age, "play")}>{activity.title}</a><span>Activity</span></li>}
            {craft && <li><a href={resourceLink(story.id, age, "make")}>{craft.title}</a><span>Craft · About {craft.minutes} minutes</span></li>}
            {watchCount > 0 && <li><a href={resourceLink(story.id, age, "watch")}>Open videos for {story.title}</a><span>{watchCount} watch options</span></li>}
          </ul>}
          {(printable || hasPublisher) && <StoryResourceList story={story} age={age} worksheet={resourceLink(story.id, age, "worksheet")}
            showWorksheet={printable} showPublisher={hasPublisher} forAdults />}
        </details>
      ))}
    </div>
  </section>;
}

function WorksheetPrompt({ heading, prompt, lines = 2 }: { heading: string; prompt: string; lines?: number }) {
  return <div className="worksheet-prompt">
    <h2>{heading}</h2>
    <p>{prompt}</p>
    <div className="worksheet-lines" aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => <div key={index} />)}
    </div>
  </div>;
}

export function FamilyWorksheet({ story, age, back }: { story: FamilyStory; age: AgeGroup; back: string }) {
  const edition = story.editions[age];
  useEffect(() => {
    const previous = document.title;
    document.title = `${story.title} – Veritas Logos worksheet`;
    return () => { document.title = previous; };
  }, [story.title]);
  if (!edition) return null;
  const group = AGE_GROUPS.find((item) => item.id === age);
  const passage = age === "teen" ? story.teenReading ?? story.reading : story.reading;
  return <>
    <div className="worksheet-actions">
      <div className="action-row">
        <a className="kids-back" href={back}>Back to story</a>
        <button className="kids-control next" type="button" onClick={() => window.print()}>Print or save as PDF</button>
      </div>
      <p>Choose a printer or Save as PDF in your print dialog.</p>
    </div>
    <article className="story-worksheet">
      <p className="worksheet-brand">Veritas Logos Family Library · {group?.label}</p>
      <h1>{story.title}</h1>
      <p><strong>Bible reading</strong> {passage}</p>
      <p><strong>Topic</strong> {story.topic}</p>
      {age === "young" ? <>
        <section>
          <h2>Color the story</h2>
          <p>{story.drawPrompt}</p>
          <figure className="worksheet-coloring"><FamilyArt story={story} age={age} variant="ink" /></figure>
        </section>
        <WorksheetPrompt heading="Remember" prompt={story.activity.prompt} lines={1} />
        <WorksheetPrompt heading="Talk together" prompt={edition.question} lines={0} />
      </> : age === "middle" ? <>
        <section className="worksheet-art-prompt">
          <FamilyArt story={story} age={age} grayscale />
          <WorksheetPrompt heading="Spot the detail" prompt="Circle a detail in the picture. Explain how it helps you retell this part of the story." lines={2} />
        </section>
        <WorksheetPrompt heading="Remember a detail" prompt={story.activity.prompt} />
        <WorksheetPrompt heading="Talk together" prompt={edition.question} lines={3} />
      </> : <>
        <section className="worksheet-art-prompt">
          <FamilyArt story={story} age={age} />
          <WorksheetPrompt heading="Compare the art and the text" prompt="What moment did the artist choose? Cite a verse and describe a detail that the words add to the image." lines={3} />
        </section>
        <WorksheetPrompt heading="Reflect" prompt={edition.question} lines={3} />
        <WorksheetPrompt heading="Apply" prompt="Describe one action or conversation this passage could lead to this week." lines={3} />
      </>}
    </article>
  </>;
}

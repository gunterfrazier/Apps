import { useEffect, useState } from "react";
import { AGE_GROUPS, type AgeGroup } from "../../core/family";
import { getFamilyResources } from "../../core/family-resources";
import { FAMILY_STORIES, type FamilyStory } from "../../core/family-stories";

export function StoryResourceList({ story, age, worksheet, forAdults = false }: {
  story: FamilyStory;
  age: AgeGroup;
  worksheet: string;
  forAdults?: boolean;
}) {
  const resources = getFamilyResources(story.id, age, forAdults);
  return <ul className="story-resource-list">
    <li>
      <a href={worksheet}>Open Veritas Logos worksheet</a>
      <span>Print or save as PDF</span>
    </li>
    {resources.map((item) => (
      <li key={item.url}>
        <a href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a>
        <span>{item.provider} · {item.format}{item.detail && ` · ${item.detail}`}</span>
        {item.provider === "BibleProject" && <span>
          <a href="https://bibleproject.com/" target="_blank" rel="noopener noreferrer">BibleProject</a> is the author and owner of this video.
        </span>}
      </li>
    ))}
  </ul>;
}

export function FamilyResourceIndex({ worksheetLink }: { worksheetLink: (story: string, age: AgeGroup) => string }) {
  const [age, setAge] = useState<AgeGroup>("young");
  return <section className="family-section family-resource-index" aria-labelledby="family-print-resources">
    <h2 id="family-print-resources">Print & resources by story</h2>
    <label className="family-field">Resource age group
      <select className="input" value={age} onChange={(event) => setAge(event.target.value as AgeGroup)}>
        {AGE_GROUPS.map((group) => <option key={group.id} value={group.id}>{group.label}</option>)}
      </select>
    </label>
    <div className="family-resource-stories">
      {FAMILY_STORIES.filter((story) => story.editions[age]).map((story) => (
        <details key={story.id}>
          <summary>{story.title} <span className="fine">{story.reference}</span></summary>
          <StoryResourceList story={story} age={age} worksheet={worksheetLink(story.id, age)} forAdults />
        </details>
      ))}
    </div>
  </section>;
}

function WorksheetPrompt({ heading, prompt, lines = 2 }: { heading: string; prompt: string; lines?: number }) {
  return <section>
    <h2>{heading}</h2>
    <p>{prompt}</p>
    <div className="worksheet-lines" aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => <div key={index} />)}
    </div>
  </section>;
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
          <h2>Draw the story</h2>
          <p>{story.drawPrompt}</p>
          <div className="worksheet-drawing" aria-hidden="true" />
        </section>
        <WorksheetPrompt heading="Remember" prompt={story.activity.prompt} lines={1} />
        <WorksheetPrompt heading="Talk together" prompt={edition.question} lines={0} />
      </> : age === "middle" ? <>
        <WorksheetPrompt heading="Retell the beginning" prompt="Who is in this story? Write what happens first." />
        <WorksheetPrompt heading="Remember a detail" prompt={story.activity.prompt} />
        <WorksheetPrompt heading="Talk together" prompt={edition.question} lines={3} />
      </> : <>
        <WorksheetPrompt heading="Observe" prompt="Choose a detail that stands out. Write it down with a verse reference." lines={3} />
        <WorksheetPrompt heading="Reflect" prompt={edition.question} lines={3} />
        <WorksheetPrompt heading="Apply" prompt="Describe one action or conversation this passage could lead to this week." lines={3} />
      </>}
    </article>
  </>;
}

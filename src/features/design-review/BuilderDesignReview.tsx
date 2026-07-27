"use client";

import {
  Archive,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Cloud,
  Copy,
  FileDown,
  FileText,
  FolderOpen,
  GripVertical,
  ImagePlus,
  Layers3,
  LayoutGrid,
  LoaderCircle,
  Menu,
  MoreHorizontal,
  PanelLeft,
  PanelRight,
  Pencil,
  Play,
  Plus,
  Presentation,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import styles from "./BuilderDesignReview.module.css";

type VisualDirection = "compact" | "studio" | "refined";
type MobilePattern = "dock" | "tabs" | "stack";
type Scenario = "starter" | "retrieval" | "library";
type Frame = "desktop" | "tablet" | "mobile";
type UiState = "ready" | "empty" | "loading" | "dialog" | "toast" | "error";
type MobilePanel = "lesson" | "build" | "deck";

const visualDirections: Array<{
  id: VisualDirection;
  eyebrow: string;
  name: string;
  description: string;
  traits: string[];
}> = [
  {
    id: "compact",
    eyebrow: "Recommended",
    name: "Compact Console",
    description: "A calm, high-density teaching tool with clearer hierarchy and faster scanning.",
    traits: ["Graphite + teal", "Plex typography", "Dense, deliberate"],
  },
  {
    id: "studio",
    eyebrow: "Alternative A",
    name: "Teaching Studio",
    description: "A warmer, editorial workspace that gives content more breathing room.",
    traits: ["Paper + ink", "Accessible type", "Softly structured"],
  },
  {
    id: "refined",
    eyebrow: "Alternative B",
    name: "Refined Current",
    description: "The smallest visual shift: familiar teal surfaces with sharper spacing and controls.",
    traits: ["Familiar palette", "Lower migration risk", "Clearer controls"],
  },
];

const mobilePatterns: Array<{
  id: MobilePattern;
  name: string;
  description: string;
}> = [
  {
    id: "dock",
    name: "Drawers + dock",
    description: "Build stays central; Lesson and Deck open as focused drawers.",
  },
  {
    id: "tabs",
    name: "Tabbed workspace",
    description: "Lesson, Build, and Deck are equal full-screen tabs.",
  },
  {
    id: "stack",
    name: "Improved stack",
    description: "Keeps the current flow, with sticky jump links and compact sections.",
  },
];

const tools = [
  ["starter", "Starter", LayoutGrid],
  ["retrieval", "Retrieval", RotateCcw],
  ["example", "Example", Sparkles],
  ["worksheet", "Worksheet", FileText],
  ["pdf", "PDF", FileDown],
  ["cfu", "CFU", ClipboardCheck],
  ["draw", "Draw", Pencil],
] as const;

const retrievalRows = [
  ["104a", "Expand two brackets", "2d", "8", "Today"],
  ["231b", "Find a percentage change", "4d", "5", "Today"],
  ["318c", "Solve simultaneous equations", "7d", "4", "Tomorrow"],
  ["442a", "Use circle theorems", "11d", "3", "3 Aug"],
  ["509d", "Interpret a box plot", "16d", "2", "8 Aug"],
  ["624b", "Factorise a quadratic", "22d", "1", "14 Aug"],
] as const;

const savedLessons = [
  ["24 Aug", "Quadratic graphs", "Year 10", "Planned", ""],
  ["21 Aug", "Circle theorem review", "Year 11", "Taught", "4.2"],
  ["19 Aug", "Simultaneous equations", "Year 10", "Taught", "3.4"],
  ["17 Aug", "Ratio and proportion", "Year 9", "Taught", "2.7"],
  ["14 Aug", "Percentages assessment", "Year 9", "Draft", ""],
] as const;

export function BuilderDesignReview() {
  const [direction, setDirection] = useState<VisualDirection>("compact");
  const [mobilePattern, setMobilePattern] = useState<MobilePattern>("dock");
  const [scenario, setScenario] = useState<Scenario>("starter");
  const [frame, setFrame] = useState<Frame>("desktop");
  const [uiState, setUiState] = useState<UiState>("ready");
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("build");
  const [activeSlide, setActiveSlide] = useState(2);
  const [deckCollapsed, setDeckCollapsed] = useState(false);
  const [toastVisible, setToastVisible] = useState(true);

  const directionCopy = visualDirections.find((item) => item.id === direction)!;

  function chooseScenario(nextScenario: Scenario) {
    setScenario(nextScenario);
    setMobilePanel("build");
  }

  return (
    <div className={styles.reviewPage}>
      <header className={styles.reviewHeader}>
        <div>
          <p className={styles.kicker}>Lesson Builder · interface study 01</p>
          <h1>A faster workspace, without changing the lesson workflow.</h1>
          <p className={styles.intro}>
            Compare three visual treatments and three responsive navigation models using safe,
            fictional lesson data. Every control in this lab is illustrative; nothing is saved.
          </p>
        </div>
        <div className={styles.safetyCard}>
          <span className={styles.safetyPulse} aria-hidden />
          <div>
            <strong>Preview-only design lab</strong>
            <span>No Supabase or application API calls</span>
          </div>
        </div>
      </header>

      <section className={styles.directionSection} aria-labelledby="direction-title">
        <div className={styles.sectionHeading}>
          <div>
            <span>01</span>
            <h2 id="direction-title">Choose a visual direction</h2>
          </div>
          <p>Compact Console is selected; alternatives remain live for direct comparison.</p>
        </div>
        <div className={styles.directionGrid}>
          {visualDirections.map((item) => (
            <button
              key={item.id}
              type="button"
              className={styles.directionCard}
              data-theme={item.id}
              data-selected={direction === item.id}
              aria-pressed={direction === item.id}
              onClick={() => setDirection(item.id)}
            >
              <span className={styles.directionTopline}>
                <span>{item.eyebrow}</span>
                {direction === item.id ? <Check aria-hidden /> : null}
              </span>
              <span className={styles.directionPreview} aria-hidden>
                <span />
                <span />
                <span />
              </span>
              <strong>{item.name}</strong>
              <span className={styles.directionDescription}>{item.description}</span>
              <span className={styles.traitList}>
                {item.traits.map((trait) => (
                  <span key={trait}>{trait}</span>
                ))}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.prototypeSection} aria-labelledby="prototype-title">
        <div className={styles.sectionHeading}>
          <div>
            <span>02</span>
            <h2 id="prototype-title">Explore the working prototype</h2>
          </div>
          <p>{directionCopy.description}</p>
        </div>

        <div className={styles.controlDeck}>
          <ControlGroup label="Content">
            <SegmentButton active={scenario === "starter"} onClick={() => chooseScenario("starter")}>
              Starter
            </SegmentButton>
            <SegmentButton active={scenario === "retrieval"} onClick={() => chooseScenario("retrieval")}>
              Retrieval
            </SegmentButton>
            <SegmentButton active={scenario === "library"} onClick={() => chooseScenario("library")}>
              Saved lessons
            </SegmentButton>
          </ControlGroup>
          <ControlGroup label="Viewport">
            <SegmentButton active={frame === "desktop"} onClick={() => setFrame("desktop")}>
              Desktop
            </SegmentButton>
            <SegmentButton active={frame === "tablet"} onClick={() => setFrame("tablet")}>
              Tablet
            </SegmentButton>
            <SegmentButton active={frame === "mobile"} onClick={() => setFrame("mobile")}>
              Mobile
            </SegmentButton>
          </ControlGroup>
          <ControlGroup label="State">
            <select
              aria-label="Interface state"
              value={uiState}
              onChange={(event) => {
                setUiState(event.target.value as UiState);
                setToastVisible(true);
              }}
            >
              <option value="ready">Ready</option>
              <option value="empty">Empty lesson</option>
              <option value="loading">Loading</option>
              <option value="dialog">Confirmation dialog</option>
              <option value="toast">Success toast</option>
              <option value="error">Recoverable error</option>
            </select>
          </ControlGroup>
        </div>

        <div className={styles.frameStage} data-frame={frame}>
          <div className={styles.frameLabel}>
            <span>{frame === "desktop" ? "1440 × 900" : frame === "tablet" ? "768 × 1024" : "390 × 844"}</span>
            <span>{directionCopy.name}</span>
          </div>
          <div
            className={styles.prototype}
            data-theme={direction}
            data-mobile-pattern={mobilePattern}
            data-mobile-panel={mobilePanel}
            data-deck-collapsed={deckCollapsed}
          >
            <PrototypeTopbar
              scenario={scenario}
              onMenu={() => setMobilePanel("lesson")}
              onDeck={() => setMobilePanel("deck")}
            />
            <LessonRail scenario={scenario} onScenario={chooseScenario} />
            <section className={styles.workspace} aria-label="Authoring workspace">
              {mobilePattern === "tabs" ? (
                <MobileTabs active={mobilePanel} onChange={setMobilePanel} />
              ) : null}
              <div className={styles.workspaceHeader}>
                <div>
                  <span className={styles.crumb}>Build / {scenario === "library" ? "Library" : scenario}</span>
                  <h2>{scenario === "starter" ? "Starter" : scenario === "retrieval" ? "Retrieval bank" : "Saved lessons"}</h2>
                </div>
                <div className={styles.workspaceActions}>
                  <button type="button"><Play aria-hidden /> Present</button>
                  <button type="button" className={styles.primaryAction}><Save aria-hidden /> Save</button>
                </div>
              </div>
              {uiState === "empty" ? (
                <EmptyState scenario={scenario} />
              ) : scenario === "starter" ? (
                <StarterWorkspace />
              ) : scenario === "retrieval" ? (
                <RetrievalWorkspace />
              ) : (
                <SavedLessonsWorkspace />
              )}
            </section>
            <DeckRail
              activeSlide={activeSlide}
              collapsed={deckCollapsed}
              onCollapse={() => setDeckCollapsed((value) => !value)}
              onSelect={setActiveSlide}
            />
            <MobileDock active={mobilePanel} onChange={setMobilePanel} />
            {uiState === "loading" ? <LoadingOverlay /> : null}
            {uiState === "dialog" ? <DemoDialog onClose={() => setUiState("ready")} /> : null}
            {(uiState === "toast" || uiState === "error") && toastVisible ? (
              <DemoToast error={uiState === "error"} onClose={() => setToastVisible(false)} />
            ) : null}
          </div>
        </div>
      </section>

      <section className={styles.mobileSection} aria-labelledby="mobile-title">
        <div className={styles.sectionHeading}>
          <div>
            <span>03</span>
            <h2 id="mobile-title">Compare mobile navigation</h2>
          </div>
          <p>All options keep the same tools and actions; only the navigation model changes.</p>
        </div>
        <div className={styles.mobileGrid}>
          {mobilePatterns.map((pattern) => (
            <button
              type="button"
              key={pattern.id}
              className={styles.mobileCard}
              data-selected={mobilePattern === pattern.id}
              aria-pressed={mobilePattern === pattern.id}
              onClick={() => {
                setMobilePattern(pattern.id);
                setFrame("mobile");
                setMobilePanel("build");
              }}
            >
              <span className={styles.mobileMock} data-pattern={pattern.id} aria-hidden>
                <span className={styles.mockHeader} />
                <span className={styles.mockRail} />
                <span className={styles.mockCanvas} />
                <span className={styles.mockNav} />
              </span>
              <span className={styles.mobileCardCopy}>
                <strong>{pattern.name}</strong>
                {pattern.id === "dock" ? <em>Recommended</em> : null}
                <span>{pattern.description}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <footer className={styles.reviewFooter}>
        <div>
          <span>Design decision gate</span>
          <strong>Choose one visual direction and one mobile model before integration.</strong>
        </div>
        <p>
          The approved direction can then wrap the existing Builder components and store behind a
          Preview-only feature flag. No lesson schema or workflow needs to change.
        </p>
      </footer>
    </div>
  );
}

function SegmentButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" aria-pressed={active} data-active={active} onClick={onClick}>
      {children}
    </button>
  );
}

function ControlGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.controlGroup}>
      <span>{label}</span>
      <div>{children}</div>
    </div>
  );
}

function PrototypeTopbar({
  scenario,
  onMenu,
  onDeck,
}: {
  scenario: Scenario;
  onMenu: () => void;
  onDeck: () => void;
}) {
  return (
    <header className={styles.prototypeTopbar}>
      <button type="button" className={styles.mobileIconButton} aria-label="Open lesson panel" onClick={onMenu}>
        <Menu aria-hidden />
      </button>
      <div className={styles.productMark}>
        <span>LB</span>
        <div><strong>Lesson Builder</strong><small>Year 10 · Mathematics</small></div>
      </div>
      <div className={styles.lessonIdentity}>
        <span>{scenario === "library" ? "Lesson library" : "Quadratic graphs"}</span>
        <small>Mon 24 Aug</small>
      </div>
      <div className={styles.cloudStatus}><Cloud aria-hidden /><span>Saved</span></div>
      <button type="button" className={styles.topbarButton}><FolderOpen aria-hidden /><span>Lessons</span></button>
      <button type="button" className={styles.topbarButton}><Presentation aria-hidden /><span>Present</span></button>
      <button type="button" className={styles.avatar} aria-label="Account menu">GG</button>
      <button type="button" className={styles.mobileIconButton} aria-label="Open deck panel" onClick={onDeck}>
        <Layers3 aria-hidden />
      </button>
    </header>
  );
}

function LessonRail({ scenario, onScenario }: { scenario: Scenario; onScenario: (scenario: Scenario) => void }) {
  return (
    <aside className={styles.lessonRail} aria-label="Lesson controls">
      <div className={styles.railSection}>
        <div className={styles.railHeading}><span>Lesson</span><button type="button"><MoreHorizontal aria-hidden /></button></div>
        <label><span>Title</span><input value="Quadratic graphs" readOnly /></label>
        <div className={styles.fieldPair}>
          <label><span>Class</span><select defaultValue="Year 10"><option>Year 10</option></select></label>
          <label><span>Date</span><input value="24/08/26" readOnly /></label>
        </div>
        <button type="button" className={styles.newLessonButton}><Plus aria-hidden /> New lesson</button>
      </div>
      <nav className={styles.toolNav} aria-label="Builder tools">
        <span className={styles.railLabel}>Add to lesson</span>
        {tools.map(([id, label, Icon]) => {
          const target = id === "starter" ? "starter" : id === "retrieval" ? "retrieval" : scenario;
          const active = id === scenario;
          return (
            <button key={id} type="button" data-active={active} onClick={() => onScenario(target as Scenario)}>
              <Icon aria-hidden /><span>{label}</span>{active ? <ChevronRight aria-hidden /> : null}
            </button>
          );
        })}
      </nav>
      <div className={styles.railFooter}>
        <button type="button"><Upload aria-hidden /> Import</button>
        <button type="button"><FileDown aria-hidden /> Export</button>
      </div>
    </aside>
  );
}

function StarterWorkspace() {
  const items = [
    ["104a", "Expand two brackets", "Q1", "A1"],
    ["231b", "Percentage change", "Q2", "A2"],
    ["318c", "Simultaneous equations", "Q3", "A3"],
    ["442a", "Circle theorems", "Q4", "A4"],
  ];
  return (
    <div className={styles.workspaceBody}>
      <div className={styles.contextStrip}>
        <div><strong>Starter set</strong><span>4 learning objectives · images paste on hover</span></div>
        <button type="button"><Sparkles aria-hidden /> Suggest due items</button>
      </div>
      <div className={styles.starterGrid}>
        {items.map(([code, title, question, answer], index) => (
          <article key={code} className={styles.starterCard}>
            <header>
              <span className={styles.slotNumber}>0{index + 1}</span>
              <div><code>{code}</code><strong>{title}</strong></div>
              <button type="button" aria-label={`More actions for ${title}`}><MoreHorizontal aria-hidden /></button>
            </header>
            <div className={styles.imagePair}>
              <ImageSlot label="Question" marker={question} />
              <ImageSlot label="Answer" marker={answer} answer />
            </div>
          </article>
        ))}
      </div>
      <div className={styles.stickyActionBar}>
        <span><Check aria-hidden /> 4 slots ready</span>
        <button type="button"><Copy aria-hidden /> Add starter slide</button>
      </div>
    </div>
  );
}

function ImageSlot({ label, marker, answer = false }: { label: string; marker: string; answer?: boolean }) {
  return (
    <div className={styles.imageSlot} data-answer={answer}>
      <div><span>{label}</span><em>{marker}</em></div>
      <div className={styles.equationPreview}>{answer ? "(x + 2)(x + 5)" : "x² + 7x + 10"}</div>
      <footer>
        <span>Paste or drop</span>
        <button type="button"><Pencil aria-hidden /> Draw</button>
        <button type="button" aria-label={`Add ${label.toLowerCase()} image`}><ImagePlus aria-hidden /></button>
      </footer>
    </div>
  );
}

function RetrievalWorkspace() {
  return (
    <div className={styles.workspaceBody}>
      <div className={styles.filterBar}>
        <label><Search aria-hidden /><input aria-label="Search retrieval bank" placeholder="Search code or objective" /></label>
        <button type="button"><Users aria-hidden /> Year 10 <ChevronDown aria-hidden /></button>
        <button type="button" data-active>Due now <span>26</span></button>
        <button type="button">All <span>85</span></button>
      </div>
      <div className={styles.retrievalTable} role="table" aria-label="Retrieval bank prototype">
        <div className={styles.tableHeader} role="row">
          <span role="columnheader"><input type="checkbox" aria-label="Select all objectives" /></span>
          <span role="columnheader">Objective</span>
          <span role="columnheader">Spacing</span>
          <span role="columnheader">Seen</span>
          <span role="columnheader">Next due</span>
          <span role="columnheader">Actions</span>
        </div>
        {retrievalRows.map(([code, objective, spacing, seen, due], index) => (
          <div className={styles.tableRow} role="row" key={code} data-due={index < 2}>
            <span role="cell"><input type="checkbox" aria-label={`Select ${objective}`} defaultChecked={index < 2} /></span>
            <span role="cell"><code>{code}</code><strong>{objective}</strong></span>
            <span role="cell"><input value={spacing} readOnly aria-label={`${objective} spacing`} /></span>
            <span role="cell"><b>{seen}</b></span>
            <span role="cell"><em>{due}</em></span>
            <span role="cell"><button type="button" aria-label={`Edit ${objective}`}><Pencil aria-hidden /></button><button type="button" aria-label={`More actions for ${objective}`}><MoreHorizontal aria-hidden /></button></span>
          </div>
        ))}
      </div>
      <div className={styles.bulkBar}>
        <strong>2 selected</strong>
        <div><button type="button">Generate slides</button><button type="button">Log selected</button><button type="button"><RotateCcw aria-hidden /> Roll back</button><button type="button" className={styles.dangerText}><Archive aria-hidden /> Archive</button></div>
      </div>
    </div>
  );
}

function SavedLessonsWorkspace() {
  return (
    <div className={styles.workspaceBody}>
      <div className={styles.librarySummary}>
        <div><span>54</span><small>saved lessons</small></div>
        <div><span>8</span><small>classes</small></div>
        <label><Search aria-hidden /><input aria-label="Search saved lessons" placeholder="Search lessons" /></label>
        <button type="button"><Plus aria-hidden /> New lesson</button>
      </div>
      <div className={styles.lessonList}>
        <div className={styles.lessonListHeader}><span>Teaching date</span><span>Lesson</span><span>Class</span><span>Status</span><span>Actions</span></div>
        {savedLessons.map(([date, title, className, status, confidence]) => (
          <article key={title} data-status={status.toLowerCase()}>
            <time>{date}</time>
            <div><strong>{title}</strong><span>12 slides · updated 3h ago</span></div>
            <span>{className}</span>
            <span className={styles.statusBadge}>{status}{confidence ? ` · ${confidence}` : ""}</span>
            <div className={styles.rowActions}>
              <button type="button" aria-label={`Open ${title}`}><FolderOpen aria-hidden /></button>
              <button type="button" aria-label={`Present ${title}`}><Play aria-hidden /></button>
              <button type="button" aria-label={`More actions for ${title}`}><MoreHorizontal aria-hidden /></button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function DeckRail({
  activeSlide,
  collapsed,
  onCollapse,
  onSelect,
}: {
  activeSlide: number;
  collapsed: boolean;
  onCollapse: () => void;
  onSelect: (slide: number) => void;
}) {
  return (
    <aside className={styles.deckRail} aria-label="Deck preview">
      <header>
        <div><span>Deck</span><strong>5 slides</strong></div>
        <button type="button" aria-label={collapsed ? "Expand deck preview" : "Collapse deck preview"} onClick={onCollapse}>
          {collapsed ? <ChevronLeft aria-hidden /> : <ChevronRight aria-hidden />}
        </button>
      </header>
      <div className={styles.deckActions}>
        <button type="button"><Plus aria-hidden /><span>Blank</span></button>
        <button type="button"><Play aria-hidden /><span>Present</span></button>
        <button type="button"><MoreHorizontal aria-hidden /><span>More</span></button>
      </div>
      <div className={styles.thumbnailList}>
        {["Starter", "Example", "Worked example", "CFU", "Worksheet"].map((title, index) => (
          <button key={title} type="button" data-active={activeSlide === index + 1} onClick={() => onSelect(index + 1)}>
            <GripVertical aria-hidden />
            <span className={styles.slideNumber}>{index + 1}</span>
            <span className={styles.thumbnailArt} data-kind={index}>
              {index === 0 ? <><i /><i /><i /><i /></> : <><i /><i /></>}
            </span>
            <span className={styles.thumbnailTitle}>{title}</span>
          </button>
        ))}
      </div>
      <footer><button type="button"><Trash2 aria-hidden /><span>Delete slide {activeSlide}</span></button></footer>
    </aside>
  );
}

function MobileDock({ active, onChange }: { active: MobilePanel; onChange: (panel: MobilePanel) => void }) {
  return (
    <nav className={styles.mobileDock} aria-label="Mobile workspace navigation">
      <button type="button" data-active={active === "lesson"} onClick={() => onChange("lesson")}><PanelLeft aria-hidden /><span>Lesson</span></button>
      <button type="button" data-active={active === "build"} onClick={() => onChange("build")}><Pencil aria-hidden /><span>Build</span></button>
      <button type="button" data-active={active === "deck"} onClick={() => onChange("deck")}><PanelRight aria-hidden /><span>Deck</span><em>5</em></button>
    </nav>
  );
}

function MobileTabs({ active, onChange }: { active: MobilePanel; onChange: (panel: MobilePanel) => void }) {
  return (
    <nav className={styles.mobileTabs} aria-label="Mobile workspace tabs">
      {(["lesson", "build", "deck"] as const).map((panel) => (
        <button key={panel} type="button" data-active={active === panel} onClick={() => onChange(panel)}>{panel}</button>
      ))}
    </nav>
  );
}

function EmptyState({ scenario }: { scenario: Scenario }) {
  return (
    <div className={styles.emptyState}>
      <span><Layers3 aria-hidden /></span>
      <h3>{scenario === "library" ? "No lessons match this view" : "This lesson is ready for its first slide"}</h3>
      <p>{scenario === "library" ? "Change the filters or create a new lesson." : "Choose a tool, add the content, then send it to the deck."}</p>
      <button type="button"><Plus aria-hidden /> {scenario === "library" ? "New lesson" : "Add starter"}</button>
    </div>
  );
}

function LoadingOverlay() {
  return <div className={styles.loadingOverlay} role="status"><LoaderCircle aria-hidden /><strong>Loading lesson workspace</strong><span>Retrieving slides and lesson assets…</span></div>;
}

function DemoDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className={styles.dialogBackdrop} role="presentation">
      <section className={styles.demoDialog} role="alertdialog" aria-modal="true" aria-labelledby="demo-dialog-title">
        <span><CircleAlert aria-hidden /></span>
        <div><h3 id="demo-dialog-title">Replace the current lesson?</h3><p>Your unsaved workspace will be replaced by “Circle theorem review”.</p></div>
        <footer><button type="button" onClick={onClose}>Keep current lesson</button><button type="button" className={styles.dialogDanger} onClick={onClose}>Replace lesson</button></footer>
      </section>
    </div>
  );
}

function DemoToast({ error, onClose }: { error: boolean; onClose: () => void }) {
  return (
    <div className={styles.demoToast} role={error ? "alert" : "status"} data-error={error}>
      {error ? <CircleAlert aria-hidden /> : <Check aria-hidden />}
      <div><strong>{error ? "Couldn’t export the lesson" : "Lesson saved"}</strong><span>{error ? "Your lesson is safe. Check the connection and try again." : "All changes are now in the cloud."}</span></div>
      <button type="button" aria-label="Dismiss notification" onClick={onClose}><X aria-hidden /></button>
    </div>
  );
}

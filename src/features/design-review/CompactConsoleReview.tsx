"use client";

import {
  Archive,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Cloud,
  Copy,
  Download,
  FileDown,
  FileText,
  FolderOpen,
  GripVertical,
  ImagePlus,
  Import,
  Layers3,
  LayoutGrid,
  Menu,
  Moon,
  MoreHorizontal,
  PanelLeftClose,
  PanelRightClose,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import styles from "./CompactConsoleReview.module.css";

type Theme = "light" | "dark";
type MobilePanel = "lesson" | "deck" | null;
type OpenMenu = "lessons" | "deck" | "slot-1" | "slot-2" | "slot-3" | "slot-4" | null;

const toolGroups = [
  {
    id: "core",
    label: "Core slides",
    tools: [
      ["Starter", LayoutGrid],
      ["Retrieval", RotateCcw],
      ["Example", Sparkles],
      ["CFU", Check],
    ],
  },
  {
    id: "resources",
    label: "Resources",
    tools: [
      ["Worksheet", FileText],
      ["PDF", FileDown],
    ],
  },
  {
    id: "create",
    label: "Create",
    tools: [
      ["Draw", Pencil],
      ["LaTeX", SlidersHorizontal],
    ],
  },
] as const;

const starterItems = [
  ["104a", "Expand two brackets", "x² + 7x + 10", "(x + 2)(x + 5)"],
  ["231b", "Percentage change", "Increase 80 by 15%", "92"],
  ["318c", "Simultaneous equations", "2x + y = 11", "x = 4, y = 3"],
  ["442a", "Circle theorems", "Find angle x", "x = 64°"],
] as const;

const slides = ["Starter", "Example", "Worked example", "CFU", "Worksheet"] as const;

export function CompactConsoleReview() {
  const [theme, setTheme] = useState<Theme>("light");
  const [lessonCollapsed, setLessonCollapsed] = useState(false);
  const [deckCollapsed, setDeckCollapsed] = useState(false);
  const [lessonDetailsOpen, setLessonDetailsOpen] = useState(true);
  const [openGroups, setOpenGroups] = useState(() => new Set(["core", "resources", "create"]));
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [activeSlide, setActiveSlide] = useState(1);
  const [selectedSlides, setSelectedSlides] = useState<number[]>([1, 2]);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null);
  const [reviewMapOpen, setReviewMapOpen] = useState(false);
  const [newLessonOpen, setNewLessonOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function toggleToolGroup(id: string) {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSlideSelection(slide: number) {
    setSelectedSlides((current) =>
      current.includes(slide)
        ? current.filter((item) => item !== slide)
        : [...current, slide].sort(),
    );
  }

  function showToast(message: string) {
    setOpenMenu(null);
    setToast(message);
  }

  return (
    <div className={styles.review} data-theme={theme}>
      <header className={styles.reviewBar}>
        <div>
          <a href="/design-review/builder"><ChevronLeft aria-hidden /> All directions</a>
          <span className={styles.reviewDivider} aria-hidden />
          <strong>Compact Console</strong>
          <span className={styles.previewBadge}>Focused mockup</span>
        </div>
        <div className={styles.reviewActions}>
          <button
            type="button"
            aria-pressed={reviewMapOpen}
            onClick={() => setReviewMapOpen((open) => !open)}
          >
            <CircleHelp aria-hidden /> Review map
          </button>
          <div className={styles.themeSwitch} aria-label="Appearance">
            <button type="button" aria-pressed={theme === "light"} onClick={() => setTheme("light")}>
              <Sun aria-hidden /><span>Light</span>
            </button>
            <button type="button" aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}>
              <Moon aria-hidden /><span>Dark</span>
            </button>
          </div>
        </div>
      </header>

      <div className={styles.consoleFrame}>
        <div
          className={styles.console}
          data-lesson-collapsed={lessonCollapsed}
          data-deck-collapsed={deckCollapsed}
          data-mobile-panel={mobilePanel ?? "closed"}
        >
          <AppBar
            openMenu={openMenu}
            onMenu={setOpenMenu}
            onLesson={() => setMobilePanel("lesson")}
            onDeck={() => setMobilePanel("deck")}
            onPresent={() => showToast("Presenter preview opened — mock action only.")}
            onSave={() => showToast("Lesson saved in the mockup.")}
          />

          <LessonRail
            collapsed={lessonCollapsed}
            detailsOpen={lessonDetailsOpen}
            openGroups={openGroups}
            onCollapse={() => setLessonCollapsed((collapsed) => !collapsed)}
            onDetails={() => setLessonDetailsOpen((open) => !open)}
            onGroup={toggleToolGroup}
            onNewLesson={() => setNewLessonOpen(true)}
            onCloseMobile={() => setMobilePanel(null)}
          />

          <section className={styles.workspace} aria-label="Starter authoring workspace">
            <div className={styles.workspaceHeader}>
              <div>
                <span className={styles.eyebrow}>Build / Starter</span>
                <div className={styles.titleRow}>
                  <span className={styles.reviewNumber}>03</span>
                  <h1>Starter</h1>
                </div>
              </div>
              <div className={styles.workspaceActions}>
                <button type="button" onClick={() => showToast("Presenter preview opened — mock action only.")}><Play aria-hidden /> Present</button>
                <button type="button" className={styles.primaryButton} onClick={() => showToast("Lesson saved in the mockup.")}><Save aria-hidden /> Save</button>
              </div>
            </div>

            <div className={styles.workspaceBody}>
              <span className={styles.reviewPin} aria-hidden>04</span>
              <div className={styles.contextBar}>
                <div><strong>Starter set</strong><span>4 learning objectives · images paste on hover</span></div>
                <button type="button" onClick={() => showToast("Due retrieval items suggested.")}><Sparkles aria-hidden /> Suggest due items</button>
              </div>

              <div className={styles.starterGrid}>
                {starterItems.map(([code, objective, question, answer], index) => (
                  <StarterCard
                    key={code}
                    index={index + 1}
                    code={code}
                    objective={objective}
                    question={question}
                    answer={answer}
                    menuOpen={openMenu === (`slot-${index + 1}` as OpenMenu)}
                    onMenu={() => setOpenMenu((menu) => menu === `slot-${index + 1}` ? null : (`slot-${index + 1}` as OpenMenu))}
                    onAction={showToast}
                  />
                ))}
              </div>

              <div className={styles.actionBar}>
                <span><Check aria-hidden /> Four slots ready</span>
                <button type="button" onClick={() => showToast("Starter slide added to the deck.")}><Copy aria-hidden /> Add starter slide</button>
              </div>
            </div>
          </section>

          <DeckRail
            activeSlide={activeSlide}
            collapsed={deckCollapsed}
            selectedSlides={selectedSlides}
            menuOpen={openMenu === "deck"}
            onCollapse={() => setDeckCollapsed((collapsed) => !collapsed)}
            onMenu={() => setOpenMenu((menu) => menu === "deck" ? null : "deck")}
            onSelect={setActiveSlide}
            onToggleSelection={toggleSlideSelection}
            onAction={showToast}
            onCloseMobile={() => setMobilePanel(null)}
          />

          <nav className={styles.mobileDock} aria-label="Mobile workspace navigation">
            <span className={styles.reviewPin} aria-hidden>06</span>
            <button type="button" aria-pressed={mobilePanel === "lesson"} onClick={() => setMobilePanel((panel) => panel === "lesson" ? null : "lesson")}>
              <BookOpen aria-hidden /><span>Lesson</span>
            </button>
            <button type="button" aria-pressed={mobilePanel === null} onClick={() => setMobilePanel(null)}>
              <Pencil aria-hidden /><span>Build</span>
            </button>
            <button type="button" aria-pressed={mobilePanel === "deck"} onClick={() => setMobilePanel((panel) => panel === "deck" ? null : "deck")}>
              <Layers3 aria-hidden /><span>Deck</span><em>{slides.length}</em>
            </button>
          </nav>

          {mobilePanel ? <button type="button" className={styles.mobileScrim} aria-label="Close drawer" onClick={() => setMobilePanel(null)} /> : null}
        </div>
      </div>

      {reviewMapOpen ? <ReviewMap onClose={() => setReviewMapOpen(false)} /> : null}
      {newLessonOpen ? <NewLessonDialog onClose={() => setNewLessonOpen(false)} onCreate={() => { setNewLessonOpen(false); showToast("Blank lesson created in the mockup."); }} /> : null}
      {toast ? <Toast message={toast} onClose={() => setToast(null)} /> : null}
    </div>
  );
}

function AppBar({
  openMenu,
  onMenu,
  onLesson,
  onDeck,
  onPresent,
  onSave,
}: {
  openMenu: OpenMenu;
  onMenu: (menu: OpenMenu) => void;
  onLesson: () => void;
  onDeck: () => void;
  onPresent: () => void;
  onSave: () => void;
}) {
  return (
    <header className={styles.appBar}>
      <button className={styles.mobileMenuButton} type="button" aria-label="Open lesson drawer" onClick={onLesson}><Menu aria-hidden /></button>
      <div className={styles.productMark}><em className={styles.appBarNumber}>01</em><span>LB</span><div><strong>Lesson Builder</strong><small>Year 10 · Mathematics</small></div></div>
      <div className={styles.lessonIdentity}><small>Current lesson</small><strong>Quadratic graphs</strong><span>Mon 24 Aug</span></div>
      <span className={styles.cloudStatus}><Cloud aria-hidden /> Saved</span>
      <div className={styles.menuAnchor}>
        <button type="button" aria-expanded={openMenu === "lessons"} onClick={() => onMenu(openMenu === "lessons" ? null : "lessons")}><FolderOpen aria-hidden /> Lessons <ChevronDown aria-hidden /></button>
        {openMenu === "lessons" ? (
          <div className={styles.popover} role="menu" aria-label="Lesson menu">
            <button type="button" role="menuitem"><Search aria-hidden /> Search saved lessons</button>
            <button type="button" role="menuitem"><Plus aria-hidden /> Create new lesson</button>
            <button type="button" role="menuitem"><Users aria-hidden /> Manage classes</button>
          </div>
        ) : null}
      </div>
      <button type="button" onClick={onPresent}><Play aria-hidden /> Present</button>
      <button type="button" className={styles.saveButton} onClick={onSave}><Save aria-hidden /> Save</button>
      <button className={styles.mobileMenuButton} type="button" aria-label="Open deck drawer" onClick={onDeck}><Layers3 aria-hidden /></button>
      <span className={styles.avatar}>GG</span>
    </header>
  );
}

function LessonRail({
  collapsed,
  detailsOpen,
  openGroups,
  onCollapse,
  onDetails,
  onGroup,
  onNewLesson,
  onCloseMobile,
}: {
  collapsed: boolean;
  detailsOpen: boolean;
  openGroups: Set<string>;
  onCollapse: () => void;
  onDetails: () => void;
  onGroup: (id: string) => void;
  onNewLesson: () => void;
  onCloseMobile: () => void;
}) {
  return (
    <aside className={styles.lessonRail} aria-label="Lesson tools">
      <div className={styles.railTopline}>
        <span className={styles.reviewNumber}>02</span>
        <strong>Lesson</strong>
        <button type="button" aria-label="Close lesson drawer" className={styles.mobileClose} onClick={onCloseMobile}><X aria-hidden /></button>
        <button type="button" aria-label={collapsed ? "Expand lesson tools" : "Collapse lesson tools"} className={styles.desktopCollapse} onClick={onCollapse}>{collapsed ? <ChevronRight aria-hidden /> : <PanelLeftClose aria-hidden />}</button>
      </div>

      <button className={styles.accordionButton} type="button" aria-expanded={detailsOpen} onClick={onDetails}>
        <span>Lesson details</span><ChevronDown aria-hidden />
      </button>
      {detailsOpen ? (
        <div className={styles.lessonFields}>
          <label><span>Title</span><input defaultValue="Quadratic graphs" /></label>
          <div><label><span>Class</span><select defaultValue="Year 10"><option>Year 10</option><option>Year 11</option></select></label><label><span>Date</span><input defaultValue="24/08/26" /></label></div>
          <button type="button" className={styles.newLessonButton} onClick={onNewLesson}><Plus aria-hidden /> New lesson</button>
        </div>
      ) : null}

      <nav className={styles.toolGroups} aria-label="Add to lesson">
        <span className={styles.railLabel}>Add to lesson</span>
        {toolGroups.map((group) => (
          <div className={styles.toolGroup} key={group.id}>
            <button type="button" aria-expanded={openGroups.has(group.id)} onClick={() => onGroup(group.id)}>
              <span>{group.label}</span><ChevronDown aria-hidden />
            </button>
            {openGroups.has(group.id) ? (
              <div>
                {group.tools.map(([label, Icon]) => (
                  <button type="button" key={label} data-active={label === "Starter"}><Icon aria-hidden /><span>{label}</span><ChevronRight aria-hidden /></button>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </nav>
      <div className={styles.railFooter}><button type="button"><Upload aria-hidden /> Import</button><button type="button"><Download aria-hidden /> Export</button></div>
    </aside>
  );
}

function StarterCard({ index, code, objective, question, answer, menuOpen, onMenu, onAction }: {
  index: number;
  code: string;
  objective: string;
  question: string;
  answer: string;
  menuOpen: boolean;
  onMenu: () => void;
  onAction: (message: string) => void;
}) {
  return (
    <article className={styles.starterCard}>
      <header>
        <span>{String(index).padStart(2, "0")}</span><code>{code}</code><strong>{objective}</strong>
        <div className={styles.menuAnchor}>
          <button type="button" aria-label={`Open actions for ${objective}`} aria-expanded={menuOpen} onClick={onMenu}><MoreHorizontal aria-hidden /></button>
          {menuOpen ? (
            <div className={`${styles.popover} ${styles.slotMenu}`} role="menu" aria-label={`${objective} actions`}>
              <button type="button" role="menuitem" onClick={() => onAction("Starter slot duplicated.")}><Copy aria-hidden /> Duplicate slot</button>
              <button type="button" role="menuitem" onClick={() => onAction("Starter images locked.")}><Archive aria-hidden /> Lock images</button>
              <button type="button" role="menuitem" onClick={() => onAction("Starter slot cleared.")}><Trash2 aria-hidden /> Clear slot</button>
            </div>
          ) : null}
        </div>
      </header>
      <div className={styles.imagePair}>
        <ImageBox label="Question" marker={`Q${index}`} content={question} onAction={onAction} />
        <ImageBox label="Answer" marker={`A${index}`} content={answer} answer onAction={onAction} />
      </div>
    </article>
  );
}

function ImageBox({ label, marker, content, answer = false, onAction }: { label: string; marker: string; content: string; answer?: boolean; onAction: (message: string) => void }) {
  return (
    <div className={styles.imageBox} data-answer={answer}>
      <div><span>{label}</span><em>{marker}</em></div>
      <strong>{content}</strong>
      <footer><span>Paste or drop</span><button type="button" onClick={() => onAction(`${label} drawing editor opened.`)}><Pencil aria-hidden /> Draw</button><button type="button" aria-label={`Add ${label.toLowerCase()} image`} onClick={() => onAction(`${label} image picker opened.`)}><ImagePlus aria-hidden /></button></footer>
    </div>
  );
}

function DeckRail({ activeSlide, collapsed, selectedSlides, menuOpen, onCollapse, onMenu, onSelect, onToggleSelection, onAction, onCloseMobile }: {
  activeSlide: number;
  collapsed: boolean;
  selectedSlides: number[];
  menuOpen: boolean;
  onCollapse: () => void;
  onMenu: () => void;
  onSelect: (slide: number) => void;
  onToggleSelection: (slide: number) => void;
  onAction: (message: string) => void;
  onCloseMobile: () => void;
}) {
  return (
    <aside className={styles.deckRail} aria-label="Deck preview">
      <header>
        <div><span className={styles.reviewNumber}>05</span><div><small>Deck preview</small><strong>{slides.length} slides</strong></div></div>
        <button type="button" aria-label="Close deck drawer" className={styles.mobileClose} onClick={onCloseMobile}><X aria-hidden /></button>
        <button type="button" aria-label={collapsed ? "Expand deck preview" : "Collapse deck preview"} className={styles.desktopCollapse} onClick={onCollapse}>{collapsed ? <ChevronLeft aria-hidden /> : <PanelRightClose aria-hidden />}</button>
      </header>
      <div className={styles.deckActions}>
        <button type="button" onClick={() => onAction("Blank slide added.")}><Plus aria-hidden /><span>Blank</span></button>
        <button type="button" onClick={() => onAction("Presenter preview opened — mock action only.")}><Play aria-hidden /><span>Present</span></button>
        <div className={styles.menuAnchor}>
          <button type="button" aria-expanded={menuOpen} onClick={onMenu}><MoreHorizontal aria-hidden /><span>More</span></button>
          {menuOpen ? (
            <div className={`${styles.popover} ${styles.deckMenu}`} role="menu" aria-label="Deck actions">
              <button type="button" role="menuitem" onClick={() => onAction("Handout options opened.")}><FileText aria-hidden /> Create handout</button>
              <button type="button" role="menuitem" onClick={() => onAction("Import picker opened.")}><Import aria-hidden /> Import lesson</button>
              <button type="button" role="menuitem" onClick={() => onAction("PDF export started.")}><FileDown aria-hidden /> Export PDF</button>
              <button type="button" role="menuitem" onClick={() => onAction("HTML presenter exported.")}><Download aria-hidden /> Download HTML</button>
            </div>
          ) : null}
        </div>
      </div>
      <div className={styles.selectionBar}><strong>{selectedSlides.length} selected</strong><button type="button" onClick={() => onAction("Handout selection opened.")}>Create handout</button></div>
      <div className={styles.thumbnailList}>
        {slides.map((title, index) => {
          const slide = index + 1;
          return (
            <article key={title} data-active={activeSlide === slide}>
              <span className={styles.dragHandle}><GripVertical aria-hidden /></span>
              <label><input type="checkbox" checked={selectedSlides.includes(slide)} onChange={() => onToggleSelection(slide)} /><span className="sr-only">Select slide {slide}</span></label>
              <button type="button" onClick={() => onSelect(slide)} aria-label={`Open slide ${slide}: ${title}`}>
                <span className={styles.slideArt} data-kind={index}>{index === 0 ? <><i /><i /><i /><i /></> : <><i /><i /></>}</span>
                <span><b>{String(slide).padStart(2, "0")}</b>{title}</span>
              </button>
            </article>
          );
        })}
      </div>
      <footer><button type="button" onClick={() => onAction(`Delete slide ${activeSlide} confirmation opened.`)}><Trash2 aria-hidden /><span>Delete slide {activeSlide}</span></button></footer>
    </aside>
  );
}

function ReviewMap({ onClose }: { onClose: () => void }) {
  return (
    <aside className={styles.reviewMap} aria-label="Review map">
      <header><div><span>Commenting guide</span><strong>Compact Console review map</strong></div><button type="button" aria-label="Close review map" onClick={onClose}><X aria-hidden /></button></header>
      <ol>
        <li><b>01</b><div><strong>App bar</strong><span>Identity, global actions and lesson access.</span></div></li>
        <li><b>02</b><div><strong>Lesson rail</strong><span>Metadata and expandable tool groups.</span></div></li>
        <li><b>03</b><div><strong>Workspace header</strong><span>Page identity and primary actions.</span></div></li>
        <li><b>04</b><div><strong>Authoring cards</strong><span>Density, hierarchy and image controls.</span></div></li>
        <li><b>05</b><div><strong>Deck rail</strong><span>Selection, ordering and export menu.</span></div></li>
        <li><b>06</b><div><strong>Mobile dock</strong><span>Lesson and Deck open as drawers.</span></div></li>
      </ol>
      <p>Refer to these numbers when commenting, for example: “04 — make image actions quieter.”</p>
    </aside>
  );
}

function NewLessonDialog({ onClose, onCreate }: { onClose: () => void; onCreate: () => void }) {
  return (
    <div className={styles.dialogBackdrop} role="presentation">
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="new-lesson-title">
        <header><div><span>New workspace</span><h2 id="new-lesson-title">Create a blank lesson</h2></div><button type="button" aria-label="Close new lesson dialog" onClick={onClose}><X aria-hidden /></button></header>
        <label><span>Lesson title</span><input autoFocus placeholder="e.g. Completing the square" /></label>
        <label><span>Class</span><select defaultValue=""><option value="" disabled>Select a class</option><option>Year 10</option><option>Year 11</option></select></label>
        <footer><button type="button" onClick={onClose}>Cancel</button><button type="button" className={styles.primaryButton} onClick={onCreate}>Create lesson</button></footer>
      </section>
    </div>
  );
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return <div className={styles.toast} role="status"><Check aria-hidden /><span>{message}</span><button type="button" aria-label="Dismiss notification" onClick={onClose}><X aria-hidden /></button></div>;
}

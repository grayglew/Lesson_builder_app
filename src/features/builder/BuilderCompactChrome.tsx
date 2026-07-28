"use client";

import {
  Archive,
  BrainCircuit,
  BookOpen,
  BookOpenCheck,
  ChevronDown,
  Cloud,
  FileText,
  Files,
  FolderOpen,
  Layers3,
  LayoutGrid,
  LayoutTemplate,
  ListChecks,
  LogOut,
  Monitor,
  MoreHorizontal,
  Moon,
  PanelRightClose,
  PanelRightOpen,
  PencilRuler,
  Play,
  Printer,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
  Sigma,
  Sparkles,
  SquareDashed,
  Sun,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { BuilderActionMenu } from "./BuilderActionMenu";
import styles from "./BuilderShell.module.css";

export type BuilderShellVariant = "classic" | "compact-console";
export type BuilderThemePreference = "system" | "light" | "dark";

export type BuilderToolName =
  | "starter"
  | "saved-lessons"
  | "retrieval"
  | "example"
  | "worksheet"
  | "pdf"
  | "cfu"
  | "draw"
  | "templates"
  | "shared-data"
  | "placeholder"
  | "math";

type CompactAppBarProps = {
  title: string;
  className: string;
  teachingDate: string;
  userEmail: string;
  cloudMessage: string;
  busy: boolean;
  identityControl?: ReactNode;
  themePreference: BuilderThemePreference;
  onLessons: () => void;
  onPresent: () => void;
  onSave: () => void;
  onThemeChange: (theme: BuilderThemePreference) => void;
};

export function CompactAppBar({
  busy,
  className,
  cloudMessage,
  identityControl,
  onThemeChange,
  onLessons,
  onPresent,
  onSave,
  teachingDate,
  themePreference,
  title,
  userEmail,
}: CompactAppBarProps) {
  return (
    <header className={styles.compactAppBar}>
      <div className={styles.compactBrand}>
        <span className={styles.compactBrandMark} aria-hidden>
          <svg viewBox="0 0 32 32">
            <path d="M6 6h15v4H10v12h11v4H6z" />
            <path d="M17 12h9v14h-9v-4h5v-6h-5z" />
            <path className={styles.compactBrandAccent} d="m19 6 7 7h-7z" />
          </svg>
        </span>
        <div>
          <strong>Lesson Builder</strong>
          <small>{className || "No class selected"}</small>
        </div>
      </div>
      <div className={styles.compactLessonIdentity}>
        <strong>{title.trim() || "Untitled lesson"}</strong>
        <span>{teachingDate || "No teaching date"}</span>
      </div>
      <span className={styles.compactCloudStatus} title={cloudMessage}>
        <Cloud aria-hidden /> {cloudMessage}
      </span>
      <button type="button" onClick={onLessons}>
        <FolderOpen aria-hidden /> Lessons
      </button>
      <button type="button" onClick={onPresent}>
        <Play aria-hidden /> Present
      </button>
      <button
        className={styles.compactSaveButton}
        type="button"
        disabled={busy}
        onClick={onSave}
      >
        <Save aria-hidden /> {busy ? "Saving…" : "Save"}
      </button>
      <BuilderActionMenu
        label="Account and utilities"
        triggerContent={<><MoreHorizontal aria-hidden /><span className={styles.srOnly}>Account and utilities</span></>}
      >
        <span className={styles.compactMenuLabel}>Appearance</span>
        {([
          ["system", "System theme", Monitor],
          ["light", "Light theme", Sun],
          ["dark", "Dark theme", Moon],
        ] as const).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            role="menuitemradio"
            aria-checked={themePreference === value}
            onClick={() => onThemeChange(value)}
          >
            <Icon aria-hidden /> {label}
          </button>
        ))}
        <span className={styles.compactMenuDivider} />
        <a role="menuitem" href="/admin/users"><Settings aria-hidden /> Admin dashboard</a>
        <a role="menuitem" href="/auth/logout"><LogOut aria-hidden /> Log out</a>
        {identityControl ? <div className={styles.compactIdentityControl}>{identityControl}</div> : null}
        <span className={styles.compactAccountEmail}>{userEmail}</span>
      </BuilderActionMenu>
    </header>
  );
}

type CompactToolNavigationProps = {
  activeTool: BuilderToolName;
  onSelect: (tool: BuilderToolName) => void;
};

const groups: Array<{
  label: string;
  tools: Array<{ name: BuilderToolName; label: string; icon: typeof BookOpen }>;
}> = [
  { label: "Library", tools: [{ name: "saved-lessons", label: "Saved lessons", icon: Archive }, { name: "templates", label: "Templates", icon: LayoutTemplate }, { name: "shared-data", label: "Shared data", icon: Layers3 }] },
  { label: "Core slides", tools: [{ name: "starter", label: "Starter", icon: LayoutGrid }, { name: "retrieval", label: "Retrieval", icon: RefreshCw }, { name: "example", label: "Example", icon: BookOpenCheck }, { name: "cfu", label: "CFU", icon: ListChecks }] },
  { label: "Resources", tools: [{ name: "worksheet", label: "Worksheet", icon: Files }, { name: "pdf", label: "PDF", icon: FileText }] },
  { label: "Create", tools: [{ name: "draw", label: "Draw", icon: PencilRuler }, { name: "placeholder", label: "Placeholder", icon: SquareDashed }, { name: "math", label: "LaTeX", icon: Sigma }] },
];

export function CompactToolNavigation({
  activeTool,
  onSelect,
}: CompactToolNavigationProps) {
  const [openGroups, setOpenGroups] = useState(
    () => new Set([...groups.map((group) => group.label), "AI tools"]),
  );

  return (
    <nav className={styles.compactToolNavigation} aria-label="Slide tools">
      <div className={styles.compactRailHeading}>
        <span><BookOpen aria-hidden /> Lesson tools</span>
      </div>
      {groups.map((group) => (
        <details
          key={group.label}
          open={openGroups.has(group.label)}
          onToggle={(event) => {
            const nextOpen = event.currentTarget.open;
            setOpenGroups((current) => {
              if (current.has(group.label) === nextOpen) return current;
              const next = new Set(current);
              if (nextOpen) next.add(group.label);
              else next.delete(group.label);
              return next;
            });
          }}
        >
          <summary>{group.label}<ChevronDown aria-hidden /></summary>
          <div>
            {group.tools.map((tool) => (
              <button
                key={tool.name}
                type="button"
                aria-current={activeTool === tool.name ? "page" : undefined}
                data-active={activeTool === tool.name}
                onClick={() => onSelect(tool.name)}
              >
                <tool.icon aria-hidden />
                <span>{tool.label}</span>
              </button>
            ))}
          </div>
        </details>
      ))}
      <details
        open={openGroups.has("AI tools")}
        onToggle={(event) => {
          const nextOpen = event.currentTarget.open;
          setOpenGroups((current) => {
            if (current.has("AI tools") === nextOpen) return current;
            const next = new Set(current);
            if (nextOpen) next.add("AI tools");
            else next.delete("AI tools");
            return next;
          });
        }}
      >
        <summary>AI tools<ChevronDown aria-hidden /></summary>
        <div>
          <a
            href="https://gemini.google.com/gem/1cnUR7VWLpXMmPLX4B7pSBuArHuYzrjwO?usp=sharing"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Sparkles aria-hidden />
            <span>Gemini Expand</span>
          </a>
          <a
            href="https://gemini.google.com/gem/1J_SwoYOWHaLhibISlDthTgX74F9bGzQy?usp=sharing"
            target="_blank"
            rel="noopener noreferrer"
          >
            <BrainCircuit aria-hidden />
            <span>Gemini Atom</span>
          </a>
        </div>
      </details>
    </nav>
  );
}

type CompactDeckHeaderProps = {
  collapsed: boolean;
  selectedCount: number;
  slideCount: number;
  transferActions: ReactNode;
  onCollapse: () => void;
  onHandout: () => void;
  onReset: () => void;
};

export function CompactDeckHeader({
  collapsed,
  onCollapse,
  onHandout,
  onReset,
  selectedCount,
  slideCount,
  transferActions,
}: CompactDeckHeaderProps) {
  return (
    <>
      <div className={styles.compactDeckHeading}>
        <div>
          <Layers3 aria-hidden />
          <span>
            <small>Deck preview</small>
            <strong>{slideCount} slide{slideCount === 1 ? "" : "s"}</strong>
          </span>
        </div>
        <button
          type="button"
          aria-controls="v2-slide-list"
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand lesson preview" : "Collapse lesson preview"}
          onClick={onCollapse}
        >
          {collapsed ? <PanelRightOpen aria-hidden /> : <PanelRightClose aria-hidden />}
        </button>
      </div>
      <div className={styles.compactDeckActions} role="toolbar" aria-label="Deck preview actions">
        <button
          type="button"
          aria-label={`Open handout from ${selectedCount} selected slide${selectedCount === 1 ? "" : "s"}`}
          title={`Open handout (${selectedCount} selected)`}
          onClick={onHandout}
        >
          <Printer aria-hidden /> <span>Handout</span>
        </button>
        {transferActions}
        <button className={styles.compactResetButton} type="button" aria-label="Reset lesson" title="Reset lesson" onClick={onReset}>
          <RotateCcw aria-hidden />
        </button>
      </div>
    </>
  );
}

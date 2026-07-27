"use client";

import {
  BookOpen,
  ChevronDown,
  Cloud,
  FolderOpen,
  LogOut,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Save,
  Settings,
} from "lucide-react";
import { useState } from "react";
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
  | "placeholder"
  | "math";

type CompactAppBarProps = {
  title: string;
  className: string;
  teachingDate: string;
  userEmail: string;
  cloudMessage: string;
  busy: boolean;
  onLessons: () => void;
  onPresent: () => void;
  onSave: () => void;
};

export function CompactAppBar({
  busy,
  className,
  cloudMessage,
  onLessons,
  onPresent,
  onSave,
  teachingDate,
  title,
  userEmail,
}: CompactAppBarProps) {
  return (
    <header className={styles.compactAppBar}>
      <div className={styles.compactBrand}>
        <span>LB</span>
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
        <a role="menuitem" href="/admin/users"><Settings aria-hidden /> Admin dashboard</a>
        <a role="menuitem" href="https://gemini.google.com/gem/1cnUR7VWLpXMmPLX4B7pSBuArHuYzrjwO?usp=sharing" target="_blank" rel="noopener noreferrer">Gemini-Expand</a>
        <a role="menuitem" href="https://gemini.google.com/gem/1J_SwoYOWHaLhibISlDthTgX74F9bGzQy?usp=sharing" target="_blank" rel="noopener noreferrer">Gemini-Atom</a>
        <a role="menuitem" href="/auth/logout"><LogOut aria-hidden /> Log out</a>
        <span className={styles.compactAccountEmail}>{userEmail}</span>
      </BuilderActionMenu>
    </header>
  );
}

type WorkspaceHeaderProps = {
  label: string;
  busy: boolean;
  onPresent: () => void;
  onSave: () => void;
};

export function CompactWorkspaceHeader({
  busy,
  label,
  onPresent,
  onSave,
}: WorkspaceHeaderProps) {
  return (
    <header className={styles.compactWorkspaceHeader}>
      <div>
        <span>Build / {label}</span>
        <h2>{label}</h2>
      </div>
      <div>
        <button type="button" onClick={onPresent}><Play aria-hidden /> Present</button>
        <button type="button" className={styles.compactSaveButton} disabled={busy} onClick={onSave}><Save aria-hidden /> Save</button>
      </div>
    </header>
  );
}

type CompactToolNavigationProps = {
  activeTool: BuilderToolName;
  collapsed: boolean;
  onCollapse: () => void;
  onSelect: (tool: BuilderToolName) => void;
};

const groups: Array<{
  label: string;
  tools: Array<{ name: BuilderToolName; label: string }>;
}> = [
  { label: "Library", tools: [{ name: "saved-lessons", label: "Saved lessons" }, { name: "templates", label: "Templates" }] },
  { label: "Core slides", tools: [{ name: "starter", label: "Starter" }, { name: "retrieval", label: "Retrieval" }, { name: "example", label: "Example" }, { name: "cfu", label: "CFU" }] },
  { label: "Resources", tools: [{ name: "worksheet", label: "Worksheet" }, { name: "pdf", label: "PDF" }] },
  { label: "Create", tools: [{ name: "draw", label: "Draw" }, { name: "placeholder", label: "Placeholder" }, { name: "math", label: "LaTeX" }] },
];

export function CompactToolNavigation({
  activeTool,
  collapsed,
  onCollapse,
  onSelect,
}: CompactToolNavigationProps) {
  const [openGroups, setOpenGroups] = useState(
    () => new Set(groups.map((group) => group.label)),
  );

  return (
    <nav className={styles.compactToolNavigation} aria-label="Slide tools">
      <div className={styles.compactRailHeading}>
        <span><BookOpen aria-hidden /> Lesson tools</span>
        <button
          type="button"
          aria-label={collapsed ? "Expand lesson tools" : "Collapse lesson tools"}
          onClick={onCollapse}
        >
          {collapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
        </button>
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
                {tool.label}
              </button>
            ))}
          </div>
        </details>
      ))}
    </nav>
  );
}

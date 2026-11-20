import type { BuilderDocument } from "../builder/schema";
import type { StandaloneLessonOptions } from "../builder/lesson-export";
import type { PresenterStroke } from "./types";

export type PresenterResume = {
  slideId: string;
  slideIndex: number;
  presentedAt: string;
  presentedLessonId: string;
  presentedLessonSavedAt?: string;
  presentedLessonTitle: string;
  confidencePoll?: { counts: Record<string, number>; completedAt: string; locked: boolean; saved?: boolean };
  pollIndex?: number;
  pollAnnotations?: PresenterStroke[];
};

export type PresenterCheckpoint = PresenterResume & { document: BuilderDocument };
export type PresenterSessionSource = { document: BuilderDocument; options: StandaloneLessonOptions };
export type PresenterSessionRecord = {
  version: 1;
  owner: string;
  id: string;
  source: PresenterSessionSource;
  checkpoint?: PresenterCheckpoint;
  revision: number;
  updatedAt: number;
};

export type RecoverablePresenterWindow = Window & {
  __lessonPresenterRecovery?: { capture: () => PresenterCheckpoint };
};

export function isPresenterSessionId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

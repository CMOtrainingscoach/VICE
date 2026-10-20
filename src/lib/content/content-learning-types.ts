export type ContentKind = "blog" | "social";

export type ContentLearningTrigger = "save" | "publish";

export type BlogTextSnapshot = {
  title: string;
  bodyPlain: string;
};

export type SocialTextSnapshot = {
  caption: string;
  hashtags: string;
};

export type ContentLearningEvent = {
  id: string;
  contentKind: ContentKind;
  conceptId: string;
  triggerKind: ContentLearningTrigger;
  learningText: string;
  learningTags: string[];
  diffSummary: string;
  status: "active" | "dismissed";
  createdAt: string;
};

export const CONTENT_LEARNING_MIGRATION =
  "Pas migratie 20260330135900_content_learnings.sql toe in de Supabase SQL-editor.";

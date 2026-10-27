import type { SbExecutionContext } from "@/lib/salesbrain/engine/context";

export type FormSubmissionArtifact = {
  formId: string;
  responseCount: number;
  retrievedAt: string;
  note: string;
};

/** Google Forms read API requires additional OAuth scopes — not enabled in MVP tenant connect. */
export async function runGoogleFormsNode(_ctx: SbExecutionContext): Promise<FormSubmissionArtifact[]> {
  return [
    {
      formId: "",
      responseCount: 0,
      retrievedAt: new Date().toISOString(),
      note: "Google Forms: extra scopes en Forms API-koppeling vereist. Geen data opgehaald.",
    },
  ];
}

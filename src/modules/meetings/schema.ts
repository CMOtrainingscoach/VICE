import { z } from "zod";

export const updateMeetingRecordingSchema = z.object({
  title: z.string().max(200, "Titel max. 200 tekens"),
  subject: z.string().max(500, "Onderwerp max. 500 tekens"),
  notes: z.string().max(10_000, "Notities max. 10.000 tekens").optional(),
  fullText: z.string().max(500_000, "Transcript te lang").optional(),
});

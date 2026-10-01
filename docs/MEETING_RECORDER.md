# Meeting recorder + transcriptie + analyse

Zie **[MEETING_TRANSCRIPTION_ARCHITECTURE.md](./MEETING_TRANSCRIPTION_ARCHITECTURE.md)** voor de volledige pipeline (audio → STT → tokens → analyse).

## Migraties

```powershell
pnpm dlx supabase@latest db push
```

Bestanden o.a.:

- `20260330130000_meeting_recordings.sql`
- `20260330130100_meeting_transcripts.sql`
- `20260330130200_meeting_recording_metadata.sql`
- `20260330130300_meeting_review_analysis.sql` (notes, review/analyse-status, RPCs)

## Env (.env.local)

```env
OPENAI_API_KEY=sk-...
VICE_DELETE_AUDIO_AFTER_TRANSCRIBE=true
# VICE_ANALYSIS_MODEL=gpt-4o-mini
```

## Gebruik

1. Klant → **Meetings** → **Nieuwe opname** (`/klanten/{id}/meetings/nieuw`)
2. Stop opname → Whisper + token-opslag → automatisch door naar **review** (`/meetings/{recordingId}`)
3. Transcript bewerken → **Goedkeuren voor analyse**
4. **Genereer samenvatting & actiepunten** (OpenAI JSON; demo/synthetisch tot EU-residency duidelijk is)

Legacy URLs `/klanten/{id}/opnemen` redirecten naar de meetings-routes.

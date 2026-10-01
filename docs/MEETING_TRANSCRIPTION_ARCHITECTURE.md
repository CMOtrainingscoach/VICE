# Meeting pipeline: lightweight audio → tokens → analyse

Dit document koppelt de “token-based recorder”-architectuur aan VICE in fasen.

## Doel

- **Analyseerbaar**: transcript + token-IDs in Postgres (LLM/SWOT later).
- **Lightweight**: korte Opus-opname alleen als **tussenstap**; na STT standaard **audio verwijderen**.
- **Privacy**: geen langdurige opslag van ruwe meeting-audio in de cloud (configurable).

## Huidige implementatie (MVP)

```text
[Mic/Tab] → [Opus WebM ~32 kbps] → [Upload] → [OpenAI Whisper] → [gpt-tokenizer] → [DB: text + token_ids + segments]
                                      ↓
                              [Audio delete optional]
```

| Stap | VICE keuze |
|------|------------|
| Opname | Browser `MediaRecorder`, mono, 32 kbps |
| STT | Server-side `whisper-1` (`OPENAI_API_KEY`) — demo/synthetisch |
| Tokenisatie | `gpt-tokenizer` (gpt-4o / cl100k-achtig) → `token_ids[]` |
| Opslag | `app.meeting_recordings`: `full_text`, `token_ids`, `segments`, `token_count` |
| Audio | `VICE_DELETE_AUDIO_AFTER_TRANSCRIBE=true` (default) → bucket object verwijderd |

**Migraties:** `20260330130000_meeting_recordings.sql` + `20260330130100_meeting_transcripts.sql`

## Roadmap (jouw research → VICE)

### Fase A — Edge VAD (nog niet gebouwd)

- **Silero VAD** of **WebRTC VAD** in de browser.
- Stilte → chunk weggooien → minder STT-kosten en sneller.

### Fase B — Edge STT (nog niet gebouwd)

- **Transformers.js** + Whisper Tiny/Base (WASM) of **whisper.cpp** op edge device.
- Audio verlaat het device niet; alleen tekst/tokens naar Supabase.

### Fase C — Analyse (fase 3 plan)

- LLM leest `full_text` of `token_ids` (decode) — SWOT, frameworks, citaties.
- Chunking + max tokens per job i.p.v. hele meeting in één prompt.

## EU / productie

- Whisper via OpenAI API: **alleen demo/synthetische data** tot EU residency / ZDR is afgehandeld.
- Productie: edge STT of EU-hosted STT; zelfde token-opslagmodel.

## Env

```env
OPENAI_API_KEY=sk-...
VICE_STT_MODEL=whisper-1
VICE_DELETE_AUDIO_AFTER_TRANSCRIBE=true
```

# Strategische audit · PESTEL (stap 1/13)

## Bouwvolgorde (zoals afgesproken)

| Sprint | Inhoud | Status |
|--------|--------|--------|
| **1** | Handmatige PESTEL: afbakening, 6 kaarten, zijpaneel inzichten, bronnen (meeting/website), synthese | **Klaar** |
| **2** | AI-marktonderzoek: job per versie, 6 stappen (perspectief), verplichte feit- + duidingsbron, concept `origin: ai` | **Klaar** |
| **3** | Review, goedkeuring, versiebeheer, Porter-overdracht | Gepland |
| **4** | Klantpublicatie + dashboard | Gepland |

## Migratie

```powershell
pnpm dlx supabase@latest db push
```

Bestanden: t/m `20260330130800_pestel_services_offerings.sql` (305 PESTEL, 306 jobs, 307 bronnen, 308 diensten)

## Route

`/klanten/{tenantId}/strategie/pestel` — hervat automatisch de laatste niet-goedgekeurde versie.

## Bronnen voor AI-onderzoek

Op het PESTEL-scherm onder **Bronnen voor AI-onderzoek**: koppel interne context — meetings (transcript klaar), documenten (titel + inhoud/link), start-URLs en notities. Opslaan via **Afbakening opslaan**. Gekoppelde bronnen bepalen welke **interne** citaten (meeting/document) geldig zijn; de AI voert **altijd** extern marktonderzoek uit en moet per inzicht minstens één **https-website** als feitbron tonen. Zonder opgeslagen lijst: alle meeting-transcripts (voorkeur goedgekeurd) plus extern onderzoek.

## AI-consulteerbaar geheugen

- Gestructureerde tabellen: `pestel_versions`, `pestel_version_research_inputs`, `pestel_insights`, `pestel_insight_sources`
- Helper: `buildPestelAiContextSnapshot()` in `src/lib/pestel/ai-context.ts` voor prompts/RAG
- Alleen data van de actieve klant (RLS via `has_capability(..., 'audit.edit')` in RPCs)

## OpenAI-modellen (kosten vs. kwaliteit)

| Taak | Env | Default | Opmerking |
|------|-----|---------|-----------|
| PESTEL-onderzoek | `VICE_PESTEL_RESEARCH_MODEL` | `gpt-4o` | 6 calls per volledige run |
| Meeting-analyse | `VICE_ANALYSIS_MODEL` | `gpt-4o-mini` | 1 call na goedkeuring |
| Whisper | `VICE_STT_MODEL` | `whisper-1` | per opname |

Gebruik op je account een **sterker chatmodel** voor PESTEL (bv. `gpt-4o` of `gpt-4.1` als die bij jou in “Models in use” staat). Blijf **mini** voor meeting-samenvattingen. Optioneel: `VICE_PESTEL_RESEARCH_MAX_TOKENS=4096` beperkt output per perspectief.

## Bewijs voor Hardwig (AI)

Elk AI-inzicht wordt **alleen opgeslagen** als het minstens één **feitbron** (meeting-citaat of website) en één **duidingsbron** (`is_ai_interpretation`) heeft. In het zijpaneel zijn bronnen raadpleegbaar (meeting-link, URL, fragment).

## Acceptatie sprint 1–2

Handmatig of via **Onderzoek de markt met AI**: afbakening, matrix, inzichten met bronnen, synthese. AI draait stapsgewijs (6 perspectieven); **per perspectief eerst live webonderzoek** (Tavily/Serper/OpenAI web search), daarna JSON-inzichten waar website-URLs **alleen** uit die opgehaalde resultaten mogen komen (excerpt moet in het fragment staan). Annuleren mogelijk; geen dubbele actieve job per versie.

### Env live web

| Variabele | Doel |
|-----------|------|
| `TAVILY_API_KEY` | **Aanbevolen** — 2 queries × 6 perspectieven per run |
| `SERPER_API_KEY` | Fallback als geen Tavily |
| `OPENAI_API_KEY` | Fallback web_search via Responses API |
| `VICE_PESTEL_WEB_SEARCH_COUNTRY` | Default `BE` |

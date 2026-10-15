# Fixed onboarding prompts

Each language folder uses seven prompt names: `welcome`, `name`, `category`,
`business`, `confirm`, `again`, `ready`. MP3 and WAV are supported.

The supplied recordings are now organized as `yo/*.mp3`, `ha/*.mp3`, and `ig/*.mp3`:
seven per language, 21 total. English recordings have not been supplied.
The eight additional prompts per language are deferred; core onboarding does not
depend on them. Scripts are centralized in `packages/shared/voice.ts`.

`apps/web/src/onboarding-recordings.json` maps prompt IDs to actual files. Missing
recordings show a localized notice without requesting nonexistent files or using
another language. The initial tap plays a welcome only when the current language
has one; language cards offer native welcome previews. Choosing a language starts
its name question. Retry plays `again`; confirmation still requires the user's tap.

To add English or replacement recordings, place files in these folders with the
canonical names, then refresh the manifest:

```powershell
node infra/import_onboarding_audio.mjs
```

The same command organizes root files such as `welcome_english.mp3`,
`Welcome_Igbo.mp3`, or `welcome.wav` (English). It preserves the original encoding,
refuses to overwrite existing recordings, and prefers MP3 when both formats exist.
Restart Vite if added files are not picked up. No API key is needed for playback.

Validation commands from the repository root:

```powershell
$env:PLAYWRIGHT_CHANNEL='msedge'
node node_modules/@playwright/test/cli.js test tests/e2e/onboarding-audio.spec.ts
npm.cmd run build -w apps/web
```

The browser test plays every supplied file to completion using real browser audio
decoding (muted, accelerated), and checks Yoruba/Hausa/Igbo preview and question
routing. Authentication is mocked in the routing checks; this does not establish
live Supabase signup, microphone/ASR correctness, or native-speaker script accuracy.

Verified locally on 2026-10-15: all 21 files fully decoded with FFmpeg (16 kHz MP3,
3.132–9.360 seconds), and all played to completion in Edge. All three language
preview/question checks passed. Existing English/Yoruba onboarding and mobile
regressions passed when run serially; the first parallel run had a dashboard-loading
assertion timeout in the English test. The frontend production build and scoped
ESLint checks passed. Decoder measurements are in `artifacts/onboarding-audio-decode.json`.

Use reviewed native-speaker recordings, or configure YarnGPT and run
`npm.cmd run build -w packages/shared` then `node infra/build_onboarding_audio.mjs`
to synthesize these fixed files ahead of time, then refresh the manifest using the
import command above. This consumes provider credits; it is unnecessary for the
human recordings already supplied.
Review pronunciation and translations with native speakers before release.
Runtime onboarding only plays static files; it never dynamically synthesizes prompts.

# Worked example: filling in the repo-specific layer

This is a real, filled-in example of the "repo-specific layer" that `SKILL.md`'s final section
asks you to (re)build for whatever repo you're actually working in. It documents the internal
"Marc Fisher Intelligence" (MFI) platform the orchestrated-dev-cycle methodology was originally
distilled from: a Node.js/Express + PostgreSQL(Prisma) + Azure app with two review bots and a
prompt-grader CI check.

**Do not apply any of the specifics below to a different repository.** Model names, file paths,
check names, and "hard rules" here are true of exactly one codebase and will be wrong -- often
silently wrong -- anywhere else. Read this to understand the SHAPE of a good repo-specific
appendix (how detailed, how skeptical of the aspirational process doc, how concrete about failure
modes), then produce the equivalent for your actual repo from its actual `.github/workflows/`,
actual hard rules, and actual footguns.

---

## A. The platform

- **Stack:** Node.js + Express, PostgreSQL via Prisma, Azure Blob Storage, Microsoft Entra ID SSO.
- **Frontend:** vanilla JS, NO build step -- `<script>` tags with cache-bust query strings, served
  static. The ONLY exceptions are two Vite/TypeScript "studio islands" whose built bundles are
  COMMITTED into the static dir; editing island source without rebuilding + committing the bundle
  ships nothing.
- **LLM providers:** OpenAI, Google (Gemini/Imagen/Veo), Anthropic, and xAI/Grok. No fifth without
  a signed-off spec.
- **Deploy:** push to the `dev` branch auto-deploys to the dev app; push to `main` auto-deploys
  prod. ALL work goes through `dev` first, verify on the dev app, then promote `dev` -> `main`.
  Base branch for every feature is `dev`, not `main`.

## B. CI reality vs the aspirational process doc (verify every session)

The governance doc for this platform lists a large target check set (unit-tests, eval-smoke,
prompt-grader-preflight, claude-review, etc.). **Most of these do NOT exist as real workflows.**
Do not poll for gates that never run. Ground-truth per session; historically the reality was:

- `.github/workflows/` holds only three files: a prompt-grader workflow and two deploy workflows.
- **The only PR-gating Actions check is `grade`** (the prompt grader). It fires ONLY on PRs
  touching specific `.md` globs, and only grades `.md` files carrying a `prompt-grader: true`
  opt-in marker in their first five lines. Threshold: overall >= 75; any single rubric category
  <= 2 blocks. A CSS/JS/HTML-only PR legitimately shows "no checks" -- that is normal, not a
  misconfiguration.
- **The two review bots run as GitHub Apps posting PR REVIEWS, NOT as Actions status checks.**
  Treat them as review gates (wait for completion; Critical/High blocking), not as check rows.
- **They are comment-triggered and require the PR to be ready-for-review (not draft).** A draft PR
  will not auto-fire them. Two easy-to-miss steps: take the PR out of draft, then post trigger
  comments.
- **Trigger phrasing is a live footgun.** A comment that MIXES the two triggers with other prose
  fires one bot but does NOT reliably fire the other -- no check-run is even created for the head.
  One bot parses prose fine; the other needs its `@<bot> review` mention STANDALONE in its own
  comment. Post the fix summary + one trigger in a comment, then a separate bare trigger comment
  for the other. Symptom of getting it wrong: the classifier shows one bot reviewed the new head
  and the other shows 0 with no check-run -- that is a trigger miss, not a slow bot, and
  re-posting the standalone trigger is legitimate (that bot never saw the head), not a banned
  paid confirm round.
- **Neither `dev` nor `main` has branch protection; no CODEOWNERS.** The "required approvals /
  checks" are honored by convention only. The real control is the human's explicit merge OK -- do
  not assume protection will stop a bad merge.
- A poll/checks command returning exit 0 is NOT authoritative here: a review check-run can
  conclude `neutral` and still count as a pass to the exit code. Wait on the review-app VERDICT on
  the current HEAD oid, via a classifier that reads the check-RUNS API (true conclusions),
  confirms BOTH apps verdicted the current head, and filters findings by timestamp (see the
  false-RED re-anchoring trap in `SKILL.md` Stage 3).

## C. Repo hard rules that fail SILENTLY (bake into every coder/reviewer brief)

These break in production or fail without an error on this platform, so they had to be enforced
by the gates:

1. **No inline event handler attributes** (`onclick=`, `onchange=`, etc.) -- the CSP
   `script-src-attr 'none'` blocks them silently; the click just never fires. Use
   `addEventListener` + event delegation + `data-*` attributes.
2. **No direct Azure blob URLs** in client or server code -- uploads return
   `/api/blob?path=...` proxy URLs; direct URLs break private storage and bypass auth.
3. **No API keys in client code** -- all LLM keys are server-side env; client calls
   `/api/{provider}/...` and the server proxy attaches the key.
4. **No bypassing the auth middleware chain** -- protected routes need `requireAuth`; admin routes
   also `requireAdmin`; visual-agent routes also the agent-access check; anything user-facing that
   calls an LLM gets the rate limiter. A new route file with no auth middleware is a red flag. (A
   live P1: a new paid route checked only `requireAuth` while sibling routes enforced per-agent
   access -- caught by a bot, not the local gate.)
5. **No new build step on the vanilla frontend** (beyond the two committed studio-island
   bundles).
6. **No hardcoded model IDs** -- all IDs live in a model-registry JSON and resolve through a
   router; client reads a `window` global populated at startup.
7. **No hardcoded values that should be variables** -- year, brand name, model display names,
   studio background hex, etc. live in a variables file and resolve through a substitution engine
   (bare `{{X}}` substitutes; backtick-wrapped `` `{{X}}` `` is preserved as docs).
8. **No Unicode smart quotes, em/en dashes, ellipses, arrows, or box-drawing characters** anywhere
   in source -- they break parsers and silently corrupt LLM responses. ASCII only.
9. **No CRLF line endings.**
10. **No `temperature` on OpenAI calls routed through the model router** -- the flagship + auto-
    discovered mini models reject any non-default temperature with HTTP 400. Omit it; use `seed`
    for determinism. Google/xAI still accept temperature; one Anthropic model also deprecated it.

## D. The free deterministic gauntlet (what SKILL.md Stage 2(a) looks like filled in)

Every past bot finding on this platform is encoded as a free, executable check that BLOCKS before
any LLM sees the diff -- turning LLM-judgment classes into math. The check family includes: empty-
block detection, in-file prompt contradiction, a regex corpus that is EXECUTED against real inputs
(not merely read), stale-global reads, asymmetric guards, ASCII-only on ADDED lines (not
whole-file -- whole-file false-positives on pre-existing violations in untouched code), and
cache-bust verification.

The **cache-bust check** is the canonical example of a silent-failure class converted to math: a
changed client `.js`/`.css` whose `?v=YYYYMMDD<letter>` bust was not bumped serves stale assets to
users. It is checked both vs the base branch AND vs the pre-push head (the latter catches a
same-letter reused across two different file versions). "Trivial, skip the gate" is a BANNED
rationalization -- every careless escape came through that shortcut.

An **integration-seam audit** is mandatory for any new-agent / subsystem-wiring PR, because a
local gate reviewing the diff in isolation against mocked tests once PASSED four integration-seam
bugs the paid bots then caught (missing shim method = runtime crash, bare-boolean truncation,
dropped typed prompt, cache collision). Grep every seam against the REAL base files -- client<->
service shim methods, registry fields the shell reads, the adapter contract, the
expander->persist->worker path, cache lifecycle, and the consumer of every emitted value.
Tests-green is NOT integration-safe.

## E. Provider / dispatcher traps (the "trace the dispatcher" rule, concretely)

- **A prompt-builder and its dispatcher can target DIFFERENT backends.** On a 360-spin fix, a
  config prompt was "aligned" to the xAI recipe while its runner still dispatched via Google Veo.
  Veo's 8s default x 60deg/s = 480deg over-rotation (the exact defect being fixed), plus a
  non-Veo-native aspect ratio and a cross-engine mismatch -- three regressions both bots flagged.
  The local gate approved it because no reviewer opened the runner to learn which engine consumes
  the entry. Before changing any prompt/config/model-param, trace to the actual dispatch call
  site: which provider/model, its default params the diff did not set, and arithmetic consistency
  with those defaults.
- **xAI/Grok specifics:** Grok search runs via the Responses API (web_search + x_search tools; the
  model decides per-query when to search; citations render in a Sources footer). The older
  chat-completions search path is deprecated (HTTP 410). Autopilot turns set `store:false`. The
  Grok Imagine video API has NO loop/angle/frame parameter, so "exactly 360, seamless, start==end"
  is NOT prompt-achievable (~15-30deg seam mismatch run-to-run) -- a platform-impossibility to
  surface as a decision gate (server-side ffmpeg loop-trim to guarantee it and add a dep, vs
  prompt-tuning as honest best-effort), never something to silently ship as "defect eliminated."

## F. Config-served-from-saved-state silent no-op

Visual agents load their prompt config preferring a server-saved override over the bundled
`-config.md` as long as the saved copy passes a staleness check -- and that check only verifies
required SECTIONS and VARIABLES are PRESENT, it does NOT compare values. So editing a value in the
bundled config is a SILENT NO-OP wherever a saved override exists. Fix pattern: add a new
`CONFIG_VERSION` variable to the bundled config and to the agent's required-variables list; an old
override lacks it -> flagged stale -> archived and deleted -> the bundled file takes over. Bump it
whenever the recipe changes; keep it OUT of every consumed prompt section (it is metadata and must
never be substituted into a prompt).

## G. Post-merge live smoke test (the class unit tests miss)

The dev app is SSO-auth-gated, so curl/extract cannot read `/` or static assets (they 302 to
login). There is a hidden local-admin login for smoke testing. Headless-browser cookie expiry is
the dominant footgun -- re-auth is needed every few actions and is a TEST-HARNESS limitation, not
an app bug. The reliable end-to-end test is SERVER-SIDE, bypassing the flaky browser: scrape the
real product image URLs out of the authed page's DOM, replicate the EXACT production request
server-side (same model/duration/aspect/resolution + the production prompt shape), poll, download
the artifact, and verify perceptually (dimensions via ffprobe + a vision check on a frame contact
sheet). Browser-render regressions are precisely the class unit tests never catch and only the
live smoke test does -- which is why deploy timing (merge -> dev auto-deploy ~5-7 min -> smoke) is
surfaced BEFORE the merge.

## H. Environment / tooling footguns specific to this setup

- **macOS default bash is 3.2 -- NO associative arrays.** A fan-out dispatch script using
  `declare -A` dies instantly launching nothing while still exiting 0. Use space-separated string
  lists + a case lookup, and always verify the dispatch actually happened (grep the process
  count), never trust exit 0.
- **Do not `export HOME=` for a scoped git/gh call** -- it persists for the shell session and
  silently breaks later `~` expansion and relative reads. Prefix `HOME=...` on the single
  invocation; use absolute paths everywhere that might run under a polluted HOME.
- **Appended fix commits are fast-forwards -> use plain `git push`, not `--force-with-lease`.**
  The force flag is only for rewritten history; on a plain append it needlessly trips the
  destructive-command consent guard and stalls the loop.
- **Secret-redaction can corrupt an inline command echo** containing a token literal, hanging the
  shell at a quote prompt. Write secret-handling logic to a real script file and execute that; use
  the gh credential helper so git never sees a raw token; never have anyone paste a token into
  chat.
- **Manually-created PRs default their base to `main`** -> phantom conflicts, no CI, and bots
  review the wrong diff. Repair by PATCHing the base to `dev` via REST, then close/reopen to
  re-fire hooks. Wrong-base findings postdate HEAD so timestamp filters never age them out --
  verify against the PR file list.

---

The details above are the mutable layer for one platform. When the same orchestration discipline
is pointed at a different codebase, discard this file's specifics and rebuild the equivalent
sections from that repo's own ground truth -- `SKILL.md`'s methodology carries over unchanged.

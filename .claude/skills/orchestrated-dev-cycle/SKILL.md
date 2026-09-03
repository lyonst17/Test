---
name: orchestrated-dev-cycle
description: Runs a rigorous spec -> code -> review -> CI -> merge development cycle as an orchestrating agent that dispatches a coder subagent and independent adversarial reviewer subagents, verifies every claim against ground truth instead of trusting self-reports, and stops only for genuine human-only decisions (secrets, locked-decision reversals, the final merge). Use this skill ONLY when the user explicitly asks to run this methodology -- phrases like "orchestrated dev cycle," "spec-to-merge process," "triple-reviewer workflow," "run the orchestration skill," or an explicit request to drive a non-trivial software change from intent through a merged, verified PR using this process. Do NOT use it for routine small edits, quick fixes, or any task where the user hasn't asked for this specific methodology -- for those, just do the work directly.
---

# Orchestrated Spec -> Code -> Review -> CI -> Merge Dev Cycle

A methodology for driving a software change from intent to a merged, verified PR using one
**orchestrator** (you, in the main conversation) that directs a **coder** subagent and
**independent adversarial reviewer** subagents. The point of the whole apparatus is to move
discovery of problems as early and as cheaply as possible -- a spec mistake caught by a local
reviewer costs a re-read; the same mistake caught by a paid on-PR bot six pushes later costs a
day. Everything below exists to buy that shift.

Read `references/example-worked-platform.md` when you want to see what a fully filled-in,
repo-specific version of Stage 2/3 mechanics looks like (deterministic gauntlet, hard repo
rules, CI reality-check, dispatcher traps, tooling footguns) -- **it is a worked example from one
specific platform, not a template to copy onto the current repo.** Rebuild the equivalent
sections from this repo's own ground truth (its real CI workflows, its real hard rules, its real
footguns) before you rely on any of it; never apply that file's specifics to a different codebase.

---

## 1. Roles

- **Architect (you, the orchestrator).** Owns the final result. Plans, decomposes, designs,
  dispatches, verifies, gates, and decides. Never write production code yourself and never post
  line-level reviews yourself -- that's the coder's and reviewers' job. You are the only one who
  talks to the human and the only one who asks for the merge. You persist across the whole task;
  everyone else is spawned on demand for a bounded subtask and remembers nothing between spawns.
- **Coder.** A spec-first engineer subagent. Writes specs, implements approved specs, writes and
  runs tests, opens PRs, fixes review findings. Fast but budget-limited on large tasks and prone
  to reporting partial work as complete -- so every claim it makes gets verified against the actual
  code, never taken at face value. The coder builds to the design you hand it; it does not author
  the architecture.
- **Independent adversarial reviewers.** Reviewer subagents that each run a full, independent pass
  over an artifact (spec or code) and report Blocking / Non-blocking / Suggestion findings plus an
  Approve / Request-changes / Needs-discussion verdict. **All reviewers review the FULL rubric --
  requirements/intent conformance AND code-quality/API-contract/regression -- on every round; they
  are not split by domain (one for spec, one for code).** Convergence requires every reviewer to
  approve; a single "request changes" blocks the gate. You resolve any reviewer-vs-reviewer
  disagreement yourself by reading all writeups plus the artifact directly.

**Why independent reviewers catch more than one careful pass.** The source workflow this skill is
distilled from ran a single local reviewer that approved a change two independent on-PR review
bots then tore apart across six push/review/fix cycles -- because independent models have
non-overlapping blind spots. Mirroring that locally moves discovery BEFORE the PR opens, so
whatever CI/PR review automation this repo has CONFIRMS rather than DISCOVERS. Expected cycle
count on the paid/CI round drops from many to roughly one.

**Implementation note for this environment.** The Agent tool spawns Claude-family subagents, not
true cross-provider agents -- so "independent reviewers" here means subagents that are made
genuinely independent by construction, not three identical reads of the same prompt:
- Where the Agent tool's `model` parameter is available, spread reviewers across different model
  tiers (e.g. one on `opus`, one on `sonnet`, one on `haiku`) to get real architectural diversity
  instead of three runs of the same weights.
- Give each reviewer a distinct adversarial stance even though all cover the same full rubric --
  e.g. one reviewer prioritized to ground-truth every cited file:line/requirement against the
  actual checkout and flag fabrications first; one prioritized to trace cross-file/API contracts
  and regressions first; one prioritized to actively construct a concrete breaking input first.
  Each still owes a full-rubric verdict, but the differing entry point pulls attention to
  different failure classes, which is the property that made three-reviewer review outperform one.
- Never let "we can't get real provider diversity" become an excuse to run one reviewer and call
  it three. The whole benefit comes from independence; a rubber-stamped second and third pass is
  worse than no reform at all because it manufactures false confidence.

---

## 2. Core principles

- **Forward motion is the default.** Advance through every obvious next step without asking.
  Spec-approved -> implement. Tests-green -> review. Local gate passes -> open draft PR -> trigger
  CI/reviewers. Those are obvious transitions, not permission gates. A good stop is a decision the
  human must own, presented with a recommendation. "Say go to do the next obvious thing" is a bad
  stop.
- **Own the design before you dispatch.** A spec describes *what* to build; design decides the
  *shape* of the code that will exist after. Architecture choices -- where state lives, what is
  coupled to what, how lifecycle is keyed, which abstraction is shared -- belong to you, not the
  coder. Write down the design decision and its rejected alternatives before any non-trivial
  dispatch. If a reviewer finding traces to a design choice rather than an implementation bug,
  that finding is yours to own, not the coder's.
- **Ground truth over claims.** A subagent's "done / tests pass / fixed" is a claim, not evidence.
  A bot review comment is a claim. Your own memory of where things stood is stale the moment
  another session or machine touches the work. Re-derive truth from the code, the test run, the
  git state, and the live PR -- every time it matters.
- **Verify before you trust, gate before you push.** Read the actual diff, run the actual tests,
  trace the actual cross-file behavior. The deep review pass happens BEFORE the artifact goes to
  any external/paid reviewer, so those confirm rather than discover.
- **Attribute every review finding to a cause class, not just a person.** (a) implementation
  defect -- coder built the spec wrong; (b) enumeration miss -- a code-path was not considered;
  (c) design error -- the architecture forced the bug to exist; (d) spec gap -- the requirement
  was ambiguous. A PR dominated by class (a) is healthy iteration. A PR with more than one
  class-(c) finding is a design-time failure -- stop, re-design, do not patch.
- **The same architectural seam getting fixes across two consecutive rounds is a STOP condition** --
  a re-design condition, not a "prompt the coder harder" condition. When the same file/function/
  abstraction is touched in round N+1 to fix problems introduced in round N, halt the loop, find
  the *property* the code keeps violating, and re-spec to make that property impossible to
  violate. Patching the same seam three times running is the cheapest way to ship a bug while
  looking busy.
- **Bounded everything.** Every wait is time-capped and classified. Every recursion has a cap. No
  silent-wait branch, no infinite loop. At a cap without convergence, escalate with evidence -- do
  not grind another silent cycle.
- **Decompose ruthlessly, delegate cleanly, brief completely.** Subagents have no memory of your
  context and cannot ask you questions. Every delegation is self-contained: the goal, the design
  decision and why (with rejected alternatives so the coder does not re-derive a worse one), the
  code-path matrix to cover, exact file paths, the exact output artifact expected, and the
  relevant standing rules. If the coder has to make a design call mid-task, the brief was
  incomplete.
- **Scope discipline.** Do the task, not the neighborhood. A reviewer *suggestion* to fix
  out-of-scope code is not a mandate -- weigh it against scope. "While I'm here" alignment breeds
  regressions the local gate misses. Leave an out-of-scope contradiction for a follow-up.
- **Honesty about state.** Report true state plainly -- including when a subagent dropped work, a
  fix regressed, or you were wrong. Never paper over a problem to keep momentum. Frame the work as
  "orchestrator + on-demand subagent checks," never as a team working in parallel on its own.

---

## 3. The pipeline

### Stage 0 -- Establish state
Re-derive truth from the repo / open PRs / filesystem, especially when resuming (another session
or machine may have advanced the work). Confirm the real base-branch SHA. Never trust where the
conversation history *thinks* things are. Key reads: open PRs for the feature keyword; the PR
HEAD oid vs the local worktree HEAD (are local fixes actually pushed?); `git status` for
uncommitted WIP that addresses findings but was never committed; the INLINE review comments (the
real findings) rather than the review summary body (usually boilerplate). Reconcile all of these
before choosing the next action.

### Stage 1 -- Spec + spec review (independent-reviewer gate, mirrors CI)
1. Coder drafts a spec to a known path.
2. Ground-truth the requirements against the LIVE system FIRST. The codebase may have been built
   against an older capability surface. For each stated requirement, verify it (read live docs
   AND run a cheap live probe where only a real call settles it). Cite where each limit comes
   from. A requirement the platform cannot meet is a blocker to surface, not something to silently
   build around.
3. Run the reviewers in parallel on the spec (see the Implementation Note in Section 1 for how to
   make them independent). Each independently verifies every cited file path and line number
   against the checkout and emits Blocking / Non-blocking / Suggestion plus an Approve /
   Request-changes / Needs-discussion verdict. This gate routinely catches FABRICATIONS a
   coder-authored spec invents -- nonexistent models/routes/DOM-ids/tokens, uninstalled test
   stacks, modules that break their own test import -- each of which would otherwise cost multiple
   expensive discovery cycles later. Reviewers MUST open every cited file:line and confirm it is
   real.
4. Loop coder-revises-spec until every reviewer approves. **Cap: 3 rounds.**

**Spec-round convergence judgment.** A complex multi-file spec often takes 3-4 rounds where EACH
fix round surfaces a NEW adjacent issue the prior fix created -- that is the gate WORKING, not
failing. Typical arc: R1 = ground-truth misses (wrong routes/models/assumptions); R2 = the R1 fix
introduced a new scope bug; R3 = design sound but stale duplicate copies of the old design linger
in secondary sections. Two devices break the each-fix-makes-a-new-bug cycle, put them in the
revision brief: (1) force a coherence TRACE TABLE (trace every variable to its declaration; table
it); (2) tell the coder to propagate a design change to ALL copies (grep the whole spec for the
old term). **Lock decision:** once blockers are down to stale-text + one small additive step and
the reviewers themselves say "no new test needed," do ONE final tightly-scoped consolidation
pass, verify the fixes yourself, and LOCK -- do not run a 4th full round. The spec never goes to
external reviewers; the CODE does. Escalate only for a genuinely NEW STRUCTURAL problem, and
state the escalation bar out loud when entering the round.

### Stage 1b -- Spike gate (when the spec has empirical unknowns)
Before implementing, resolve anything only a live call or seeing real output can answer ("is this
the right model/config name?", "does the API accept this input shape?", "does the generated
output actually look right?"). **A spike result that contradicts a LOCKED spec decision is a
Blocking spec finding** -- loop back to Stage 1 with a coder-driven spec revision that cites the
spike, re-review, THEN build. Never implement against a spec the spike disproved. Running the
spike is autonomous; *changing a locked decision* on the strength of it needs human sign-off.

### Stage 2 -- Implementation + local triple-gate
1. Coder creates the feature branch/worktree off the base branch, writes code, runs TARGETED
   tests (the change-scoped suite, not the whole tree unless asked).
2. **Deterministic-first review, MANDATORY ORDER (this is the cost reform: the external/paid
   review round must DISCOVER NOTHING, only CONFIRM):**
   - **(a) Free deterministic gauntlet FIRST.** Encode every past reviewer finding as a free,
     executable check specific to this repo (empty-block detection, in-file contradiction checks,
     a regex/format corpus EXECUTED not read, stale-global reads, asymmetric guards, whatever this
     repo's own recurring careless-mistake classes are). A BLOCK here is fixed before any LLM sees
     the diff. This converts careless-mistake classes from LLM-judgment into math. "Trivial, skip
     the gate" is a BANNED rationalization -- every careless escape came through that shortcut.
     Build this gauntlet from THIS repo's own history/rules, not from another project's list --
     see `references/example-worked-platform.md` §D for what a filled-in version looks like.
   - **(b) A deterministic pre-push floor.** Hard-fail on whatever this repo's cheap, objective
     checks are: a changed asset whose cache-bust wasn't updated, stray non-ASCII/control
     characters on added lines, a syntax-check failure, a targeted-test failure -- adapted to what
     actually matters in this codebase.
   - **(c) An integration-seam audit** for any new-subsystem / wiring change. Tests-green is NOT
     integration-safe: a diff reviewed in isolation against mocked tests can pass while missing
     integration-seam bugs (a missing shim method causing a runtime crash, a dropped typed value,
     a cache collision). Grep every seam against the REAL base files: the contracts between
     modules, the fields a consumer actually reads, the full persist -> read-back path, cache
     lifecycle, and the consumer of every emitted value.
   - **(d) ONE local reviewer pass, ROLE-SPLIT not identical reads.** e.g. an EXECUTOR that runs
     the code + a production-ordering repro; a CONTRACT reviewer that traces cross-file and
     in-file contradictions; an ADVERSARY that builds and RUNS a breaking case. Run these roles in
     parallel; push is gated on all of them approving.
3. **Verify every coder claim in-code.** A coder's "done / all fixed / tests pass" is a CLAIM.
   After every coder pass, independently confirm each finding's fix in the actual code -- open the
   file, read the changed region, tick it off a checklist against the code, not against the
   summary. Demand a per-item completion table back ("for EACH item: what changed, file:line, the
   guarding test") and verify that table against the code. Re-run the tests yourself; syntax-check
   touched files; diff for scope/format violations. Coders drop items, regress, and claim
   completion -- the biggest driver of runaway cycle counts is a coder doing partial work reported
   as complete, then the orchestrator pushing on that self-report and letting reviewers discover
   what was dropped.
4. **A fix pass must not regress.** Fixes routinely INTRODUCE regressions. ALWAYS re-run the FULL
   local gate after every fix. When a behavioral bug is "fixed," confirm its guard test FAILS on
   revert -- a test that passes on both the old and new code proves nothing (the mutation trap).
5. **Verify the commit's FILE LIST, not just contents.** Coders silently re-stage workdir junk
   (review artifacts, task briefs, logs). After every coder commit, inspect the stat; if junk got
   staged, reset and re-commit clean. Tell the coder to add listed files explicitly, never a broad
   `add -A`. A PR carrying internal briefs is an instant reviewer flag and leaks orchestration
   prompts.
6. Loop coder-fixes -> re-gate. **Cap: 5 rounds.** Expected convergence: 2-3 rounds.

### Stage 3 -- PR + CI + external review
1. Coder pushes the branch, opens a DRAFT PR into the base branch with a Conventional Commit title
   and a thorough body (intent/scope/risk, spike findings, known issues, the pre-merge smoke
   checklist).
2. **Local review is NOT a substitute for whatever CI/PR review automation this repo actually
   has.** A clean local pass can still miss end-to-end behavior a local reviewer reads statically
   but never executes. Ground-truth what actually gates PRs in this repo (see Stage 0 and the
   note below) -- do not assume a target-doc's aspirational check list is real; verify against
   `.github/workflows/` and the PR's actual checks. Take the PR out of draft and fire whatever
   triggers this repo's review automation. (Trigger phrasing/mechanics can silently mis-fire --
   verify a review actually landed on the current HEAD rather than assuming a slow reviewer.)
3. **Wait via a BOUNDED, CLASSIFIED poll loop -- never an unbounded wait, never trusting a
   checks-passed exit code.** A checks command can exit 0 even when a check concluded `neutral` /
   `skipped`; neutral/skipped is NOT pass, it means "did not verdict" -> treat as action-needed.
   Every poll loop classifies into exactly one of PENDING / ACTION_NEEDED / GREEN_AND_REVIEWED /
   ERROR. PENDING continues up to a hard cap (~20-30 min of 60-90s ticks); cap-hit or ERROR or
   ACTION_NEEDED stops and acts/escalates. Wait on the actual review verdict on the current HEAD
   oid, not on a check-run that can go neutral.
4. **Filter findings by timestamp, not by commit id.** After a new push, some platforms re-anchor
   stale inline comments from the prior commit onto the new HEAD if the line still maps -- so a
   naive "comment is on HEAD" filter counts OLD, already-fixed findings as fresh (a false
   action-needed). A reviewer cannot review a commit before it is pushed: only count
   reviews/comments whose timestamp is AFTER the HEAD commit's committer date. A "still red"
   finding right after your own fix push is stale until proven fresh.
5. **Wait for ALL review sources on the CURRENT head before fixing anything.** A finding from one
   source while another has not yet reviewed the same head is a PARTIAL state; acting on it risks
   a half-blind fix and a wasted second round. Collect from all sources, then fix ALL open
   findings in ONE root-cause-grouped pass per cycle. Refresh CI state on every push (a push
   changes HEAD; the old waiter now points at a dead head).
6. Triage by severity: Critical/High/P1 -> fix (loop, cap 5); Medium/P2 -> fix or disposition in a
   PR comment; Low/Nitpick/P3 -> advisory.
7. **After each cycle, classify findings by cause class (a-d) from Section 2.** If class-(c)
   design-error findings appear in two consecutive cycles, or the same seam is touched twice, HALT
   and re-design -- do not patch. **Round cap = 1** for a confirmation-only posture; a second
   external review round looming is a STOP-and-escalate signal, not a grind signal.

### Stage 4 -- Merge (the one mandatory human stop)
1. Present the human a single decision packet: green checks, diff stats, the review dispositions,
   and the merge ask. Merging requires EXPLICIT per-PR human approval; never infer it.
2. On approval: merge per this repo's convention, then clean up branch + worktree (remove the
   worktree FIRST if one was used, it pins the branch).
3. **Verify the merge from ground truth**, never from the merge command's exit code (a trailing
   local-branch delete can error while the merge itself succeeded). Confirm the merge commit is on
   the base branch via `git log` AND the PR state reads MERGED via the API/UI.
4. **Surface post-merge smoke-test timing BEFORE the merge**, if this repo auto-deploys on push
   to a branch. The honest sequence is merge -> auto-deploy -> smoke test -> hotfix if broken.
   Regressions visible only at runtime (rendering, live integrations) are the class unit tests
   miss and only a live smoke test catches. A merged PR whose feature branch lingers in the branch
   list can LOOK still-open to the user -- that is the leftover branch, not the PR; re-derive state
   and disambiguate rather than re-asserting.

---

## 4. Autonomy contract -- when to STOP and ask the human

Run the entire pipeline autonomously. Stop ONLY for a genuine input you cannot derive or decide:

1. **Missing source material** -- the spec itself, or a real asset the task needs.
2. **Credentials / secrets** -- have the human provide them out of band; never accept a secret
   pasted into chat, and never write one into a file that could get committed.
3. **A standing-rule / policy change** -- editing a governing doc or a locked stakeholder
   decision.
4. **Evidence contradicting a LOCKED decision** -- surface the evidence + proposed correction, get
   sign-off, THEN revise. (Running the spike that produced the evidence is autonomous.)
5. **Premise failure / strategy pivot** -- the chosen approach demonstrably fails and recovery
   needs human knowledge. Report with evidence; do not thrash.
6. **A recursion cap hit without convergence** -- escalate with the latest state.
7. **A re-design triggered by the seam-twice or two-consecutive-class-(c) rules** -- making the
   design call is autonomous; *announcing* a re-design that shifts scope/timeline is a stop.
8. **The final merge** -- the one mandatory stop at the end.
9. **Genuine, unresolvable ambiguity** -- ask ONE sharp question with a recommended answer.

Everything else: proceed. Over-stopping is itself a failure mode. Litmus before any stop: is this
a specific human-only input, or a LOCKED decision you are changing? If neither, proceed. When you
do stop, BATCH everything into one message -- state the options + your recommendation -- and keep
working on anything not blocked.

---

## 5. CI review authority split (a governance pattern worth adopting per repo)

If this repo has more than one automated PR reviewer, treat them differently based on how the
human wants control exercised -- don't assume; confirm once, then apply consistently:

- **An architect-autonomous, recursive reviewer.** You may trigger it, read findings, dispatch
  fixes, re-push, and re-trigger in a bounded recursive loop until clean -- no human checkpoint.
  This is the normal converge-to-green loop.
- **A HUMAN-DECISION-gate reviewer.** Don't autonomously fix-loop its findings. Your job is only
  to (1) ensure it actually reviewed the current HEAD, (2) collect its verdict + every finding
  verbatim, classified by severity, and (3) surface them to the human as a decision -- which to
  fix, waive, or defer is the human's call. The loop iterates through the human, not around them.

Practical shape: converge the autonomous reviewer first, then present a single packet =
{autonomous reviewer: converged clean, with evidence | human-gated reviewer: verdict + findings
for your decision + merge ask}.

The rationale: an expensive review process with many findings that are mechanically detectable is
a signal to invest in determinism, not more LLM review rounds -- EXECUTION + DETERMINISM + a
findings ledger, not more reviewers. Every reviewer-caught or gauntlet-escaping finding becomes a
permanent free deterministic check so its class can never cost a paid/slow round again.

---

## 6. Recurring lessons (generalize these, don't just memorize the specific bugs)

- **Trace the dispatcher, not just the diff.** When a change edits a prompt/config/model-param,
  trace from that entry to the actual call site that dispatches it: which backend/service is
  invoked, its DEFAULT params the diff did not set, and whether the new values are arithmetically
  consistent with those defaults. A config-builder and its dispatcher can target different
  backends; changing the config to match backend A while the dispatcher still calls backend B is a
  guaranteed mismatch. "The config reads fine" is not enough.
- **A self-consistent set of stale values is safer than a half-updated "aligned" set.** If you
  must touch such code, update the WHOLE chain or none of it.
- **When a reviewer flags a bonus out-of-scope change, REVERT it, don't patch it.**
- **Green-but-dead.** Unit tests can pass while the wiring is dead (state cleared before its
  reader runs; a stub that renders in-session but persists nothing so the record is empty after
  reload). The gate question is always "does this hold end-to-end in production ordering," not "do
  the tests pass." The classes unit tests miss are the ones a live smoke test or a cross-file
  call-chain trace catches.
- **A local "Approve" must mean "I traced end-to-end behavior and it holds,"** not "the diff reads
  fine." If a later reviewer finds a Critical the local gate missed, record which rubric item
  missed it and add a deterministic check so it can never escape free again.
- **Verify REVIEWER claims too, not just coder claims.** A reviewer finding is a claim -- open the
  cited file:line against the pinned baseline SHA. Reviewers fail both ways: reviewing the wrong
  branch can declare real files missing (all false negatives); a misread can produce a
  false-positive "architectural finding" the code contradicts. Pin the baseline SHA in every
  artifact so everyone measures the same tree.
- **A qualified approve is not a hard block.** A gate that greps for an exact approve string will
  block on "Approve (with one Medium to fix)" -- read the actual findings, branch on those, not on
  a script's exit code.
- **Large delegations exhaust their budget -- plan for continuation.** After any abnormal coder
  exit, ground-truth the tree: a half-applied two-step edit (add-without-delete = shadowing) can
  be WORSE than the original bug and leaves tests green. Name the half-state in the continuation
  brief; guard tests must assert exactly-one / zero-of-old, not merely presence-of-new.
- **The seam-twice redesign shape.** When a declared/explicit signal keeps colliding with a
  heuristic, the fix is usually to make the declared signal EXCLUSIVE (branch on its presence)
  rather than OR-ing a third guard into the heuristic.
- **Don't add a chatty status cron to "watch for stalls."** It fires in a separate session with
  zero memory of the orchestration -- a smoke alarm with no firefighter. Use completion
  notifications + verify-dispatch discipline; if a backstop is truly wanted, only a SILENT
  watchdog that pings on a real anomaly (a stuck process, a job that exited non-zero unconsumed).

---

## 7. Caps summary

| Stage | Cap | On cap without convergence |
|---|---|---|
| Spec review rounds | 3 | Lock if only stale-text/additive remains; escalate only on a NEW structural problem |
| Local code fix rounds | 5 | Escalate honestly with the convergence pattern + one final consolidated pass |
| External/paid review rounds | 1 (confirmation posture) | A 2nd round looming = STOP + escalate |
| CI poll loop | ~20-30 min hard cap | ERROR or cap-hit -> stop + escalate; never loop forever |
| Same seam touched | 2 rounds | Re-design, do not patch a 3rd time |

The deliverable is a merged, working artifact backed by real verification -- not a description of
one.

---

## Applying this to a new repo, every time

Before Stage 0 of any run, spend a few minutes re-grounding the parts of this methodology that are
inherently repo-specific -- treating a stale assumption as current is exactly the failure mode
Section 6 warns about:

- What actually gates a PR here (real CI workflows, real bot/reviewer apps, branch protection or
  its absence)? Read `.github/workflows/` (or equivalent) directly; don't trust an aspirational
  process doc.
- What are this repo's hard rules that fail silently in production (auth middleware chains,
  banned patterns, required build steps, character/encoding constraints)?
- What does this repo's deterministic gauntlet need to check, given its own past review findings?
- What is the base branch for feature work, and does merging auto-deploy anywhere?

`references/example-worked-platform.md` shows what a fully worked-out answer to these questions
looked like for one specific platform. Use it to understand the SHAPE of a good answer, then
produce this repo's own answer from this repo's own evidence.

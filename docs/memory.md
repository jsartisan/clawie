# Memory Management Design

How a Clawie agent remembers things about its user across sessions, and how it
learns over time. This doc covers the **hybrid agent-first + host-reconciler**
design — what files exist, who writes them, when, and how conflicts are avoided.

Status: **implemented** (redesign of the original host-only reflection pass).

---

## The problem in one paragraph

A session is one long-lived thread. The container that runs the agent spins up
and dies many times over a thread's life. We want the agent to walk into every
session already knowing who the user is, what they prefer, and the durable facts
about their projects — without re-asking. We also want it to get *better* over
time, not just accumulate a growing pile of stale, contradictory notes.

## The two questions every memory system answers

1. **Who decides what to remember, and when?** (the *write* path)
2. **How does remembered stuff get back into the agent's head?** (the *read* path)

Our answers, in plain terms:

- **Write:** the agent writes its own memory *as it goes* (it knows best, in the
  moment). A host-side pass runs *after* the session as a safety net — it catches
  anything the agent forgot and tidies up duplicates/contradictions. This is the
  **hybrid** model.
- **Read:** a small set of markdown files is loaded into the agent's context
  automatically at the start of every session (no search, no database — just
  files).

---

## Files: the single memory convention

Today the agent is told (in `container/CLAUDE.md`) to use **three** overlapping
things: `CLAUDE.local.md`, ad-hoc self-made files (`customers.md`, etc.), and a
`conversations/` transcript folder. That's confusing — the agent doesn't know
where a given fact belongs. This design collapses memory into **two always-loaded
files plus an on-demand archive**.

| File | Holds | Always in context? | Budget |
|------|-------|--------------------|--------|
| `USER.md` | Who the user is — identity, durable preferences, communication style | ✅ yes | ~500 tokens |
| `MEMORY.md` | Environment/project facts, conventions, lessons learned | ✅ yes | ~800 tokens |
| `memory/*.md` | Bigger structured notes (e.g. `projects.md`, `people.md`), loaded only when relevant | ❌ on demand | — |
| `conversations/` | Raw past transcripts, searched when needed | ❌ on demand | — |

Both `USER.md` and `MEMORY.md` live in the agent group folder
(`groups/<folder>/`), which is mounted read-write into the container. They are
pulled into context via `@`-imports in the composed `CLAUDE.md` (same mechanism
that already loads shared instructions).

**Why two tiers?** The always-loaded files are tiny on purpose — they're the
"never make the user repeat themselves" surface, and they cost tokens on every
single turn. Everything bulkier (a full project spec, a customer list) goes into
`memory/*.md` and is loaded only when the conversation touches it. This is the
standard "small core + load-on-demand archive" pattern.

### What happens to `CLAUDE.local.md`?

It is **retired as a memory store**. `USER.md` takes over its "preferences /
who-the-user-is" role; `MEMORY.md` takes over "project facts / lessons." The
`container/CLAUDE.md` memory instructions are rewritten to point at the new
convention so the agent has exactly one obvious home for each kind of fact.

> **Scope assumption — single user per agent group.** `USER.md` is one
> group-level file, so an agent group is assumed to serve effectively one user
> (the dominant 1:1 DM case). If one agent group serves *many* distinct users
> (multiple DMs, or a shared channel), this file blends them. A per-user /
> per-conversation scoping model (keyed by messaging group, with a shared vs
> private layer split) was designed and prototyped but **deliberately deferred**
> — revisit if real multi-user demand appears. See git history / the research
> notes for the multi-user design.

---

## Write path 1: the agent (primary)

The agent maintains `USER.md` and `MEMORY.md` itself, using its normal
Read/Write/Edit file tools, guided by instructions in `container/CLAUDE.md`. No
new runtime code — just composition + prompt.

**When the agent should write (from the instructions):**
- User corrects it or says "remember this" / "don't do that again"
- User shares a preference, habit, or personal detail (name, role, timezone, style)
- It discovers a durable environment/project fact (stack, conventions, a quirk)
- It learns something that will matter again in a future session

**When it should NOT write:** one-off task state, things easily re-discovered,
raw data dumps, todo lists for the current task.

**The budget forces tidiness.** When a file approaches its token budget, the
agent is instructed to *consolidate* — merge overlapping lines, drop stale ones —
rather than keep appending. (Hermes enforces this with a hard cap that errors;
we start with a soft instruction and can harden later.)

This is exactly how Hermes and Anthropic's memory tool work: the model is the
best judge of salience in the moment, and writing markdown is cheap and
debuggable.

---

## Write path 2: the host reconciler (safety net)

After a session goes quiet (container stopped), the host runs a reflection pass.
Its job is **not** to be the main author — it's a janitor that:

1. Reads only the **new** messages since last time — a per-session
   `last_reflected_at` timestamp watermark on the `sessions` table, so it never
   re-processes the whole thread. (Timestamp, not seq, because the two session
   DBs use disjoint even/odd seq spaces; a timestamp orders cleanly across both.)
2. Asks an LLM to extract any salient facts/preferences the conversation revealed.
3. **Reconciles** the extraction against the current `USER.md` and `MEMORY.md`
   using the Mem0 four-way decision (see below). The LLM is handed both current
   files + the new transcript and returns the merged files, so the merge is
   holistic (no fragile parse-and-regenerate).
4. Writes each file **atomically** (temp + rename), only if it changed. A
   truncated/malformed LLM response is detected (`stop_reason`/JSON parse) and
   retried once; a hard failure leaves the watermark unadvanced so the next
   sweep retries.

**Model.** Defaults to Haiku (`REFLECTION_MODEL` env overrides). Sonnet is the
better choice on quality grounds — reflection's mistakes are persistent and the
shared-vs-private split is subtle judgment — but the standard Claude Code OAuth
token only has working Haiku access via the direct Messages API (Sonnet 429s on
that tier). Installs with a Sonnet-capable key (a real `sk-ant-api…` key, or one
injected via the OneCLI gateway) set `REFLECTION_MODEL=claude-sonnet-4-6`.

### The Mem0-style reconciler — in plain terms

For each new fact, look at what's already written and pick ONE action:

| Action | When | Example |
|--------|------|---------|
| **ADD** | genuinely new | "User's timezone is IST" → add it |
| **UPDATE** | we knew something, now we know more | "uses Postgres" + new "on RDS" → "uses Postgres on RDS" |
| **DELETE** | new fact contradicts an old one | "prefers detailed" then "prefers concise" → drop old, keep new |
| **NOOP** | already known exactly | "prefers pnpm" already there → do nothing |

"Latest info wins." This keeps the file **clean, deduplicated, and current**
instead of a growing pile. Because we're at file scale (not millions of records),
the "find similar existing memories" step is just "read the current file" — no
vector database needed.

---

## Why the two writers don't conflict

This is the crux of the hybrid design. Three guarantees:

1. **Never simultaneous.** The host pass only runs when the container is stopped
   (`host-sweep.ts` gates on `!alive`). The agent only writes while its container
   is alive. They don't overlap in time.

2. **The host is a reconciler, not a re-author.** It merges new facts *into*
   whatever is already in the file and edits in place. If the agent already wrote
   a fact, the host sees it and returns **NOOP**. It cannot "fight" the agent
   because its entire job is to fit new facts into the existing content — no
   matter who wrote it.

3. **One source of truth.** There's only the file. No second store to drift out
   of sync. The agent is the primary author; the host is the janitor; both
   converge on the same file.

Atomic writes mean that even in the rare race (container respawns in the gap
between the alive-check and the write), the worst case is one write loses — never
a corrupted file.

> Contrast with the original code: it threw away the file and regenerated it from
> two parsed sections, silently deleting anything else — the data-loss bug this
> design fixed.

---

## Learned skills (procedural memory)

Separate from facts: when the agent works out a reusable *procedure*, it can be
saved as a skill (`groups/<folder>/skills/<name>/SKILL.md`) that future sessions
discover automatically.

**The one hard rule (from Voyager / the research): only persist a skill that was
externally verified** — the tool actually ran, the test passed, or the user
confirmed it worked. We do **not** auto-save "this looks reusable" guesses,
because the research is clear that saving unverified self-generated content makes
agents worse over time, not better.

This is a tightening of today's behavior, where the reflection pass writes
skills from any pattern the model thinks is reusable.

> Note: this is *also* distinct from the `self-customize` skill, which is about
> changing the agent's **capabilities** (installing packages, adding MCP servers,
> editing its own code). That skill is unaffected by this redesign.

---

## What we are deliberately NOT building (yet)

- **No embeddings / vector store.** Markdown-in-context is sufficient until a
  single user's memory stops fitting in a curated file. Graduate to hybrid
  (keyword + vector) over the same markdown files only when that happens.
- **No per-turn extraction.** We run the host pass post-session, not on every
  message (cheaper, and the agent already handles in-the-moment writes).
- **No self-critique loops on reasoning.** Reflection only extracts grounded
  facts from what was said. The research shows a model grading its own reasoning
  with no external signal degrades quality.
- **No temporal/bi-temporal fact history.** "What did the user believe last
  month" isn't a need yet; supersession (overwrite) is enough.

---

## Implementation surface (as built)

Small and contained:

| Change | File |
|--------|------|
| Import group-level `USER.md` + `MEMORY.md` via `@`-import when present | `src/claude-md-compose.ts` |
| Host reflection: watermark + extract + Mem0 reconcile + atomic write + retry + skill gating | `src/reflection.ts` |
| `last_reflected_at` watermark column | `src/db/migrations/021-reflection-watermark.ts`, `src/types.ts`, `src/db/sessions.ts` |
| Trigger unchanged (runs post-session, gated on `!alive`) | `src/host-sweep.ts` |
| Single memory convention (`USER.md` / `MEMORY.md`); retire `CLAUDE.local.md` story | `container/CLAUDE.md` |

### Reflection pass, step by step

1. Look up the session's `last_reflected_at` watermark.
2. Read `messages_in` + `messages_out` with `timestamp` greater than the
   watermark, **interleaved by timestamp**, keeping the **most recent tail** if
   over the char cap.
3. If nothing new, return (cheap no-op — no LLM call).
4. One LLM call: hand it the current `USER.md` + `MEMORY.md` + the new
   transcript; it returns the merged files (Mem0 ADD/UPDATE/DELETE/NOOP) + any
   *verified* skills.
5. Write each changed file atomically; save verified skills (skip if file exists).
6. Advance the watermark to the newest message processed.

### Resolved (were open questions)

- **Watermark home:** `last_reflected_at` column on the central `sessions` table
  (host-owned — respects the one-writer-per-file rule, unlike the
  container-owned `outbound.db` `session_state`).
- **Budget:** soft instruction in the prompt + agent CLAUDE.md. Revisit with a
  hard cap if files bloat.
- **Model:** Haiku default, Sonnet via `REFLECTION_MODEL` when a capable key
  exists (see Write path 2).

### Still open

- **Auth:** reflection calls Anthropic directly via `ANTHROPIC_API_KEY`
  (OAuth-token aware). Routing through the OneCLI gateway would unlock Sonnet and
  match the rest of the host's credential model.
- **Multi-user scoping:** per-user / per-conversation memory (the scope
  assumption noted above) — deferred until real multi-user demand appears.

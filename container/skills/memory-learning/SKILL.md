---
name: memory-learning
description: Learn from conversations — write facts, preferences, and reusable skills to persistent memory so future sessions start with context.
---

# Memory Learning

You have a persistent memory system. Use it actively.

## What to remember

**After completing any non-trivial task**, ask yourself:
- Did the user correct your style, tone, format, or tool choice? → write a **preference**
- Did you learn something concrete about the user's environment or project? → write a **fact**
- Did you solve a tricky problem with a reusable technique? → write a **skill**

Most conversations should produce at least one memory write. Be active, not passive.

## How to write memories

Write to your workspace at `/workspace/agent/memory/`:

```bash
# facts and preferences — append to memory.jsonl (one JSON object per line)
mkdir -p /workspace/agent/memory
echo '{"kind":"preference","content":"User prefers pnpm over npm"}' >> /workspace/agent/memory/memory.jsonl
echo '{"kind":"fact","content":"Project uses Next.js 14 with App Router"}' >> /workspace/agent/memory/memory.jsonl
```

**Kinds:**
- `preference` — how the user likes things done (style, tools, format, verbosity)
- `fact` — concrete facts about the user, their project, or environment

## How to write learned skills

Treat skill creation as a reflex and maintenance as mandatory — don't wait to be asked.

**Create** a skill when, in a turn, you: completed a complex task (~5+ tool calls), fixed a tricky/non-obvious error, or discovered a reusable non-trivial workflow.

**Gate (so you don't over-create)** — only save it if it is **a procedure, not a fact**, **reusable**, **proven on real data first** (don't bake in guesses), and **non-obvious**. One-offs and easily re-discovered facts don't qualify — and facts go to memory, not skills.

```bash
SKILL_NAME="your-skill-name"  # lowercase, hyphens only
mkdir -p /workspace/agent/skills/$SKILL_NAME
cat > /workspace/agent/skills/$SKILL_NAME/SKILL.md << 'EOF'
---
name: your-skill-name
description: One-line description of what this skill does
---

# Skill Title

[Full instructions for the reusable technique...]
EOF
```

Skills written here are automatically loaded in future sessions.

**Patch immediately** when you use a skill and find it outdated, incomplete, or wrong. Unmaintained skills are liabilities.

**One skill per workflow** — no duplicate or near-duplicate skills; delete superseded ones rather than letting them pile up.

## What NOT to write

- One-off tasks ("user asked me to rename X") — skip
- Obvious things a competent assistant already knows — skip
- Anything that will be stale in a day (e.g. "user is debugging issue #123") — skip

## When to write

- **During** the conversation: immediately when you notice a preference correction or learn a fact
- **At the end** of a conversation: do a quick review — anything worth saving that you haven't written yet?

## Context you already have

At the start of each new session, the host injects a `<memory from_prior_sessions="true">` block with your remembered facts, preferences, and learned skills. Read it and use it — don't ask for things you already know.

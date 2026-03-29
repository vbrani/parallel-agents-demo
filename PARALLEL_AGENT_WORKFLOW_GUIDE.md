# Parallel Agent Workflow Guide
## How to Think Like a Developer Managing Multiple AI Agents

---

## The Mental Model

Think of yourself as a **Tech Lead** managing a team of junior developers (AI agents).
You don't write every line of code — you:
1. **Break down** the work into independent tasks
2. **Delegate** each task to an agent
3. **Review** the output
4. **Orchestrate** the integration

---

## Step-by-Step: How to Run Parallel Agents

### Step 1: Identify the Work
Look at the project and list everything that needs to be done:
- Bug fixes (validation missing, updated_at bug)
- New features (pagination, logging middleware)
- Tests (unit tests, integration tests)
- Code quality (linting, refactoring)

### Step 2: Map Dependencies
Ask: "Can these tasks be done at the same time without conflicts?"

```
INDEPENDENT (can run in parallel):          DEPENDENT (must be sequential):
├── Write tests for tasks.js                ├── First: Add validation to tasks.js
├── Write tests for users.js                │   Then: Write tests for validation
├── Add logging middleware                  ├── First: Add pagination util
├── Fix updated_at bug                      │   Then: Use pagination in routes
└── Add rate limiting middleware
```

### Step 3: Launch Agents in Parallel
In Claude Code, you can use the Agent tool to spawn multiple agents simultaneously.

---

## Real-World Scenarios to Practice

### Scenario 1: "Fix bugs + Add tests" (2 parallel agents)
You tell Claude:
> "I need you to do two things in parallel:
> Agent 1: Fix the input validation bug in POST /api/tasks - add zod validation
> Agent 2: Write jest tests for the GET endpoints in tasks.js and users.js"

WHY parallel? Tests for GET endpoints don't depend on POST validation changes.

### Scenario 2: "Three-way parallel" (3 agents)
> "Run these three agents in parallel:
> Agent 1: Add request logging middleware using morgan
> Agent 2: Fix the updated_at bug in PUT /api/tasks/:id
> Agent 3: Add pagination to GET /api/tasks and GET /api/users"

WHY parallel? Each touches different files/concerns with no overlap.

### Scenario 3: "Sequential then parallel" (mixed)
> "First, add zod validation schemas for task and user creation.
> Then in parallel:
> Agent 1: Write tests covering the new validation (happy + error paths)
> Agent 2: Add a POST /api/tasks/bulk endpoint using the same validation"

WHY mixed? Agents 1 and 2 both depend on the validation being done first,
but are independent of each other.

---

## Key Principles

### 1. File Conflict Avoidance
Never send two agents to edit the SAME file simultaneously.
Bad:  Agent 1 edits tasks.js, Agent 2 also edits tasks.js
Good: Agent 1 edits tasks.js, Agent 2 edits users.js

### 2. Dependency Awareness
If Agent 2 needs Agent 1's output, they CANNOT be parallel.
Example: "Add a utility function" then "Use that utility" = sequential

### 3. Clear, Specific Prompts
Bad:  "Fix the bugs" (vague, agent doesn't know scope)
Good: "Fix the updated_at bug in src/routes/tasks.js line 55 -
       add updated_at = CURRENT_TIMESTAMP to the UPDATE query"

### 4. Review After Each Wave
After parallel agents finish, review all changes before starting the next wave.
Don't blindly chain waves — an agent might have made a mistake.

### 5. Worktree Isolation
For risky changes, use `isolation: "worktree"` so each agent works on
an isolated copy. If something goes wrong, the main branch is untouched.

---

## Practice Exercises

### Exercise 1: Bug Fix Sprint (Easy)
Open this project in Claude Code and say:
"Fix these two bugs in parallel:
1. Add zod validation to POST /api/tasks (title is required, status must be todo/in_progress/done)
2. Fix updated_at not being updated in PUT /api/tasks/:id"

### Exercise 2: Feature + Tests (Medium)
"Do these in parallel:
1. Add pagination (page, limit query params) to GET /api/tasks
2. Write comprehensive tests for all existing user endpoints"

### Exercise 3: Full Sprint Simulation (Hard)
"I need a full sprint done:
Wave 1 (parallel): Fix all validation bugs + add logging middleware
Wave 2 (parallel, after wave 1): Write tests for all endpoints + add rate limiting
Wave 3 (sequential): Integration test the full API end-to-end"

---

## How This Maps to the Grindr Article

| Grindr's Finding               | What It Looks Like in Practice          |
|---------------------------------|-----------------------------------------|
| 94% run 1-5 agents in parallel  | You launch 2-3 agents per task wave     |
| 58% see 2-3x productivity       | 3 agents = 3 tasks done in time of 1    |
| 64% use agents most of the time | You're orchestrating, not typing code   |
| 60% struggle with context-switch | This guide helps you avoid that          |

---

## Common Mistakes to Avoid

1. **Over-parallelizing**: Don't run 5 agents if 2 of them will conflict
2. **Under-specifying**: Vague prompts = agents guess wrong = wasted time
3. **No review between waves**: Always check output before building on it
4. **Ignoring file conflicts**: Two agents editing same file = merge hell
5. **Not using worktrees**: For risky work, isolate agents with worktrees

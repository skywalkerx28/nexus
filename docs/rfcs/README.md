# Nexus RFCs - Request for Comments

This directory contains design documents for significant architectural decisions and interface changes in Nexus.

## Purpose

RFCs serve as:
- **Design documentation** for major features and interfaces
- **Historical record** of architectural decisions
- **Contract enforcement** - downstream modules depend on stable interfaces
- **Review mechanism** - changes require explicit approval

## When to Write an RFC

Write an RFC when:
- Defining or changing a stable interface (EventLog schema, OrderBook API, etc.)
- Making architectural decisions that affect multiple modules
- Introducing breaking changes to existing systems
- Adding new core subsystems

## RFC Format

```markdown
# RFC-XXX: Title

**Status:** Draft | Review | Accepted | Implemented | Deprecated
**Author:** Name
**Created:** YYYY-MM-DD
**Updated:** YYYY-MM-DD

## Summary
One paragraph overview.

## Motivation
Why is this needed?

## Design
Technical details, schemas, interfaces.

## Alternatives Considered
What else was evaluated?

## Testing Strategy
How will this be validated?

## Migration Path
How do we transition from current state?

## References
Links to related docs, papers, etc.
```

## Active RFCs

- [RFC-001: EventLog Arrow/Parquet Schema](001-eventlog-schema.md) - **Implemented**

## RFC Lifecycle

1. **Draft** - Initial proposal, open for feedback
2. **Review** - Under active review by team
3. **Accepted** - Approved, ready for implementation
4. **Implemented** - Code shipped, tests passing
5. **Deprecated** - Superseded by newer RFC

## Approval Process

1. Create RFC as PR
2. Tag relevant code owners
3. Address feedback
4. Merge when consensus reached
5. Update status as implementation progresses

---

**Note:** Small changes (bug fixes, refactors, optimizations) don't need RFCs. Use your judgment.


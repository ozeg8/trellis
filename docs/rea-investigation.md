# REA methodology and reconstruction scope

Trellis is an independent local project-board demo. REA browser scenarios were
used to observe the real Trello public interface before refining its visual
structure. No authenticated Trello workspace was modified.

The investigation followed REA's documented sequence: identify the target and
authority, collect a small UI inventory, follow bounded read-only interactions,
retain provenance privately, distinguish observed behavior from unknowns, then
implement and test the explicitly requested local workflows.

The observed public UI included horizontal lists with compact white cards,
colored labels, date and checklist badges, a split card-details/activity dialog,
filter controls, and a board menu. These observations informed Trellis's layout.
Exact list widths and colors are screenshot-derived approximations rather than
recovered CSS declarations.

Workspace creation, card/list editing, comment submission, drag-and-drop
mutation, background selection, authenticated validation, and Trello's internal
storage/API behavior were not verified against a signed-in account. Their
Trellis implementations follow the project requirements and are tested locally.
Search deliberately uses case-insensitive substring matching; it does not claim
to reproduce Trello's complete search grammar.

Raw captures, screenshots, personal paths, public-board identifiers, third-party
comments, and Evidence records are intentionally omitted from this repository.
No proprietary Trello source bundle or downloaded Trello artwork is included.
The icon and interface source are authored locally. This is not an official
Trello client or a write-capable AgentEnv export.

See [validation](validation.md) for checks executed against Trellis and
[security](../SECURITY.md) for its local trust boundary.

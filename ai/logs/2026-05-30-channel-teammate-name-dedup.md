# 2026-05-30 Channel Teammate Name Dedup

## Bug
Creating a teammate from a channel could fail with a duplicate-name error even when the current channel did not show that teammate. The real cause was the `custom_agents_owner_workspace_name_key` unique index: names are unique across the whole owner workspace, while the channel creation flow sent the user-entered name directly to `custom_agents`.

## Fix
- Channel-scoped teammate creation now resolves a safe display name before insert.
- Existing workspace agent names and current channel participant names are both treated as occupied names.
- If `软件工程师` is occupied, the backend creates `软件工程师1`; if that is occupied too, it advances to `软件工程师2`, and so on.
- Generic duplicate-name conflicts now return a Chinese product message instead of the previous English internal wording.
- The teammate wizard fetches the current channel participants and shows a Chinese alert when the typed name already exists in the channel.

## Verification
- Added API coverage for creating a same-named teammate in a channel and receiving a numeric suffix.
- Added web coverage for the channel duplicate-name warning.

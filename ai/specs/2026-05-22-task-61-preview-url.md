# Spec: Task 61 Preview URL Provisioning

## Objective
Ensure successful `static-site` and `container` deployments surface a usable
preview URL in the deploy result shown by the chat UI. The preview URL must be
workspace-scoped and support rotation when revoked.

## Assumptions
- A deterministic preview router path is enough for this slice; no live
  preview-serving backend is required.
- URL rotation can be represented by issuing a new opaque token and updating
  the stored `deployments.preview_url`.
- `source-archive` deployments do not receive preview URLs.

## Commands
- Build: `pnpm --filter api build`
- Test: `pnpm test:integration`
- Test: `pnpm test:e2e`

## Project Structure
- `apps/api/src/modules/deploys/*` → preview URL provisioning and rotation
- `infra/k8s/*` → preview ingress manifest
- `tests/integration/*` → API + worker verification

## Code Style
Keep preview URL generation explicit and centralized. The API should call one
service to issue and rotate URLs rather than letting each controller build
paths ad hoc.

## Testing Strategy
- Add an integration test that deploys through the API, checks the returned
  preview URL shape, revokes it, and confirms the URL rotates.
- Reuse the existing deploy-command e2e coverage to confirm the card still
  renders the preview URL.

## Boundaries
- Always: scope the URL path by workspace and deployment identifiers.
- Ask first: introducing a new database table solely for preview URL tokens.
- Never: assign preview URLs to `source-archive` deploys.

## Success Criteria
- `POST /deploys` returns a non-null `deployment.previewUrl` for successful
  `static-site` and `container` deploys.
- The preview URL path includes the workspace scope.
- Revoking a preview URL issues a different URL and persists it back to the
  deployment row.
- Existing deploy status cards continue to render the preview URL.

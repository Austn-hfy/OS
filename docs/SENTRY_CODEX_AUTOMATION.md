# Sentry-to-Codex automation

This repository can turn trusted Sentry alert issues into bounded Codex repair
attempts while preserving a clear human escalation path.

## Flow

1. A Sentry alert rule creates a GitHub issue in this repository.
2. The Sentry action adds the `sentry:codex` label.
3. `.github/workflows/sentry-codex.yml` starts a sandboxed Codex investigation.
4. Safe, validated code changes are transferred to a clean job, checked again, and
   opened as an unmerged pull request.
5. Unsafe, ambiguous, or failed repairs are labeled `codex:needs-human` and remain
   open with a concrete explanation.
6. A scheduled Codex conversation monitor reports state changes and human blockers.

## One-time account configuration

### GitHub

Add an Actions secret named `OPENAI_API_KEY`. Never put the key in an issue,
workflow file, repository variable, or chat message.

The workflow creates and maintains these labels automatically after its first
authorized run:

- `sentry:codex`
- `codex:working`
- `codex:pr-open`
- `codex:needs-human`
- `codex:failed`
- `codex:retry`

If the Sentry alert rule is configured before the first run, create
`sentry:codex` manually so it is available in Sentry's label selector.

### Sentry

Connect the Sentry organization to the `Austn-hfy/OS` GitHub repository. In the
production issue-alert workflow, add a **Create a GitHub issue** action with:

- Repository: `Austn-hfy/OS`
- Title prefix: `[Sentry]`
- Label: `sentry:codex`
- Body: include the Sentry issue link, environment, release or commit, exception,
  stack trace, event count, affected users, and useful scrubbed breadcrumbs.

Keep the existing direct Sentry notification for critical alerts. The agent and
conversation monitor are additional response channels, not a replacement for an
urgent pager.

## Safety properties

- Only labeled issues enter the workflow.
- The alert payload is explicitly treated as untrusted data.
- The agent receives no write-capable GitHub credential.
- The write-capable publish job runs separately after the agent exits.
- Protected repository, database, dependency, deployment, and monitoring paths are
  rejected from automatic pull requests.
- Every repair is revalidated with lint, type checking, and the full test suite.
- Pull requests are never automatically merged or deployed.
- Any failure or uncertainty becomes `codex:needs-human`.

## Retry and resolution

Apply `codex:retry` after resolving a blocker to rerun the investigation. A
successful pull request contains `Fixes #<issue>`, so GitHub closes the alert issue
when the repair is merged. Do not resolve the Sentry issue until the repair is
deployed and the alert has stopped recurring.

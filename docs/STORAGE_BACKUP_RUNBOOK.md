# HFY OS Supabase Storage backup runbook

## What this protects

Supabase database backups do not include the bytes stored in Supabase Storage. HFY OS therefore exports all objects from these private buckets every day:

- `invoice-pdfs`
- `brand-assets`
- `talent-documents`

The export contains a manifest with every original bucket/path, content type, byte size, source timestamps, and SHA-256 digest. Each downloaded file is verified before the export succeeds.

## Where backups live

The scheduled GitHub Actions workflow stores only an AES-256 encrypted archive. The repository being public does not expose filenames, documents, or the manifest. The archive is independently stored outside Supabase and retained for 90 days. Each new daily run creates a separate point-in-time artifact.

The workflow must have these protected repository secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STORAGE_BACKUP_PASSPHRASE`

The backup passphrase must also be retained outside GitHub in the owner's password manager. GitHub does not allow repository secrets to be read back later.

## Failure behavior

The workflow fails before uploading an artifact if any expected bucket is missing, an object cannot be listed/downloaded, the downloaded size is wrong, SHA-256 verification fails, encryption fails, or a decrypt-and-verify rehearsal fails. A successful workflow run therefore proves that the encrypted artifact can be opened and that its contents match the manifest.

GitHub's workflow-failure email is the first alert. Add a separate Healthchecks.io heartbeat if missed scheduled GitHub runs ever need monitoring independently of GitHub.

## Restore rehearsal

1. Download an encrypted workflow artifact.
2. Decrypt and extract it with the same OpenSSL parameters used in `.github/workflows/storage-backup.yml`.
3. Run `pnpm storage:verify --input <extracted-directory>`.
4. Point `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` at an empty recovery project.
5. Run `pnpm storage:restore --input <extracted-directory>` for a dry run.
6. Run the same command with `--apply` to restore. Existing target objects are never overwritten unless `--overwrite` is also supplied.

Perform a restore rehearsal at least quarterly and after any change to the workflow, encryption settings, bucket list, or restore script.

## Recovery objectives and limitations

- Schedule: daily at 5:20 a.m. Pacific Daylight Time / 4:20 a.m. Pacific Standard Time.
- Maximum expected data loss: roughly 24 hours until a more frequent schedule is configured.
- Retention: 90 rolling daily artifacts.
- Scope: Storage objects only. Database recovery remains Supabase's daily database backup.
- The backup is not operational until all three GitHub secrets exist and the first manual workflow run succeeds.

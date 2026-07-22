# Doctor Frost retrieval import

This workflow imports completed Doctor Frost captures into the shared retrieval bank for one Supabase user. It is dry-run only unless a separate, exact approval record is supplied.

## Behaviour

- A code already active in `retrieval_los` keeps its row ID. The import replaces its canonical wording and all 16 question/feedback image references with the higher-quality capture.
- Existing `retrieval_class_progress` rows are not inserted, updated, archived, or deleted. Teaching dates, seen counts, spacing, current slots, and class assignments therefore survive an override.
- A code found only in archived history gets a new active `retrieval_los` row. The archive is retained.
- A newly imported LO has no class-progress row. It becomes due only after the user adds it to a class from the Example composer or another existing retrieval workflow.
- Storage objects use checksum-addressed immutable paths. The importer never overwrites an existing object in place.

## 1. Wait for capture completion

The normal inventory requires all 1,809 unique codes to be checked across the four lane registers. Each selected capture must have helper version 2.0.9 or newer, a complete manifest, eight JSONL records, `batch.complete`, eight question PNGs, eight feedback PNGs, and valid PNG signatures.

## 2. Generate an inventory (no upload)

From the app repository:

```powershell
npm run drfrost:inventory -- --project-ref <target-project-ref> --workspace-root "C:\Users\grayg\Documents\New project 6"
```

This writes `drfrost-import-reports/import-manifest.json` and an approval template. It prints the SHA-256 manifest hash, totals, target project, and owner. It does not read service-role credentials, construct a Supabase client, or upload anything.

`--allow-incomplete` exists only for inspection during capture work. It writes an
`inspection-only` manifest containing every currently eligible checked capture,
plus an `omissions` list for checked codes that do not yet have a valid helper
2.0.9+ capture. Its approval template is marked `applyEligible: false`.

Inspection-only or otherwise incomplete manifests are mechanically rejected by
the apply command before service-role credentials are read or an upload-capable
client is constructed. A final manifest is apply-eligible only when all 1,809
codes are checked, eligible, present as entries, and the omissions list is empty.

## 3. Review and obtain explicit approval

Review the exact manifest, target project ref, owner (`grayglew@gmail.com`), entry count, and hash. Do not set `approved` to `true` merely because the inventory succeeded. An operator may create the approval JSON only after the user explicitly approves that exact environment and manifest hash.

The approval file must contain:

```json
{
  "approved": true,
  "targetProjectRef": "<target-project-ref>",
  "ownerEmail": "grayglew@gmail.com",
  "manifestHash": "<exact-manifest-sha256>",
  "runId": "<exact-manifest-run-id>",
  "approvedAt": "<ISO-8601 timestamp>"
}
```

Any mismatch is rejected before upload-capable credentials are read or a client is constructed.

## 4. Apply only after approval

Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for the approved project, then run:

```powershell
node scripts/import-drfrost-captures.mjs --apply --manifest <manifest.json> --approval <approval.json> --project-ref <target-project-ref>
```

The script writes a checkpoint after preparation, each immutable image upload, and each canonical replacement. The report records prior wording and image references so database references can be restored. Failed partials and uploaded immutable objects are retained; no automatic destructive cleanup occurs.

## 5. Verify and, if necessary, roll back

Verify a sample of new and overridden codes in the application, including an LO already tracked by a class. Confirm its progress values are unchanged and its images resolve correctly.

Rollback restores prior database wording and image references for replaced rows and archives rows created by the import. It does not delete immutable storage objects:

```powershell
node scripts/import-drfrost-captures.mjs --rollback --report <report.json> --approval <approval.json> --project-ref <target-project-ref>
```

Treat rollback as a separate external mutation and obtain approval before running it.

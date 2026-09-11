import {
  ACE_SEPTEMBER_2026_BACKFILL_CONFIRMATION,
  runAceSeptember2026Backfill,
} from "../src/services/ace-september-backfill";

const confirmation = process.env.ACE_SEPTEMBER_2026_BACKFILL_CONFIRMATION ?? "";
if (confirmation !== ACE_SEPTEMBER_2026_BACKFILL_CONFIRMATION) {
  throw new Error(
    `Set ACE_SEPTEMBER_2026_BACKFILL_CONFIRMATION to "${ACE_SEPTEMBER_2026_BACKFILL_CONFIRMATION}" to run this reviewed backfill.`,
  );
}

const result = await runAceSeptember2026Backfill(confirmation);
process.stdout.write(`${JSON.stringify({ ok: true, ...result }, null, 2)}\n`);

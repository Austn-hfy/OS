CREATE UNIQUE INDEX "shift_change_requests_one_pending_per_shift_unique"
ON "shift_change_requests" USING btree ("shift_id")
WHERE "status" = 'pending';

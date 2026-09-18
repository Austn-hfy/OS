WITH "retired_revision" AS (
	UPDATE "platform_subscription_revisions"
	SET
		"stripe_sync_status" = 'failed',
		"stripe_sync_error" = 'Deferred annual schedule released in favor of immediate prorated annual switching.',
		"synced_at" = NULL
	WHERE
		"platform_subscription_id" = '27c559a6-f548-46c4-a145-d08d89f75da5'
		AND "revision" = 4
		AND "term" = 'annual'
		AND "stripe_sync_status" = 'pending'
	RETURNING "id", "residency_id", "platform_subscription_id", "revision", "stripe_price_id"
)
INSERT INTO "audit_log" (
	"residency_id",
	"actor_label",
	"action",
	"entity_type",
	"entity_id",
	"details"
)
SELECT
	"residency_id",
	'automation:immediate-annual-proration-rollout',
	'platform_deferred_annual_revision_retired',
	'platform_subscription_revision',
	"id",
	jsonb_build_object(
		'platformSubscriptionId', "platform_subscription_id",
		'revision', "revision",
		'stripePriceId', "stripe_price_id",
		'stripeScheduleId', 'sub_sched_1UGuXtEjVx206c2NAysuyKI8',
		'reason', 'Deferred annual schedule released in favor of immediate prorated annual switching.'
	)
FROM "retired_revision";

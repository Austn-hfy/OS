CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"residency_id" uuid NOT NULL,
	"name" text NOT NULL,
	"hue" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rooms_name_not_blank" CHECK (length(btrim("rooms"."name")) > 0),
	CONSTRAINT "rooms_hue_valid" CHECK ("rooms"."hue" IN ('blue', 'orange', 'green', 'purple', 'yellow', 'navy', 'red', 'teal')),
	CONSTRAINT "rooms_sort_order_nonnegative" CHECK ("rooms"."sort_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE "dayparts" ADD COLUMN "room_id" uuid;--> statement-breakpoint
ALTER TABLE "schedule_occurrences" ADD COLUMN "room_id" uuid;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "room_id" uuid;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_residency_id_residencies_id_fk" FOREIGN KEY ("residency_id") REFERENCES "public"."residencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_residency_name_unique" ON "rooms" USING btree ("residency_id",lower(btrim("name")));--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_id_residency_unique" ON "rooms" USING btree ("id","residency_id");--> statement-breakpoint
CREATE INDEX "rooms_residency_sort_idx" ON "rooms" USING btree ("residency_id","sort_order","name");--> statement-breakpoint
WITH raw_rooms AS (
	SELECT "residency_id", btrim("room") AS "name" FROM "dayparts"
	UNION ALL
	SELECT "residency_id", btrim("room") AS "name" FROM "schedule_occurrences"
	UNION ALL
	SELECT "residency_id", btrim("room") AS "name" FROM "shifts"
), distinct_rooms AS (
	SELECT "residency_id", min("name") AS "name"
	FROM raw_rooms
	WHERE "name" <> ''
	GROUP BY "residency_id", lower("name")
), ranked_rooms AS (
	SELECT
		"residency_id",
		"name",
		row_number() OVER (PARTITION BY "residency_id" ORDER BY lower("name"), "name") - 1 AS "room_index"
	FROM distinct_rooms
)
INSERT INTO "rooms" ("residency_id", "name", "hue", "sort_order")
SELECT
	"residency_id",
	"name",
	(ARRAY['blue', 'orange', 'green', 'purple', 'yellow', 'navy', 'red', 'teal'])[("room_index" % 8) + 1],
	"room_index"
FROM ranked_rooms;--> statement-breakpoint
UPDATE "dayparts" AS item
SET "room_id" = room."id"
FROM "rooms" AS room
WHERE room."residency_id" = item."residency_id"
	AND lower(btrim(room."name")) = lower(btrim(item."room"));--> statement-breakpoint
UPDATE "schedule_occurrences" AS occurrence
SET "room_id" = room."id"
FROM "rooms" AS room
WHERE room."residency_id" = occurrence."residency_id"
	AND lower(btrim(room."name")) = lower(btrim(occurrence."room"));--> statement-breakpoint
UPDATE "shifts" AS shift
SET "room_id" = room."id"
FROM "rooms" AS room
WHERE room."residency_id" = shift."residency_id"
	AND lower(btrim(room."name")) = lower(btrim(shift."room"));--> statement-breakpoint
WITH ranked_dayparts AS (
	SELECT
		item."id",
		room."hue",
		row_number() OVER (
			PARTITION BY item."room_id"
			ORDER BY lower(item."name"), item."name", item."id"
		) - 1 AS "item_index"
	FROM "dayparts" AS item
	INNER JOIN "rooms" AS room ON room."id" = item."room_id"
), assigned_colors AS (
	SELECT
		"id",
		CASE "hue"
			WHEN 'blue' THEN (ARRAY['#1B5FA7', '#2783DC', '#5AA6E8'])[("item_index" % 3) + 1]
			WHEN 'orange' THEN (ARRAY['#B95A1E', '#E98332', '#F1A35D'])[("item_index" % 3) + 1]
			WHEN 'green' THEN (ARRAY['#24745B', '#2E9E79', '#5DBA91'])[("item_index" % 3) + 1]
			WHEN 'purple' THEN (ARRAY['#5542A1', '#7A65D1', '#9B8AE0'])[("item_index" % 3) + 1]
			WHEN 'yellow' THEN (ARRAY['#A97912', '#D6A11D', '#E5BC3A'])[("item_index" % 3) + 1]
			WHEN 'navy' THEN (ARRAY['#173650', '#244C76', '#4B6F91'])[("item_index" % 3) + 1]
			WHEN 'red' THEN (ARRAY['#9C3F4D', '#D45757', '#E97868'])[("item_index" % 3) + 1]
			ELSE (ARRAY['#19686C', '#248F94', '#4DAEB1'])[("item_index" % 3) + 1]
		END AS "color"
	FROM ranked_dayparts
)
UPDATE "dayparts" AS item
SET "color" = assigned."color", "updated_at" = now()
FROM assigned_colors AS assigned
WHERE assigned."id" = item."id";--> statement-breakpoint
UPDATE "schedule_occurrences" AS occurrence
SET "room_id" = item."room_id", "color" = item."color", "updated_at" = now()
FROM "dayparts" AS item
WHERE item."id" = occurrence."daypart_id";--> statement-breakpoint
UPDATE "shifts" AS shift
SET "room_id" = item."room_id",
	"calendar_color" = CASE WHEN upper(coalesce(shift."calendar_color", '')) = '#EC4899' THEN NULL ELSE shift."calendar_color" END,
	"updated_at" = now()
FROM "dayparts" AS item
WHERE item."id" = shift."daypart_id";--> statement-breakpoint
UPDATE "shifts" AS shift
SET "calendar_color" = CASE room."hue"
	WHEN 'blue' THEN '#2783DC'
	WHEN 'orange' THEN '#E98332'
	WHEN 'green' THEN '#2E9E79'
	WHEN 'purple' THEN '#7A65D1'
	WHEN 'yellow' THEN '#D6A11D'
	WHEN 'navy' THEN '#244C76'
	WHEN 'red' THEN '#D45757'
	ELSE '#248F94'
END,
"updated_at" = now()
FROM "rooms" AS room
WHERE room."id" = shift."room_id"
	AND shift."daypart_id" IS NULL
	AND upper(coalesce(shift."calendar_color", '')) = '#EC4899';--> statement-breakpoint
ALTER TABLE "rooms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "rooms_read_membership" ON "rooms" FOR SELECT TO authenticated
USING ("residency_id" IN (SELECT private.current_residency_ids()));--> statement-breakpoint
ALTER TABLE "dayparts" ADD CONSTRAINT "dayparts_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_occurrences" ADD CONSTRAINT "schedule_occurrences_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dayparts_room_idx" ON "dayparts" USING btree ("room_id","created_at");--> statement-breakpoint
CREATE INDEX "schedule_occurrences_room_idx" ON "schedule_occurrences" USING btree ("room_id","service_date");--> statement-breakpoint
CREATE INDEX "shifts_room_idx" ON "shifts" USING btree ("room_id","service_date");

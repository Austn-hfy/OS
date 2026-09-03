WITH ace_rooms AS (
	SELECT room."id", lower(btrim(room."name")) AS "normalized_name"
	FROM "rooms" AS room
	INNER JOIN "residencies" AS residency ON residency."id" = room."residency_id"
	WHERE residency."slug" = 'ace-hotel'
		AND lower(btrim(room."name")) IN ('amigo room', 'pool')
)
UPDATE "rooms" AS room
SET "hue" = CASE ace."normalized_name"
		WHEN 'amigo room' THEN 'orange'
		ELSE 'blue'
	END,
	"updated_at" = now()
FROM ace_rooms AS ace
WHERE ace."id" = room."id";--> statement-breakpoint
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
	INNER JOIN "residencies" AS residency ON residency."id" = room."residency_id"
	WHERE residency."slug" = 'ace-hotel'
		AND lower(btrim(room."name")) IN ('amigo room', 'pool')
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
SET "color" = item."color", "updated_at" = now()
FROM "dayparts" AS item
INNER JOIN "rooms" AS room ON room."id" = item."room_id"
INNER JOIN "residencies" AS residency ON residency."id" = room."residency_id"
WHERE occurrence."daypart_id" = item."id"
	AND residency."slug" = 'ace-hotel'
	AND lower(btrim(room."name")) IN ('amigo room', 'pool');

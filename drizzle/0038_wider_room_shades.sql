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
			WHEN 'blue' THEN (ARRAY['#103E70', '#DAECFA', '#2783DC', '#5AA6E8'])[("item_index" % 4) + 1]
			WHEN 'orange' THEN (ARRAY['#7D350B', '#FBE1C9', '#E98332', '#F1A35D'])[("item_index" % 4) + 1]
			WHEN 'green' THEN (ARRAY['#124D38', '#D9F1E6', '#2E9E79', '#5DBA91'])[("item_index" % 4) + 1]
			WHEN 'purple' THEN (ARRAY['#392873', '#E8E2FA', '#7A65D1', '#9B8AE0'])[("item_index" % 4) + 1]
			WHEN 'yellow' THEN (ARRAY['#694B08', '#FAEFC4', '#D6A11D', '#E5BC3A'])[("item_index" % 4) + 1]
			WHEN 'navy' THEN (ARRAY['#0B243A', '#DEE7EF', '#244C76', '#4B6F91'])[("item_index" % 4) + 1]
			WHEN 'red' THEN (ARRAY['#76293A', '#FADCDD', '#D45757', '#E97868'])[("item_index" % 4) + 1]
			ELSE (ARRAY['#0D4B50', '#D7F0F1', '#248F94', '#4DAEB1'])[("item_index" % 4) + 1]
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
WHERE occurrence."daypart_id" = item."id";

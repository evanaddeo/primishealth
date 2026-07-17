# Synthetic FoodData Central fixtures

These CSVs are small, fabricated CU-095 fixtures. They are not USDA records,
do not claim nutritional accuracy, and must never be replaced with a real FDC
archive or a generated production flattening output.

- `foundation.csv` covers valid foods, all supported macro nutrients, an
  unsupported nutrient, unit conversion and rejection, malformed rows,
  invalid IDs and amounts, missing optional/required fields, duplicate
  nutrients, and a later duplicate food ID.
- `branded.csv` covers quoted commas, brand and serving fields, missing
  optional fields, invalid serving data, unsupported nutrients, malformed
  rows, and a later duplicate food ID.

Both files use the grouped flattened contract documented in
`scripts/fooddata-central/README.md`. The deliberate final duplicate groups
exercise safe last-write-wins rerun behavior and are the only intentional
departures from ascending `fdc_id` order.

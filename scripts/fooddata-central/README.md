# FoodData Central Importer (CU-095)

Local, operator-driven import of USDA FoodData Central (FDC) foods into the
Primis food catalog (`food_items` / `food_nutrient_values`). Built per the
Phase K plan (`plans/phase-k-post-mvp-expansion-stubs.md` §10) — this is a
scaffold for the Foundation and Branded datasets only.

## Usage

```bash
pnpm fdc:import -- --input <csv-path> --dataset foundation|branded \
  --release <label> [--dry-run] [--chunk-size <n>]
```

- `--input` — path to a **local** flattened CSV (see input contract below).
  There is no downloader: operators obtain USDA archives independently from
  <https://fdc.nal.usda.gov/download-datasets/>. The importer never makes
  network requests — no per-food API calls, ever.
- `--dataset` — `foundation` or `branded` (the only v1 datasets).
- `--release` — operator-supplied dataset release label (e.g. `2026-04`),
  recorded as provenance; 1–64 chars of `[A-Za-z0-9._-]`.
- `--dry-run` — parse, validate, normalize, and report **without opening a
  database connection**. Nothing is written.
- `--chunk-size` — foods committed per transaction (default 500, max 5000).

Example against the synthetic fixtures:

```bash
pnpm fdc:import -- --input database/fixtures/fooddata_central/synthetic/foundation.csv \
  --dataset foundation --release synthetic-v1 --dry-run
```

## Input contract (flattened CSV)

The official FDC per-dataset archives split food attributes across several
CSVs (`food.csv`, `food_nutrient.csv`, `nutrient.csv`, `branded_food.csv` —
see the [FDC data dictionary](https://fdc.nal.usda.gov/portal-data/external/dataDictionary)).
This scaffold consumes **one flattened CSV per dataset**: one row per
(food, nutrient) pair, with `fdc_id` groups in ascending numeric order. The
flattening step must sort explicitly; USDA documents the relational files but
does not make file-ordering part of the data contract. Producing and validating
the flattened file from a production archive is operator tooling owned by the
Phase Z production-scale gate; the synthetic fixtures under
`database/fixtures/fooddata_central/` define the exact CU-095 shape.

Columns (official FDC field names):

| Column                               | Datasets | Maps to                                             |
| ------------------------------------ | -------- | --------------------------------------------------- |
| `fdc_id`                             | both     | `food_items.external_food_id` (stable FDC ID)       |
| `description`                        | both     | `food_items.name` (required)                        |
| `food_category`                      | both     | `food_items.food_category`                          |
| `nutrient_id`                        | both     | approved-nutrient lookup (`nutrient.id`, e.g. 1003) |
| `nutrient_name`                      | both     | `food_nutrient_values.nutrient_name`                |
| `nutrient_unit`                      | both     | unit normalization input (`unit_name`)              |
| `nutrient_amount`                    | both     | `food_nutrient_values.amount` (per 100 g/mL)        |
| `brand_owner` / `brand_name`         | branded  | `food_items.brand_name` (name preferred)            |
| `serving_size` / `serving_size_unit` | branded  | `food_items.serving_size` / `serving_unit`          |
| `household_serving_fulltext`         | branded  | `food_items.household_serving`                      |

A food with no nutrient pairs is a single row with empty nutrient columns.
Rows with an `fdc_id` that reappears after its group closed violate the sorted
input contract. They are accepted as duplicate/reordered source IDs, the last
occurrence wins, and the event is counted without retaining an unbounded ID
set. A single food group is capped at 10,000 rows.

## Nutrients and units

Only the seven approved v1 nutrients are imported (canonical codes from
`@primis/core-types` `FOOD_NUTRIENT_CODES`): FDC nutrient IDs 1008 (Energy
kcal), 1003 (Protein), 1005 (Carbohydrate), 1004 (Total fat), 1079 (Fiber),
2000 (Sugars), 1093 (Sodium). Mass units are converted between `g`/`mg`/`µg`
into each code's canonical unit; energy is accepted in `KCAL` only (kJ rows
are counted as `unsupported_unit`, not converted). Everything else is counted
as `unsupported_nutrient` and skipped — counts only, no raw rows retained.
Re-verify current nutrient IDs against the FDC data dictionary before any
production import (Phase Z gate).

## Idempotency, provenance, and freshness

- Foods upsert on `(source_code='fdc', external_food_id)`; each upserted
  food's nutrient rows are **replaced** in the same transaction, so stale
  nutrients never survive a re-import.
- Each chunk commits independently — an interrupted run is recovered by
  simply rerunning the same file/release.
- Memory is bounded by one capped food group plus one bounded write chunk; no
  production-sized row or ID collection is retained.
- Re-running the same dataset+release is safe and converges to the same rows.
- Provenance: every item's `metadata` records `fdcDataset` and `fdcRelease`;
  the `food_catalog_sources` `fdc` row records `source_version`,
  `imported_at`, and an aggregate `lastImport` summary.
- Foods absent from the supplied file are **never deleted or hidden** — they
  are reported as `staleCandidateCount` only (destructive replacement needs a
  product decision/ADR).
- The importer only writes `fdc`-owned global rows; `user_private` foods
  (CU-096) are never touched.

## Report and logging

The only output is an aggregate JSON report (row/food/nutrient counts and
bounded warning-code counts such as `malformed_row`, `unsupported_unit`).
Raw source rows, field values, and file paths are never logged. In
`--dry-run`, `staleCandidateCount` is `null` because the database is not
consulted. Counters count events, not distinct rows — idempotency is proven
by database row counts (see `test/import.test.ts`), not by comparing reports.

## Never commit datasets

Real USDA archives, flattened production CSVs, and generated outputs must not
enter Git. Only the tiny fabricated fixtures under
`database/fixtures/fooddata_central/synthetic/` are committed
(`find database/fixtures/fooddata_central -type f -size +1M -print` must
return nothing).

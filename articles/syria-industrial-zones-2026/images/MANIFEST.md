# Image manifest — Syria Industrial Zones, Quarter by Quarter

The article (`../index.html`) expects the files below. Slider frames that are
missing render a hatched "composite pending — Qx" panel, so the page works while
images are produced incrementally.

## Naming convention

```
images/{zone}_{quarter}.jpeg
```

- `zone` ∈ `adra`, `sheikh_najjar`, `hisya`, `bab_al_hawa`
- `quarter` ∈ `2024q4`, `2025q1`, `2025q2`, `2025q3`, `2025q4`, `2026q1`

Each image should be a **square** (1:1) per-zone radiance composite, magma color
scale, vmin/vmax matched within a zone across all six quarters so the crossfade is
comparable. Same extraction window per zone across all quarters.

## Full file list (24 zone frames + 1 hero)

| Zone | Q4 '24 | Q1 '25 | Q2 '25 | Q3 '25 | Q4 '25 | Q1 '26 |
|------|--------|--------|--------|--------|--------|--------|
| adra | adra_2024q4.jpeg | adra_2025q1.jpeg | adra_2025q2.jpeg | adra_2025q3.jpeg | adra_2025q4.jpeg | adra_2026q1.jpeg |
| sheikh_najjar | sheikh_najjar_2024q4.jpeg | … | … | … | … | sheikh_najjar_2026q1.jpeg |
| hisya | hisya_2024q4.jpeg | … | … | … | … | hisya_2026q1.jpeg |
| bab_al_hawa | bab_al_hawa_2024q4.jpeg | … | … | … | … | bab_al_hawa_2026q1.jpeg |

Plus `iz_hero.jpeg` — a wide hero (region or composite of all four zones).

## Anchors already available

The `*_2024q4` and `*_2025q4` frames can be seeded from the existing October
composites in `../syria-recovery-2025/images/` (e.g. `adra_oct2024.jpeg` →
`adra_2024q4.jpeg`, `adra_oct2025.jpeg` → `adra_2025q4.jpeg`). The four interior
quarters must be generated.

## How to generate (generate_clips.py)

Use the generic clip generator at the project root. Sites (the four zones) and
periods (the six quarters) are defined in its `SITES` / `PERIODS` tables.

```bash
# Nighttime VIIRS frames -> {zone}_{quarter}.jpeg
python generate_clips.py --source viirs

# Optional daytime HLS frames -> {zone}_{quarter}_day.jpeg
python generate_clips.py --source hls

# Subset while iterating
python generate_clips.py --source viirs --sites adra,hisya --periods 2025q2,2025q3
```

The VIIRS path reuses the proven download → cloud-mask → composite → clip code and
fixes the magma `vmax` per site across all quarters so the crossfade is comparable.
It prints each frame's mean radiance — paste those into the `ZONES[...].radiance`
arrays and the `<table id="qz-table">` in `../index.html`.

⚠️ `2024q4` and `2025q4` use the verified clear October nights. The interior-quarter
date lists in `PERIODS` are new-moon candidates — replace them with the pipeline's
quality-filtered clear nights, and confirm winter quarters (Q4, Q1) rest on enough
clear observations, before trusting the values.

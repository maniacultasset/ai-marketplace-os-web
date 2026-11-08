# Landing photo credits

Every photo was downloaded from images.unsplash.com (the original JPEG), checked with `file`, then cropped and
resized with Lanczos and saved as WebP (quality 86-88). No cut-outs, no backgrounds removed, no upscaling.
All are free under the Unsplash License (https://unsplash.com/license): free commercial use, no attribution
required, not Unsplash+. Each license was checked on its photo page on 2026-11-08. Credit is kept here anyway.

| Files | Photo page | Author | License |
|---|---|---|---|
| `kurta-set-420.webp`, `kurta-set-840.webp`, `slip-kurta-set-48.webp`, `slip-kurta-set-96.webp`, `slip-kurta-set-indigo.webp` (How it works thumbnail) | https://unsplash.com/photos/woman-in-a-floral-print-navy-blue-kurta-and-pants-1qsb5rGOcC4 (original 3889x5833) | IMANA (@imanaindia) | Unsplash License |
| `tee-420.webp`, `tee-840.webp`, `slip-tee-48.webp`, `slip-tee-96.webp` | https://unsplash.com/photos/54EWNIGurW4 "Woman in dark t-shirt, blue jeans, and gold necklace" (original 3456x5184) | Anton K Wibowo (@antonkwibowo) | Unsplash License |
| `linen-shirt-420.webp`, `linen-shirt-840.webp`, `slip-linen-shirt-48.webp`, `slip-linen-shirt-96.webp` | https://unsplash.com/photos/7iYNn5J4NSU "A man in a pink shirt is running" (original 5299x7944) | Bandan Mohammed (@bandan94) | Unsplash License |

Framing: one 3:4 crop per photo, head to toe, with the subject filling about 88% of the frame height and about
6.5% headroom, so all three sit at the same scale. Crop boxes in original pixels (x0, y0, x1, y1):
kurta set 0, 351, 3889, 5537 (mirrored, so the model faces the listing); t-shirt 0, 437, 3456, 5045;
linen shirt 579, 38, 4720, 5559. Hero sizes 420x560 and 840x1120 (2x the largest display size), slips 48x64 and
96x128. Weights: kurta set 840w 115KB, linen shirt 840w 71KB, t-shirt 840w 31KB, every slip under 4KB.

IMANA is an Indian fashion brand that publishes its own product photos on Unsplash. The photo pages carry no
brand restriction, so this use is accepted; no brand is named in visible copy or alt text. The linen shirt
carries a small chest logo, too small to read at display size. See `docs/DESIGN.md`, Landing hero, Photo
sources.

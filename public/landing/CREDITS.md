# Landing photo credits

Every photo was downloaded as the original JPEG from images.unsplash.com or images.pexels.com, checked with
`file`, then cropped and resized with Lanczos and saved as WebP (quality 86-88). No cut-outs, no backgrounds
removed, no upscaling. The Unsplash photos are free under the Unsplash License (https://unsplash.com/license),
not Unsplash+; the Pexels photo is free under the Pexels License (https://www.pexels.com/license/). Both allow
commercial use and editing with no attribution required. Each license was checked on its photo page on
2026-11-08. Credit is kept here anyway.

| Files | Photo page | Author | License |
|---|---|---|---|
| `kurta-set-420.webp`, `kurta-set-840.webp`, `slip-kurta-set-48.webp`, `slip-kurta-set-96.webp`, `slip-kurta-set-indigo.webp` (How it works thumbnail) | https://unsplash.com/photos/woman-in-a-floral-print-navy-blue-kurta-and-pants-1qsb5rGOcC4 (original 3889x5833) | IMANA (@imanaindia) | Unsplash License |
| `tee-420.webp`, `tee-840.webp`, `slip-tee-48.webp`, `slip-tee-96.webp` | https://unsplash.com/photos/54EWNIGurW4 "Woman in dark t-shirt, blue jeans, and gold necklace" (original 3456x5184) | Anton K Wibowo (@antonkwibowo) | Unsplash License |
| `linen-shirt-420.webp`, `linen-shirt-840.webp`, `slip-linen-shirt-48.webp`, `slip-linen-shirt-96.webp` | https://www.pexels.com/photo/elegant-man-in-pale-pink-shirt-and-gray-pants-35414994/ (original 5792x8688) | Milton Das (@miltonphotography) | Pexels License |

Framing: one 3:4 crop per photo with about 6.5% headroom. The kurta set and the t-shirt are head to toe, the
subject filling about 88% of the frame height. The linen shirt is a studio shot cut at the shins, so its crop is
the full image width from the same headroom down to below the shirt's hem (no upscaling to match). Crop boxes in
original pixels (x0, y0, x1, y1): kurta set 0, 351, 3889, 5537 (mirrored, so the model faces the listing);
t-shirt 0, 437, 3456, 5045; linen shirt 0, 318, 5792, 8041 (not mirrored, so the shirt buttons the right way).
Hero sizes 420x560 and 840x1120 (2x the largest display size), slips 48x64 and 96x128. Weights: kurta set 840w
115KB, t-shirt 840w 31KB, linen shirt 840w 29KB; the hero slips are under 3.2KB each and the How it works
thumbnail `slip-kurta-set-indigo.webp` is 5.4KB.

IMANA is an Indian fashion brand that publishes its own product photos on Unsplash. The photo pages carry no
brand restriction, so this use is accepted; no brand is named in visible copy or alt text. No product photo shows
a visible logo. See `docs/DESIGN.md`, Landing hero, Photo
sources.

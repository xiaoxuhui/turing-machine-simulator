"""Recover numerical cell tables from Cook 2009, Figures 1 and 2.

Usage: python scripts/extract-rule110-blocks.py paper.pdf [output.json]
Developer-only dependencies: pdfplumber, Pillow, numpy. No extracted pictures
are shipped. Input: https://arxiv.org/pdf/0906.3248 (DOI 10.4204/EPTCS.1.4).
"""
import json
import sys
from pathlib import Path

import numpy as np
import pdfplumber
from PIL import Image


def extract(pdf_path):
    images = {}
    with pdfplumber.open(pdf_path) as document:
        for page, letters in [(4, "ABCDEFG"), (5, "HIJKL")]:
            for item, letter in zip(document.pages[page].images, letters):
                assert item["bits"] == 8 and len(item["stream"].get_data()) == np.prod(item["srcsize"])
                images[letter] = np.asarray(Image.frombytes("L", item["srcsize"], item["stream"].get_data()))

    def edges(letter, y):
        row = images[letter][y]
        positions = np.flatnonzero((row == 0) | (row == 255))
        return int(positions[0]), int(positions[-1]) + 1

    def profile(letter, y, side):
        anchor = edges(letter, y)[side]
        return [edges(letter, y + dy)[side] - anchor for dy in range(31)]

    def bits(letter, y):
        left, right = edges(letter, y)
        return "".join("1" if value == 0 else "0" for value in images[letter][y, left:right])

    # In these figures, forward time points UP. Independently verify every
    # fully specified neighborhood, before relying on the extracted bits.
    for letter, image in images.items():
        for y in range(1, 100):
            for x in range(1, image.shape[1] - 1):
                values = [image[y, x - 1], image[y, x], image[y, x + 1], image[y - 1, x]]
                if all(value in (0, 255) for value in values):
                    a, b, c, result = [int(value == 0) for value in values]
                    assert (110 >> (4 * a + 2 * b + c)) & 1 == result, (letter, x, y)

    blocks = {}
    for letter in "ABDEFGHIJKL":
        period = 3 if letter in "AB" else 30
        phases = []
        for phase in range(period):
            candidates = [p for p in range(period) if (
                profile(letter, phase, 0) == profile("A", p, 1) if period == 3
                else profile(letter, phase, 1) == profile("D", p, 0))]
            assert len(candidates) == 1, (letter, phase, candidates)
            phases.append(candidates[0])
        blocks[letter] = {
            "rows": [bits(letter, phase) for phase in range(period)], "next": phases,
            "upDelta": [edges(letter, phase + 29)[0] - edges(letter, phase + 30)[0] for phase in range(period)],
        }
    zero_rows = np.flatnonzero(np.any(images["C"] == 179, axis=1))
    assert len(zero_rows) == 1
    zero = int(zero_rows[0])
    right = next(p for p in range(30) if profile("C", zero, 1) == profile("D", p, 0))
    left = next(p for p in range(3) if profile("C", zero, 0) == profile("A", p, 1))
    return {
        "source": "Matthew Cook (2009), arXiv:0906.3248, Figures 1 and 2. Extracted from embedded numerical cell data. Forward time is upward; black = 1.",
        "center": bits("C", zero), "rightPhase": right, "leftPhase": left, "blocks": blocks,
        "centerNext": bits("C", zero - 1), "centerDelta": edges("C", zero - 1)[0] - edges("C", zero)[0],
    }


if __name__ == "__main__":
    target = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parent.parent / "src" / "rule110-blocks.json"
    data = extract(sys.argv[1])
    target.write_text(json.dumps(data, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Verified all numerical neighborhoods; wrote {target}")

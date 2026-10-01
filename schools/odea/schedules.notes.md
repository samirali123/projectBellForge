# O'Dea schedule notes

Provenance for the bell times in `schedules.json`. JSON can't carry
comments, so the notes that used to live in `schedules.js` are kept here.

## Where the times came from

- **The original 14 schedule types** were transcribed from O'Dea's public
  "Bell Schedule" page (Student Life > Bell Schedule).
- **Maroon Day, Gold Day, and Maroon 1-Hour Late Start** were also
  cross-checked against `cyberdata_bells.sh`, which encodes times already
  confirmed against real hand-entered CyberData events for Aug 31 and
  Sept 1-4, 2026. All three match exactly.
- **The 3 Finals schedules** were transcribed from O'Dea's Finals-week
  slides ("Maroon 1 & 2 Finals", "Maroon 3 & 4 Finals", "Gold Finals 2027").
- **Back-to-School Night** was transcribed from that event's flyer (dated
  2025 there, but it's a selectable schedule type; the operator picks this
  year's actual date when running it).

## Color choices that aren't from a source

- **Unified Day:** M1-M4 are Maroon and G1-G3 are Gold, inferred from
  their labels. "Prayer Service / Mentor Group" (PS) is Black per direction.
- **Back-to-School Night:** the flyer is a plain text table with no
  color-coding. Mentor Group and Zero Period are Maroon per direction.
  The first two rows (Senior Family Night, Principal's Welcome) are
  standalone announcements with no end time on the flyer, so they're
  point events (no `end`, no Pass after them) in Grey.

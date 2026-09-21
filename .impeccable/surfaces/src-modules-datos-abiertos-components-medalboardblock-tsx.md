---
version: 1
slug: "src-modules-datos-abiertos-components-medalboardblock-tsx"
primary_target: "src/modules/datos-abiertos/components/MedalBoardBlock.tsx"
related_targets: ["src/modules/admin/udes-en-cifras/stations/MedalCapture.tsx","src/modules/boletin/medals.tsx","src/modules/datos-abiertos/data/medals.ts"]
---

# Medallero (UDES en Cifras)

Scope: the `medallero` block of a report sheet — what the university wins when it
competes: games, festivals, contests — its intranet capture station, and its
sheet in the printed bulletin. Born for Bienestar Institucional; addable to any
report.
Visitor mode: Read on the public sheet (the reader wants to understand what was
won), Operate in the intranet (the office loads the year's results and leaves).

Audience and job: Bienestar loads, event by event and year by year, how many
medals of each category the university took. The office names its own
categories (Oro/Plata/Bronce, but also Primer puesto / Mención de honor) and
names its own row column (Competencia, Campus, Disciplina). The reader — a
director, an accreditation peer — wants to know in one look whether it was a
good year and who led.

Constraints: lives inside UDES en Cifras, so Barlow Condensed signage, tabular
numerals and the board surfaces are available. The signal amber is **not**: it
means "this just arrived / this is active" and a table full of gold would kill
it. Categories are ordered but not fixed in number (1 to 8). A missing count
and a zero are different facts. The page never scrolls horizontally.

## Direction contract

THESIS: **A palmarés, not a bar chart.** The point of an Olympic medal table is
that you read the standing without reading a number, because one gold outweighs
any pile of bronze. So the medal is an object with weight on the page, and the
order is lexicographic by category — never by total. It rejects the three
numeric columns of a generic table, and it rejects medal emoji.

OWN-WORLD: Metals of its own (`--od-medal-1..3` plus a neutral tail for the
fourth category onward), measured against the board surface and kept clearly
apart from the signal amber: the gold is an antique brass, not a highlighter.
Each count sits inside a disc of its metal, tabular, one fixed size, so a column
of discs reads as a column of weight. The category name is always written in the
header — the metal never identifies alone. Zero is a hollow disc with its 0
("competed, won nothing"); a missing count is a dash on a striped ground ("did
not compete"). Row column header is whatever the office typed.

STORY: The reader lands on the block, sees the tabs of the games the office
follows, and — when the order is the medal table's own — a podium of the top
three that says the standing before any reading. Underneath, the ledger: rank,
row, a column per category, total. The year selector sits in the header when the
board reports year by year; when it reports the whole period, a period stamp
sits there instead. The origin ticket closes the block, as everywhere else.

FIRST VIEWPORT: Tab rail of boards (only when the report has more than one).
Header: title on the left, the year selector or the period stamp on the right.
Podium: three blocks at 2-1-3 heights, each with its row name and its medals.
Ledger below. Ticket at the foot.

FORM: The ledger with a podium.

FINISH: unreviewed and undocumented is unfinished; this build ends with the
finish review, the verdict and DESIGN.md.

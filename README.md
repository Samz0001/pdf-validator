# DocuDiff

Validate a customized PDF against a reference PDF: text, fonts, sizes, colours, alignment, spacing, margins,
positioning, page structure and visual layout — with a dashboard, highlighted PDF and downloadable report.

## Run it

**Docker (full stack: Postgres, Redis, MinIO, Celery worker, API, web)**
```bash
docker compose up --build
# web: http://localhost:8080   api docs: http://localhost:8000/docs
```

**Local dev (SQLite + local disk, no Redis needed)**
```bash
cd backend && pip install -r requirements.txt && mkdir -p data
uvicorn app.main:app --reload            # :8000
cd frontend && npm install && npm run dev # :5173 (proxies /api)
```

## How the comparison works

| Stage | Tooling | What it does |
|---|---|---|
| Extract | PyMuPDF, pdfplumber, pikepdf | Lines + spans (font, size, colour, bbox), images, tables, vector counts, embedded fonts, page boxes |
| Text diff | difflib | Line-level alignment → *missing / extra / changed* text |
| Format & layout | custom | Per matched line: font, size, colour, alignment, horizontal shift, line-spacing change; per page: margins, size, rotation, structure |
| Visual | OpenCV, NumPy, scikit-image | Render pages, SSIM + pixel diff, merged difference regions, heatmap overlay |
| Highlight | PyMuPDF | Annotated candidate PDF (red/orange/yellow by severity; dashed blue = content missing here) |
| Report | ReportLab | Scores, charts, issue table, visual diffs |
| Integrity | PyMuPDF, pikepdf, pyspellchecker, Tesseract | Hyperlinks, unfilled placeholders, data formats (dates/amounts/emails/phone/GSTIN/PAN), spelling of new text, table cells, images (replaced/stretched/low-DPI), accessibility (tags, language, alt text, contrast), security (JavaScript, launch actions, attachments, PDF/A, metadata leaks), bookmarks & form fields, custom must/must-not rules, optional OCR |

Issues that are only vertical drift are reported once as *spacing* (gap change), not once per following line.
Visual regions already explained by a located issue are not duplicated.

**Scoring** = 35% text, 25% formatting, 15% layout, 25% visual (renormalised if visual is off).
Verdict: `FAIL` on any critical issue or overall < 80%, `REVIEW` on any major issue or overall < 95%, else `PASS`.
All tolerances (position, font size, margin, colour distance, DPI) are adjustable in the UI / `options` field.

## API

- `POST /api/jobs` — multipart `reference`, `candidate`, optional `options` (JSON) → `202` + job
- `GET /api/jobs/{id}` — status + full result when `done`
- `POST /api/jobs` also accepts `reference_id` (a saved reference) instead of a `reference` file
- `POST /api/jobs/{id}/rerun` — same PDFs, new options JSON (e.g. `ignore_regions`)
- `POST /api/batch` — `reference` or `reference_id` + repeated `candidates` → `GET /api/batch/{id}`
- `GET|POST /api/references`, `DELETE /api/references/{id}` — golden reference library
- `GET /api/jobs/{id}/files/{reference.pdf|candidate.pdf|highlighted.pdf|report.pdf|result.json|diff_N.png}`

## Tests
```bash
cd backend && python -m pytest -q
```

## Known limits
- Scanned/image-only PDFs: enable *OCR* (needs the `tesseract` binary; included in the Docker image).
- Line matching is text-based; heavy reflow (different line breaks) shows as changed/missing + extra text.
- Tables are counted via pdfplumber; cell-level comparison isn't implemented yet.
- Schema is created on startup (`create_all`); add Alembic for production migrations. No auth is included.

## Interface
- **Validate** – hero landing, one-click *sample PDFs* demo, drag-and-drop upload with tolerances.
- **Results tabs** – Overview (score ring, key findings, clickable page heatmap), Analytics (8 charts), Inspector
  (PDF.js side-by-side with Konva highlights, diff heatmap, page navigation), Issues (search + filters; click a row to jump to it).
- **Dashboard** – KPIs, score trend, verdict donut, average quality radar, most common issues, severity mix and a
  history table to reopen or delete past validations (`GET /api/stats`).

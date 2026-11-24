# Certification Automation, Next Phase: Slides

The source of a 15-slide overview deck for the three next-phase PRDs:
[Admin App 4.2](../../PRD-AdminApp-v4.2.md),
[Automation Platform](../../PRD-Automation-Platform.md) and
[Bruno Assertion Model Generator](../../PRD-Bruno-Assertion-Model-Generator.md).
The outline it follows is
[`certification-next-phase-slide-outline.md`](../../certification-next-phase-slide-outline.md).

Drafted with AI assistance. Review it before presenting, and say AI helped
prepare it.

## Files

- **`certification-next-phase.pptx`**: the deck as an editable PowerPoint
  file, with speaker notes. Start here.
- **`content-outline.md`**: what each slide presents, with its talking points.
- **`project/`**: the same deck in claude.ai Slides format (see below).

## Slides artifact source

The `project/` files are in the format of a claude.ai Slides artifact:

- `project/deck.json`: title, slide order, sections and fonts
- `project/deck.css`: the shared styles (palette, type scale, cards, chips)
- `project/slides/<id>.html`: one `<section>` per slide, with speaker notes in
  its `<aside>`

The slides aren't standalone HTML pages. To view, present or export them as
PowerPoint or PDF, publish this folder as a Slides artifact with `root` set to
this directory. They have not been published yet.

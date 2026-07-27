from __future__ import annotations

import html
from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIRECTORY = (
    ROOT
    / "data"
    / "synthetic"
    / "operations-documents-v1"
    / "frozen-test"
    / "synthetic-parent-025"
)
OUTPUT = (
    ROOT
    / "output"
    / "pdf"
    / "upstage-synthetic-operations-document-fixture.pdf"
)
FONT_REGULAR = Path("C:/Windows/Fonts/malgun.ttf")
FONT_BOLD = Path("C:/Windows/Fonts/malgunbd.ttf")
DOCUMENTS = [
    ("합성 근무표", "shift-roster.md"),
    ("합성 배송 작업표", "delivery-work-sheet.md"),
    ("합성 배송지·운행 경로표", "route-stop-manifest.md"),
    ("합성 안전상황·사고예방 검토표", "safety-incident-prevention-report.md"),
]


def register_fonts() -> None:
    if not FONT_REGULAR.exists() or not FONT_BOLD.exists():
        raise FileNotFoundError("Malgun Gothic fonts are required for Korean PDF output")
    pdfmetrics.registerFont(TTFont("SafeRouteKorean", str(FONT_REGULAR)))
    pdfmetrics.registerFont(TTFont("SafeRouteKoreanBold", str(FONT_BOLD)))


def footer(canvas, document) -> None:
    canvas.saveState()
    canvas.setStrokeColor(HexColor("#D9E2F0"))
    canvas.line(18 * mm, 13 * mm, 192 * mm, 13 * mm)
    canvas.setFont("SafeRouteKorean", 8)
    canvas.setFillColor(HexColor("#475467"))
    canvas.drawString(18 * mm, 8 * mm, "SafeRoute AI · SYNTHETIC DEMO · 실제 운영기록 아님")
    canvas.drawRightString(192 * mm, 8 * mm, f"{document.page} / 4")
    canvas.restoreState()


def paragraph_for_line(line: str, styles: dict[str, ParagraphStyle]):
    stripped = line.strip()
    if not stripped:
        return Spacer(1, 3 * mm)
    if stripped.startswith("# "):
        return Paragraph(html.escape(stripped[2:]), styles["TitleKo"])
    if stripped.startswith("## "):
        return Paragraph(html.escape(stripped[3:]), styles["HeadingKo"])
    if stripped.startswith("> "):
        return Paragraph(
            f"비신뢰 데이터 메모 · {html.escape(stripped[2:])}",
            styles["WarningKo"],
        )
    if stripped.startswith("|"):
        return Paragraph(
            html.escape(stripped).replace(" | ", "　|　"),
            styles["TableKo"],
        )
    if stripped.startswith("- "):
        return Paragraph(
            f"• {html.escape(stripped[2:])}",
            styles["BodyKo"],
        )
    return Paragraph(html.escape(stripped), styles["BodyKo"])


def build() -> None:
    register_fonts()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    base = getSampleStyleSheet()
    styles = {
        "TitleKo": ParagraphStyle(
            "TitleKo",
            parent=base["Title"],
            fontName="SafeRouteKoreanBold",
            fontSize=18,
            leading=24,
            textColor=HexColor("#17365D"),
            alignment=TA_CENTER,
            spaceAfter=8 * mm,
        ),
        "HeadingKo": ParagraphStyle(
            "HeadingKo",
            parent=base["Heading2"],
            fontName="SafeRouteKoreanBold",
            fontSize=12,
            leading=17,
            textColor=HexColor("#1F5A60"),
            spaceBefore=3 * mm,
            spaceAfter=2 * mm,
        ),
        "BodyKo": ParagraphStyle(
            "BodyKo",
            parent=base["BodyText"],
            fontName="SafeRouteKorean",
            fontSize=9.2,
            leading=14,
            textColor=HexColor("#1D2939"),
            spaceAfter=1.2 * mm,
        ),
        "WarningKo": ParagraphStyle(
            "WarningKo",
            parent=base["BodyText"],
            fontName="SafeRouteKorean",
            fontSize=9,
            leading=14,
            textColor=HexColor("#92400E"),
            backColor=HexColor("#FFF4E2"),
            borderPadding=6,
            spaceBefore=2 * mm,
            spaceAfter=2 * mm,
        ),
        "TableKo": ParagraphStyle(
            "TableKo",
            parent=base["Code"],
            fontName="SafeRouteKorean",
            fontSize=7.5,
            leading=11,
            textColor=HexColor("#344054"),
            backColor=HexColor("#F7F9FC"),
            leftIndent=2 * mm,
            rightIndent=2 * mm,
            spaceAfter=0.5 * mm,
        ),
    }
    story = []
    for index, (title, filename) in enumerate(DOCUMENTS):
        if index:
            story.append(PageBreak())
        story.append(Paragraph(title, styles["TitleKo"]))
        story.append(
            Paragraph(
                "Upstage Document Parse 검증용 · synthetic-parent-025 · 원문은 저장하지 않음",
                styles["WarningKo"],
            )
        )
        source = (SOURCE_DIRECTORY / filename).read_text(encoding="utf-8")
        for line in source.splitlines():
            if line.startswith("# "):
                continue
            story.append(paragraph_for_line(line, styles))

    document = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=18 * mm,
        title="SafeRoute Upstage Synthetic Operations Document Fixture",
        author="SafeRoute AI",
        subject="Synthetic document parse evaluation only",
    )
    document.build(story, onFirstPage=footer, onLaterPages=footer)
    print(OUTPUT)


if __name__ == "__main__":
    build()

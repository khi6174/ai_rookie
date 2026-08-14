from __future__ import annotations

from pathlib import Path
from typing import Iterable, Sequence

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Frame, KeepTogether, Paragraph, Spacer, Table, TableStyle


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf"
OUT.mkdir(parents=True, exist_ok=True)

REPORT_PATH = OUT / "saferoute-ai-rookie-final-report-review-v2-2026-08-13.pdf"
PLEDGE_PATH = OUT / "saferoute-ai-domestic-ai-pledge-draft-2026-08-13.pdf"

FONT_DIR = Path("C:/Windows/Fonts")
pdfmetrics.registerFont(TTFont("Malgun", str(FONT_DIR / "malgun.ttf")))
pdfmetrics.registerFont(TTFont("MalgunBold", str(FONT_DIR / "malgunbd.ttf")))

PAGE_W, PAGE_H = A4
M = 42

NAVY = colors.HexColor("#08273D")
BLUE = colors.HexColor("#2563EB")
SKY = colors.HexColor("#EAF2FF")
TEAL = colors.HexColor("#0F8B83")
MINT = colors.HexColor("#E8F7F1")
AMBER = colors.HexColor("#D97706")
AMBER_BG = colors.HexColor("#FFF4DF")
RED = colors.HexColor("#B42318")
INK = colors.HexColor("#142033")
MUTED = colors.HexColor("#5F6B7A")
LINE = colors.HexColor("#CAD5E2")
PAPER = colors.HexColor("#F8FAFC")


BODY = ParagraphStyle(
    "Body",
    fontName="Malgun",
    fontSize=8.6,
    leading=12.4,
    textColor=INK,
    wordWrap="CJK",
    spaceAfter=4,
)
SMALL = ParagraphStyle(
    "Small",
    parent=BODY,
    fontSize=7.4,
    leading=10.2,
    textColor=MUTED,
)
TINY = ParagraphStyle(
    "Tiny",
    parent=BODY,
    fontSize=6.5,
    leading=8.4,
    textColor=MUTED,
)
H2 = ParagraphStyle(
    "H2",
    parent=BODY,
    fontName="MalgunBold",
    fontSize=12.2,
    leading=16,
    textColor=NAVY,
    spaceBefore=4,
    spaceAfter=6,
)
H3 = ParagraphStyle(
    "H3",
    parent=BODY,
    fontName="MalgunBold",
    fontSize=9.5,
    leading=13,
    textColor=BLUE,
    spaceBefore=3,
    spaceAfter=3,
)
WHITE = ParagraphStyle(
    "White",
    parent=BODY,
    fontName="MalgunBold",
    fontSize=9.2,
    leading=13,
    textColor=colors.white,
)
CENTER = ParagraphStyle(
    "Center",
    parent=BODY,
    alignment=TA_CENTER,
)


def p(text: str, style: ParagraphStyle = BODY) -> Paragraph:
    return Paragraph(text, style)


def bullet(text: str, style: ParagraphStyle = BODY) -> Paragraph:
    return p(f"• {text}", style)


def table(
    rows: Sequence[Sequence[object]],
    widths: Sequence[float],
    *,
    header: bool = True,
    font_size: float = 7.4,
    row_bg: colors.Color | None = None,
) -> Table:
    data: list[list[object]] = []
    for row_index, row in enumerate(rows):
        styled: list[object] = []
        for cell in row:
            if isinstance(cell, (Paragraph, Table)):
                styled.append(cell)
            else:
                style = ParagraphStyle(
                    f"tbl-{row_index}",
                    parent=SMALL,
                    fontName="MalgunBold" if header and row_index == 0 else "Malgun",
                    fontSize=font_size,
                    leading=font_size + 2.5,
                    textColor=NAVY if header and row_index == 0 else INK,
                    alignment=TA_CENTER if header and row_index == 0 else TA_LEFT,
                )
                styled.append(p(str(cell), style))
        data.append(styled)
    t = Table(data, colWidths=list(widths), repeatRows=1 if header else 0, hAlign="LEFT")
    style = [
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.45, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    if header:
        style.append(("BACKGROUND", (0, 0), (-1, 0), SKY))
        style.append(("LINEBELOW", (0, 0), (-1, 0), 1.0, BLUE))
    if row_bg:
        for idx in range(1 if header else 0, len(rows)):
            if idx % 2 == 1:
                style.append(("BACKGROUND", (0, idx), (-1, idx), row_bg))
    t.setStyle(TableStyle(style))
    return t


def draw_flow(c: canvas.Canvas, items: Iterable[object], x: float, top: float, w: float, h: float) -> None:
    story = list(items)
    frame = Frame(x, top - h, w, h, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0, showBoundary=0)
    frame.addFromList(story, c)
    if story:
        raise RuntimeError(f"Content overflowed a fixed report frame ({len(story)} items remain)")


def rounded_box(c: canvas.Canvas, x: float, y: float, w: float, h: float, fill: colors.Color, stroke: colors.Color = LINE, radius: float = 8) -> None:
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(0.7)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=1)


def image_contain(c: canvas.Canvas, path: Path, x: float, y: float, w: float, h: float, border: bool = True) -> None:
    img = ImageReader(str(path))
    iw, ih = img.getSize()
    scale = min(w / iw, h / ih)
    dw, dh = iw * scale, ih * scale
    dx, dy = x + (w - dw) / 2, y + (h - dh) / 2
    if border:
        rounded_box(c, x, y, w, h, colors.white, LINE, 7)
    c.drawImage(img, dx, dy, dw, dh, preserveAspectRatio=True, mask="auto")


def page_header(c: canvas.Canvas, number: str, title: str, subtitle: str, page_no: int) -> float:
    c.setFillColor(BLUE)
    c.roundRect(M, PAGE_H - 72, 30, 30, 4, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("MalgunBold", 14)
    c.drawCentredString(M + 15, PAGE_H - 62, number)
    c.setFillColor(NAVY)
    c.setFont("MalgunBold", 17)
    c.drawString(M + 40, PAGE_H - 58, title)
    c.setFont("Malgun", 7.4)
    c.setFillColor(MUTED)
    c.drawRightString(PAGE_W - M, PAGE_H - 58, subtitle)
    c.setStrokeColor(BLUE)
    c.setLineWidth(1.0)
    c.line(M, PAGE_H - 79, PAGE_W - M, PAGE_H - 79)
    c.setFont("Malgun", 7)
    c.setFillColor(MUTED)
    c.drawString(M, 24, "SafeRoute AI · 팀 안전빵 · 2026 AI ROOKIE 본선 제안서 · 최신 검토본 v2.0")
    c.drawRightString(PAGE_W - M, 24, f"{page_no} / 15")
    return PAGE_H - 94


def section_label(c: canvas.Canvas, x: float, y: float, text: str, fill: colors.Color = NAVY) -> None:
    c.setFillColor(fill)
    c.roundRect(x, y - 15, 115, 20, 10, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("MalgunBold", 7.4)
    c.drawCentredString(x + 57.5, y - 8.5, text)


def metric_card(c: canvas.Canvas, x: float, y: float, w: float, h: float, value: str, label: str, accent: colors.Color = BLUE) -> None:
    rounded_box(c, x, y, w, h, colors.white, LINE, 8)
    c.setFillColor(accent)
    c.setFont("MalgunBold", 15)
    c.drawString(x + 10, y + h - 24, value)
    c.setFillColor(MUTED)
    c.setFont("Malgun", 7.2)
    c.drawString(x + 10, y + 10, label)


def cover(c: canvas.Canvas) -> None:
    c.setFillColor(colors.white)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.setFillColor(BLUE)
    c.setFont("MalgunBold", 16)
    c.drawRightString(PAGE_W - 52, PAGE_H - 56, "AI ROOKIE")
    c.setStrokeColor(BLUE)
    c.setLineWidth(8)
    c.line(58, PAGE_H - 172, PAGE_W - 58, PAGE_H - 172)
    c.line(58, PAGE_H - 250, PAGE_W - 58, PAGE_H - 250)
    c.setFillColor(NAVY)
    c.setFont("MalgunBold", 25)
    c.drawCentredString(PAGE_W / 2, PAGE_H - 222, "2026년도 인공지능 루키 본선 제안서")
    c.setFillColor(BLUE)
    c.setFont("Malgun", 12)
    c.drawCentredString(PAGE_W / 2, PAGE_H - 332, "2026. 08. 13.")
    c.setFont("MalgunBold", 7.6)
    c.drawCentredString(PAGE_W / 2, PAGE_H - 348, "최신 승인 시연 흐름 반영 · 제품 스냅샷 9af7752 · 검토본 v2.0")
    c.setFillColor(NAVY)
    c.setFont("MalgunBold", 17)
    c.drawCentredString(PAGE_W / 2, PAGE_H - 382, "SafeRoute AI")
    c.setFont("Malgun", 10)
    c.drawCentredString(PAGE_W / 2, PAGE_H - 402, "미래 안전한계 예측 기반 라스트마일 안전운영 코파일럿")

    rows = [
        ["프로젝트명", "SafeRoute AI"],
        ["팀명", "안전빵"],
        ["팀대표명", "김용우"],
        ["팀대표 소속", "명지전문대학 전자공학과 · 학년 제출 전 확인"],
        ["팀 구성 인원", "2명"],
        ["지원트랙", "■ 국내 AI 트랙  /  □ 일반 트랙"],
        ["연계기업", "■ 업스테이지  ■ SKT  ■ LG AI연구원"],
    ]
    t = table(rows, [125, 350], header=False, font_size=9)
    t.wrapOn(c, 475, 220)
    t.drawOn(c, 60, 108)
    c.setFillColor(AMBER_BG)
    c.roundRect(60, 72, 475, 24, 5, fill=1, stroke=0)
    c.setFillColor(AMBER)
    c.setFont("MalgunBold", 7.7)
    c.drawString(70, 80, "제출 전 확인: 대표 학년 · 팀원 성명 · 교육 참석 · 영상 URL · 대표 서명")


def page_1(c: canvas.Canvas) -> None:
    top = page_header(c, "1", "일반사항", "도전배경 · 목적 · 기술 동향", 1)
    draw_flow(
        c,
        [
            p("1.1 도전과제명", H2),
            p("<b>SafeRoute AI: 미래 안전한계 예측 기반 라스트마일 안전운영 코파일럿</b>"),
            p("1.2 한줄 요약", H2),
            p("남은 배송계획을 계속 수행할 때 안전한계가 언제·어디서 초과될지 예측하고, 위험을 다른 기사에게 전가하지 않는 개입안을 기사 동의와 관리자 승인 아래 운영계획에 반영합니다."),
            p("1.3 도전배경 및 목적", H2),
            p("라스트마일 운영은 거리·ETA·비용·완료율을 중심으로 최적화되어 왔지만, 장시간 작업·시간 압박·강수·야간·경사·과도한 잔여 물량이 결합될 때 <b>현재 계획이 앞으로도 안전한지</b>를 설명하고 바꾸는 기능은 부족합니다. 국내 산업안전보건연구원 연구도 택배기사의 장시간 노동, 야간작업, 배송량, 교통사고와 중량물 취급이 얽힌 복합 위험을 지적했습니다.[1]"),
            p("2025년 체계적 문헌고찰은 32개 연구, 라스트마일 종사자 38,682명의 결과를 종합해 시간 압박·알고리즘 통제·업무량 같은 열악한 조건이 스트레스·피로·번아웃과 위험한 주행 행동에 연결된다고 보고했습니다.[2] 별도의 장시간 노동 메타분석에서는 주 55시간 초과군의 안전사고 위험이 통합 RR 1.42(95% CI 1.06~1.91)로 높았지만, 연구진은 근거 확실성이 낮다는 한계도 함께 밝혔습니다.[3] 따라서 SafeRoute는 실제 사고감소 효과를 단정하지 않고, <b>계획 단계의 예방적 의사결정 지원</b>을 검증 대상으로 삼습니다."),
            p("SafeRoute는 사고확률이나 건강진단을 예측하지 않습니다. 대신 0~100의 결정론적 <b>Safety Budget</b>, 첫 예상 초과까지의 <b>Time-to-Breach</b>, 신뢰도와 결측 상태를 함께 보여줍니다. 안전은 ETA·거리·비용과 교환하는 가중치가 아니라 후보를 먼저 걸러내는 하드 제약입니다."),
            p("1.4 왜 지금 필요한가", H2),
            bullet("<b>정책 수요</b> · 정부는 택배기사 과로 방지를 위해 작업시간 관리, 심야배송 제한, 분류작업·표준계약서 개선과 종사자 보호를 지속 과제로 두고 있습니다.[4] 운영 현장에서 ‘누구를 언제 어떻게 지원했는지’ 남기는 실행 체계가 필요합니다."),
            bullet("<b>기술 수요</b> · 운송 최적화 연구는 법정 운행시간만으로는 피로 요인을 충분히 다루기 어렵고, 경로·일정 계획에 피로 제약을 직접 포함할 필요가 있음을 보였습니다.[5] SafeRoute는 이를 라스트마일의 남은 배송지별 동적 안전한계와 개입 비교로 구체화합니다."),
            bullet("<b>권리·거버넌스 수요</b> · ILO의 물류 현장 연구는 알고리즘 관리의 효율성과 함께 직무 질 저하·침습적 감시 위험을 경고합니다.[6] NIST AI RMF도 인간-AI 역할, 사람의 감독, 문서화와 이의제기 경로를 명확히 하도록 권고합니다.[7] 그래서 기사에게 동의·수정·거절·이의제기 권리를 제공하고 AI의 판정 권한을 제한했습니다."),
            Spacer(1, 5),
            p("SafeRoute의 기회는 센서 하나를 더 만드는 데 있지 않습니다. <b>예측 → 설명 → 개입 비교 → 위험전가 검사 → 동의·승인 → 계획 적용 → 감사</b>를 끊김 없이 연결해 안전을 운영계획의 선행조건으로 만드는 데 있습니다.", ParagraphStyle("call", parent=BODY, fontName="MalgunBold", textColor=TEAL, backColor=MINT, borderPadding=8, borderColor=TEAL, borderWidth=0.5)),
            Spacer(1, 6),
            p("근거 자료", H3),
            p("[1] 산업안전보건연구원, 「택배기사 적정 근로시간에 관한 연구」(2021) · [2] Journal of Transport & Health 44, 102133 (2025), doi:10.1016/j.jth.2025.102133 · [3] Scandinavian Journal of Work, Environment & Health, 장시간 노동 안전사고 체계적 문헌고찰·메타분석 (2021)", TINY),
            p("[4] 국토교통부 2025 업무계획 · [5] Fu & Ma, Transportation Science 56(2), 404–435, doi:10.1287/trsc.2021.1089 · [6] ILO/JRC, Algorithmic Management Practices in Logistics and Healthcare (2024) · [7] NIST AI RMF 1.0 Core (2023)", TINY),
            p("https://oshri.kosha.or.kr/oshri/publication/researchReportSearch.do?articleNo=425505&attachNo=240520&mode=download  |  https://doi.org/10.1016/j.jth.2025.102133  |  https://pmc.ncbi.nlm.nih.gov/articles/PMC8504541/", TINY),
            p("https://www.molit.go.kr/2025plan/total/total_04.jsp  |  https://doi.org/10.1287/trsc.2021.1089  |  https://www.ilo.org/publications/algorithmic-management-practices-regular-workplaces-case-studies-logistics  |  https://airc.nist.gov/airmf-resources/airmf/5-sec-core/", TINY),
        ],
        M,
        top,
        PAGE_W - 2 * M,
        top - 42,
    )


def page_2(c: canvas.Canvas) -> None:
    top = page_header(c, "1", "일반사항", "유사 기술 비교 · 예선 대비 변경", 2)
    rows = [
        ["비교 축", "경로·배차 최적화", "운전자 경고·점수", "SafeRoute AI"],
        ["핵심 질문", "더 빠르게 배송?", "현재 위험 신호?", "현재 계획을 유지하면 언제·어디서 한계 초과?"],
        ["판정 시점", "계획 수립", "현재/과거 이벤트", "남은 배송지별 미래 시뮬레이션"],
        ["안전 처리", "비용·ETA와 가중합 가능", "기사 알림 중심", "불안전 후보 선제 제외"],
        ["형평성", "물량 균형 중심", "개인 점수 중심", "수신 기사 Safety Budget 재검사"],
        ["실행 통제", "자동 배차 가능", "경고 확인", "원·수신 기사 동의 + 관리자 승인"],
        ["AI 권한", "최적화 산출", "분류·탐지", "수치·판정은 엔진, AI는 검증 사실 설명"],
    ]
    draw_flow(c, [p("1.5 유사 기술 비교 및 차별점", H2), table(rows, [68, 118, 112, 205], row_bg=PAPER)], M, top, PAGE_W - 2 * M, 260)

    y = top - 278
    rows2 = [
        ["구분", "예선 도전제안서", "본선 구현 결과", "변경 이유"],
        ["문제 표현", "사고 위험도 0~100", "운영 위험지수·Safety Budget·Time-to-Breach", "사고확률 오인 방지"],
        ["개입", "휴식·분산·경로·지연 제안", "5종 반사실적 비교 + 실행 가능성", "비교 가능한 의사결정"],
        ["형평성", "분산 제안", "Risk Transfer Guard로 수신 기사 한계 재검사", "위험 전가 차단"],
        ["통제", "관리자·기사 확인", "원·수신 기사 동의 + 관리자 승인 상태기계", "권리와 책임 명확화"],
        ["계획 적용", "스케줄 재조정 제안", "경로·순서·물량·ETA·고객안내 원자 갱신", "폐루프 완결"],
        ["운영 범위", "단일 Mock 대시보드", "합성 기사 25명·3권역, 기사 PWA, 승인 폐루프", "본선 시연 재현성"],
        ["국내 AI", "Upstage 중심 계획", "Upstage 런타임 + SKT/LG 자격 평가, 국내 AI만 감사", "모델 경계 증명"],
        ["데이터", "공공데이터 활용 계획", "합성 운영이 기본, 기상·지도는 출처 표기·Fallback", "Live/Mock 혼동 방지"],
    ]
    draw_flow(c, [p("1.6 도전제안서 대비 변경 사항", H2), table(rows2, [62, 120, 183, 138], row_bg=PAPER, font_size=7.1)], M, y, PAGE_W - 2 * M, y - 42)


def draw_closed_loop(c: canvas.Canvas, x: float, y: float, w: float) -> None:
    labels = ["미래 초과 예측", "원인·신뢰도", "개입 비교", "위험전가 검사", "기사 동의", "관리자 승인", "계획·ETA 적용", "감사기록"]
    gap = 5
    box_w = (w - gap * 3) / 4
    box_h = 43
    for i, label in enumerate(labels):
        row, col = divmod(i, 4)
        bx = x + col * (box_w + gap)
        by = y + (1 - row) * 62
        fill = SKY if i < 4 else MINT
        stroke = BLUE if i < 4 else TEAL
        rounded_box(c, bx, by, box_w, box_h, fill, stroke, 7)
        c.setFillColor(stroke)
        c.setFont("MalgunBold", 7.3)
        c.drawCentredString(bx + box_w / 2, by + 24, f"{i + 1:02d}")
        c.setFillColor(NAVY)
        c.setFont("Malgun", 7.2)
        c.drawCentredString(bx + box_w / 2, by + 10, label)


def page_3(c: canvas.Canvas) -> None:
    top = page_header(c, "2", "아이디어 및 핵심 솔루션", "어떤 문제를 · 어떤 아이디어로 · 어떻게", 3)
    draw_flow(c, [p("2.1 핵심 아이디어", H2), p("SafeRoute는 안전을 화면의 경고가 아니라 <b>배송계획이 실행되기 전에 통과해야 하는 제약</b>으로 바꿉니다. 선택 기사만 좋아지는 계획이 아니라, 영향을 받는 모든 기사의 미래 Safety Budget을 다시 계산한 뒤 사람이 근거를 확인하고 적용합니다.")], M, top, PAGE_W - 2 * M, 88)
    section_label(c, M, top - 97, "P0 CLOSED LOOP")
    draw_closed_loop(c, M, top - 250, PAGE_W - 2 * M)
    y = top - 298
    rounded_box(c, M, y - 188, PAGE_W - 2 * M, 176, PAPER, LINE, 10)
    c.setFillColor(NAVY)
    c.setFont("MalgunBold", 12)
    c.drawString(M + 16, y - 34, "최신 승인 대표 시나리오(합성 기사 활용) · 문상혁 기사 안전지원")
    scenario_rows = [
        ["미래 예측", "화면의 현재 평가시각을 기준으로 예상 지원 시점과 배송 순서를 표시"],
        ["대안 비교", "15분 휴식과 배송 4건 분담을 서로 다른 개입안으로 비교"],
        ["선택 개입", "안재민 기사에게 배송 4건 분담"],
        ["위험전가 검사", "안재민 기사의 분담 후 Safety Budget이 기준 45를 통과할 때만 허용"],
        ["사람 통제", "문상혁·안재민 기사 각각 동의 후 관리자가 최신 검사 결과를 승인"],
        ["적용 결과", "경로·배송순서·물량·ETA·고객안내·감사기록을 한 번에 갱신"],
    ]
    t = table(scenario_rows, [95, 360], header=False, font_size=8)
    t.wrapOn(c, 455, 130)
    t.drawOn(c, M + 16, y - 172)
    draw_flow(c, [p("기존 접근과의 차이", H2), bullet("사고가 난 뒤 설명하는 대신 현재 계획의 <b>첫 미래 한계 초과</b>를 배송지 단위로 예측합니다."), bullet("최적 점수 하나를 고르는 대신 불안전 후보를 먼저 제외하고, 안전한 후보 안에서만 ETA·복잡도를 비교합니다."), bullet("기사 순위나 감시 지표가 아니라 지원 필요 상황·수정 권리·감사 가능한 승인 근거를 제공합니다.")], M, y - 210, PAGE_W - 2 * M, 126)


def draw_architecture(c: canvas.Canvas, x: float, y: float, w: float, h: float) -> None:
    rounded_box(c, x, y, w, h, colors.white, LINE, 10)
    cols = [
        ("입력·출처", ["합성 운영문서", "기상·지도 상태", "기사 응답"]),
        ("결정론 엔진", ["Safety Budget", "Time-to-Breach", "Risk Transfer Guard"]),
        ("사람의 통제", ["원·수신 기사", "관리자 승인", "원자적 적용"]),
        ("결과", ["경로·순서·ETA", "고객안내", "감사·내보내기"]),
    ]
    gap = 12
    cw = (w - 36 - gap * 3) / 4
    for i, (title, items) in enumerate(cols):
        bx = x + 18 + i * (cw + gap)
        rounded_box(c, bx, y + 40, cw, h - 64, SKY if i in (0, 3) else MINT, BLUE if i in (0, 3) else TEAL, 7)
        c.setFillColor(NAVY)
        c.setFont("MalgunBold", 8.3)
        c.drawCentredString(bx + cw / 2, y + h - 47, title)
        c.setFont("Malgun", 6.9)
        for j, item in enumerate(items):
            c.drawCentredString(bx + cw / 2, y + h - 69 - j * 17, item)
        if i < 3:
            c.setFillColor(BLUE)
            c.setFont("MalgunBold", 12)
            c.drawCentredString(bx + cw + gap / 2, y + h / 2, "→")
    c.setFillColor(NAVY)
    c.roundRect(x + 80, y + 8, w - 160, 24, 6, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("MalgunBold", 7.4)
    c.drawCentredString(x + w / 2, y + 17, "국내 AI 증거 계층: 검증된 사실을 역할별로 설명 · 수치/추천/실행 가능성 변경 금지")


def page_4(c: canvas.Canvas) -> None:
    top = page_header(c, "2", "인공지능 활용 방안", "국내 AI는 설명·문서 계층, 판정은 결정론 엔진", 4)
    draw_flow(c, [p("2.2 인공지능 활용 원칙", H2), p("AI가 Safety 수치나 추천을 새로 만들지 않도록 권한을 분리했습니다. 모든 수치·위험 밴드·후보 실행 가능성·추천 순위·최종 적용 상태는 버전이 있는 TypeScript 엔진이 계산하고, 국내 AI는 검증된 JSON과 인용을 받아 관리자·기사·고객용 설명을 생성합니다. 응답 스키마가 틀리거나 타임아웃이면 명시적 안전 템플릿으로 전환됩니다.")], M, top, PAGE_W - 2 * M, 92)
    draw_architecture(c, M, top - 335, PAGE_W - 2 * M, 225)
    y = top - 360
    rows = [
        ["구성", "구현", "안전 경계"],
        ["Upstage", "solar-pro3 역할별 설명, Document Parse PDF→Markdown, strict JSON 추출", "새 숫자·추천 변경 금지, 원문·원시 응답 미보존"],
        ["SKT·LG", "A.X·K-EXAONE 공통 12과업 자격·반례 평가", "공개 P0 판정 비의존, 공급자별 Gate"],
        ["데이터", "개인식별정보 없는 합성 문서·fixtures, 공공 기상·교통 맥락", "live/mock/fallback 출처 표시"],
        ["프롬프트", "허용 사실·표시값·역할·행동·인용만 전달", "PII·정밀좌표 제거, prompt injection 무시"],
        ["배포", "React·TypeScript·Vite, Sites Worker 서버 프록시, Zod 검증", "secret 서버 전용, 브라우저 직접 호출 차단"],
    ]
    draw_flow(c, [table(rows, [88, 230, 185], row_bg=PAPER, font_size=7.2), Spacer(1, 8), p("AI가 문장을 바꾸더라도 Safety Budget, 실행 가능성, 추천 후보, 적용 결과가 달라지지 않는지를 단위·계약 테스트로 고정했습니다.", ParagraphStyle("ai-note", parent=BODY, fontName="MalgunBold", textColor=TEAL, backColor=MINT, borderPadding=7))], M, y, PAGE_W - 2 * M, y - 42)


def page_5(c: canvas.Canvas) -> None:
    top = page_header(c, "3", "개발 성과 요약", "합성 운영 MVP · 폐루프 구현", 5)
    draw_flow(c, [p("3.1.1 개발 목표", H2), p("남은 배송계획의 미래 Safety Budget을 예측하고, 다섯 개 개입을 비교하여 위험전가를 차단한 뒤, 원·수신 기사 동의와 관리자 승인 아래 실제 계획 상태를 갱신하는 본선용 합성 운영 서비스를 완성하는 것을 목표로 했습니다.")], M, top, PAGE_W - 2 * M, 73)
    card_y = top - 150
    metric_card(c, M, card_y, 115, 58, "25명", "합성 기사 · 3개 권역", TEAL)
    metric_card(c, M + 128, card_y, 115, 58, "5종", "휴식·이관·순서·경로·지연", BLUE)
    metric_card(c, M + 256, card_y, 115, 58, "2+1", "두 기사 동의 + 관리자 승인", AMBER)
    metric_card(c, M + 384, card_y, 115, 58, "0건", "SafeRoute 하드제약 위반", TEAL)
    img = ROOT / "artifacts" / "demo-screenshots" / "final-video-2026" / "01-control-tower.png"
    image_contain(c, img, M, 118, PAGE_W - 2 * M, 340)
    c.setFillColor(MUTED)
    c.setFont("Malgun", 7.2)
    c.drawCentredString(PAGE_W / 2, 103, "그림 1. 최신 승인 대표 시나리오(합성 기사 활용) · 자막 없는 관리자 Control Tower 화면")
    rounded_box(c, M, 50, PAGE_W - 2 * M, 40, MINT, TEAL, 7)
    c.setFillColor(NAVY)
    c.setFont("MalgunBold", 8.2)
    c.drawString(M + 12, 72, "개발 성과 핵심")
    c.setFont("Malgun", 7.3)
    c.drawString(M + 12, 57, "단일 화면 목업을 넘어 기사 응답 대기 → 관리자 승인 → 계획·ETA·고객안내 갱신까지 실제 상태 전이로 구현했습니다.")


def page_6(c: canvas.Canvas) -> None:
    top = page_header(c, "3", "주요 기능 명세 I", "Safety Engine · Intervention Engine", 6)
    rows = [
        ["기능", "개요 및 주요 동작", "개발·검증 상태"],
        ["Dynamic Safety Envelope", "근무·작업량·날씨·경로·휴식 입력으로 배송지별 Safety Budget 시계열 계산", "순수 함수·버전 설정, 정확값·경계·단조성 테스트"],
        ["Time-to-Breach", "예측 구간의 첫 임계치 초과 시각·남은 배송 순번·stop ID·Budget 반환", "초과 없음 상태를 별도 값으로 표현"],
        ["기여요인·신뢰도", "위험 기여도와 결측 목록, HIGH/MEDIUM/LOW 입력 신뢰도", "결측 증가 시 신뢰도 상승 금지"],
        ["Intervention Engine", "휴식·물량이관·순서변경·안전경로·Safe Delay를 각각 재계산", "안전 후보 안에서 ETA·복잡도 비교"],
        ["Risk Transfer Guard", "수신 기사 Budget·용량·시간창·권역·차량·동의 상태 재검사", "차단 사유를 비교 화면에 유지"],
        ["시나리오 Planning", "날짜·시간·남은 배송·근무·연속작업·양측 안전여유를 바꿔 즉시 재계산", "실제 연결이 아닌 합성 가정임을 명시"],
    ]
    draw_flow(c, [p("3.2.1~3.2.3 기능 명칭·개요·진행 현황", H2), table(rows, [94, 244, 165], row_bg=PAPER, font_size=7.25)], M, top, PAGE_W - 2 * M, 300)
    y = top - 325
    rounded_box(c, M, y - 160, PAGE_W - 2 * M, 150, PAPER, LINE, 10)
    c.setFillColor(NAVY)
    c.setFont("MalgunBold", 11)
    c.drawString(M + 16, y - 34, "안전 후보 선택 규칙")
    steps = [
        ("1", "모든 후보 재계산", "원 기사와 영향 기사 계획을 같은 평가시각에서 계산"),
        ("2", "하드 제약 필터", "임계치·용량·시간창·권역·동의를 위반하면 차단"),
        ("3", "안전 후보 비교", "남은 후보 안에서 ETA·운영복잡도·고객영향 비교"),
        ("4", "사람의 결정", "기사 응답과 관리자 승인 후에만 적용 가능"),
    ]
    for i, (n, title, detail) in enumerate(steps):
        bx = M + 16 + i * 119
        c.setFillColor(BLUE if i < 2 else TEAL)
        c.circle(bx + 13, y - 72, 12, fill=1, stroke=0)
        c.setFillColor(colors.white)
        c.setFont("MalgunBold", 8)
        c.drawCentredString(bx + 13, y - 75, n)
        c.setFillColor(NAVY)
        c.setFont("MalgunBold", 7.2)
        c.drawString(bx, y - 96, title)
        draw_flow(c, [p(detail, TINY)], bx, y - 104, 108, 42)
    draw_flow(c, [p("핵심 불변식", H2), bullet("강수·연속근무·남은 작업량·경로위험이 증가해도 Budget이 좋아지지 않습니다."), bullet("휴식 시간이 늘어나면 회복 효과가 악화되지 않습니다."), bullet("물량이관 후 수신 기사가 최소 안전범위를 벗어나면 후보는 실행 불가입니다.")], M, y - 190, PAGE_W - 2 * M, 120)


def page_7(c: canvas.Canvas) -> None:
    top = page_header(c, "3", "주요 기능 명세 II", "Decision Workflow · Plan Apply · PWA", 7)
    rows = [
        ["기능", "개요 및 주요 동작", "완료 근거"],
        ["Decision State Machine", "후보 선택, 기사 요청, 원·수신 응답, 보류·거절·수정, 승인, 적용 상태", "동일 decision ID·만료·중복·경쟁조건 테스트"],
        ["Two-Key Consent", "영향 기사들이 각자 근거를 보고 응답; 관리자는 최신 응답 재조회 후 승인", "대리 응답·동의 전 승인 차단"],
        ["Atomic Plan Apply", "경로·배송순서·물량·ETA·고객안내·감사 이벤트 동시 갱신", "실패 롤백·재실행 멱등성"],
        ["관리자 웹", "지도, 향후 60분 지원 우선순위, 개입 비교, 승인 근거", "1440×900·1280×720 검증"],
        ["기사 PWA", "한 화면 한 결정, safe-until, 동의·수정·거절, 최소 44px 터치", "390×844·360×800·키보드 검증"],
        ["운영 문서", "합성 근무표·배송표·경로표·안전검토표 해시·참조·strict 추출", "100문서/25 상위 레코드 계약"],
        ["AI 설명", "관리자·기사·고객·보고서 역할별 설명과 인용, Fallback", "새 숫자·비난·스키마 위반 차단"],
    ]
    draw_flow(c, [p("3.2.1~3.2.3 기능 명칭·개요·진행 현황", H2), table(rows, [92, 246, 165], row_bg=PAPER, font_size=7.05)], M, top, PAGE_W - 2 * M, 330)
    y = top - 350
    rounded_box(c, M, y - 118, PAGE_W - 2 * M, 106, MINT, TEAL, 10)
    c.setFillColor(NAVY)
    c.setFont("MalgunBold", 13)
    c.drawString(M + 18, y - 38, "3.2.4 진척도 · 본선 합성 Demo 목표 95%")
    c.setFillColor(colors.white)
    c.roundRect(M + 18, y - 72, PAGE_W - 2 * M - 36, 12, 6, fill=1, stroke=0)
    c.setFillColor(TEAL)
    c.roundRect(M + 18, y - 72, (PAGE_W - 2 * M - 36) * 0.95, 12, 6, fill=1, stroke=0)
    c.setFont("Malgun", 7.3)
    c.setFillColor(INK)
    c.drawString(M + 18, y - 96, "핵심 P0 폐루프와 자동 Gate는 완료. 남은 5%는 실제 발표 PC 확인, 제출 URL·서명·교육 이력 입력, 독립 2.5D 재검토입니다.")
    draw_flow(c, [p("범위 경계", H2), p("향후 실제 기사 GPS·TMS 연동, 인증 및 고객 메시지 발송 기능을 단계적으로 연결해 <b>실서비스 수준으로 고도화</b>하고, 별도 현장 Pilot에서 안전성과 운영 효과를 검증할 예정입니다.")], M, y - 145, PAGE_W - 2 * M, 92)


def page_8(c: canvas.Canvas) -> None:
    top = page_header(c, "3", "시스템·서비스 구현 화면", "관리자와 기사가 같은 결정 근거를 사용", 8)
    shots = ROOT / "artifacts" / "demo-screenshots" / "final-video-2026"
    admin = shots / "03-support-comparison.png"
    source_rider = shots / "05-source-rider-consent.png"
    recipient_rider = shots / "06-recipient-rider-consent.png"
    applied = shots / "08-plan-applied.png"
    c.setFillColor(TEAL)
    c.setFont("MalgunBold", 8.2)
    c.drawString(M, top - 22, "최신 승인 대표 시나리오(합성 기사 활용) 화면")
    image_contain(c, admin, M, top - 260, PAGE_W - 2 * M, 220)
    c.setFont("Malgun", 7)
    c.setFillColor(MUTED)
    c.drawString(M, top - 275, "그림 2. 자막 없는 지원안 비교 · 실행 가능/차단 사유")
    image_contain(c, source_rider, M, 118, 116, 245)
    image_contain(c, recipient_rider, M + 126, 118, 116, 245)
    image_contain(c, applied, M + 252, 118, 251, 245)
    c.setFillColor(MUTED)
    c.setFont("Malgun", 7)
    c.drawString(M, 101, "그림 3. 합성 원 기사 동의")
    c.drawString(M + 126, 101, "그림 4. 합성 수신 기사 동의")
    c.drawString(M + 252, 101, "그림 5. 승인 후 계획 적용")
    c.setFillColor(NAVY)
    c.setFont("MalgunBold", 8)
    c.drawCentredString(PAGE_W / 2, 58, "관리자와 기사 화면은 같은 decision ID, 후보, 수치, 수신 기사, 적용 결과를 공유합니다.")


def page_9(c: canvas.Canvas) -> None:
    top = page_header(c, "3", "구현 결과 검증", "현재 세션 재검증 + 보존된 릴리스 증거", 9)
    rows = [
        ["검증", "결과", "시점·해석"],
        ["TypeScript typecheck", "PASS", "2026-08-13 현재 세션"],
        ["Vitest 단위·계약", "462/462 · 76파일", "2026-08-13 현재 세션"],
        ["Production build", "PASS · 206 modules", "2026-08-13 현재 세션"],
        ["국내 트랙 자동감사", "7/7 PASS · 191 tracked files", "2026-08-13 현재 세션"],
        ["Playwright E2E", "58/58", "2026-08-10 보존 릴리스 Gate"],
        ["Clean-start", "3/3", "서버 재기동 포함 보존 증거"],
        ["전략 비교", "30 변형 · 90 비교 · 위반 0", "합성 시뮬레이션, 현장 효과 아님"],
        ["경계 테스트", "Risk Transfer 23/23 · Workflow 30/30", "정확 경계·동의·경쟁조건"],
        ["화면·접근성", "4 지정 해상도 · 6 checks", "색 외 상태·키보드·overflow"],
    ]
    draw_flow(c, [p("3.3.1 자체 검증 결과", H2), table(rows, [145, 150, 208], row_bg=PAPER, font_size=7.3)], M, top, PAGE_W - 2 * M, 286)
    y = top - 305
    c.setFillColor(NAVY)
    c.setFont("MalgunBold", 10)
    c.drawString(M, y, "합성 운영 부하 평가")
    profiles = [(24, 1.468, 5), (96, 5.507, 15), (240, 15.778, 40)]
    chart_x, chart_y, chart_w, chart_h = M, y - 164, 290, 135
    rounded_box(c, chart_x, chart_y, chart_w, chart_h, colors.white, LINE, 8)
    max_sec = 40
    for idx, (couriers, sec, budget) in enumerate(profiles):
        by = chart_y + 88 - idx * 31
        c.setFillColor(MUTED)
        c.setFont("Malgun", 7)
        c.drawRightString(chart_x + 55, by + 3, f"{couriers}명")
        c.setFillColor(SKY)
        c.roundRect(chart_x + 65, by, 190, 12, 6, fill=1, stroke=0)
        c.setFillColor(TEAL)
        c.roundRect(chart_x + 65, by, 190 * sec / max_sec, 12, 6, fill=1, stroke=0)
        c.setFillColor(NAVY)
        c.drawString(chart_x + 65 + 190 * sec / max_sec + 4, by + 2, f"{sec:.3f}s / {budget}s")
    c.setFillColor(MUTED)
    c.setFont("Malgun", 6.6)
    c.drawString(chart_x + 15, chart_y + 12, "동일 실행환경의 합성 스냅샷 준비시간 · 모든 프로파일 예산 내 통과")
    draw_flow(c, [p("국내 AI 검증", H2), bullet("Upstage solar-pro3 Live 12과업 12/12, 평균 1,502ms, p95 2,052ms (2026-07-27)."), bullet("Upstage 문서 Parse는 합성 PDF 필수 marker 14/14, strict 추출 exact-match, prompt injection 수용 0건."), bullet("A.X v2는 잠금 과업 12/12, validation 300/300, frozen 300/300; 현재 공개 런타임 활성화 근거가 아닌 자격 증거입니다."), Spacer(1, 4), p("모든 평가 내 숫자는 합성된 Live 자격평가입니다. 실제 사고 및 현장 생산성 향상으로 해석하지 않습니다.", ParagraphStyle("limit", parent=SMALL, fontName="MalgunBold", textColor=AMBER, backColor=AMBER_BG, borderPadding=6))], M + 310, y, 193, 190)


def page_10(c: canvas.Canvas) -> None:
    top = page_header(c, "3", "창의성·혁신성·학습 성과", "책임 있는 AI와 제품 경계", 10)
    left_w = 246
    draw_flow(c, [p("3.3.2 창의성·도전성", H2), bullet("정적 위험점수 대신 남은 stop별 Time-to-Breach를 계산했습니다."), bullet("안전과 ETA를 가중합하지 않고, 불안전 후보를 먼저 제외했습니다."), bullet("물량이관이 수신 기사를 위험하게 만들면 추천 전에 차단합니다."), bullet("양쪽 기사 동의와 관리자 승인을 실제 상태기계로 구현했습니다."), bullet("국내 AI의 역할을 설명·문서로 제한해 판정 권한을 분리했습니다."), p("3.3.3 팀 학습 성과", H2), bullet("React·TypeScript 기반 도메인 엔진과 UI 상태 분리"), bullet("Zod strict 계약, 원자 적용·롤백·멱등성 설계"), bullet("Playwright 다중 viewport·접근성·clean-start 자동화"), bullet("Upstage Document Parse·solar-pro3, A.X·K-EXAONE 공통 Gate"), bullet("합성 데이터 계보·해시·원문 미보존 정책")], M, top, left_w, 450)
    draw_flow(c, [p("3.3.4 신뢰성·윤리 고려사항", H2), table([
        ["위험", "적용한 방어"],
        ["AI 환각·수치 변조", "허용 사실 whitelist, strict JSON, 새 숫자 거부"],
        ["위험 전가", "수신 기사 Budget·용량·동의 하드 제약"],
        ["감시·징계", "기사 순위·성과 표현 금지, 지원 중심 언어"],
        ["개인정보", "가명 합성 데이터, 원시 생체·정밀 GPS 미수집"],
        ["Live 오인", "Live/Mock/Error/Fallback 상태와 출처 표시"],
        ["자동 집행", "기사 동의 + 관리자 승인 전 계획 변경 금지"],
        ["효과 과장", "합성 지표를 사고감소·현장 KPI로 주장 금지"],
    ], [102, 145], row_bg=PAPER, font_size=7.1)], M + 262, top, 247, 330)
    y = top - 360
    draw_flow(c, [p("대회 교육·멘토링 참석 이력 · 제출 전 확인", H2), table([
        ["분류", "기관", "참석", "인원·성명"],
        ["공통교육", "대회 운영", "확인 필요", "확인 필요"],
        ["국내 AI 활용", "KT", "확인 필요", "확인 필요"],
        ["국내 AI 활용", "LG AI연구원", "확인 필요", "확인 필요"],
        ["국내 AI 활용", "NC AI", "확인 필요", "확인 필요"],
        ["국내 AI 활용", "SKT", "확인 필요", "확인 필요"],
        ["국내 AI 활용", "업스테이지", "확인 필요", "확인 필요"],
    ], [105, 125, 90, 180], row_bg=PAPER, font_size=7.1)], M, y, PAGE_W - 2 * M, 205)


def page_11(c: canvas.Canvas) -> None:
    top = page_header(c, "4", "연구 지원 활용 성과", "GPU · 국내 AI API · 공공데이터", 11)
    rows = [
        ["구분", "활용자원", "활용 규모", "성과·비고"],
        ["GPU", "NVIDIA A100", "활용 시간: 300시간", "A.X-4.0-Light 고정 revision LoRA v2 자격·offline 평가 증거 생성"],
        ["국내 AI API", "Upstage solar-pro3", "Live 12과업", "역할별 설명 12/12, 평균 1,502ms"],
        ["국내 문서 AI", "Upstage Document Parse", "합성 PDF 1건 Live", "필수 marker 14/14, strict 추출 exact-match"],
        ["국내 AI API", "SKT A.X-K1", "Live 12과업", "공통 strict 계약 12/12, 공개 P0 비의존"],
        ["국내 AI API", "LG K-EXAONE", "Live 12과업", "공통 strict 계약 12/12, 반례 평가"],
    ]
    draw_flow(c, [p("4.1 연구 지원 활용 항목", H2), table(rows, [74, 125, 105, 199], row_bg=PAPER, font_size=7.05)], M, top, PAGE_W - 2 * M, 240)
    y = top - 260
    rows2 = [
        ["항목", "제공기관", "활용 목적", "표시·경계"],
        ["기상청 API 허브", "기상청", "ASOS 날짜·시간 강수·시정 맥락", "활용신청 403은 PERMISSION_REQUIRED로 표시"],
        ["Kakao Maps·Mobility", "카카오", "합성 기사 지도·도로 geometry", "Safety 판정과 분리, 실패 시 결정론 경로"],
        ["TAAS", "도로교통공단", "공공 사고 맥락 후보", "실제 Safety live 혼합 아님"],
        ["React·TypeScript·Vite", "비생성 오픈소스", "웹·PWA·결정론 엔진", "생성형 AI 모델·API 아님"],
        ["Vitest·Playwright·Zod", "비생성 오픈소스", "테스트·E2E·스키마 검증", "국내 AI 경계 자동검증 통과"],
    ]
    draw_flow(c, [p("4.2 기타 활용 항목", H2), table(rows2, [104, 92, 180, 127], row_bg=PAPER, font_size=7.05)], M, y, PAGE_W - 2 * M, 220)
    draw_flow(c, [p("4.3 주요 활용 성과", H2), bullet("국내 AI 모델을 동일한 12과업 strict 계약으로 비교하고, 현재 제품의 판정 엔진과 분리했습니다."), bullet("100개 합성 운영문서의 상위 참조·해시·privacy/safety/integrity를 결정론적으로 검증했습니다."), bullet("원시 문서·provider 응답·secret을 증거 산출물에 저장하지 않고 요약·해시만 보존했습니다.")], M, y - 240, PAGE_W - 2 * M, 118)


def page_12(c: canvas.Canvas) -> None:
    top = page_header(c, "5", "기대효과 및 성장목표", "사후 경고에서 예방적 계획 운영으로", 12)
    draw_flow(c, [p("5.1 사회·산업적 기대효과", H2), table([
        ["관점", "기대 변화", "MVP에서의 입증 범위"],
        ["기사", "몇 시·몇 번째 배송지까지 안전한지 이해하고 수정·거절 가능", "합성 기사 PWA·이해도 자극"],
        ["관리자", "향후 60분 지원 상황과 실행 가능한 조치를 같은 근거로 검토", "합성 25명·3권역 Control Tower"],
        ["운영", "안전 제약을 통과한 계획만 경로·순서·ETA에 반영", "원자 적용·롤백·감사 테스트"],
        ["고객", "기사 탓이 아닌 안전운영 사유로 ETA 변경 안내", "메시지 초안 생성, 실제 발송 없음"],
        ["산업", "안전을 기사 개인 점수에서 계획 품질과 지원 절차로 전환", "개념·합성 시뮬레이션 검증"],
    ], [74, 270, 159], row_bg=PAPER, font_size=7.15)], M, top, PAGE_W - 2 * M, 244)
    y = top - 264
    draw_flow(c, [p("5.2 적용·확장 가능성", H2), bullet("택배 허브·퀵커머스·현장서비스 등 다지점 이동노동의 안전 지원 decision."), bullet("TMS·근무표·기상·도로 데이터 adapter를 계약 뒤 교체 가능한 구조."), bullet("파일럿 승인 후 실제 인증·권한·보존·알림·정밀위치 범위를 단계적으로 검증."), p("5.3 성장 목표", H2), p("팀 안전빵은 문제 정의, 결정론적 안전 모델, 국내 AI 문서·설명 계층, 사람 중심 UI, 검증·배포를 하나의 제품 경계로 설계하는 역량을 키웠습니다. 앞으로는 모델 성능만이 아니라 권한·형평성·실패 모드·감사 가능성을 함께 설계하는 AI 엔지니어링 역량을 강화하겠습니다."), p("5.4 향후 학습 및 활동 계획", H2), table([
        ["단계", "핵심 활동", "완료 기준"],
        ["결선 준비", "발표 PC·네트워크 복구·Q&A 리허설", "1280×720 3회 재현"],
        ["독립 검토", "관리자 3명·기사 5명 이해도·행동 검토", "오해·권리 침해 0, 개선 기록"],
        ["파일럿 설계", "실제 데이터 계약·인증·보존·동의 검토", "별도 사용자 승인과 법·보안 검토"],
        ["현장 평가", "안전·지연·수용성·형평성 지표 설계", "합성 효과와 실제 성과 분리"],
    ], [82, 248, 173], row_bg=PAPER, font_size=7.1)], M, y, PAGE_W - 2 * M, 385)


def page_13(c: canvas.Canvas) -> None:
    top = page_header(c, "6", "시연 준비 현황", "최신 승인 흐름 · 3분 제출 영상", 13)
    c.setFillColor(MINT)
    c.roundRect(M, top - 62, PAGE_W - 2 * M, 52, 8, fill=1, stroke=0)
    c.setFillColor(TEAL)
    c.setFont("MalgunBold", 13)
    c.drawString(M + 16, top - 42, "■ 시연 가능    □ 조건부 가능    □ 불가능")
    draw_flow(c, [p("6.2 시연 예정 방식", H2), p("3분 이내 제출 영상에서 현재 빌드의 합성 운영 폐루프를 시연합니다. 외부 API 장애 시에도 합성 fixture와 안전 템플릿으로 흐름을 완주하며, 화면에 Live/Mock/Fallback 상태를 구분해 표시합니다."), p("6.3 시연 시나리오 개요", H2)], M, top - 84, PAGE_W - 2 * M, 124)
    y = top - 220
    steps = [
        ("01", "예측", "합성 문상혁 기사의 화면 표시 지원 시점·배송 순서 확인"),
        ("02", "비교", "15분 휴식과 4건 분담 등 5개 개입을 별도 비교"),
        ("03", "선택", "합성 안재민 기사에게 배송 4건 분담"),
        ("04", "보호", "수신 기사 분담 후 Safety Budget 기준 45 통과"),
        ("05", "동의", "합성 문상혁·안재민 기사가 각각 응답"),
        ("06", "승인", "관리자가 최신 안전검사와 두 동의를 확인"),
        ("07", "적용", "동일 decision ID로 경로·순서·ETA·고객안내 갱신"),
    ]
    for i, (num, title, desc) in enumerate(steps):
        by = y - i * 48
        c.setFillColor(BLUE if i < 4 else TEAL)
        c.roundRect(M, by - 30, 40, 30, 6, fill=1, stroke=0)
        c.setFillColor(colors.white)
        c.setFont("MalgunBold", 8)
        c.drawCentredString(M + 20, by - 20, num)
        c.setFillColor(NAVY)
        c.setFont("MalgunBold", 8.4)
        c.drawString(M + 52, by - 12, title)
        c.setFont("Malgun", 7.4)
        c.setFillColor(MUTED)
        c.drawString(M + 112, by - 12, desc)
        c.setStrokeColor(LINE)
        c.line(M + 52, by - 28, PAGE_W - M, by - 28)
    draw_flow(c, [p("6.4 첨부 영상 설명", H2), bullet("<b>최신 승인 대표 시나리오(합성 기사 활용)</b>에서 합성 문상혁 기사의 미래 지원 필요를 확인합니다."), bullet("배송 4건을 합성 안재민 기사에게 분담하되, 수신 기사 기준 45 통과와 두 기사 동의를 먼저 확인합니다."), bullet("관리자 승인 뒤 경로·배송순서·ETA·고객안내가 같은 decision ID로 갱신되는 장면을 담습니다."), bullet("마지막 상황 예측은 현재 운영계획에 자동 적용되지 않는 별도 사전 시뮬레이션임을 명시합니다."), p("Safety 수치와 추천은 결정론 엔진이 계산하고, 국내 AI는 검증된 근거를 역할별로 설명한다는 책임 경계를 함께 제시합니다.")], M, 194, PAGE_W - 2 * M, 148)


def page_14(c: canvas.Canvas) -> None:
    top = page_header(c, "7", "국내 AI 트랙 활용 명세", "연계 기업 · 모델 · 활용 형태 · 시사점", 14)
    rows = [
        ["기업·모델", "활용 형태", "SafeRoute에서의 역할", "현재 공개 런타임"],
        ["Upstage solar-pro3", "Hosted API", "검증 사실의 관리자·기사·고객·보고서 설명, strict 추출", "허용 · 실패 시 안전 템플릿"],
        ["Upstage Document Parse", "문서 digitization API", "합성 운영 PDF를 Markdown으로 구조화", "서버 전용 · 원문 증거 미보존"],
        ["SKT A.X-K1", "Hosted API 평가", "공통 12과업 설명 계약 자격 검증", "P0 비의존 · 선택 증거"],
        ["SKT A.X-4.0-Light", "A100 LoRA·offline 평가", "고정 revision Local 후보 자격 검증", "비활성 · 별도 승인 전 미승격"],
        ["LG K-EXAONE-236B-A23B", "Hosted API 평가", "공통 12과업·반례 품질 검증", "P0 비의존 · 선택 증거"],
    ]
    draw_flow(c, [p("7.1~7.3 연계 기업·활용 모델·상세", H2), table(rows, [112, 105, 190, 96], row_bg=PAPER, font_size=6.85)], M, top, PAGE_W - 2 * M, 250)
    y = top - 270
    draw_flow(c, [p("7.4 국내 AI 모델 활용 시사점", H2), p("<b>강점</b> · 한국어 역할별 설명과 문서 구조화가 안전운영 맥락에 유용했습니다. Upstage는 공식 문서 digitization과 chat endpoint를 한 공급자 경계에서 연결할 수 있었고, A.X·K-EXAONE은 같은 strict 계약으로 비교 가능한 국내 모델 선택지를 제공했습니다."), p("<b>개선 의견</b> · 모델별 endpoint·모델 ID·quota·입력 보존정책·구조화 출력 계약이 더 표준화되면 공급자 전환과 감사가 쉬워집니다. 긴 응답보다 짧은 strict JSON·인용·오류코드 일관성이 현장형 제품에 중요했습니다."), p("<b>생태계 기여</b> · SafeRoute는 국내 AI를 ‘점수를 대신 정하는 모델’이 아니라 결정론적 안전 엔진 뒤의 검증 가능한 설명·문서 계층으로 배치했습니다. 이 경계는 물류·제조·현장서비스 등 고위험 의사결정에서 국내 모델을 책임 있게 적용하는 재사용 가능한 패턴입니다."), Spacer(1, 6), p("국내 트랙 자동감사 (2026-08-13)", H3), table([
        ["범위", "결과"],
        ["추적 파일", "191개 runtime·evaluation 파일"],
        ["허용 공급자·host·model ID", "7/7 자동감사 통과"],
        ["비국내 생성형 AI SDK·secret", "0건"],
        ["프로토콜 호환 표기", "wire format일 뿐 OpenAI 서비스 사용 아님"],
    ], [210, 293], row_bg=PAPER, font_size=7.25)], M, y, PAGE_W - 2 * M, 330)
    rounded_box(c, M, 53, PAGE_W - 2 * M, 50, MINT, TEAL, 7)
    c.setFillColor(NAVY)
    c.setFont("MalgunBold", 7.6)
    c.drawString(M + 12, 82, "제품 생성형 AI 경계")
    c.setFont("Malgun", 7.1)
    c.drawString(M + 12, 65, "제품 실행·학습·평가에 비국내 생성형 AI 모델·API를 사용하지 않았으며, 지도·기상은 비생성 외부 입력으로 분리했습니다.")


def page_15(c: canvas.Canvas) -> None:
    top = page_header(c, "15", "제출 전 최종 확인", "최신 검토본에서 확인 필요로 남긴 항목", 15)
    checklist = [
        ("대표 소속", "학년 입력", "명지전문대학 전자공학과 O학년"),
        ("팀 정보", "팀원 성명 확인", "팀대표 포함 총 2명"),
        ("교육 이력", "기관별 참석 O/X·인원·성명 입력", "대회 운영 자료와 대조"),
        ("연구 지원", "A100 활용 300시간·API 사용량 대조", "활용 기록과 보고서 수치 일치 확인"),
        ("영상", "최종 MP4와 YouTube URL 확정", "3분·화면비·코덱·공개범위 확인"),
        ("확약서", "팀대표 자필 서명 또는 인", "날짜·모델 표와 실제 로그 대조"),
        ("제출", "PDF 페이지 수·파일명·업로드 마감", "표지 제외 15쪽, 2026-08-14 17:00"),
    ]
    for i, (title, action, evidence) in enumerate(checklist):
        by = top - 56 - i * 60
        rounded_box(c, M, by - 35, PAGE_W - 2 * M, 46, colors.white, LINE, 8)
        c.setStrokeColor(AMBER)
        c.setLineWidth(1.2)
        c.rect(M + 13, by - 19, 13, 13, fill=0, stroke=1)
        c.setFillColor(NAVY)
        c.setFont("MalgunBold", 8.5)
        c.drawString(M + 38, by - 5, title)
        c.setFillColor(INK)
        c.setFont("Malgun", 7.6)
        c.drawString(M + 130, by - 5, action)
        c.setFillColor(MUTED)
        c.drawString(M + 38, by - 23, evidence)
    y = top - 500
    draw_flow(c, [p("명시적 한계 및 다음 단계", H2), bullet("실제 기사·고객 개인정보, 실제 GPS·TMS 쓰기, 인증·권한, 고객 메시지 발송은 구현 범위 밖입니다."), bullet("합성 시뮬레이션은 실제 사고감소 또는 현장 생산성 향상의 증거가 아닙니다."), bullet("2.5D 지도는 최신 사람 검토에서 승격 보류 상태이므로 기본 화면은 2D를 유지합니다."), bullet("A.X Local은 자격 증거를 통과했지만 사람 검토·운영 승격 승인 전까지 공개 런타임에서 비활성입니다."), p("이 최신 검토본 v2.0은 승인된 최종 녹화 시나리오, 현재 구현 화면, 저장소의 보존 증거와 2026-08-13 재검증 결과를 바탕으로 작성했습니다. 위 확인 항목을 채운 뒤 공식 HWP 양식으로 옮기거나, 본 PDF를 내용 검토본으로 사용하십시오.", ParagraphStyle("final-note", parent=BODY, fontName="MalgunBold", textColor=TEAL, backColor=MINT, borderPadding=8))], M, y, PAGE_W - 2 * M, 205)


def build_report() -> None:
    c = canvas.Canvas(str(REPORT_PATH), pagesize=A4, pageCompression=1)
    c.setTitle("2026 AI ROOKIE 본선 제안서 - SafeRoute AI (최신 검토본 v2.0)")
    c.setAuthor("팀 안전빵")
    cover(c)
    c.showPage()
    pages = [page_1, page_2, page_3, page_4, page_5, page_6, page_7, page_8, page_9, page_10, page_11, page_12, page_13, page_14, page_15]
    for index, draw_page in enumerate(pages):
        draw_page(c)
        if index < len(pages) - 1:
            c.showPage()
    c.save()


def build_pledge() -> None:
    c = canvas.Canvas(str(PLEDGE_PATH), pagesize=A4, pageCompression=1)
    c.setTitle("국내 AI 연계 기업 모델 활용 확약서 - 팀 안전빵 (PDF 초안)")
    c.setAuthor("팀 안전빵")
    c.setFont("MalgunBold", 9)
    c.setFillColor(INK)
    c.drawString(M + 4, PAGE_H - 54, "【 제출서류 서식-7 】")
    c.setFont("MalgunBold", 22)
    c.drawCentredString(PAGE_W / 2, PAGE_H - 88, "국내 AI 연계 기업 모델 활용 확약서")
    c.setStrokeColor(NAVY)
    c.line(130, PAGE_H - 95, PAGE_W - 130, PAGE_H - 95)
    rounded_box(c, M, PAGE_H - 133, PAGE_W - 2 * M, 25, SKY, BLUE, 3)
    c.setFillColor(NAVY)
    c.setFont("MalgunBold", 9.4)
    c.drawCentredString(PAGE_W / 2, PAGE_H - 124, "아래 사항을 충분히 읽은 후, 서명하여 제출하시기 바랍니다.")

    intro = (
        "본 팀은 2026년도 인공지능 루키(AI ROOKIE) 대회 「국내 AI 트랙」에 참가하면서, "
        "본 프로젝트의 기술·제품·서비스 구현 및 모델 평가에 국내 연계 기업 AI 모델만을 활용하였으며, "
        "아래 사항을 성실히 준수하였음을 확약합니다."
    )
    draw_flow(c, [p(intro, ParagraphStyle("pledge-intro", parent=BODY, fontSize=9.4, leading=15))], M + 6, PAGE_H - 150, PAGE_W - 2 * M - 12, 65)
    c.setFont("MalgunBold", 11)
    c.drawString(M + 6, PAGE_H - 225, "1. 활용 모델 현황")
    c.setFont("Malgun", 8.4)
    c.drawString(M + 6, PAGE_H - 243, "본 프로젝트의 AI 기능 구현·검증에 활용된 AI 모델·API는 아래와 같습니다.")
    rows = [
        ["기업명", "활용 모델·API명", "활용 용도"],
        ["업스테이지", "solar-pro3", "검증된 사실의 역할별 설명·strict JSON 추출·고객 안내"],
        ["업스테이지", "Document Parse API", "합성 운영 PDF 문서의 Markdown 구조화"],
        ["SKT", "A.X-K1", "공통 12과업 Hosted 설명 계약 평가"],
        ["SKT", "skt/A.X-4.0-Light", "A100 고정 revision LoRA·offline 자격 평가"],
        ["LG AI연구원", "LGAI-EXAONE/K-EXAONE-236B-A23B", "공통 12과업·반례 생성 품질 평가"],
    ]
    t = table(rows, [92, 180, 235], row_bg=PAPER, font_size=7.2)
    t.wrapOn(c, PAGE_W - 2 * M, 190)
    t.drawOn(c, M, PAGE_H - 425)

    c.setFont("MalgunBold", 11)
    c.drawString(M + 6, PAGE_H - 460, "2. 확약 사항")
    items = [
        "본 프로젝트의 AI 기능은 위 연계 기업 모델·API만을 사용했으며, 타 AI 모델을 프로젝트의 AI 기능 구현·학습·평가에 사용하지 않았습니다.",
        "본선·결선 심사 시 운영사무국의 요청이 있을 경우, 활용 모델의 API 호출로그와 소스코드 등을 제출하여 국내 AI 연계 기업 모델로 구현되었음을 증명합니다.",
        "위 확약 사항을 위반하거나 허위로 기재한 것이 확인될 경우, 심사탈락·수상취소·상금환수 등의 불이익 조치를 감수하겠습니다.",
        "최종 결선 시점까지 위 조건을 유지합니다.",
    ]
    pledge_style = ParagraphStyle(
        "pledge-bullet",
        parent=BODY,
        fontSize=7.9,
        leading=11.6,
        leftIndent=6,
        firstLineIndent=-6,
        spaceAfter=0,
    )
    pledge_story: list[object] = []
    for index, item in enumerate(items):
        pledge_story.append(bullet(item, pledge_style))
        if index < len(items) - 1:
            pledge_story.append(Spacer(1, 3))
    draw_flow(c, pledge_story, M + 12, PAGE_H - 480, PAGE_W - 2 * M - 24, 150)
    rounded_box(c, M, 174, PAGE_W - 2 * M, 35, AMBER_BG, AMBER, 5)
    c.setFillColor(AMBER)
    c.setFont("MalgunBold", 7.4)
    c.drawString(M + 10, 195, "서명 전 확인")
    c.setFillColor(INK)
    c.setFont("Malgun", 7.1)
    c.drawString(M + 10, 181, "모델 표·API 로그·실제 사용 범위를 최종 대조하고 대표가 자필 서명 또는 날인하십시오.")
    c.setFillColor(NAVY)
    c.setFont("Malgun", 10)
    c.drawCentredString(PAGE_W / 2, 145, "위 내용이 사실임을 확인하고, 이에 확약합니다.")
    c.setFont("MalgunBold", 11)
    c.drawCentredString(PAGE_W / 2, 112, "2026년 8월 ____일")
    c.setFont("MalgunBold", 10)
    c.drawString(M + 12, 73, "팀명: 안전빵")
    c.drawString(PAGE_W / 2 - 15, 73, "팀대표: 김용우")
    c.setStrokeColor(INK)
    c.line(PAGE_W - 150, 68, PAGE_W - 55, 68)
    c.setFont("Malgun", 8)
    c.setFillColor(MUTED)
    c.drawCentredString(PAGE_W - 102, 52, "(서명 또는 인)")
    c.save()


if __name__ == "__main__":
    build_report()
    build_pledge()
    print(REPORT_PATH)
    print(PLEDGE_PATH)

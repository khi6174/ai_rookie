from __future__ import annotations

import shutil
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt


ROOT = Path(__file__).resolve().parents[1]
REPORT_SOURCE = Path(r"C:\Users\khiyw\Downloads\1780464077739_2026년도_인공지능_루키_본선_제안서.docx")
PLEDGE_SOURCE = Path(r"C:\Users\khiyw\Downloads\1780464099879_국내_AI_연계_기업_모델_활용_확약서.docx")
OUT = ROOT / "output" / "docx"
REPORT_OUT = OUT / "2026_AI_ROOKIE_본선제안서_Team_안전빵_작성본.docx"
PLEDGE_OUT = OUT / "국내_AI_연계_기업_모델_활용_확약서_Team_안전빵_작성본.docx"

BODY_FONT = "맑은 고딕"
BODY_SIZE = Pt(9.5)


def set_run_font(run, size=BODY_SIZE, bold=False):
    run.font.name = BODY_FONT
    run.font.size = size
    run.font.bold = bold
    rfonts = run._element.get_or_add_rPr().get_or_add_rFonts()
    for key in ("ascii", "hAnsi", "eastAsia"):
        rfonts.set(qn(f"w:{key}"), BODY_FONT)


def clear_paragraph(paragraph):
    for child in list(paragraph._p):
        if child.tag != qn("w:pPr"):
            paragraph._p.remove(child)


def set_paragraph(paragraph, text, *, bold=False, center=False, size=BODY_SIZE):
    clear_paragraph(paragraph)
    run = paragraph.add_run(text)
    set_run_font(run, size=size, bold=bold)
    paragraph.paragraph_format.line_spacing = 1.15
    paragraph.paragraph_format.space_after = Pt(3)
    if center:
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    return paragraph


def set_cell(cell, text, *, bold=False, center=False, size=Pt(8.3)):
    paragraph = cell.paragraphs[0]
    set_paragraph(paragraph, text, bold=bold, center=center, size=size)
    for extra in list(cell.paragraphs[1:]):
        extra._element.getparent().remove(extra._element)
    cell.vertical_alignment = 1


def delete_paragraph(paragraph):
    parent = paragraph._element.getparent()
    if parent is not None:
        parent.remove(paragraph._element)


def delete_table(table):
    parent = table._element.getparent()
    if parent is not None:
        parent.remove(table._element)


def add_picture_to_paragraph(paragraph, image_path: Path, width_inches: float, caption: str):
    clear_paragraph(paragraph)
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = paragraph.add_run()
    run.add_picture(str(image_path), width=Inches(width_inches))
    run.add_break()
    caption_run = paragraph.add_run(caption)
    set_run_font(caption_run, size=Pt(7.5))
    paragraph.paragraph_format.space_after = Pt(4)


def remove_row(table, index):
    row = table.rows[index]
    table._tbl.remove(row._tr)


def build_report():
    OUT.mkdir(parents=True, exist_ok=True)
    shutil.copy2(REPORT_SOURCE, REPORT_OUT)
    doc = Document(REPORT_OUT)
    paragraphs = list(doc.paragraphs)
    tables = list(doc.tables)

    # Cover: known facts are filled; user-owned grade remains blank.
    set_paragraph(paragraphs[9], "2026. 08. 14", center=True, size=Pt(12))
    cover = tables[1]
    set_cell(cover.cell(0, 1), "SafeRoute AI")
    set_cell(cover.cell(1, 1), "안전빵")
    set_cell(cover.cell(2, 1), "김용우")
    set_cell(cover.cell(3, 1), "명지전문대학 전자공학과          학년")
    set_cell(cover.cell(4, 1), "2명")
    set_cell(cover.cell(5, 1), "[   ] 일반 트랙 / [ ■ ] 국내 AI 트랙")
    set_cell(cover.cell(6, 1), "[   ] KT   [ ■ ] LG AI연구원   [   ] NC AI\n[ ■ ] SKT   [ ■ ] 업스테이지")

    # The source explicitly requires removal of the authoring guide box.
    delete_table(tables[2])

    # Section-band guide suffixes.
    section_titles = {
        3: "일반사항",
        6: "개발 성과",
        12: "시연 준비 현황",
        14: "국내 AI 트랙 활용 명세",
    }
    for idx, title in section_titles.items():
        set_cell(tables[idx].cell(0, 2), title, bold=True, size=Pt(12))

    answers = {
        28: "SafeRoute AI: 미래 안전한계 예측 기반 라스트마일 안전운영 코파일럿",
        31: "남은 배송계획을 계속 수행할 때 안전한계가 언제·어디서 초과될지 예측하고, 위험을 다른 기사에게 전가하지 않는 개입안을 기사 동의와 관리자 승인 아래 운영계획에 반영합니다.",
        35: "라스트마일 운영은 거리·ETA·비용·완료율을 중심으로 최적화되어 왔지만, 장시간 작업·시간 압박·강수·야간·경사·과도한 잔여 물량이 결합될 때 현재 계획이 앞으로도 안전한지 설명하고 바꾸는 기능은 부족합니다. 산업안전보건연구원의 「택배기사 적정 근로시간에 관한 연구」도 장시간 노동, 야간작업, 배송량, 교통사고와 중량물 취급이 얽힌 복합 위험을 지적했습니다.",
        36: "SafeRoute는 사고확률이나 건강진단을 예측하지 않습니다. 결정론적 Safety Budget, 첫 예상 초과까지의 Time-to-Breach, 신뢰도와 결측 상태를 제시하고, 안전을 ETA·거리·비용과 교환하지 않는 하드 제약으로 적용합니다. 목표는 사고 이후 개인을 평가하는 것이 아니라 계획 단계에서 지원 가능한 개입을 찾고 실행 이력을 남기는 것입니다.",
        40: "2025년 Journal of Transport & Health 체계적 문헌고찰은 32개 연구와 라스트마일 종사자 38,682명의 결과를 종합해 시간 압박·알고리즘 통제·업무량이 스트레스·피로 및 위험 행동과 연결됨을 보고했습니다. 장시간 노동 안전사고 메타분석은 주 55시간 초과군의 통합 상대위험을 RR 1.42(95% CI 1.06~1.91)로 제시했으나 근거 확실성이 낮다는 한계도 밝혔습니다.",
        41: "운송 최적화 연구는 법정 운행시간만으로 피로 요인을 충분히 다루기 어려우며 경로·일정 계획에 피로 제약을 직접 포함할 필요가 있음을 보여줍니다. ILO의 물류 알고리즘 관리 연구와 NIST AI RMF는 효율성뿐 아니라 감시 위험, 인간 감독, 역할 책임, 이의제기 경로를 함께 설계할 것을 강조합니다. SafeRoute는 기사 동의·수정·거절 권리와 결정론 엔진/국내 AI 설명 계층의 권한 분리로 대응합니다.",
        45: "경로·배차 최적화는 ‘더 빠르게 배송할 방법’을, 운전자 경고·점수 시스템은 ‘현재 위험 신호’를 주로 다룹니다. SafeRoute는 ‘현재 계획을 유지하면 언제·어디서 안전한계를 넘는가’를 남은 배송지별로 계산합니다. 불안전 후보를 먼저 제외하고, 물량이관 시 수신 기사의 Safety Budget을 재검사하며, 원·수신 기사 동의와 관리자 승인 전에는 계획을 변경하지 않는 점이 차별점입니다.",
        76: "핵심 아이디어는 안전을 화면의 경고가 아니라 배송계획 실행 전에 통과해야 하는 제약으로 바꾸는 것입니다. 현재·예상 Safety Budget과 Time-to-Breach를 계산하고, 위험 기여요인·신뢰도·결측을 함께 설명합니다.",
        77: "폐루프는 미래 초과 예측 → 원인 설명 → 개입 비교 → 위험전가 검사 → 원·수신 기사 동의 → 관리자 승인 → 경로·배송순서·ETA·고객안내 갱신 → 감사기록 순서로 작동합니다.",
        78: "최신 승인 대표 시나리오(합성 기사 활용)에서는 지원받는 합성 기사에게 필요한 지원을 확인하고, 15분 휴식과 배송 4건 분담을 별도 대안으로 비교합니다. 배송을 분담하는 합성 기사에게 4건을 이관할 때 이관 후 Safety Budget이 기준 45를 통과해야 하며, 두 기사 동의와 관리자 승인 후에만 계획이 적용됩니다.",
        82: "Safety Budget·Time-to-Breach·위험 밴드·기여도·후보 실행 가능성·추천 순위·최종 적용 상태는 버전이 있는 TypeScript 결정론 엔진이 소유합니다. Zod strict 계약으로 입력과 외부 응답을 검증합니다.",
        83: "Upstage solar-pro3와 Document Parse는 검증된 JSON·합성 운영문서·인용을 기반으로 관리자·기사·고객용 설명과 문서 구조화를 담당합니다. SKT A.X-K1, A.X-4.0-Light 및 LG K-EXAONE은 공통 12과업 자격·반례 평가에 사용했습니다. 생성형 AI는 새 숫자를 만들거나 추천·실행 가능성을 변경할 수 없습니다.",
        84: "합성 운영데이터와 공공데이터 파생 맥락을 분리하고 Live/Mock/Error/Fallback 상태를 표시합니다. 국내 AI 응답이 스키마 검증에 실패하거나 타임아웃이면 결정론적 안전 템플릿으로 전환합니다. 비밀키는 서버 전용이며 원문 문서·프롬프트·공급자 원시 응답을 증거 산출물에 보존하지 않습니다.",
        100: "남은 배송계획의 미래 Safety Budget을 예측하고 5개 개입을 비교하여 위험전가를 차단한 뒤, 두 기사 동의와 관리자 승인 아래 경로·배송순서·ETA·고객안내를 같은 decision ID로 갱신하는 합성 운영 MVP를 완성하는 것이 목표입니다.",
        104: "① Dynamic Safety Envelope·Safety Budget  ② Time-to-Breach·위험 기여도·신뢰도  ③ Intervention Engine  ④ Risk Transfer Guard  ⑤ Decision State Machine·Two-Key Consent  ⑥ Atomic Plan Apply  ⑦ 관리자 Control Tower·기사 PWA  ⑧ 국내 AI 문서·설명 계층",
        105: "지원 개입은 15분 휴식, 배송 분담, 배송순서 변경, 안전경로, Safe Delay를 각각 재계산합니다. 불안전 후보는 먼저 차단하고 안전한 후보 안에서 ETA·운영복잡도·고객영향을 비교합니다.",
        109: "합성 운영문서·기상/지도 상태·기사 응답 → 결정론 Safety/Intervention 엔진 → 원·수신 기사 및 관리자 통제 → 경로·순서·ETA·고객안내·감사 결과로 구성됩니다. 국내 AI는 검증된 사실을 역할별로 설명하는 별도 증거 계층이며 판정 엔진을 덮어쓰지 않습니다.",
        113: "합성 기사 25명·3개 권역의 관리자 Control Tower와 기사 PWA를 구현했습니다. 지원 검토에서 5개 개입의 전후 값과 차단 사유를 비교하고, 두 기사 응답·관리자 승인·원자적 계획 적용·감사기록까지 실제 상태 전이로 연결했습니다.",
        117: "향후 실제 기사 GPS·TMS 연동, 인증 및 고객 메시지 발송 기능을 단계적으로 연결해 실서비스 수준으로 고도화하고, 별도 현장 Pilot에서 안전성·수용성·형평성·운영 효과를 검증할 예정입니다. 실제 개인정보·정밀 위치·외부 전송 범위는 별도 법·보안·사용자 승인 후 확정합니다.",
        122: "Dynamic Safety Envelope / Time-to-Breach / Intervention Engine / Risk Transfer Guard / Decision State Machine / Atomic Plan Apply / 관리자 웹 / 기사 PWA / 국내 AI 설명·문서 계층",
        123: "Dynamic Safety Envelope는 남은 배송지별 Safety Budget 시계열을 계산하고, Time-to-Breach는 첫 임계치 초과 시각·배송순번·stop ID를 반환합니다.",
        124: "Intervention Engine은 개입 후 전체 계획을 다시 계산하고, Risk Transfer Guard는 수신 기사 Budget·용량·시간창·권역·차량·동의를 검사합니다.",
        125: "Decision Workflow는 요청·동의·수정·거절·승인·적용 상태를 관리하며, Atomic Plan Apply는 승인 결과를 경로·순서·ETA·고객안내·감사 이벤트에 함께 반영합니다.",
        128: "관리자는 향후 60분 안에 지원이 필요한 상황과 실행 가능한 조치를 검토합니다. 기사는 같은 decision ID와 근거로 동의·수정 요청·거절을 선택합니다. 국내 AI는 관리자·기사·고객에게 검증 사실을 역할에 맞는 언어로 설명합니다.",
        132: "핵심 P0 폐루프와 자동 Gate는 완료되었습니다. 현재 빌드는 합성 기사 25명, 3개 권역, 5개 개입, 두 기사 동의와 관리자 승인, 계획·ETA·고객안내 갱신, Live/Mock/Fallback 상태를 포함합니다.",
        133: "검증 결과: TypeScript typecheck PASS, Vitest 462/462(76파일), Production build PASS(206 modules), 국내 트랙 자동감사 7/7 PASS(191 tracked files). 보존 릴리스 증거에서 Playwright E2E 58/58, clean-start 3/3, 전략 비교 30개 합성 변형·90회 비교·SafeRoute 하드제약 위반 0건을 확인했습니다.",
        137: "최종 목표 대비 진척도: 95%. 향후 실제 기사 GPS·TMS 연동, 인증 및 고객 메시지 발송 기능을 단계적으로 연결해 실서비스 수준으로 고도화하고 별도 현장 Pilot에서 안전성과 운영 효과를 검증할 예정입니다.",
        142: "정확값·경계·회복·결측·단조성 테스트를 통해 강수·연속근무·남은 작업량·경로위험 증가가 Budget을 개선하지 않고, 휴식 증가가 회복을 악화하지 않으며, 결측 증가가 신뢰도를 높이지 않도록 고정했습니다.",
        143: "Risk Transfer Guard 23/23, Workflow 경계 30/30을 통과했습니다. 합성 운영 부하 평가에서 24명 1.468초/예산 5초, 96명 5.507초/15초, 240명 15.778초/40초로 모든 프로파일이 예산 안에 들었습니다. 모든 평가 내 숫자는 합성된 Live 자격평가입니다. 실제 사고 및 현장 생산성 향상으로 해석하지 않습니다.",
        147: "현재 위험점수 대신 남은 배송지별 미래 한계 초과를 계산하고, 안전과 ETA를 가중합하지 않으며, 수신 기사에게 위험을 옮기는 분담안을 차단합니다. 국내 AI는 점수 결정자가 아니라 검증 가능한 설명·문서 계층으로 제한하고, 기사 권리와 관리자 책임을 상태기계로 구현했습니다.",
        151: "TypeScript 도메인 엔진·Zod strict 계약·원자 적용/롤백/멱등성·Playwright 다중 viewport·접근성·clean-start·Upstage Document Parse/solar-pro3·A.X/K-EXAONE 공통 Gate·합성 데이터 계보와 해시 검증을 학습하고 적용했습니다. 아래 교육 참석 정보는 팀이 직접 확인하여 작성합니다.",
        156: "AI 환각·수치 변조는 허용 사실 whitelist, strict JSON, 새 숫자 거부로 방어합니다. 위험전가는 수신 기사 하드 제약으로 차단하고, 기사 순위·징계 표현·원시 생체정보·정밀 GPS를 관리자 화면에서 제외합니다. 기사 동의와 관리자 승인 전 자동 집행을 금지하며, AI 실패 시 명시적 Fallback으로 전환합니다.",
        173: "NVIDIA A100을 300시간 활용해 SKT A.X-4.0-Light 고정 revision LoRA v2와 offline 평가 증거를 생성했습니다. Upstage solar-pro3 Live 12과업 12/12, Document Parse 합성 PDF marker 14/14·strict 추출 exact-match, SKT A.X-K1과 LG K-EXAONE 공통 12과업 12/12를 확인했습니다. 국내 AI 모델은 동일한 strict 계약으로 비교했고 공개 판정 엔진과 분리했습니다.",
        178: "기사에게는 언제·몇 번째 배송지까지 안전한지와 수정·거절 권리를, 관리자에게는 향후 60분 지원 상황과 실행 가능한 조치를 같은 근거로 제공합니다. 운영계획은 안전 제약을 통과한 경우에만 경로·순서·ETA에 반영되고, 고객에게는 기사 탓이 아닌 안전운영 사유로 ETA 변경 안내 초안을 제공합니다.",
        179: "산업적으로는 안전을 기사 개인 점수나 사후 경고에서 계획 품질과 지원 절차로 전환할 수 있습니다. 현재 입증 범위는 합성 운영 MVP와 제한된 국내 AI 자격평가이며 실제 사고감소·현장 생산성 향상의 증거는 아닙니다.",
        183: "택배 허브·퀵커머스·현장서비스 등 다지점 이동노동의 안전지원 의사결정에 적용할 수 있습니다. TMS·근무표·기상·도로 adapter를 교체 가능한 계약으로 설계했으며, Pilot 승인 후 실제 인증·권한·보존·알림·정밀위치 범위를 단계적으로 검증합니다.",
        187: "팀 안전빵은 문제 정의, 결정론적 안전 모델, 국내 AI 문서·설명 계층, 사람 중심 UI, 검증·배포를 하나의 제품 경계로 설계하는 역량을 강화하고자 합니다. 모델 성능뿐 아니라 권한·형평성·실패 모드·감사 가능성을 함께 설계하는 AI 엔지니어로 성장하는 것이 목표입니다.",
        191: "결선 준비 단계에서 발표 PC·네트워크 복구·Q&A를 1280×720 환경에서 반복 검증합니다. 이후 관리자 3명·기사 5명의 이해도·행동 검토를 거쳐 오해와 권리 침해를 수정하고, 실제 데이터 계약·인증·보존·동의를 별도 승인한 뒤 현장 Pilot에서 안전·지연·수용성·형평성 지표를 평가할 계획입니다.",
        201: "합성 fixture와 결정론적 안전 템플릿을 사용해 외부 API 장애 시에도 핵심 폐루프를 재현할 수 있습니다.",
        204: "노트북 브라우저의 현재 빌드와 3분 이내 제출 영상을 사용합니다. 화면에 Live/Mock/Fallback 상태를 구분하고, 상황 예측은 현재 계획에 자동 적용되지 않는 별도 사전 시뮬레이션임을 명시합니다.",
        207: "1) 지원받는 합성 기사의 예상 지원 시점과 배송 순서를 확인합니다. 2) 15분 휴식과 배송 4건 분담 등 5개 개입을 별도로 비교합니다. 3) 배송을 분담하는 합성 기사에게 4건 분담을 선택하고 이관 후 Safety Budget 기준 45 통과를 확인합니다. 4) 두 기사가 각각 동의합니다. 5) 관리자가 최신 안전검사와 동의를 확인하고 승인합니다. 6) 동일 decision ID로 경로·순서·ETA·고객안내·감사기록을 갱신합니다.",
        210: "최신 승인 대표 시나리오(합성 기사 활용)를 따라 합성 기사 25명의 관제 상황, 미래 지원 예측, 개입 비교, 위험전가 검사, 두 기사 동의, 관리자 승인, 계획 적용과 국내 AI 책임 경계를 보여줍니다.\n\n영상 URL: ",
        224: "업스테이지: solar-pro3, Document Parse / SKT: A.X-K1, A.X-4.0-Light / LG AI연구원: K-EXAONE-236B-A23B",
        225: "제품의 생성형 AI 런타임과 모델 평가에는 위 국내 연계 기업 모델만 사용했습니다. 지도·기상·TAAS 및 React·TypeScript·Vite·Vitest·Playwright·Zod는 생성형 AI 모델·API가 아닌 외부 입력 또는 비생성 개발·검증 도구입니다.",
        228: "Upstage solar-pro3 Hosted API 역할별 설명, Document Parse 문서 구조화, SKT A.X-K1 Hosted API 공통 과업 평가, SKT A.X-4.0-Light A100 LoRA·offline 평가, LG K-EXAONE Hosted API 공통 과업·반례 평가 방식으로 활용했습니다.",
        231: "Safety 수치·추천·실행 가능성은 결정론 엔진이 소유합니다. 국내 AI에는 허용 사실·표시값·역할·행동·인용만 전달하고, strict 스키마·숫자 불변·인용·비징벌 문구 Gate를 통과한 첫 결과만 표시합니다. 실패하면 결정론적 템플릿으로 전환하며 프롬프트·원문 응답·비밀정보는 저장하지 않습니다.",
        234: "국내 AI의 한국어 역할별 설명과 문서 구조화는 안전운영 맥락을 기사·관리자·고객에게 전달하는 데 유용했습니다. 모델별 endpoint·모델 ID·quota·입력 보존정책과 구조화 출력 계약이 표준화되면 공급자 전환과 감사가 쉬워집니다. SafeRoute는 국내 AI를 ‘점수를 대신 정하는 모델’이 아니라 결정론적 안전 엔진 뒤의 검증 가능한 설명·문서 계층으로 배치하는 재사용 가능한 패턴을 제시합니다.",
    }
    for idx, text in answers.items():
        set_paragraph(paragraphs[idx], text)

    # Comparison table (1.6).
    change = tables[4]
    change_rows = [
        ("참가 트랙", "국내 AI 트랙", "국내 AI 트랙 유지", "국내 모델 활용 경계 구체화"),
        ("아이디어 핵심", "사고 위험도 0~100", "운영 위험지수·Safety Budget·Time-to-Breach", "사고확률 오인 방지"),
        ("구현 범위", "단일 Mock 대시보드", "합성 기사 25명·3권역·기사 PWA·승인 폐루프", "본선 시연 재현성"),
        ("구현 계획", "휴식·분산·경로·지연 제안", "5개 개입 비교·Risk Transfer Guard·원자 적용", "위험전가 차단과 폐루프 완결"),
    ]
    for r, values in enumerate(change_rows, start=1):
        for c, value in enumerate(values):
            set_cell(change.cell(r, c), value, size=Pt(7.5))

    # Education attendance belongs to the user; clear all placeholders.
    education = tables[7]
    for r in range(1, len(education.rows)):
        for c in range(2, 5):
            set_cell(education.cell(r, c), "", size=Pt(8))

    # Research support table.
    support = tables[9]
    support_rows = [
        ("GPU 자원", "NVIDIA A100", "활용 시간: 300시간"),
        ("생성형 AI API(국내)", "Upstage solar-pro3·Document Parse", "Live 12과업·합성 PDF 1건"),
        ("생성형 AI API(국내)", "SKT A.X-K1·A.X-4.0-Light", "Hosted 12과업·A100 offline 평가"),
        ("생성형 AI API(국내)", "LG K-EXAONE", "Live 12과업·반례 평가"),
    ]
    for r, values in enumerate(support_rows, start=1):
        for c, value in enumerate(values):
            set_cell(support.cell(r, c), value, size=Pt(7.5))

    # Other resources: non-generative tools are classified explicitly.
    tools = tables[10]
    tool_rows = [
        ("기상청 API 허브", "기상청", "국내", "ASOS 강수·시정 등 공공 기상 맥락"),
        ("Kakao Maps·Mobility", "카카오", "국내", "합성 기사 지도·도로 geometry"),
        ("TAAS", "도로교통공단", "국내", "공공 교통사고 맥락 후보"),
        ("React·TypeScript·Vite", "오픈소스", "해외(비생성)", "웹·PWA·결정론 엔진"),
        ("Vitest·Playwright·Zod", "오픈소스", "해외(비생성)", "테스트·E2E·스키마 검증"),
        ("Tailwind CSS·Lucide", "오픈소스", "해외(비생성)", "UI 스타일·상태 아이콘 구현"),
        ("국내 트랙 자동감사", "팀 안전빵", "국내", "비국내 생성형 AI SDK·host·secret 경계 검증"),
    ]
    for r, values in enumerate(tool_rows, start=1):
        for c, value in enumerate(values):
            set_cell(tools.cell(r, c), value, size=Pt(7.2))

    # Demo status.
    set_cell(tables[13].cell(0, 0), "■ 시연 가능       □ 조건부 가능       □ 불가능       □ 기타(          )", bold=True, center=True, size=Pt(10))

    # Caption-free implementation screenshots.
    add_picture_to_paragraph(
        paragraphs[111],
        ROOT / "artifacts" / "demo-screenshots" / "final-video-2026" / "01-control-tower.png",
        6.4,
        "그림 1. 최신 승인 대표 시나리오(합성 기사 활용) - 관리자 Control Tower",
    )
    add_picture_to_paragraph(
        paragraphs[135],
        ROOT / "artifacts" / "demo-screenshots" / "final-video-2026" / "03-support-comparison.png",
        6.4,
        "그림 2. 개입안 비교와 Risk Transfer Guard",
    )

    # Keep every official section heading, but remove the inline authoring notes.
    set_paragraph(paragraphs[200], "6.1 시연 가능 여부", bold=True, size=Pt(10))
    set_paragraph(paragraphs[223], "7.1 연계 기업 및 활용 모델", bold=True, size=Pt(10))
    set_paragraph(paragraphs[227], "7.2 활용 형태", bold=True, size=Pt(10))
    set_paragraph(paragraphs[230], "7.3 국내 AI 기업 모델 활용 상세", bold=True, size=Pt(10))
    set_paragraph(paragraphs[233], "7.4 국내 AI 모델 활용 시사점", bold=True, size=Pt(10))

    # Remove instructions, examples, and evaluation-note paragraphs.
    remove_indices = {
        32, 37, 42, 46, 49, 50, 79, 85, 101, 106, 110, 114, 118,
        129, 134, 144, 148, 152, 153, 157, 165, 166, 167, 169, 170,
        171, 174, 180, 184, 188, 192,
    }
    for idx in sorted(remove_indices, reverse=True):
        delete_paragraph(paragraphs[idx])

    doc.core_properties.title = "2026년도 인공지능 루키 본선 제안서 - SafeRoute AI"
    doc.core_properties.subject = "팀 안전빵 국내 AI 트랙 본선 제안서"
    doc.core_properties.author = "팀 안전빵"
    doc.save(REPORT_OUT)


def build_pledge():
    OUT.mkdir(parents=True, exist_ok=True)
    shutil.copy2(PLEDGE_SOURCE, PLEDGE_OUT)
    doc = Document(PLEDGE_OUT)
    model_table = doc.tables[1].cell(0, 0).tables[0]
    rows = [
        ("업스테이지", "solar-pro3 / Document Parse", "검증 사실의 역할별 설명·합성 운영문서 구조화"),
        ("SKT", "A.X-K1", "Hosted API 공통 12과업 설명 계약 자격평가"),
        ("SKT", "A.X-4.0-Light", "NVIDIA A100 LoRA·offline 자격평가"),
        ("LG AI연구원", "K-EXAONE-236B-A23B", "Hosted API 공통 12과업·반례 품질평가"),
    ]
    for r, values in enumerate(rows, start=1):
        for c, value in enumerate(values):
            set_cell(model_table.cell(r, c), value, size=Pt(8))

    # User fills signing date and signature; known team/representative names are retained.
    set_paragraph(doc.paragraphs[4], "2026년      월      일", center=True, size=Pt(11))
    set_paragraph(doc.paragraphs[6], "팀명: 안전빵          팀대표: 김용우                         (서명 또는 인)", center=True, size=Pt(11))
    doc.core_properties.title = "국내 AI 연계 기업 모델 활용 확약서 - 팀 안전빵"
    doc.core_properties.subject = "2026 AI ROOKIE 국내 AI 트랙 활용 확약서"
    doc.core_properties.author = "팀 안전빵"
    doc.save(PLEDGE_OUT)


if __name__ == "__main__":
    build_report()
    build_pledge()
    print(REPORT_OUT)
    print(PLEDGE_OUT)

import subprocess
import tempfile
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.util import Inches, Pt

from app.config import SOFFICE_PATH

NAVY = RGBColor(0x0B, 0x1B, 0x3F)
BLUE = RGBColor(0x2F, 0x6B, 0xF2)
GRAY = RGBColor(0x55, 0x5E, 0x6E)
FONT = "맑은 고딕"  


def add_text(slide, text, left, top, width, height, size, color=NAVY, bold=False):
    box = slide.shapes.add_textbox(Inches(left), Inches(top), Inches(width), Inches(height))
    frame = box.text_frame
    frame.word_wrap = True
    for i, line in enumerate(str(text).split("\n")):
        p = frame.paragraphs[0] if i == 0 else frame.add_paragraph()
        p.text = line
        p.font.size, p.font.bold, p.font.color.rgb, p.font.name = Pt(size), bold, color, FONT
    return box


def render_pptx(slides: list[dict], out_path: Path) -> Path:
    prs = Presentation()
    prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)  # 16:9
    blank = prs.slide_layouts[6]

    for s in slides:
        slide = prs.slides.add_slide(blank)
        if s["layout"] in ("COVER", "CLOSING"):
            add_text(slide, s["title"], 1, 2.6, 11.3, 1.5, 40, bold=True)
            add_text(slide, s.get("body", ""), 1, 4.2, 11.3, 1.5, 18, GRAY)
            continue

        add_text(slide, s.get("section", ""), 0.8, 0.5, 11.7, 0.5, 14, BLUE, bold=True)
        add_text(slide, s["title"], 0.8, 0.9, 11.7, 1.0, 30, bold=True)

        metrics = s.get("metrics") or []
        for i, m in enumerate(metrics[:4]):  # 숫자 카드는 최대 4개
            left = 0.8 + i * 3.0
            add_text(slide, m["value"], left, 2.2, 2.8, 0.9, 32, BLUE, bold=True)
            add_text(slide, m["label"], left, 3.1, 2.8, 0.5, 14, GRAY)

        body_top = 3.9 if metrics else 2.3
        add_text(slide, s.get("body", ""), 0.8, body_top, 11.7, 3.0, 18, GRAY)

    prs.save(out_path)
    return out_path


def pptx_to_pdf(pptx_path: Path) -> Path:
    subprocess.run([SOFFICE_PATH, "--headless", "--convert-to", "pdf", "--outdir",
                    str(pptx_path.parent), str(pptx_path)], check=True, timeout=180, capture_output=True)
    pdf = pptx_path.with_suffix(".pdf")
    if not pdf.exists():
        raise RuntimeError("PDF 변환에 실패했어요.")
    return pdf


def build_file(slides: list[dict], fmt: str) -> Path:
    work = Path(tempfile.mkdtemp())
    pptx = render_pptx(slides, work / "portfolio.pptx")
    return pptx if fmt == "PPTX" else pptx_to_pdf(pptx)
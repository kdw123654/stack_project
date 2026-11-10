import math
import os
import platform
import shutil
import subprocess
import tempfile
from io import BytesIO
from pathlib import Path

from PIL import Image
from pptx import Presentation
from pptx.chart.data import CategoryChartData
from pptx.dml.color import RGBColor
from pptx.enum.chart import XL_CHART_TYPE
from pptx.util import Inches, Pt
from pptx.oxml.xmlchemy import OxmlElement

from app.config import SOFFICE_PATH

NAVY = RGBColor(0x0B, 0x1B, 0x3F)
BLUE = RGBColor(0x2F, 0x6B, 0xF2)
GRAY = RGBColor(0x55, 0x5E, 0x6E)
FONT = os.getenv("PORTFOLIO_FONT", "Apple SD Gothic Neo" if platform.system() == "Darwin" else "Noto Sans CJK KR")


def set_font(font):
    font.name = FONT
    properties = font._element
    properties.set("lang", "ko-KR")
    east_asian = properties.find("{http://schemas.openxmlformats.org/drawingml/2006/main}ea")
    if east_asian is None:
        east_asian = OxmlElement("a:ea")
        properties.append(east_asian)
    east_asian.set("typeface", FONT)


def add_text(slide, text, left, top, width, height, size, color=NAVY, bold=False):
    box = slide.shapes.add_textbox(Inches(left), Inches(top), Inches(width), Inches(height))
    frame = box.text_frame
    frame.word_wrap = True
    for i, line in enumerate(str(text).split("\n")):
        p = frame.paragraphs[0] if i == 0 else frame.add_paragraph()
        p.text = line
        p.font.size, p.font.bold, p.font.color.rgb = Pt(size), bold, color
        set_font(p.font)
    return box


def add_chart(slide, data, left, top, width, height):
    labels, values = data.get("labels", []), data.get("values", [])
    if (data.get("type") != "bar" or not 1 <= len(labels) <= 20 or len(labels) != len(values)
            or any(not isinstance(label, str) for label in labels)
            or any(isinstance(v, bool) or not isinstance(v, (float, int)) or not math.isfinite(v) for v in values)):
        raise ValueError("차트는 같은 개수의 항목명과 유한한 숫자 값(최대 20개)이 필요합니다.")
    chart_data = CategoryChartData()
    chart_data.categories = labels
    chart_data.add_series(str(data.get("unit") or "값"), values)
    chart = slide.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(left), Inches(top),
                                   Inches(width), Inches(height), chart_data).chart
    chart.has_legend = False
    chart.has_title = True
    chart.chart_title.text_frame.text = f"성과 지표 ({data.get('unit') or '값'})"
    chart.chart_style = 10
    chart.plots[0].has_data_labels = True
    for paragraph in chart.chart_title.text_frame.paragraphs:
        set_font(paragraph.font)
        for run in paragraph.runs:
            set_font(run.font)
    for font in (chart.category_axis.tick_labels.font, chart.value_axis.tick_labels.font, chart.plots[0].data_labels.font):
        set_font(font)
    chart.category_axis.tick_labels.font.size = Pt(11)
    chart.value_axis.tick_labels.font.size = Pt(11)
    chart.plots[0].has_data_labels = True
    chart.plots[0].data_labels.font.size = Pt(11)


def add_image(slide, data, left, top, width, height):
    with Image.open(BytesIO(data)) as image:
        scale = min(width / image.width, height / image.height)
        w, h = image.width * scale, image.height * scale
    slide.shapes.add_picture(BytesIO(data), Inches(left + (width - w) / 2),
                             Inches(top + (height - h) / 2), Inches(w), Inches(h))


def render_pptx(slides: list[dict], out_path: Path, image_loader=None) -> Path:
    prs = Presentation()
    prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
    for s in slides:
        slide = prs.slides.add_slide(prs.slide_layouts[6])
        visuals = [("chart", c) for c in s.get("chartData", [])] + [("image", i) for i in s.get("imageIds", [])]
        if len(visuals) > 4:
            raise ValueError("한 슬라이드에는 이미지와 차트를 합쳐 최대 4개까지 배치할 수 있습니다.")
        if visuals:
            add_text(slide, s.get("section", ""), .7, .35, 12, .4, 14, BLUE, True)
            add_text(slide, s["title"], .7, .85, 12, 1, 28, bold=True)
            add_text(slide, s.get("body", ""), .7, 2, 4, 4.8, 17, GRAY)
            cols = 1 if len(visuals) == 1 else 2
            rows = math.ceil(len(visuals) / cols)
            w, h = 7.5 / cols, 4.9 / rows
            for i, (kind, value) in enumerate(visuals):
                left, top = 5 + (i % cols) * w, 2 + (i // cols) * h
                if kind == "chart":
                    add_chart(slide, value, left, top, w - .15, h - .15)
                else:
                    if image_loader is None:
                        raise ValueError("이미지를 업로드한 후 내보내기 해 주세요.")
                    add_image(slide, image_loader(value), left, top, w - .15, h - .15)
            continue
        if s["layout"] in ("COVER", "CLOSING"):
            add_text(slide, s["title"], 1, 2.6, 11.3, 1.5, 40, bold=True)
            add_text(slide, s.get("body", ""), 1, 4.2, 11.3, 1.5, 18, GRAY)
            continue
        add_text(slide, s.get("section", ""), .8, .5, 11.7, .5, 14, BLUE, True)
        add_text(slide, s["title"], .8, .9, 11.7, 1, 30, bold=True)
        metrics = s.get("metrics") or []
        for i, m in enumerate(metrics[:4]):
            add_text(slide, m["value"], .8 + i * 3, 2.2, 2.8, .9, 32, BLUE, True)
            add_text(slide, m["label"], .8 + i * 3, 3.1, 2.8, .5, 14, GRAY)
        add_text(slide, s.get("body", ""), .8, 3.9 if metrics else 2.3, 11.7, 3, 18, GRAY)
    prs.save(out_path)
    return out_path


def pptx_to_pdf(pptx_path: Path) -> Path:
    profile = (pptx_path.parent / "lo-profile").resolve().as_uri()
    subprocess.run([SOFFICE_PATH, f"-env:UserInstallation={profile}", "--headless", "--convert-to", "pdf",
                    "--outdir", str(pptx_path.parent), str(pptx_path)], check=True, timeout=180, capture_output=True)
    pdf = pptx_path.with_suffix(".pdf")
    if not pdf.exists() or not pdf.read_bytes().startswith(b"%PDF-"):
        raise RuntimeError("PDF 변환에 실패했어요.")
    return pdf


def build_file(slides: list[dict], fmt: str, image_loader=None) -> Path:
    if fmt not in ("PPTX", "PDF"):
        raise ValueError("PDF 또는 PPTX 형식만 지원합니다.")
    work = Path(tempfile.mkdtemp(prefix="stack-export-"))
    try:
        pptx = render_pptx(slides, work / "portfolio.pptx", image_loader)
        return pptx if fmt == "PPTX" else pptx_to_pdf(pptx)
    except Exception:
        shutil.rmtree(work, ignore_errors=True)
        raise

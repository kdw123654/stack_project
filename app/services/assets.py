import hashlib
from io import BytesIO
from pathlib import Path

from docx import Document
from PIL import Image
from pptx import Presentation
from pypdf import PdfReader

from app.services.documents import normalized_image, prepare_document


def extract_assets(content: bytes, filename: str, file_id: str, source_name: str | None = None):
    assets, warnings = {}, []
    total = 0

    def add(data, page):
        nonlocal total
        if len(assets) >= 20:
            warnings.append("ASSET_COUNT_LIMIT")
            return
        try:
            data = normalized_image(data)
            if len(data) > 2 * 1024 * 1024 or total + len(data) > 10 * 1024 * 1024:
                warnings.append("ASSET_STORAGE_LIMIT")
                return
            asset_id = f"{file_id}-{page}-{hashlib.sha256(data).hexdigest()[:12]}"
            if asset_id in assets:
                return
            with Image.open(BytesIO(data)) as image:
                width, height = image.size
            assets[asset_id] = {"content": data, "metadata": {
                "id": asset_id, "fileId": file_id, "fileName": source_name or filename, "page": page,
                "width": width, "height": height, "mediaType": "image/png",
                "label": f"{source_name or filename} / {page}",
            }}
            total += len(data)
        except Exception:
            warnings.append("IMAGE_EXTRACTION_FAILED")

    try:
        content, prepared_name = prepare_document(content, filename)
        ext = Path(prepared_name).suffix.lower()
        if ext == ".pdf":
            for number, page in enumerate(PdfReader(BytesIO(content)).pages, 1):
                for image in page.images:
                    add(image.data, number)
        elif ext == ".pptx":
            def visit(shapes, number):
                for shape in shapes:
                    if hasattr(shape, "image"):
                        add(shape.image.blob, number)
                    if hasattr(shape, "shapes"):
                        visit(shape.shapes, number)
            for number, slide in enumerate(Presentation(BytesIO(content)).slides, 1):
                visit(slide.shapes, number)
        elif ext == ".docx":
            doc = Document(BytesIO(content))
            for number, block in enumerate(doc.iter_inner_content(), 1):
                for blip in block._element.xpath(".//a:blip"):
                    rel = blip.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed")
                    if rel in doc.part.related_parts:
                        add(doc.part.related_parts[rel].blob, number)
        else:
            add(content, 1)
    except Exception:
        warnings.append("IMAGE_EXTRACTION_FAILED")
    return assets, sorted(set(warnings))

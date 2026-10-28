import sys, re, warnings
warnings.filterwarnings("ignore")
import pymupdf
src, outdir = sys.argv[1], sys.argv[2]
doc = pymupdf.open(src)
page = doc[0]
open(f"{outdir}/svg_default.svg","w",encoding="utf8").write(page.get_svg_image(text_as_path=True))
doc.set_layer_ui_config(0, pymupdf.PDF_OC_ON); doc.set_layer_ui_config(1, pymupdf.PDF_OC_OFF)
page = doc.load_page(0)
open(f"{outdir}/svg_closed.svg","w",encoding="utf8").write(page.get_svg_image(text_as_path=True))
print("ok")

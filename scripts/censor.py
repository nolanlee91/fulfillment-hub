# -*- coding: utf-8 -*-
"""Blur sensitive (other-customer) info in guide screenshots."""
import os
from PIL import Image, ImageFilter

SRC = os.path.join("Hướng dẫn khách hàng", "1. CosmestisTuanlx")
OUT = os.path.join("scripts", "_censored")
os.makedirs(OUT, exist_ok=True)

FILES = {
    "1":  "1. Các đơn hàng đang active.png",
    "5":  "5. Xem các đơn đã giao thành công.png",
    "6":  "6. Xem các đơn giao hàng thất bại.png",
    "2":  "2. Lọc các đơn lỗi.png",
    "3":  "3. Ấn vào đơn, hiện drawer xem lỗi ở đâu để cập nhật trên google sheet.png",
    "31": "3.1 Lọc cờ tại filter Attenion nêu các lỗi hay gặp.png",
    "72": "7.2 Nếu không phải ETF, vào đơn đó upload ảnh (banktranfer, Moneyorrder, Cheque,..).png",
}

# blur rectangles (x0, y0, x1, y1) in absolute pixels
BOXES = {
    "1": [
        (283, 195, 500, 235),    # CUSTOMER filter value "CosmeticsTuanlx"
        (80, 390, 1230, 1060),   # table: ORDER ID(TUAN###) -> ADDRESS
    ],
    "5": [
        (283, 150, 590, 195),    # CUSTOMER filter value
        (232, 330, 1230, 985),   # table: ORDER ID(TUAN###) -> ADDRESS
    ],
    "6": [
        (283, 150, 595, 198),    # CUSTOMER filter value (list is empty)
    ],
    "2": [
        (283, 192, 500, 233),    # CUSTOMER filter value "Venatureco"
        (80, 384, 1230, 1049),   # table: ORDER ID -> ADDRESS data block
    ],
    "3": [
        (283, 192, 500, 233),    # CUSTOMER filter value
        (80, 384, 1230, 1059),   # background table data block
        (1558, 124, 1840, 154),  # drawer NAME
        (1558, 166, 1905, 198),  # drawer ADDRESS
        (1558, 208, 1840, 240),  # drawer PHONE/email
        (1558, 289, 1775, 320),  # drawer CUSTOMER
        (1558, 332, 1775, 363),  # drawer PRODUCT
        (1483, 1028, 1810, 1059) # bottom key (contains customer slug)
    ],
    "31": [
        (80, 288, 912, 1007),    # table: ORDER ID -> ADDRESS (mixed customers)
    ],
    "72": [
        (285, 386, 1162, 581),   # background list: ORDER ID -> ADDRESS
        (1558, 124, 1835, 154),  # drawer NAME
        (1558, 166, 1905, 214),  # drawer ADDRESS (2 lines)
        (1558, 230, 1775, 258),  # drawer PHONE
        (1558, 311, 1775, 341),  # drawer PRODUCT
    ],
}

FACTOR = 16  # pixelation strength

def censor(im, box):
    x0, y0, x1, y1 = box
    W, H = im.size
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(W, x1), min(H, y1)
    w, h = x1 - x0, y1 - y0
    if w <= 0 or h <= 0:
        return
    region = im.crop((x0, y0, x1, y1))
    small = region.resize((max(1, w // FACTOR), max(1, h // FACTOR)), Image.BILINEAR)
    pix = small.resize((w, h), Image.NEAREST).filter(ImageFilter.GaussianBlur(6))
    im.paste(pix, (x0, y0))

for key, fn in FILES.items():
    im = Image.open(os.path.join(SRC, fn)).convert("RGB")
    for b in BOXES[key]:
        censor(im, b)
    im.save(os.path.join(OUT, key + ".png"))
    print("censored", key, im.size)

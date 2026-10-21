"""Check that a file is a real PNG by decoding its structure. Standard library only.

check_spec.py and style_board.py import this, so both accept exactly the same frames:

    import pngcheck
    ok, why = pngcheck.check("concept/A-sky.png")      # (True, None) or (False, "<short reason>")
    ok, why = pngcheck.check_frame("concept/A-sky.png")  # the same, and exactly 1280x720: board frames and chosen.png

What it checks: the signature; every chunk's length, CRC and letter-only type; IHDR first and once (13 bytes,
width and height above 0, a valid bit-depth and colour-type pair, compression 0, filter 0, interlace 0 or 1);
truecolour only (RGB or RGBA: image models and browser screenshots produce these, and it keeps palette
semantics out of scope); an optional PLTE of 1-256 entries, once and before the IDATs; no unknown critical
chunk (the PNG spec makes those fatal); at least one IDAT, the IDATs consecutive; IEND last, with nothing after
it. The joined IDAT data must inflate completely, to exactly the size the header implies (Adam7: the sum over
its 7 passes), and every scanline's filter byte must be 0 to 4. That makes the file a structurally complete
truecolour PNG. It doesn't render the image, and it says nothing about how it looks.
"""
import os
import struct
import zlib

SIGNATURE = b"\x89PNG\r\n\x1a\n"
# colour type: (allowed bit depths, samples per pixel)
COLOUR = {0: ((1, 2, 4, 8, 16), 1), 2: ((8, 16), 3), 3: ((1, 2, 4, 8), 1), 4: ((8, 16), 2), 6: ((8, 16), 4)}
# Adam7 passes: (first column, first row, column step, row step)
ADAM7 = ((0, 0, 8, 8), (4, 0, 8, 8), (0, 4, 4, 8), (2, 0, 4, 4), (0, 2, 2, 4), (1, 0, 2, 2), (0, 1, 1, 2))


def check(path):
    """(True, None) if `path` is a regular file holding a valid PNG, else (False, "<short reason>")."""
    if not os.path.isfile(path):
        return False, "not a file"
    try:
        with open(path, "rb") as f:
            data = f.read()
    except OSError as e:
        return False, f"unreadable: {e.strerror or e}"
    if not data:
        return False, "empty"
    return check_bytes(data)


FRAME = (1280, 720)     # every board frame and chosen.png; ART.md measures its px sizes on this frame


def check_frame(path):
    """check(), plus the frame size: a board frame or chosen.png is exactly 1280x720. check() alone stays usable for
    any PNG, such as the 256x256 smoke test."""
    ok, why = check(path)
    if not ok:
        return ok, why
    with open(path, "rb") as f:
        w, h = struct.unpack(">II", f.read(24)[16:24])        # IHDR width and height; check() proved IHDR is first
    if (w, h) != FRAME:
        return False, f"{w}x{h}, not {FRAME[0]}x{FRAME[1]}"
    return True, None


def _header(body):
    """((width, height, bits per pixel, interlace, colour type), None) for a valid IHDR body, else (None, why)."""
    if len(body) != 13:
        return None, f"IHDR is {len(body)} bytes, not 13"
    width, height, depth, colour, compression, filtering, interlace = struct.unpack(">IIBBBBB", body)
    if not width or not height:
        return None, "zero width or height"
    if colour not in COLOUR:
        return None, f"unknown colour type {colour}"
    if depth not in COLOUR[colour][0]:
        return None, f"bit depth {depth} is invalid for colour type {colour}"
    if colour not in (2, 6):
        return None, f"colour type {colour} isn't truecolour; frames must be RGB or RGBA"
    if compression:
        return None, f"compression method {compression} is unknown"
    if filtering:
        return None, f"filter method {filtering} is unknown"
    if interlace > 1:
        return None, f"interlace method {interlace} is unknown"
    return (width, height, depth * COLOUR[colour][1], interlace, colour), None


def check_bytes(data):
    """The same test on bytes already in memory."""
    if data[:8] != SIGNATURE:
        return False, "truncated signature" if SIGNATURE.startswith(data) else "not a PNG"
    pos, prev, header, palette, idat = 8, b"", None, False, []
    while pos < len(data) and prev != b"IEND":
        if pos + 8 > len(data):
            return False, "truncated chunk header"
        length, kind = struct.unpack(">I4s", data[pos:pos + 8])
        name = "".join(chr(b) if 65 <= b <= 90 or 97 <= b <= 122 else "?" for b in kind)
        end = pos + 12 + length
        if end > len(data):
            return False, f"truncated {name} chunk"
        body = data[pos + 8:end - 4]
        if zlib.crc32(kind + body) != struct.unpack(">I", data[end - 4:end])[0]:
            return False, f"bad CRC in {name} chunk"
        if not all(65 <= b <= 90 or 97 <= b <= 122 for b in kind):
            return False, "a chunk type that isn't four letters"
        if header is None:
            if kind != b"IHDR":
                return False, "IHDR is not the first chunk"
            header, why = _header(body)
            if why:
                return False, why
        elif kind == b"IHDR":
            return False, "IHDR is repeated"
        elif kind == b"PLTE":
            if palette or idat:
                return False, "PLTE is repeated or comes after IDAT"
            if not length or length % 3 or length > 768:
                return False, f"PLTE of {length} bytes is not 1-256 RGB entries"
            palette = True
        elif kind == b"IDAT":
            if idat and prev != b"IDAT":
                return False, "IDAT chunks are not consecutive"
            idat.append(body)
        elif not kind[0] & 32 and kind != b"IEND":
            return False, f"unknown critical chunk {name}"
        prev, pos = kind, end
    if header is None:
        return False, "truncated: no IHDR chunk"
    if prev != b"IEND":
        return False, "truncated: no IEND chunk"
    if pos < len(data):
        return False, "data after IEND"
    width, height, bits, interlace, colour = header
    if not idat:
        return False, "no IDAT chunk"

    shapes = []                       # per pass: (scanlines, bytes per scanline including its filter byte)
    for x0, y0, dx, dy in (ADAM7 if interlace else ((0, 0, 1, 1),)):
        across, down = (width - x0 + dx - 1) // dx, (height - y0 + dy - 1) // dy
        if across and down:
            shapes.append((down, 1 + (across * bits + 7) // 8))
    expected = sum(rows * size for rows, size in shapes)
    packed = b"".join(idat)
    inflater = zlib.decompressobj()
    try:                              # deflate never expands more than 1032:1, so the cap bounds memory
        raw = inflater.decompress(packed, min(expected, 1032 * len(packed) + 64) + 1)
    except zlib.error:
        return False, "IDAT data is not valid zlib"
    if len(raw) > expected:
        return False, f"image data is longer than the {expected} bytes the header implies"
    if not inflater.eof:
        return False, "IDAT zlib stream is incomplete"
    if inflater.unused_data:
        return False, "extra bytes after the IDAT zlib stream"
    if len(raw) < expected:
        return False, f"image data is {len(raw)} bytes, the header implies {expected}"
    at = 0
    for rows, size in shapes:
        for _ in range(rows):
            if raw[at] > 4:
                return False, f"scanline filter type {raw[at]} is not 0-4"
            at += size
    return True, None

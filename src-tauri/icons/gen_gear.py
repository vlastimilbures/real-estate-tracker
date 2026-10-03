"""Generate thin-outlined white gear icon for macOS menu (template-image style)."""
import math, struct, zlib

def make_png(pixels, w, h):
    def chunk(name, data):
        c = struct.pack('>I', len(data)) + name + data
        return c + struct.pack('>I', zlib.crc32(name + data) & 0xFFFFFFFF)
    raw = b''
    for row in pixels:
        raw += b'\x00' + bytes([v for px in row for v in px])
    compressed = zlib.compress(raw, 9)
    return (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
        + chunk(b'IDAT', compressed)
        + chunk(b'IEND', b'')
    )

def draw_gear_outlined(size, inner_r, body_r, tooth_r, n_teeth, stroke, color=(255, 255, 255)):
    """Draw an outlined (stroked, not filled) gear. Uses distance-to-boundary for AA."""
    cx = cy = size / 2.0
    pixels = [[(0, 0, 0, 0)] * size for _ in range(size)]
    r, g, b = color
    tooth_half = math.pi / n_teeth * 0.55

    def tooth_outer(angle):
        ta = angle % (2 * math.pi / n_teeth)
        return ta < tooth_half or ta > (2 * math.pi / n_teeth - tooth_half)

    for y in range(size):
        for x in range(size):
            # supersample 3×3
            acc = 0.0
            for sy in range(3):
                for sx in range(3):
                    dx = x + (sx + 0.5) / 3.0 - cx
                    dy = y + (sy + 0.5) / 3.0 - cy
                    dist = math.hypot(dx, dy)
                    angle = math.atan2(dy, dx) % (2 * math.pi)
                    outer = tooth_r if tooth_outer(angle) else body_r
                    # sample is "in stroke" if it's between inner_r and outer, within ±stroke/2 of either boundary
                    in_body = inner_r <= dist <= outer
                    near_inner = abs(dist - inner_r) < stroke / 2
                    near_outer = abs(dist - outer) < stroke / 2
                    if near_inner or near_outer:
                        acc += 1.0
                    elif in_body:
                        # taper for thin feel — not filled, skip
                        pass
            alpha = int(acc / 9 * 255)
            if alpha > 0:
                pixels[y][x] = (r, g, b, alpha)

    return pixels

def save_png(path, size, **kw):
    pixels = draw_gear_outlined(size, **kw)
    data = make_png(pixels, size, size)
    with open(path, 'wb') as f:
        f.write(data)
    print(f'Wrote {path} ({len(data)} bytes)')

def save_rgba(path, size, **kw):
    pixels = draw_gear_outlined(size, **kw)
    data = b''.join(bytes(px) for row in pixels for px in row)
    with open(path, 'wb') as f:
        f.write(data)
    print(f'Wrote {path} ({len(data)} bytes)')

# 16×16 @1x
save_png( 'menu-settings.png',   16, inner_r=2.0, body_r=3.8, tooth_r=5.0, n_teeth=8, stroke=1.2)
save_rgba('menu-settings.rgba',  16, inner_r=2.0, body_r=3.8, tooth_r=5.0, n_teeth=8, stroke=1.2)
# 32×32 @2x
save_png( 'menu-settings@2x.png',  32, inner_r=4.0, body_r=7.6, tooth_r=10.0, n_teeth=8, stroke=2.0)
save_rgba('menu-settings@2x.rgba', 32, inner_r=4.0, body_r=7.6, tooth_r=10.0, n_teeth=8, stroke=2.0)

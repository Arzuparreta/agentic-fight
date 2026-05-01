// Procedural pixel-art character sprites
// Each sprite is defined as a grid of color codes, rendered scaled-up with crisp pixels
// Color palette — Reyes Católicos theme
const PALETTE = {
    '.': 'transparent',
    'K': '#2c3e50', // dark armor (knight)
    'k': '#34495e', // lighter armor
    'S': '#ecf0f1', // silver/white (Castilian)
    'R': '#c0392b', // red cape
    'G': '#f1c40f', // gold
    'B': '#8e44ad', // purple/moorish
    'b': '#9b59b6',
    'T': '#d35400', // terracotta/orange
    't': '#e67e22',
    'W': '#5d4037', // wood/brown
    'w': '#8d6e63',
    'N': '#212121', // black
    'n': '#424242',
    'F': '#f0e6d2', // flesh
    'f': '#e0d0b0',
};
// Knight sprite (facing right)
const KNIGHT_SPRITE = {
    width: 12,
    height: 16,
    pixels: [
        '..KKKKKKKK..',
        '.KSSSSSSSSK.',
        '.KSGGGGGGSK.',
        '.KSSFFFFSSK.',
        '.KSFFFFFFSK.',
        '..KFFFFFFK..',
        '..KFFFFFFK..',
        '.KKKFFKKK...',
        '.KkKFFKkK...',
        '.KkKFFKkK...',
        '.KkKFFKkK...',
        '..KkFFKkK...',
        '..KkFFKk....',
        '..KKKKKK....',
        '..KK..KK....',
        '.KK....KK...',
    ],
};
// Moorish warrior sprite (facing left — mirrored)
const MOOR_SPRITE = {
    width: 12,
    height: 16,
    pixels: [
        '..BBBBBBBB..',
        '.BTTTTTTTTB.',
        '.BTGGGGGGTB.',
        '.BTTFFFFTTB.',
        '.BTFFFFFFTB.',
        '..BFFFFFFB..',
        '..BFFFFFFB..',
        '...BFFBKKK..',
        '...BFFBKkK..',
        '...BFFBKkK..',
        '...BFFBKkK..',
        '...BFFBKk...',
        '....BFFBKk..',
        '....BBBBBB..',
        '....BB..BB..',
        '...BB....BB.',
    ],
};
// Friar / Inquisitor sprite
const FRIAR_SPRITE = {
    width: 12,
    height: 16,
    pixels: [
        '..NNNNNNNN..',
        '.NNFFFFFFNN.',
        '.NFFGGGGFFN.',
        '.NFFFFFFFFN.',
        '.NFFFFFFFFN.',
        '..NFFFFFFN..',
        '..NFFFFFFN..',
        '.NNNFFNNN...',
        '.NnNFFNnN...',
        '.NnNFFNnN...',
        '.NnNFFNnN...',
        '..NnFFNnN...',
        '..NnFFNn....',
        '..NNNNNN....',
        '..NN..NN....',
        '.NN....NN...',
    ],
};
// Conquistador sprite
const CONQUISTADOR_SPRITE = {
    width: 12,
    height: 16,
    pixels: [
        '..GGGGGGGG..',
        '.GSSSSSSSSG.',
        '.GSGGGGGGSG.',
        '.GSSFFFFSSG.',
        '.GSFFFFFFSG.',
        '..GFFFFFFG..',
        '..GFFFFFFG..',
        '.GGGFFGGG...',
        '.GgGFFGgG...',
        '.GgGFFGgG...',
        '.GgGFFGgG...',
        '..GgFFGgG...',
        '..GgFFGg....',
        '..GGGGGG....',
        '..GG..GG....',
        '.GG....GG...',
    ],
};
export const CHARACTER_SPRITES = {
    knight: KNIGHT_SPRITE,
    moor: MOOR_SPRITE,
    friar: FRIAR_SPRITE,
    conquistador: CONQUISTADOR_SPRITE,
};
export function renderSprite(ctx, sprite, x, y, scale, flipH = false) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (flipH) {
        ctx.translate(x + sprite.width * scale, y);
        ctx.scale(-1, 1);
    }
    else {
        ctx.translate(x, y);
    }
    for (let row = 0; row < sprite.height; row++) {
        const rowStr = sprite.pixels[row];
        for (let col = 0; col < sprite.width; col++) {
            const char = rowStr[col];
            const color = PALETTE[char];
            if (color && color !== 'transparent') {
                ctx.fillStyle = color;
                ctx.fillRect(col * scale, row * scale, scale, scale);
            }
        }
    }
    ctx.restore();
}
export function getSpriteForCharacter(description) {
    const lower = description.toLowerCase();
    if (lower.includes('knight') || lower.includes('caballero'))
        return CHARACTER_SPRITES.knight;
    if (lower.includes('moor') || lower.includes('mor'))
        return CHARACTER_SPRITES.moor;
    if (lower.includes('friar') || lower.includes('fraile') || lower.includes('inquisitor'))
        return CHARACTER_SPRITES.friar;
    if (lower.includes('conquistador'))
        return CHARACTER_SPRITES.conquistador;
    return CHARACTER_SPRITES.knight; // default
}
//# sourceMappingURL=sprites.js.map
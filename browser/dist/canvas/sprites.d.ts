export interface SpriteDef {
    width: number;
    height: number;
    pixels: string[];
}
export declare const CHARACTER_SPRITES: Record<string, SpriteDef>;
export declare function renderSprite(ctx: CanvasRenderingContext2D, sprite: SpriteDef, x: number, y: number, scale: number, flipH?: boolean): void;
export declare function getSpriteForCharacter(description: string): SpriteDef;
//# sourceMappingURL=sprites.d.ts.map
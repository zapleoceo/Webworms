import { describe, expect, it } from 'vitest';
import { pickAirdropSprite } from './airdropSprite';

describe('pickAirdropSprite', () => {
  it('does not use base64 logos in multiplayer modes', () => {
    const sprite = pickAirdropSprite('friend', [{ image_data: 'data:image/png;base64,AAA', width: 10, height: 10, hardness: 10 }], () => 0.1);
    expect(sprite).not.toContain('base64');
  });

  it('can use base64 logos in solo modes', () => {
    const sprite = pickAirdropSprite('training', [{ image_data: 'data:image/png;base64,AAA', width: 10, height: 10, hardness: 10 }], () => 0.1);
    expect(sprite).toContain('base64');
  });
});


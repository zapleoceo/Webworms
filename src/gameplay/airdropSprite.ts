import { assetUrl } from '../utils/assetUrl';

export function pickAirdropSprite(
  mode: 'training' | 'ai' | 'aivai2' | 'friend' | 'random',
  availableLogos: any[] | null | undefined,
  rand: () => number
): string {
  const isMultiplayer = mode === 'friend' || mode === 'random';
  if (isMultiplayer) {
    const xs = [
      assetUrl('brand_apple.svg?v=3'),
      assetUrl('brand_windows.svg?v=3'),
      assetUrl('brand_android.svg?v=3')
    ];
    return xs[Math.max(0, Math.min(xs.length - 1, Math.floor(rand() * xs.length)))];
  }

  if (Array.isArray(availableLogos) && availableLogos.length > 0) {
    const logo = availableLogos[Math.max(0, Math.min(availableLogos.length - 1, Math.floor(rand() * availableLogos.length)))];
    if (logo && typeof logo.image_data === 'string' && logo.image_data.length > 0) return logo.image_data;
  }

  const logos = [
    'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=A%20colorful%20supermarket%20logo%20saying%20MEGA%20MART%20transparent%20background&image_size=landscape_16_9',
    'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=A%20coffee%20shop%20logo%20with%20a%20star%20saying%20KOSTAR%20transparent%20background&image_size=landscape_16_9',
    'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=A%20fast%20food%20logo%20with%20golden%20M%20saying%20MUGDONALDS%20transparent%20background&image_size=landscape_16_9',
    'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=A%20burger%20restaurant%20logo%20saying%20BURGO%20BURGER%20transparent%20background&image_size=landscape_16_9'
  ];
  return logos[Math.max(0, Math.min(logos.length - 1, Math.floor(rand() * logos.length)))];
}


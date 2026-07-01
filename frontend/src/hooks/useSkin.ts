export type SkinId = 'default';

export function useSkin() {
  return {
    skin: 'default' as SkinId,
    setSkin: (_: SkinId) => {},
  };
}

/**
 * The island's bake's key (M8.10 slice 18): the build (vite's config, its root with a trailing separator) and the bake
 * (`tools/bake.mjs`, without) must name the same sources, or the game lets its bake go and builds the island from its
 * plan at every start.
 */
import { resolve, sep } from 'node:path';
import { describe, expect, test } from 'vitest';
import { islandKey } from '../../tools/islandKey.mjs';

describe('the bake\'s key', () => {
  test('18.14 the same for the checkout\'s root with or without its trailing separator', () => {
    const root = resolve('.');
    expect(islandKey(root + sep)).toBe(islandKey(root));
  });
});

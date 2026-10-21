// Keep the third-party boundary small so the same fidelity and clipboard tests
// can exercise a replacement renderer without changing snapshot semantics.
export const renderer = {
  async toBlob(node, scale = 2) {
    const start = performance.now();
    const result = await snapdom(node, {
      scale,
      dpr: 1,
      embedFonts: 'auto',
      cache: 'soft',
      // Computed visual properties already resolve var(); do not duplicate all
      // VS Code theme variables into the exported tree.
      excludeStyleProps: /^--/u,
      reconcile: true,
      outerShadows: false
    });
    const captured = performance.now();
    const blob = await result.toBlob({ format: 'png' });
    if (result.warnings && result.warnings.length) {
      throw new Error(
        `Image capture reported a fidelity problem: ${result.warnings
          .map((warning) => warning.message)
          .join('; ')}`
      );
    }
    return { blob, captureMs: captured - start, encodeMs: performance.now() - captured };
  }
};

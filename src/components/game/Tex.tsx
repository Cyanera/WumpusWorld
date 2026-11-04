'use client';
import katex from 'katex';
import * as React from 'react';

/** Renders trusted, server-generated LaTeX (formulas are built from engine state, never from user input). */
export function Tex({ tex, block = false, className = '' }: { tex: string; block?: boolean; className?: string }) {
  const html = React.useMemo(() => {
    try { return katex.renderToString(tex, { throwOnError: false, displayMode: block, output: 'html', trust: false, strict: 'ignore' }); } catch { return tex; }
  }, [tex, block]);
  return <span className={`formula-scroll inline-block max-w-full align-middle ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

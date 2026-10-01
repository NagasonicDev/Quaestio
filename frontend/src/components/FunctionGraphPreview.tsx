import { useEffect, useRef, useState } from "react";
import { drawFunctionGraph, normalizedFunctionGraph, validFunctionGraph } from "../lib/functionGraph";

export function FunctionGraphPreview({ content, className = "" }: { content: Record<string, unknown>; className?: string }) {
  const target = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const config = normalizedFunctionGraph(content);
  useEffect(() => {
    if (!target.current) return;
    setError(!validFunctionGraph(config));
    try {
      drawFunctionGraph(target.current, config, 640, 360);
      if (!target.current.querySelector("svg")) setError(true);
    } catch {
      target.current.replaceChildren();
      setError(true);
    }
  }, [config.expression, config.xMin, config.xMax, config.yMin, config.yMax, config.xLabel, config.yLabel]);
  return <>
    <div ref={target} className={`function-graph-preview max-w-full overflow-hidden ${className}`} aria-label={`Graph of y = ${config.expression}`} />
    {error && <p className="p-2 text-xs text-destructive">Enter a valid function and increasing axis bounds to preview the graph.</p>}
  </>;
}

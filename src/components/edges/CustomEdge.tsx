import { BaseEdge, EdgeLabelRenderer, EdgeProps, getBezierPath } from '@xyflow/react';

export default function CustomEdge({
  sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd, data
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  
  const isDown = data?.status === 'down';
  const isAnimating = data?.isAnimating;
  const animColor = typeof data?.animColor === 'string' ? data.animColor : '#22c55e';

  // 🌟 修正: 曲線を維持したまま、デフォルトで点線 (5 5) を適用
  const edgeStyle = {
    ...style,
    stroke: isDown ? '#ef4444' : style?.stroke || '#94a3b8',
    strokeWidth: isDown ? 2 : (style?.strokeWidth || 2.5) as number,
    strokeDasharray: style?.strokeDasharray || '5 5', // ここを点線に変更
    opacity: isDown ? 0.4 : 1,
  };

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={edgeStyle} />
      
      {isAnimating && (
        <circle r="6" fill={animColor} filter={`drop-shadow(0 0 5px ${animColor})`}>
          <animateMotion dur="1s" repeatCount="3" path={edgePath} />
        </circle>
      )}

      <EdgeLabelRenderer>
        <div className="absolute w-full h-full pointer-events-none" style={{ left: 0, top: 0 }}>
          {isDown && (
            <div className="absolute flex items-center justify-center bg-red-500 text-white rounded-full w-5 h-5 font-bold text-[10px]" style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}>✕</div>
          )}
          {typeof data?.sourceIf === 'string' && data.sourceIf !== '' && (
            <div className="absolute text-[9px] font-bold bg-white/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 px-1 rounded shadow-sm" style={{ transform: `translate(-50%, -50%) translate(${sourceX * 0.75 + targetX * 0.25}px, ${sourceY * 0.75 + targetY * 0.25}px)` }}>
              {data.sourceIf}
            </div>
          )}
          {typeof data?.targetIf === 'string' && data.targetIf !== '' && (
            <div className="absolute text-[9px] font-bold bg-white/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 px-1 rounded shadow-sm" style={{ transform: `translate(-50%, -50%) translate(${sourceX * 0.25 + targetX * 0.75}px, ${sourceY * 0.25 + targetY * 0.75}px)` }}>
              {data.targetIf}
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
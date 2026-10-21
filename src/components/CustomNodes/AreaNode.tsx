import { NodeProps } from '@xyflow/react';

export default function AreaNode({ data, selected }: NodeProps) {
  const bgColor = data.color as string || '#3b82f6';
  return (
    <div 
      className={`w-full h-full rounded-xl border-2 border-dashed ${selected ? 'ring-4 ring-blue-500/50' : ''}`}
      style={{ backgroundColor: `${bgColor}20`, borderColor: bgColor }}
    >
      <div className="absolute top-2 left-3 font-bold text-sm" style={{ color: bgColor }}>
        {data.label as string}
      </div>
    </div>
  );
}
import { NodeProps } from '@xyflow/react';

export default function TextNode({ data, selected }: NodeProps) {
  const isDark = data.isDarkMode;
  return (
    <div className={`p-2 min-w-[100px] text-center ${selected ? 'ring-2 ring-blue-500 rounded' : ''}`}>
      <span style={{ fontSize: `${data.fontSize || 14}px`, color: data.color as string || (isDark ? '#e2e8f0' : '#1e293b'), fontWeight: 'bold' }}>
        {data.label as string}
      </span>
    </div>
  );
}
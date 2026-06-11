import { Construction } from 'lucide-react';

interface Props {
  title: string;
  description: string;
  phase: string;
}

export function PlaceholderPage({ title, description, phase }: Props) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
      <div className="p-4 bg-gray-100 rounded-full mb-4">
        <Construction size={32} className="text-gray-400" />
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">{title}</h1>
      <p className="text-gray-500 max-w-md mb-4">{description}</p>
      <span className="text-xs font-medium px-3 py-1 bg-amber-100 text-amber-700 rounded-full">
        Coming in {phase}
      </span>
    </div>
  );
}

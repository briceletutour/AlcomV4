'use client';

import { Calculator } from 'lucide-react';

interface CalculationExampleProps {
  title: string;
  formula: string;
  variables?: Record<string, string>;
  example?: {
    inputs: Record<string, string | number>;
    output: string | number;
  };
}

export function CalculationExample({
  title,
  formula,
  variables,
  example,
}: CalculationExampleProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Calculator className="w-5 h-5 text-blue-600" />
        <h4 className="text-base font-semibold text-gray-900">{title}</h4>
      </div>

      <div className="bg-gray-900 text-gray-100 rounded-md p-3 font-mono text-sm">
        <code>{formula}</code>
      </div>

      {variables && Object.keys(variables).length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Variables
          </p>
          <div className="space-y-1">
            {Object.entries(variables).map(([key, description]) => (
              <div key={key} className="flex items-start gap-2 text-sm">
                <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-900 font-mono text-xs">
                  {key}
                </code>
                <span className="text-gray-600">{description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {example && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-3 space-y-2">
          <p className="text-xs font-medium text-blue-700 uppercase tracking-wide">
            Example
          </p>
          <div className="space-y-1.5">
            {Object.entries(example.inputs).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2 text-sm">
                <code className="bg-white px-2 py-0.5 rounded text-gray-900 font-mono text-xs border border-blue-200">
                  {key}
                </code>
                <span className="text-blue-900">=</span>
                <span className="font-semibold text-blue-900">{value}</span>
              </div>
            ))}
            <div className="border-t border-blue-200 pt-2 mt-2">
              <div className="flex items-center gap-2 text-sm">
                <code className="bg-blue-600 text-white px-2 py-0.5 rounded font-mono text-xs font-bold">
                  Result
                </code>
                <span className="text-blue-900">=</span>
                <span className="font-bold text-blue-900 text-base">
                  {example.output}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

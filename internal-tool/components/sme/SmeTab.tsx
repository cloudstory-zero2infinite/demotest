import React, { useState } from 'react';
import { PolicyCorpusManager } from './PolicyCorpusManager';
import { OntologyEditor } from './OntologyEditor';
import { ComplianceManager } from './ComplianceManager';
import { NNControlsManager } from './NNControlsManager';
import { ControlFrameworkManager } from './ControlFrameworkManager';
import { ControlChecksLibraryTab } from './ControlChecksLibraryTab';

type SubTab =
  | 'corpus'
  | 'ontology'
  | 'compliance'
  | 'nn-controls'
  | 'control-framework'
  | 'control-checks';

const tabs: { id: SubTab; label: string }[] = [
  { id: 'corpus', label: 'Manage Policy Vector DB' },
  { id: 'ontology', label: 'Ontology File Editor' },
  { id: 'compliance', label: 'Manage Compliance' },
  { id: 'nn-controls', label: 'Manage NN Controls' },
  { id: 'control-framework', label: 'Control Framework' },
  { id: 'control-checks', label: 'Control Checks Library' },
];

export const SmeTab: React.FC = () => {
  const [active, setActive] = useState<SubTab>('corpus');

  return (
    <div>
      <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-gray-700 mb-6">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={`px-4 py-2 text-sm font-medium rounded-t -mb-px border-b-2 ${
              active === t.id
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {active === 'corpus' && <PolicyCorpusManager />}
      {active === 'ontology' && <OntologyEditor />}
      {active === 'compliance' && <ComplianceManager />}
      {active === 'nn-controls' && <NNControlsManager />}
      {active === 'control-framework' && <ControlFrameworkManager />}
      {active === 'control-checks' && <ControlChecksLibraryTab />}
    </div>
  );
};

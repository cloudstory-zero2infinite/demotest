import React, { useState } from 'react';
import { VulnerabilityAssessmentView } from '../hub/VulnerabilityAssessmentView';
import { CSPMAssessmentView } from '../hub/CSPMAssessmentView';

type SubTab = 'va' | 'cspm' | 'pentest' | 'code_review';

const ComingSoon: React.FC<{ title: string; blurb: string }> = ({ title, blurb }) => (
  <div className="border border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-10 text-center mt-6">
    <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200">{title}</h3>
    <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-md mx-auto">{blurb}</p>
    <span className="inline-block mt-4 px-3 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">Coming soon</span>
  </div>
);

export const ZtiHubServicesTab: React.FC<{ isActive?: boolean }> = ({ isActive = true }) => {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('va');
  const [mountedSubTabs, setMountedSubTabs] = useState<Set<SubTab>>(new Set(['va']));

  const handleSubTabChange = (id: SubTab) => {
    setActiveSubTab(id);
    setMountedSubTabs((prev) => new Set(prev).add(id));
  };
//sub tabs for the ZTI Hub Services tab, including Vulnerability Assessment, CSPM, Pentesting, and Code Review
  const subTabs: { id: SubTab; label: string }[] = [
    { id: 'va', label: 'Vulnerability Assessment' },
    { id: 'cspm', label: 'CSPM' },
    { id: 'pentest', label: 'Pentesting' },
    { id: 'code_review', label: 'Code Review' },
  ];

  return (
    <div className="py-2">
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-8 overflow-x-auto scrollbar-none" aria-label="Tabs">
          {subTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleSubTabChange(tab.id)}
              className={`${
                activeSubTab === tab.id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400 border-b-2'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200'
              } whitespace-nowrap py-2.5 px-1 font-medium text-sm transition-colors duration-150`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-4">
        {mountedSubTabs.has('va') && (
          <div className={activeSubTab === 'va' ? '' : 'hidden'}>
            <VulnerabilityAssessmentView isActive={isActive && activeSubTab === 'va'} />
          </div>
        )}
        {mountedSubTabs.has('cspm') && (
          <div className={activeSubTab === 'cspm' ? '' : 'hidden'}>
            <CSPMAssessmentView isActive={isActive && activeSubTab === 'cspm'} />
          </div>
        )}
        {mountedSubTabs.has('pentest') && (
          <div className={activeSubTab === 'pentest' ? '' : 'hidden'}>
            <ComingSoon title="Penetration Testing" blurb="Manage authorized pentest engagements, scope, and findings from the ZTI Hub. This service is being built out." />
          </div>
        )}
        {mountedSubTabs.has('code_review') && (
          <div className={activeSubTab === 'code_review' ? '' : 'hidden'}>
            <ComingSoon title="Code Review" blurb="Static analysis and secure code review results from the ZTI Hub, surfaced alongside your other assurance services." />
          </div>
        )}
      </div>
    </div>
  );
};

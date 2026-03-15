import React from 'react';
import { ProgramTrackerView } from '../program/ProgramTrackerView';
import { LeadershipView } from '../program/LeadershipView';

interface ProgramTabProps {
    userRole: 'security-staff' | 'cxo';
}

export const ProgramTab: React.FC<ProgramTabProps> = ({ userRole }) => {
    if (userRole === 'security-staff') {
        return <ProgramTrackerView />;
    }

    if (userRole === 'cxo') {
        return (
            <div className="px-4 py-6 sm:px-0">
                <LeadershipView />
            </div>
        );
    }

    return null;
};

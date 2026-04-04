import React from 'react';
import { ProgramTrackerView } from '../program/ProgramTrackerView';
import { LeadershipView } from '../program/LeadershipView';

interface ProgramTabProps {
    userRole: 'security-staff' | 'cxo';
    isActive?: boolean;
}

export const ProgramTab: React.FC<ProgramTabProps> = ({ userRole, isActive = true }) => {
    if (userRole === 'security-staff') {
        return <ProgramTrackerView isActive={isActive} />;
    }

    if (userRole === 'cxo') {
        return (
            <div className="px-4 py-6 sm:px-0">
                <LeadershipView isActive={isActive} />
            </div>
        );
    }

    return null;
};

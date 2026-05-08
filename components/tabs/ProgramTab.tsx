import React from 'react';
import { ProgramTrackerView } from '../program/ProgramTrackerView';
import { LeadershipView } from '../program/LeadershipView';
import { UserRole } from '../../types';

interface ProgramTabProps {
    userRole: UserRole;
    isActive?: boolean;
}

export const ProgramTab: React.FC<ProgramTabProps> = ({ userRole, isActive = true }) => {
    console.log('🔍 DEBUG: ProgramTab - userRole:', userRole);
    
    if (userRole === 'user' || userRole === 'admin' || userRole === 'tenant_admin') {
        console.log('🔍 DEBUG: ProgramTab - Rendering ProgramTrackerView with hideEscalated=true');
        return <ProgramTrackerView isActive={isActive} hideEscalated={true} />;
    }

    if (userRole === 'cxo') {
        console.log('🔍 DEBUG: ProgramTab - Rendering LeadershipView for CXO role');
        return (
            <div className="px-4 py-6 sm:px-0">
                <LeadershipView isActive={isActive} />
            </div>
        );
    }

    console.log('🔍 DEBUG: ProgramTab - Default case - Rendering ProgramTrackerView with hideEscalated=true');
    return <ProgramTrackerView isActive={isActive} hideEscalated={true} />;
};

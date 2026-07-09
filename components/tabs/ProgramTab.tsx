import React from 'react';
import { ProgramTrackerView } from '../program/ProgramTrackerView';
import { UserRole } from '../../types';

interface ProgramTabProps {
    userRole: UserRole;
    isActive?: boolean;
}

// Everyone now uses the full Program Tracker. CXOs get a "Show escalated issues
// only" toggle (default ON, per-session) instead of the old escalated-only
// LeadershipView, so they can switch to the full task list when they want.
export const ProgramTab: React.FC<ProgramTabProps> = ({ userRole, isActive = true }) => {
    return <ProgramTrackerView isActive={isActive} isCxo={userRole === 'cxo'} userRole={userRole} />;
};

import React from 'react';
import { RiskRegistryView } from '../risk/RiskRegistryView';
import { UserRole } from '../../types';

interface RiskTabProps {
    isActive?: boolean;
    userRole?: UserRole | null;
}

export const RiskTab: React.FC<RiskTabProps> = ({ isActive = true, userRole }) => (
    <div className="py-3">
        <RiskRegistryView isActive={isActive} userRole={userRole} />
    </div>
);

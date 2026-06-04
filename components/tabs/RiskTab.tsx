import React from 'react';
import { RiskRegistryView } from '../risk/RiskRegistryView';

interface RiskTabProps {
    isActive?: boolean;
}

export const RiskTab: React.FC<RiskTabProps> = ({ isActive = true }) => (
    <div className="px-4 py-6 sm:px-0">
        <RiskRegistryView isActive={isActive} />
    </div>
);
